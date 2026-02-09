import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import {
    collection,
    doc,
    getDocs,
    getFirestore,
    limit,
    query,
    serverTimestamp,
    setDoc,
    writeBatch,
} from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import storage, { subscribeStorage } from './storageService';
import authService from './authService';
import { analytics } from './analyticsService';
import { getLocalDateKey } from '../utils/dateUtils';
import { checkNetworkConnection } from './offlineService';
import i18n from '../i18n';
import type {
    ActivityLogEntry,
    DailyPlan,
    DailyWrapUp,
    FoodLogEntry,
    MoodLog,
    SleepSession,
    WeightLogEntry,
} from '../types';

export type CloudSyncStatus = {
    lastSyncAt?: number;
    lastError?: string;
    lastErrorCode?: string;
    lastErrorAt?: number;
    lastSource?: string;
    lastRestoreAt?: number;
    lastRestoreError?: string;
    lastRestoreErrorCode?: string;
    lastRestoreErrorAt?: number;
    lastRestoreSource?: string;
};

type CloudSyncSource = 'app_start' | 'storage_change' | 'manual' | 'network_restored' | 'auth';
type LogType = 'food' | 'mood' | 'weight' | 'activity' | 'sleep';
type CloudRestoreMode = 'merge' | 'replace';

export type CloudRestoreResult = {
    restoredAt: number;
    source: CloudSyncSource;
    mode: CloudRestoreMode;
    totals: {
        plans: number;
        wrapups: number;
        logs: Record<LogType, number>;
    };
};

export type CloudDataSummary = {
    hasData: boolean;
    totals: {
        plans: number;
        wrapups: number;
        logs: Record<LogType, number>;
    };
};

type CloudRestoreOptions = {
    source?: CloudSyncSource;
    mode?: CloudRestoreMode;
};

const MONTH_PAD = 2;
const SYNC_DEBOUNCE_MS = 1500;
const getDb = () => getFirestore();

let initialized = false;
let syncAllInFlight: Promise<void> | null = null;
let restoreInFlight: Promise<CloudRestoreResult> | null = null;
let storageUnsubscribe: (() => void) | null = null;
let isRestoring = false;
let syncBlocked = false;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

const getUserDocRef = async () => {
    const user = await authService.waitForAuthReady();
    if (!user) return null;
    return doc(getDb(), 'users', user.uid);
};

const formatMonthKey = (timestamp: number): string => {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(MONTH_PAD, '0');
    return `${date.getFullYear()}-${month}`;
};

const getLogTimestamp = (item: any, fallback: number = 0): number => {
    if (typeof item?.timestamp === 'number') return item.timestamp;
    if (typeof item?.endTime === 'number') return item.endTime;
    if (typeof item?.startTime === 'number') return item.startTime;
    return fallback;
};

const stripUndefined = <T>(value: T): T => {
    if (Array.isArray(value)) {
        return value
            .map((entry) => stripUndefined(entry))
            .filter((entry) => entry !== undefined) as unknown as T;
    }
    if (value && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        const isPlainObject = proto === Object.prototype || proto === null;
        if (!isPlainObject) {
            return value;
        }

        const next: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
            if (entry === undefined) return;
            const cleaned = stripUndefined(entry);
            if (cleaned !== undefined) {
                next[key] = cleaned;
            }
        });
        return next as T;
    }
    return value;
};

const loadSyncBlockState = async (): Promise<void> => {
    const pending = await storage.get(storage.keys.PENDING_AUTH_DELETE);
    syncBlocked = !!pending;
};

const handleSyncBlocked = async (source: CloudSyncSource, operation: 'sync' | 'restore'): Promise<boolean> => {
    if (!syncBlocked) return false;

    const message = i18n.t('errors.cloud.deletion_pending');
    if (operation === 'sync') {
        await updateStatus({
            lastError: message,
            lastErrorAt: Date.now(),
            lastSource: source,
        });
        analytics.logEvent('cloud_sync_blocked', { source });
        if (source === 'manual') {
            throw new Error(message);
        }
        return true;
    }

    await updateStatus({
        lastRestoreError: message,
        lastRestoreErrorAt: Date.now(),
        lastRestoreSource: source,
    });
    analytics.logEvent('cloud_restore_blocked', { source });
    throw new Error(message);
};

const getFirestoreErrorCode = (error: unknown): string | null => {
    const rawCode = (error as { code?: unknown })?.code;
    if (typeof rawCode === 'string') return rawCode;
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
        return 'firestore/permission-denied';
    }
    return null;
};

const normalizeCloudSyncError = (error: unknown): { message: string; code?: string } => {
    const firestoreCode = getFirestoreErrorCode(error);
    if (firestoreCode === 'firestore/permission-denied' || firestoreCode === 'permission-denied') {
        return {
            code: 'permission_denied',
            message: i18n.t('errors.cloud.permission_denied'),
        };
    }
    return { message: error instanceof Error ? error.message : String(error) };
};

const ensureOnline = async (
    source: CloudSyncSource,
    operation: 'sync' | 'restore',
    options: { throwOnOffline?: boolean } = {}
): Promise<boolean> => {
    const isOnline = await checkNetworkConnection();
    if (isOnline) return true;

    const message = i18n.t('errors.cloud.offline');
    if (operation === 'sync') {
        if (options.throwOnOffline) {
            throw new Error(message);
        }
        await updateStatus({
            lastError: message,
            lastErrorAt: Date.now(),
            lastSource: source,
        });
        analytics.logEvent('cloud_sync_skipped_offline', { source });
        return false;
    }

    await updateStatus({
        lastRestoreError: message,
        lastRestoreErrorAt: Date.now(),
        lastRestoreSource: source,
    });
    throw new Error(message);
};

type UserDocRef = FirebaseFirestoreTypes.DocumentReference<FirebaseFirestoreTypes.DocumentData>;

const isFirestoreTimestamp = (value: unknown): value is FirebaseFirestoreTypes.Timestamp => {
    return !!value && typeof (value as FirebaseFirestoreTypes.Timestamp).toMillis === 'function';
};

const normalizeFirestorePayload = <T,>(value: T): T => {
    if (isFirestoreTimestamp(value)) {
        return value.toMillis() as unknown as T;
    }

    if (value instanceof Date) {
        return value.getTime() as unknown as T;
    }

    if (Array.isArray(value)) {
        return value.map((entry) => normalizeFirestorePayload(entry)) as unknown as T;
    }

    if (value && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        const isPlainObject = proto === Object.prototype || proto === null;
        if (!isPlainObject) return value;

        const next: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
            next[key] = normalizeFirestorePayload(entry);
        });
        return next as T;
    }

    return value;
};

const getPlanUpdatedAt = (plan?: DailyPlan | null): number => {
    if (!plan) return 0;
    return plan.updatedAt ?? plan.generatedAt ?? plan.createdAt ?? 0;
};

const pickBetterPlan = (current: DailyPlan | undefined, incoming: DailyPlan | undefined): DailyPlan | undefined => {
    if (!current) return incoming;
    if (!incoming) return current;

    const currentUpdated = getPlanUpdatedAt(current);
    const incomingUpdated = getPlanUpdatedAt(incoming);
    if (incomingUpdated > currentUpdated) return incoming;
    if (incomingUpdated < currentUpdated) return current;

    const currentItems = current.items?.length ?? 0;
    const incomingItems = incoming.items?.length ?? 0;
    if (incomingItems > currentItems) return incoming;
    if (incomingItems < currentItems) return current;

    if (incoming.summary && !current.summary) return incoming;
    return current;
};

const mergePlansByDate = (
    localPlans: DailyPlan[],
    incomingPlans: DailyPlan[],
    mode: CloudRestoreMode
): DailyPlan[] => {
    if (mode === 'replace') {
        return incomingPlans;
    }

    const map = new Map<string, DailyPlan>();
    localPlans.forEach((plan) => {
        if (plan?.date) map.set(plan.date, plan);
    });

    incomingPlans.forEach((plan) => {
        if (!plan?.date) return;
        const current = map.get(plan.date);
        const next = pickBetterPlan(current, plan) ?? plan;
        map.set(plan.date, next);
    });

    return Array.from(map.values());
};

const pickBetterWrapup = (
    current: DailyWrapUp | undefined,
    incoming: DailyWrapUp | undefined
): DailyWrapUp | undefined => {
    if (!current) return incoming;
    if (!incoming) return current;

    const currentRated = typeof current.userRating === 'number';
    const incomingRated = typeof incoming.userRating === 'number';
    if (incomingRated && !currentRated) return incoming;
    if (currentRated && !incomingRated) return current;
    return incoming;
};

const mergeWrapupsByDate = (
    localWrapups: DailyWrapUp[],
    incomingWrapups: DailyWrapUp[],
    mode: CloudRestoreMode
): DailyWrapUp[] => {
    if (mode === 'replace') {
        return incomingWrapups;
    }

    const map = new Map<string, DailyWrapUp>();
    localWrapups.forEach((wrapup) => {
        if (wrapup?.date) map.set(wrapup.date, wrapup);
    });

    incomingWrapups.forEach((wrapup) => {
        if (!wrapup?.date) return;
        const current = map.get(wrapup.date);
        const next = pickBetterWrapup(current, wrapup) ?? wrapup;
        map.set(wrapup.date, next);
    });

    return Array.from(map.values());
};

const mergeLogEntries = <T extends { id?: string }>(
    localLogs: T[],
    incomingLogs: T[],
    mode: CloudRestoreMode
): T[] => {
    if (mode === 'replace') {
        return incomingLogs;
    }

    const byId = new Map<string, T>();
    const merged: T[] = [];

    localLogs.forEach((entry) => {
        const id = entry?.id;
        if (id) byId.set(id, entry);
        merged.push(entry);
    });

    incomingLogs.forEach((entry) => {
        const id = entry?.id;
        if (id) {
            if (!byId.has(id)) {
                byId.set(id, entry);
                merged.push(entry);
            }
        } else {
            merged.push(entry);
        }
    });

    return merged.sort((a, b) => getLogTimestamp(a) - getLogTimestamp(b));
};

const updateStatus = async (update: CloudSyncStatus): Promise<void> => {
    const current = await storage.get<CloudSyncStatus>(storage.keys.CLOUD_SYNC_STATUS);
    const next = { ...(current || {}), ...update };
    await storage.set(storage.keys.CLOUD_SYNC_STATUS, next);
};

const fetchPlansFromCloud = async (userRef: UserDocRef): Promise<DailyPlan[]> => {
    const snapshot = await getDocs(collection(userRef, 'plans'));
    const plans: DailyPlan[] = [];
    snapshot.docs.forEach((docSnap: FirebaseFirestoreTypes.QueryDocumentSnapshot<FirebaseFirestoreTypes.DocumentData>) => {
        const raw = normalizeFirestorePayload(docSnap.data()) as DailyPlan;
        const plan = { ...raw, date: raw?.date ?? docSnap.id };
        if (plan?.date) plans.push(plan);
    });
    return plans;
};

const fetchWrapupsFromCloud = async (userRef: UserDocRef): Promise<DailyWrapUp[]> => {
    const snapshot = await getDocs(collection(userRef, 'wrapups'));
    const wrapups: DailyWrapUp[] = [];
    snapshot.docs.forEach((docSnap: FirebaseFirestoreTypes.QueryDocumentSnapshot<FirebaseFirestoreTypes.DocumentData>) => {
        const raw = normalizeFirestorePayload(docSnap.data()) as DailyWrapUp;
        const wrapup = { ...raw, date: raw?.date ?? docSnap.id };
        if (wrapup?.date) wrapups.push(wrapup);
    });
    return wrapups;
};

const fetchLogEntriesFromCloud = async (userRef: UserDocRef, type: LogType): Promise<unknown[]> => {
    const logsDocRef = doc(userRef, 'logs', type);
    const monthsRef = collection(logsDocRef, 'months');
    const snapshot = await getDocs(monthsRef);
    const items: unknown[] = [];
    snapshot.docs.forEach((docSnap: FirebaseFirestoreTypes.QueryDocumentSnapshot<FirebaseFirestoreTypes.DocumentData>) => {
        const data = normalizeFirestorePayload(docSnap.data()) as { items?: unknown[] };
        if (Array.isArray(data?.items)) {
            items.push(...data.items);
        }
    });
    return items;
};

const loadLocalPlansByDate = async (): Promise<DailyPlan[]> => {
    const allKeys = await AsyncStorage.getAllKeys();
    const planKeys = allKeys.filter((key) => /^ls_daily_plan_\d{4}-\d{2}-\d{2}$/.test(key));
    const pairs = planKeys.length ? await AsyncStorage.multiGet(planKeys) : [];
    const plans: DailyPlan[] = [];

    pairs.forEach(([key, value]) => {
        if (!value) return;
        try {
            const parsed = JSON.parse(value) as DailyPlan;
            if (!parsed || typeof parsed !== 'object') return;
            const dateKey = key.replace(/^ls_daily_plan_/, '');
            const normalized = { ...parsed, date: parsed.date ?? dateKey };
            if (normalized.date) plans.push(normalized);
        } catch {
            // Ignore invalid entries
        }
    });

    const currentPlan = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
    if (currentPlan?.date) {
        plans.push(currentPlan);
    }

    return plans;
};

const clearPlanKeys = async (): Promise<void> => {
    const allKeys = await AsyncStorage.getAllKeys();
    const planKeys = allKeys.filter((key) => /^ls_daily_plan_\d{4}-\d{2}-\d{2}$/.test(key));
    if (planKeys.length > 0) {
        await AsyncStorage.multiRemove(planKeys);
    }
};

const syncPlan = async (plan: DailyPlan, source: CloudSyncSource): Promise<void> => {
    const userRef = await getUserDocRef();
    if (!userRef) return;

    const payload = stripUndefined({
        ...plan,
        updatedAt: serverTimestamp(),
        lastSyncSource: source,
    });

    const planRef = doc(collection(userRef, 'plans'), plan.date);
    await setDoc(planRef, payload, { merge: true });
};

const syncWrapups = async (wrapups: DailyWrapUp[], source: CloudSyncSource): Promise<void> => {
    const userRef = await getUserDocRef();
    if (!userRef) return;

    const batch = writeBatch(getDb());
    wrapups.forEach((wrapup) => {
        const docRef = doc(collection(userRef, 'wrapups'), wrapup.date);
        const payload = stripUndefined({
            ...wrapup,
            updatedAt: serverTimestamp(),
            lastSyncSource: source,
        });
        batch.set(docRef, payload, { merge: true });
    });

    await batch.commit();
};

const syncBioSummary = async (userRef: UserDocRef, dateKey: string): Promise<void> => {
    try {
        const { bioSnapshotService } = require('./bioSnapshotService');
        const snapshot = bioSnapshotService.getLastSnapshot();
        if (!snapshot || snapshot.source === 'fallback') return;

        const bioDoc = {
            date: dateKey,
            stressIndex: snapshot.stressIndex,
            readinessScore: snapshot.readinessScore,
            hrv: snapshot.hrv,
            sleepScore: snapshot.sleepScore,
            updatedAt: Date.now(),
        };

        const bioRef = doc(collection(userRef, 'bioSummaries'), dateKey);
        await setDoc(bioRef, bioDoc, { merge: true });
    } catch (e) {
        console.warn('[CloudSync] Bio summary sync failed:', e);
    }
};

const syncLogs = async (type: LogType, items: unknown[], source: CloudSyncSource): Promise<void> => {
    const userRef = await getUserDocRef();
    if (!userRef) return;

    const grouped = new Map<string, unknown[]>();
    items.forEach((item) => {
        const timestamp = getLogTimestamp(item);
        if (!timestamp) return;
        const monthKey = formatMonthKey(timestamp);
        const bucket = grouped.get(monthKey) || [];
        bucket.push(item);
        grouped.set(monthKey, bucket);
    });

    const batch = writeBatch(getDb());
    grouped.forEach((bucket, monthKey) => {
        const sanitizedItems = bucket
            .map((item) => stripUndefined(item))
            .filter((item) => item !== undefined);
        const docRef = doc(collection(doc(userRef, 'logs', type), 'months'), monthKey);
        batch.set(docRef, {
            items: sanitizedItems,
            count: sanitizedItems.length,
            updatedAt: serverTimestamp(),
            lastSyncSource: source,
        }, { merge: true });
    });

    const metaRef = doc(collection(userRef, 'logs'), type);
    batch.set(metaRef, {
        lastSyncAt: serverTimestamp(),
        lastSyncSource: source,
    }, { merge: true });

    await batch.commit();
};

const syncFromStorageKey = async (key: string, value: unknown, source: CloudSyncSource): Promise<void> => {
    if (key === storage.keys.CLOUD_SYNC_STATUS) return;

    if (key === storage.keys.DAILY_PLAN || key.startsWith(`${storage.keys.DAILY_PLAN}_`)) {
        const plan = value as DailyPlan | null;
        if (plan?.date) {
            await syncPlan(plan, source);
        }
        return;
    }

    if (key === storage.keys.DAILY_WRAPUPS) {
        const wrapups = (value as DailyWrapUp[]) || [];
        if (wrapups.length > 0) {
            await syncWrapups(wrapups, source);
        }
        return;
    }

    if (key === storage.keys.FOOD) {
        await syncLogs('food', (value as FoodLogEntry[]) || [], source);
        return;
    }

    if (key === storage.keys.MOOD) {
        await syncLogs('mood', (value as MoodLog[]) || [], source);
        return;
    }

    if (key === storage.keys.WEIGHT) {
        await syncLogs('weight', (value as WeightLogEntry[]) || [], source);
        return;
    }

    if (key === storage.keys.ACTIVITY) {
        await syncLogs('activity', (value as ActivityLogEntry[]) || [], source);
        return;
    }

    if (key === storage.keys.SLEEP_HISTORY) {
        await syncLogs('sleep', (value as SleepSession[]) || [], source);
    }
};

const isSyncableKey = (key: string): boolean => {
    if (key === storage.keys.CLOUD_SYNC_STATUS) return false;
    if (key === storage.keys.DAILY_PLAN) return true;
    if (key.startsWith(`${storage.keys.DAILY_PLAN}_`)) return true;
    if (key === storage.keys.DAILY_WRAPUPS) return true;
    if (key === storage.keys.FOOD) return true;
    if (key === storage.keys.MOOD) return true;
    if (key === storage.keys.WEIGHT) return true;
    if (key === storage.keys.ACTIVITY) return true;
    if (key === storage.keys.SLEEP_HISTORY) return true;
    return false;
};

const scheduleKeySync = (key: string, value: unknown): void => {
    if (syncBlocked) return;
    if (pendingTimers.has(key)) {
        clearTimeout(pendingTimers.get(key));
    }

    const timeout = setTimeout(() => {
        pendingTimers.delete(key);
        void syncFromStorageKey(key, value, 'storage_change')
            .then(() => updateStatus({ lastSyncAt: Date.now(), lastSource: 'storage_change', lastError: undefined }))
            .catch((error) => {
        analytics.logError(error, 'CloudSync.storage_change');
        const errorInfo = normalizeCloudSyncError(error);
        void updateStatus({
            lastError: errorInfo.message,
            lastErrorCode: errorInfo.code,
            lastErrorAt: Date.now(),
            lastSource: 'storage_change',
        });
            });
    }, SYNC_DEBOUNCE_MS);

    pendingTimers.set(key, timeout);
};

const syncAllNow = async (source: CloudSyncSource = 'manual'): Promise<void> => {
    if (isRestoring) return;
    if (syncAllInFlight) return syncAllInFlight;

    syncAllInFlight = (async () => {
        if (await handleSyncBlocked(source, 'sync')) {
            return;
        }
        if (!(await ensureOnline(source, 'sync', { throwOnOffline: source === 'manual' }))) {
            return;
        }
        analytics.logEvent('cloud_sync_started', { source });
        try {
            const allKeys = await AsyncStorage.getAllKeys();
            const planKeys = allKeys.filter((key) => /^ls_daily_plan_\d{4}-\d{2}-\d{2}$/.test(key));
            const planPairs = planKeys.length
                ? await AsyncStorage.multiGet(planKeys)
                : [];
            const datePlans = planPairs
                .map(([, value]) => {
                    if (!value) return null;
                    try {
                        return JSON.parse(value) as DailyPlan;
                    } catch {
                        return null;
                    }
                })
                .filter((plan): plan is DailyPlan => !!plan && !!plan.date);

            const [
                plan,
                foodLogs,
                moodLogs,
                weightLogs,
                activityLogs,
                sleepLogs,
                wrapups,
            ] = await Promise.all([
                storage.get<DailyPlan>(storage.keys.DAILY_PLAN),
                storage.get<FoodLogEntry[]>(storage.keys.FOOD),
                storage.get<MoodLog[]>(storage.keys.MOOD),
                storage.get<WeightLogEntry[]>(storage.keys.WEIGHT),
                storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY),
                storage.get<SleepSession[]>(storage.keys.SLEEP_HISTORY),
                storage.get<DailyWrapUp[]>(storage.keys.DAILY_WRAPUPS),
            ]);

            if (plan?.date) {
                await syncPlan(plan, source);
            }
            if (datePlans.length > 0) {
                await Promise.all(datePlans.map((entry) => syncPlan(entry, source)));
            }

            if (wrapups && wrapups.length > 0) {
                await syncWrapups(wrapups, source);
            }

            await Promise.all([
                syncLogs('food', foodLogs || [], source),
                syncLogs('mood', moodLogs || [], source),
                syncLogs('weight', weightLogs || [], source),
                syncLogs('activity', activityLogs || [], source),
                syncLogs('sleep', sleepLogs || [], source),
            ]);

            const userRef = await getUserDocRef();
            if (userRef) {
                const dateKey = getLocalDateKey(new Date());
                await syncBioSummary(userRef, dateKey);
            }

            await updateStatus({ lastSyncAt: Date.now(), lastSource: source, lastError: undefined });
            analytics.logEvent('cloud_sync_completed', { source });
        } catch (error) {
            analytics.logError(error, 'CloudSync.sync_all', { source });
            const errorInfo = normalizeCloudSyncError(error);
            await updateStatus({
                lastError: errorInfo.message,
                lastErrorCode: errorInfo.code,
                lastErrorAt: Date.now(),
                lastSource: source,
            });
            analytics.logEvent('cloud_sync_failed', { source });
            throw error;
        } finally {
            syncAllInFlight = null;
        }
    })();

    return syncAllInFlight;
};

const restoreFromCloud = async (options: CloudRestoreOptions = {}): Promise<CloudRestoreResult> => {
    if (restoreInFlight) return restoreInFlight;

    restoreInFlight = (async () => {
        const source = options.source ?? 'manual';
        const mode = options.mode ?? 'merge';
        analytics.logEvent('cloud_restore_started', { source, mode });
        isRestoring = true;
        pendingTimers.forEach((timeout) => clearTimeout(timeout));
        pendingTimers.clear();

        try {
            await handleSyncBlocked(source, 'restore');
            await ensureOnline(source, 'restore');
            if (syncAllInFlight) {
                await syncAllInFlight;
            }
            const userRef = await getUserDocRef();
            if (!userRef) {
                throw new Error(i18n.t('errors.auth.no_user_restore'));
            }

            const [
                cloudPlans,
                cloudWrapups,
                cloudFoodLogs,
                cloudMoodLogs,
                cloudWeightLogs,
                cloudActivityLogs,
                cloudSleepLogs,
                localPlans,
                localWrapups,
                localFoodLogs,
                localMoodLogs,
                localWeightLogs,
                localActivityLogs,
                localSleepLogs,
            ] = await Promise.all([
                fetchPlansFromCloud(userRef),
                fetchWrapupsFromCloud(userRef),
                fetchLogEntriesFromCloud(userRef, 'food'),
                fetchLogEntriesFromCloud(userRef, 'mood'),
                fetchLogEntriesFromCloud(userRef, 'weight'),
                fetchLogEntriesFromCloud(userRef, 'activity'),
                fetchLogEntriesFromCloud(userRef, 'sleep'),
                loadLocalPlansByDate(),
                storage.get<DailyWrapUp[]>(storage.keys.DAILY_WRAPUPS),
                storage.get<FoodLogEntry[]>(storage.keys.FOOD),
                storage.get<MoodLog[]>(storage.keys.MOOD),
                storage.get<WeightLogEntry[]>(storage.keys.WEIGHT),
                storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY),
                storage.get<SleepSession[]>(storage.keys.SLEEP_HISTORY),
            ]);

            const mergedPlans = mergePlansByDate(
                localPlans,
                cloudPlans,
                mode
            );
            const mergedWrapups = mergeWrapupsByDate(
                localWrapups || [],
                cloudWrapups,
                mode
            );
            const mergedFood = mergeLogEntries(
                localFoodLogs || [],
                cloudFoodLogs as FoodLogEntry[],
                mode
            );
            const mergedMood = mergeLogEntries(
                localMoodLogs || [],
                cloudMoodLogs as MoodLog[],
                mode
            );
            const mergedWeight = mergeLogEntries(
                localWeightLogs || [],
                cloudWeightLogs as WeightLogEntry[],
                mode
            );
            const mergedActivity = mergeLogEntries(
                localActivityLogs || [],
                cloudActivityLogs as ActivityLogEntry[],
                mode
            );
            const mergedSleep = mergeLogEntries(
                localSleepLogs || [],
                cloudSleepLogs as SleepSession[],
                mode
            );

            if (mode === 'replace') {
                await clearPlanKeys();
            }

            const planMap = new Map<string, DailyPlan>();
            mergedPlans.forEach((plan) => {
                if (plan?.date) planMap.set(plan.date, plan);
            });

            const planWrites = Array.from(planMap.entries()).map(([date, plan]) => (
                storage.set(`${storage.keys.DAILY_PLAN}_${date}`, plan)
            ));

            await Promise.all([
                ...planWrites,
                storage.set(storage.keys.FOOD, mergedFood),
                storage.set(storage.keys.MOOD, mergedMood),
                storage.set(storage.keys.WEIGHT, mergedWeight),
                storage.set(storage.keys.ACTIVITY, mergedActivity),
                storage.set(storage.keys.SLEEP_HISTORY, mergedSleep),
                storage.set(storage.keys.DAILY_WRAPUPS, mergedWrapups),
            ]);

            const todayDateKey = getLocalDateKey(new Date());
            const todayPlan = planMap.get(todayDateKey);
            if (todayPlan) {
                await storage.set(storage.keys.DAILY_PLAN, todayPlan);
            } else if (mode === 'replace') {
                await storage.remove(storage.keys.DAILY_PLAN);
            }

            storage.clearCache();

            const result: CloudRestoreResult = {
                restoredAt: Date.now(),
                source,
                mode,
                totals: {
                    plans: mergedPlans.length,
                    wrapups: mergedWrapups.length,
                    logs: {
                        food: mergedFood.length,
                        mood: mergedMood.length,
                        weight: mergedWeight.length,
                        activity: mergedActivity.length,
                        sleep: mergedSleep.length,
                    },
                },
            };

            await updateStatus({
                lastRestoreAt: result.restoredAt,
                lastRestoreSource: source,
                lastRestoreError: undefined,
                lastRestoreErrorAt: undefined,
            });
            analytics.logEvent('cloud_restore_completed', { source, mode });
            return result;
        } catch (error) {
            analytics.logError(error, 'CloudSync.restore');
            const errorInfo = normalizeCloudSyncError(error);
            await updateStatus({
                lastRestoreError: errorInfo.message,
                lastRestoreErrorCode: errorInfo.code,
                lastRestoreErrorAt: Date.now(),
                lastRestoreSource: source,
            });
            analytics.logEvent('cloud_restore_failed', { source, mode });
            throw error;
        } finally {
            isRestoring = false;
            restoreInFlight = null;
        }
    })();

    return restoreInFlight;
};

const initialize = async (): Promise<void> => {
    if (initialized) return;
    await authService.waitForAuthReady();
    await loadSyncBlockState();

    storageUnsubscribe = subscribeStorage((key, value, action) => {
        if (action === 'clear') {
            syncBlocked = false;
            return;
        }
        if (key === storage.keys.PENDING_AUTH_DELETE) {
            syncBlocked = !!value;
            if (syncBlocked) {
                pendingTimers.forEach((timeout) => clearTimeout(timeout));
                pendingTimers.clear();
            }
            return;
        }
        if (action !== 'set') return;
        if (isRestoring) return;
        if (!isSyncableKey(key)) return;
        scheduleKeySync(key, value);
    });

    initialized = true;
};

const destroy = (): void => {
    storageUnsubscribe?.();
    storageUnsubscribe = null;
    pendingTimers.forEach((timeout) => clearTimeout(timeout));
    pendingTimers.clear();
    initialized = false;
};

const getStatus = async (): Promise<CloudSyncStatus | null> => {
    return await storage.get<CloudSyncStatus>(storage.keys.CLOUD_SYNC_STATUS);
};

const getLocalSummary = async (): Promise<CloudDataSummary> => {
    const plans = await loadLocalPlansByDate();
    const planDates = new Set<string>();
    plans.forEach((plan) => {
        if (plan?.date) planDates.add(plan.date);
    });

    const wrapups = (await storage.get<DailyWrapUp[]>(storage.keys.DAILY_WRAPUPS)) || [];
    const foodLogs = (await storage.get<FoodLogEntry[]>(storage.keys.FOOD)) || [];
    const moodLogs = (await storage.get<MoodLog[]>(storage.keys.MOOD)) || [];
    const weightLogs = (await storage.get<WeightLogEntry[]>(storage.keys.WEIGHT)) || [];
    const activityLogs = (await storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY)) || [];
    const sleepLogs = (await storage.get<SleepSession[]>(storage.keys.SLEEP_HISTORY)) || [];

    const totals = {
        plans: planDates.size,
        wrapups: wrapups.length,
        logs: {
            food: foodLogs.length,
            mood: moodLogs.length,
            weight: weightLogs.length,
            activity: activityLogs.length,
            sleep: sleepLogs.length,
        },
    };

    const logCount = Object.values(totals.logs).reduce((sum, count) => sum + count, 0);
    return {
        hasData: totals.plans > 0 || totals.wrapups > 0 || logCount > 0,
        totals,
    };
};

const getCloudSummary = async (): Promise<CloudDataSummary> => {
    const empty: CloudDataSummary = {
        hasData: false,
        totals: {
            plans: 0,
            wrapups: 0,
            logs: { food: 0, mood: 0, weight: 0, activity: 0, sleep: 0 },
        },
    };

    try {
        const userRef = await getUserDocRef();
        if (!userRef) return empty;

        const [plansSnap, wrapupsSnap, logsSnap] = await Promise.all([
            getDocs(query(collection(userRef, 'plans'), limit(1))),
            getDocs(query(collection(userRef, 'wrapups'), limit(1))),
            getDocs(query(collection(userRef, 'logs'), limit(1))),
        ]);

        const hasData = plansSnap.size > 0 || wrapupsSnap.size > 0 || logsSnap.size > 0;
        return {
            hasData,
            totals: {
                plans: plansSnap.size > 0 ? 1 : 0,
                wrapups: wrapupsSnap.size > 0 ? 1 : 0,
                logs: { food: logsSnap.size > 0 ? 1 : 0, mood: 0, weight: 0, activity: 0, sleep: 0 },
            },
        };
    } catch (error) {
        analytics.logError(error, 'CloudSync.getCloudSummary');
        return empty;
    }
};

export const cloudSyncService = {
    initialize,
    destroy,
    syncAllNow,
    restoreFromCloud,
    getStatus,
    getLocalSummary,
    getCloudSummary,
};

export default cloudSyncService;
