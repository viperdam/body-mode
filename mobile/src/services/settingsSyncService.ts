import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import authService from './authService';
import storage from './storageService';
import { analytics } from './analyticsService';
import type { NotificationPlanMode } from '../types';

type SettingsSyncSource = 'settings' | 'auth' | 'restore' | 'app_start' | 'manual' | 'storage_change';

type CloudPreferences = {
    useMetric?: boolean;
    notificationPlanMode?: NotificationPlanMode;
    darkMode?: boolean;
    notificationsEnabled?: boolean;
    sleepScheduleAutoEnabled?: boolean;
    adRechargeOnWake?: boolean;
    adRechargeOnBackground?: boolean;
};

const buildPreferencesPayload = (prefs: Record<string, unknown>): CloudPreferences => {
    const next: CloudPreferences = {};
    if (typeof prefs.useMetric === 'boolean') next.useMetric = prefs.useMetric;
    if (typeof prefs.notificationPlanMode === 'string') {
        next.notificationPlanMode = prefs.notificationPlanMode as NotificationPlanMode;
    }
    if (typeof prefs.darkMode === 'boolean') next.darkMode = prefs.darkMode;
    if (typeof prefs.notificationsEnabled === 'boolean') next.notificationsEnabled = prefs.notificationsEnabled;
    if (typeof prefs.sleepScheduleAutoEnabled === 'boolean') {
        next.sleepScheduleAutoEnabled = prefs.sleepScheduleAutoEnabled;
    }
    if (typeof prefs.adRechargeOnWake === 'boolean') {
        next.adRechargeOnWake = prefs.adRechargeOnWake;
    }
    if (typeof prefs.adRechargeOnBackground === 'boolean') {
        next.adRechargeOnBackground = prefs.adRechargeOnBackground;
    }
    return next;
};

const SYNC_DEBOUNCE_MS = 800;
let initialized = false;
let unsubscribe: (() => void) | null = null;
let pendingSync: ReturnType<typeof setTimeout> | null = null;

const getUserDocRef = async () => {
    const user = await authService.waitForAuthReady();
    if (!user) return null;
    return doc(getFirestore(), 'users', user.uid);
};

const syncPreferences = async (source: SettingsSyncSource = 'settings'): Promise<void> => {
    try {
        const docRef = await getUserDocRef();
        if (!docRef) return;

        const prefs = (await storage.get<Record<string, unknown>>(storage.keys.APP_PREFERENCES)) || {};
        const payload = buildPreferencesPayload(prefs);
        if (Object.keys(payload).length === 0) return;

        await setDoc(
            docRef,
            {
                settings: {
                    preferences: payload,
                    updatedAt: serverTimestamp(),
                    lastUpdateSource: source,
                },
            },
            { merge: true }
        );
    } catch (error) {
        analytics.logError(error, 'SettingsSync.syncPreferences', { source });
    }
};

const schedulePreferenceSync = (source: SettingsSyncSource): void => {
    if (pendingSync) {
        clearTimeout(pendingSync);
    }
    pendingSync = setTimeout(() => {
        pendingSync = null;
        void syncPreferences(source);
    }, SYNC_DEBOUNCE_MS);
};

const initialize = (): void => {
    if (initialized) return;
    unsubscribe = storage.subscribe((key, _value, action) => {
        if (action !== 'set') return;
        if (key !== storage.keys.APP_PREFERENCES) return;
        schedulePreferenceSync('storage_change');
    });
    initialized = true;
};

const destroy = (): void => {
    if (pendingSync) {
        clearTimeout(pendingSync);
        pendingSync = null;
    }
    unsubscribe?.();
    unsubscribe = null;
    initialized = false;
};

const restorePreferences = async (options: { source?: SettingsSyncSource; mode?: 'merge' | 'replace' } = {}) => {
    try {
        const docRef = await getUserDocRef();
        if (!docRef) return null;

        const snapshot = await getDoc(docRef);
        const settings = snapshot.data()?.settings;
        const cloudPrefs = settings?.preferences as CloudPreferences | undefined;
        if (!cloudPrefs) return null;

        const local = (await storage.get<Record<string, unknown>>(storage.keys.APP_PREFERENCES)) || {};
        const merged =
            options.mode === 'replace'
                ? { ...cloudPrefs }
                : { ...local, ...cloudPrefs };

        await storage.set(storage.keys.APP_PREFERENCES, merged);
        analytics.logEvent('settings_restore_completed', { source: options.source ?? 'restore' });
        return merged as CloudPreferences;
    } catch (error) {
        analytics.logError(error, 'SettingsSync.restorePreferences', { source: options.source });
        return null;
    }
};

export const settingsSyncService = {
    initialize,
    destroy,
    syncPreferences,
    restorePreferences,
};

export default settingsSyncService;
