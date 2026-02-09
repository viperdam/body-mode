import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import storage from './storageService';
import { txStoreService } from './txStoreService';
import { getActiveDayKey } from './dayBoundaryService';
import { getLocalDateKey } from '../utils/dateUtils';
import { emit } from './planEventService';
import type { DailyPlan, PlanItem } from '../types';

type PlanSyncResult = {
    synced: boolean;
    hydrated: boolean;
    dateKeys: string[];
};

const SYNC_THROTTLE_MS = 30_000;
let lastSyncAt = 0;

const planStorageKey = (dateKey: string): string => `${storage.keys.DAILY_PLAN}_${dateKey}`;

const normalizePlanItemType = (value?: string): PlanItem['type'] => {
    switch ((value || '').toLowerCase()) {
        case 'meal':
            return 'meal';
        case 'workout':
        case 'activity':
            return 'workout';
        case 'hydration':
        case 'water':
            return 'hydration';
        case 'sleep':
        case 'wakeup':
            return 'sleep';
        case 'work_break':
        case 'break':
            return 'work_break';
        default:
            return 'workout';
    }
};

const buildPlanFromTxPlan = (txPlan: {
    date: string;
    items: Array<{
        id: string;
        time: string;
        type: string;
        title: string;
        description: string;
        completed: boolean;
        skipped?: boolean;
        completedAt?: number;
        skippedAt?: number;
        snoozedUntil?: number;
    }>;
    summary?: string;
    updatedAt?: number;
}): DailyPlan => {
    const items: PlanItem[] = (txPlan.items || []).map(item => ({
        id: item.id,
        time: item.time,
        type: normalizePlanItemType(item.type),
        title: item.title,
        description: item.description || '',
        completed: !!item.completed,
        skipped: item.skipped,
        completedAt: item.completedAt,
        skippedAt: item.skippedAt,
        snoozedUntil: item.snoozedUntil,
    }));

    return {
        date: txPlan.date,
        summary: txPlan.summary || '',
        items,
        updatedAt: txPlan.updatedAt,
    };
};

const persistPlan = async (plan: DailyPlan, dateKey: string, updateLegacy: boolean): Promise<void> => {
    const planKey = planStorageKey(dateKey);
    await storage.set(planKey, plan, { skipPlanSync: true });
    if (updateLegacy) {
        await storage.set(storage.keys.DAILY_PLAN, plan, { skipPlanSync: true });
    }
    storage.invalidateCache(planKey);
    storage.invalidateCache(storage.keys.DAILY_PLAN);
};

export const syncPlanFromNative = async (options?: {
    dateKeys?: string[];
    emitEvents?: boolean;
    force?: boolean;
}): Promise<PlanSyncResult> => {
    if (Platform.OS !== 'android' || !txStoreService.available()) {
        return { synced: false, hydrated: false, dateKeys: [] };
    }

    const now = Date.now();
    if (!options?.force && now - lastSyncAt < SYNC_THROTTLE_MS) {
        return { synced: false, hydrated: false, dateKeys: [] };
    }
    lastSyncAt = now;

    const activeDayKey = await getActiveDayKey();
    const calendarDayKey = getLocalDateKey(new Date());
    const dateKeys = options?.dateKeys?.length
        ? Array.from(new Set(options.dateKeys))
        : (activeDayKey === calendarDayKey ? [activeDayKey] : [activeDayKey, calendarDayKey]);

    let synced = false;
    let hydrated = false;

    for (const dateKey of dateKeys) {
        const planKey = planStorageKey(dateKey);
        const existingPlan = await AsyncStorage.getItem(planKey);

        if (!existingPlan) {
            const txPlan = await txStoreService.getPlan(dateKey);
            if (txPlan && txPlan.items && txPlan.items.length > 0) {
                const plan = buildPlanFromTxPlan(txPlan);
                await persistPlan(plan, dateKey, dateKey === activeDayKey);
                hydrated = true;
                if (options?.emitEvents) {
                    await emit('PLAN_GENERATED', { dateKey, source: 'native_sync' });
                }
            }
        }

        const updated = await txStoreService.syncFromNative(dateKey);
        if (updated) {
            storage.invalidateCache(planKey);
            storage.invalidateCache(storage.keys.DAILY_PLAN);
            synced = true;
            if (options?.emitEvents) {
                await emit('PLAN_UPDATED', { date: dateKey, source: 'native_sync' });
            }
        }
    }

    return { synced, hydrated, dateKeys };
};

export default {
    syncPlanFromNative,
};
