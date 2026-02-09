/**
 * Overlay Scheduler Service
 * 
 * Manages dynamic overlay scheduling:
 * - Syncs overlays with current plan
 * - Subscribes to PLAN_GENERATED/PLAN_UPDATED events
 * - Cancels old overlays before rescheduling
 * - No hardcoded limits - schedules all future uncompleted items
 */

import storage from './storageService';
import { DailyPlan, PlanItem, DEFAULT_OVERLAY_SETTINGS, type OverlaySettings, type NotificationPlanMode } from '../types';
import { getActiveDayKey, getPlanItemDateTime } from './dayBoundaryService';
import { getLocalDateKey } from '../utils/dateUtils';
import { Platform } from 'react-native';
import * as overlayService from './overlayService';
import { subscribe } from './planEventService';
import { txStoreService } from './txStoreService';
import { userAdaptiveService } from './userAdaptiveService';
import { scheduleNightlyWrapUpReminder, schedulePlanNotifications } from './notificationService';

// Maximum overlays to schedule (stay well under Android 500 alarm limit)
// This is a safety limit, not a hardcoded window
const MAX_OVERLAY_SAFETY_LIMIT = 30;

const resolvePlanForKeys = async (candidateKeys: string[]): Promise<DailyPlan | null> => {
    const keys = Array.from(new Set(candidateKeys.filter(Boolean)));

    for (const key of keys) {
        const planKey = `${storage.keys.DAILY_PLAN}_${key}`;
        const plan = await storage.get<DailyPlan>(planKey);
        if (plan && (!plan.date || plan.date === key)) return plan;
    }

    const legacy = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
    if (legacy && (!legacy.date || keys.includes(legacy.date))) return legacy;

    return null;
};

const getNotificationPlanMode = async (): Promise<NotificationPlanMode> => {
    const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
    return prefs?.notificationPlanMode || 'high';
};

const normalizeOverlayType = (type?: string): string => {
    const raw = (type || '').toLowerCase();
    if (raw.includes('meal')) return 'meal';
    if (raw.includes('hydration') || raw.includes('water')) return 'hydration';
    if (raw.includes('workout') || raw.includes('activity') || raw.includes('work_break')) return 'activity';
    if (raw.includes('sleep') || raw.includes('wakeup')) return 'sleep';
    return raw || 'other';
};

const shouldScheduleOverlayForItem = (
    item: PlanItem,
    triggerDate: Date,
    policy: { suppressedTypes: string[]; suppressedHours: number[] }
): boolean => {
    const typeKey = normalizeOverlayType(item.type);
    if (typeKey !== 'sleep' && policy.suppressedTypes.includes(typeKey)) {
        return false;
    }
    if (typeKey !== 'sleep' && policy.suppressedHours.includes(triggerDate.getHours())) {
        return false;
    }
    return true;
};

const applyAdaptiveOverlayConfig = async (
    policy: { suppressedTypes: string[] },
    settings: OverlaySettings
): Promise<void> => {
    if (!txStoreService.available()) return;

    const suppressed = new Set(policy.suppressedTypes);
    const overlaysEnabled = !!settings.enabled && !!settings.permissionGranted;
    const overlayMealEnabled = overlaysEnabled && settings.types.meal && !suppressed.has('meal');
    const overlayHydrationEnabled = overlaysEnabled && settings.types.hydration && !suppressed.has('hydration');
    const overlayActivityEnabled =
        overlaysEnabled &&
        (settings.types.workout || settings.types.workBreak) &&
        !suppressed.has('activity');
    const overlaySleepEnabled = overlaysEnabled && settings.types.sleep;

    await txStoreService.updateConfig({
        overlaysEnabled,
        overlayMealEnabled,
        overlayHydrationEnabled,
        overlayActivityEnabled,
        overlaySleepEnabled,
    });
};

/**
 * Build a trigger date from plan date and time string
 */
/**
 * Get all future, uncompleted plan items sorted by time
 */
const getFutureUncompletedItems = async (plan: DailyPlan): Promise<PlanItem[]> => {
    const now = Date.now();
    const todayKey = getLocalDateKey(new Date());

    if (plan.date < todayKey) return [];

    const filtered: PlanItem[] = [];
    for (const item of plan.items || []) {
        if (!item.time) continue;
        if (item.completed || item.skipped) continue;

        const triggerDate = await getPlanItemDateTime(plan.date, item.time);
        if (!triggerDate) continue;

        if (plan.date === todayKey) {
            if (triggerDate.getTime() > now) {
                filtered.push(item);
            }
            continue;
        }

        filtered.push(item);
    }

    return filtered.sort((a, b) => a.time.localeCompare(b.time));
};

const resolveBestPlanForOverlays = async (
    activeDayKey: string,
    calendarDayKey: string
): Promise<DailyPlan | null> => {
    const candidateKeys = activeDayKey === calendarDayKey
        ? [activeDayKey]
        : [activeDayKey, calendarDayKey];

    const primaryPlan = await resolvePlanForKeys(candidateKeys);
    if (!primaryPlan) return null;

    if (activeDayKey !== calendarDayKey) {
        const calendarPlan = await resolvePlanForKeys([calendarDayKey]);
        if (calendarPlan && calendarPlan !== primaryPlan) {
            const [primaryFuture, calendarFuture] = await Promise.all([
                getFutureUncompletedItems(primaryPlan),
                getFutureUncompletedItems(calendarPlan),
            ]);

            if (calendarFuture.length > primaryFuture.length) {
                return calendarPlan;
            }

            if (calendarFuture.length > 0 && primaryFuture.length === 0) {
                return calendarPlan;
            }
        }
    }

    return primaryPlan;
};

/**
 * Sync overlays with the given plan
 * - Cancels all existing overlays
 * - Schedules overlays for all future uncompleted items
 */
export const syncOverlaysWithPlan = async (plan: DailyPlan): Promise<{ scheduled: number; total: number }> => {
    console.log('[OverlayScheduler] Syncing overlays with plan...');
    const adaptivePolicy = await userAdaptiveService.getOverlayPolicy();

    if (Platform.OS !== 'android') {
        const mode = await getNotificationPlanMode();
        await schedulePlanNotifications(plan, { mode });
        await scheduleNightlyWrapUpReminder();
        const total = plan.items?.filter(item => item.time && !item.completed && !item.skipped).length || 0;
        console.log(`[OverlayScheduler] Scheduled iOS notifications for ${total} items`);
        return { scheduled: total, total };
    }

    // Android execution-plane: delegate to TxStore + native reconcile.
    if (Platform.OS === 'android' && txStoreService.available()) {
        const futureItems = await getFutureUncompletedItems(plan);
        let settings: OverlaySettings | null = null;
        let finalScheduledCount = 0;

        try {
            settings = await overlayService.getOverlaySettings();
            await applyAdaptiveOverlayConfig(adaptivePolicy, settings);
        } catch (error) {
            console.warn('[OverlayScheduler] Adaptive overlay config failed:', error);
        }

        // Sync plan to native TxStore
        await txStoreService.syncPlan(plan);
        if (settings?.enabled && settings.permissionGranted) {
            await txStoreService.triggerReconcile();
            try {
                let scheduledCount = await overlayService.getScheduledOverlayCount();
                if (scheduledCount === 0 && futureItems.length > 0) {
                    const fallbackItems = futureItems.slice(0, MAX_OVERLAY_SAFETY_LIMIT);
                    let fallbackScheduled = 0;
                    for (const item of fallbackItems) {
                        const triggerDate = await getPlanItemDateTime(plan.date, item.time);
                        if (!triggerDate) continue;
                        if (!shouldScheduleOverlayForItem(item, triggerDate, adaptivePolicy)) {
                            continue;
                        }
                        const success = await overlayService.scheduleOverlay(item, triggerDate, plan.date);
                        if (success) fallbackScheduled++;
                    }
                    console.log(`[OverlayScheduler] Fallback overlay scheduling applied (${fallbackScheduled})`);
                    scheduledCount = await overlayService.getScheduledOverlayCount();
                }
                finalScheduledCount = scheduledCount;
            } catch (error) {
                console.warn('[OverlayScheduler] Overlay fallback check failed:', error);
            }
        }

        console.log(`[OverlayScheduler] Delegated to native reconcile (${futureItems.length} future items)`);
        return {
            scheduled: finalScheduledCount,
            total: futureItems.length
        };
    }

    // Step 1: Cancel all existing overlays
    try {
        await overlayService.cancelAllScheduledOverlays();
        console.log('[OverlayScheduler] Cancelled all existing overlays');
    } catch (error) {
        console.warn('[OverlayScheduler] Failed to cancel overlays:', error);
    }

    // Step 2: Check if overlays are enabled
    const settings = await overlayService.getOverlaySettings();
    if (!settings.enabled) {
        console.log('[OverlayScheduler] Overlays disabled in settings, skipping');
        return { scheduled: 0, total: 0 };
    }

    // Step 3: Get future uncompleted items
    const futureItems = await getFutureUncompletedItems(plan);
    console.log(`[OverlayScheduler] Found ${futureItems.length} future uncompleted items`);

    if (futureItems.length === 0) {
        return { scheduled: 0, total: 0 };
    }

    // Step 4: Schedule overlays for each item (up to safety limit)
    let scheduledCount = 0;
    const itemsToSchedule = futureItems.slice(0, MAX_OVERLAY_SAFETY_LIMIT);

    for (const item of itemsToSchedule) {
        const triggerDate = await getPlanItemDateTime(plan.date, item.time);
        if (!triggerDate) continue;

        try {
            if (!shouldScheduleOverlayForItem(item, triggerDate, adaptivePolicy)) {
                continue;
            }
            const success = await overlayService.scheduleOverlay(item, triggerDate, plan.date);
            if (success) {
                scheduledCount++;
            }
        } catch (error) {
            console.warn(`[OverlayScheduler] Failed to schedule overlay for ${item.title}:`, error);
        }
    }

    console.log(`[OverlayScheduler] ✅ Scheduled ${scheduledCount}/${futureItems.length} overlays`);
    return { scheduled: scheduledCount, total: futureItems.length };
};

/**
 * Sync overlays with the current plan from storage
 */
export const syncOverlaysFromStorage = async (): Promise<{ scheduled: number; total: number }> => {
    const activeDayKey = await getActiveDayKey();
    const calendarDayKey = getLocalDateKey(new Date());
    const plan = await resolveBestPlanForOverlays(activeDayKey, calendarDayKey);

    if (!plan) {
        console.log(`[OverlayScheduler] No plan found for ${activeDayKey}${activeDayKey !== calendarDayKey ? `, ${calendarDayKey}` : ''}`);
        return { scheduled: 0, total: 0 };
    }

    return syncOverlaysWithPlan(plan);
};

/**
 * Initialize event listeners for plan changes
 * Call this once on app startup
 */
export const initOverlayEventListeners = (): (() => void) => {
    console.log('[OverlayScheduler] Initializing event listeners...');

    // Startup bootstrap:
    // - Ensure overlay settings exist in storage (so TxStore + native prefs can mirror it deterministically)
    // - Refresh overlay permission state (covers installs where permission is already granted)
    // - Sync to native prefs + schedule overlays for current plan
    void (async () => {
        try {
            const existing = await storage.get<OverlaySettings>(storage.keys.OVERLAY_SETTINGS);
            if (!existing) {
                await overlayService.saveOverlaySettings(DEFAULT_OVERLAY_SETTINGS);
            }

            // Updates stored permissionGranted if it changed.
            await overlayService.checkOverlayPermission();

            const synced = await overlayService.syncSettingsToNative();
            console.log(`[OverlayScheduler] Settings synced to native: ${synced}`);

            const result = await syncOverlaysFromStorage();
            console.log(`[OverlayScheduler] Startup sync: scheduled ${result.scheduled}/${result.total} overlays`);
        } catch (error) {
            console.warn('[OverlayScheduler] Startup bootstrap failed:', error);
        }
    })();

    // Subscribe to plan generated event
    const unsubGenerated = subscribe('PLAN_GENERATED', async (data: any) => {
        console.log('[OverlayScheduler] PLAN_GENERATED event received');
        if (data?.plan) {
            await syncOverlaysWithPlan(data.plan);
        } else {
            await syncOverlaysFromStorage();
        }
    });

    // Subscribe to plan updated event
    const unsubUpdated = subscribe('PLAN_UPDATED', async (data: any) => {
        console.log('[OverlayScheduler] PLAN_UPDATED event received');
        if (data?.plan) {
            await syncOverlaysWithPlan(data.plan);
        } else {
            await syncOverlaysFromStorage();
        }
    });

    console.log('[OverlayScheduler] ✅ Event listeners initialized');

    return () => {
        unsubGenerated();
        unsubUpdated();
    };
};

/**
 * Trigger overlay sync from native (called by WorkManager)
 */
export const triggerOverlaySyncFromNative = async (): Promise<void> => {
    console.log('[OverlayScheduler] Triggered from native WorkManager');
    await syncOverlaysFromStorage();
};

/**
 * Sync overlays with the current day's plan
 * Call this when permission is granted or settings change
 */
export const syncOverlaysWithCurrentPlan = async (): Promise<{ scheduled: number; total: number }> => {
    console.log('[OverlayScheduler] Syncing with current plan...');

    try {
        const activeDayKey = await getActiveDayKey();
        const calendarDayKey = getLocalDateKey(new Date());
        const plan = await resolveBestPlanForOverlays(activeDayKey, calendarDayKey);

        if (!plan) {
            console.log(`[OverlayScheduler] No plan for ${activeDayKey}${activeDayKey !== calendarDayKey ? `, ${calendarDayKey}` : ''}, skipping sync`);
            return { scheduled: 0, total: 0 };
        }

        return await syncOverlaysWithPlan(plan);
    } catch (error) {
        console.error('[OverlayScheduler] Failed to sync with current plan:', error);
        return { scheduled: 0, total: 0 };
    }
};
