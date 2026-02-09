// Overlay Action Service - Handles pending actions from native overlay
// When overlay buttons (Done/Snooze/Skip) are pressed while app is killed,
// actions are stored in SharedPreferences and processed when app opens.
// Now uses actionSyncService for safe modifications and cross-channel sync.

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import {
    completeItemWithSync,
    skipItemWithSync,
    snoozeItemUntilWithSync,
    storeFailedAction,
    recoverFailedActions,
    cancelRelatedNotification,
} from './actionSyncService';
import storage from './storageService';
import { sleepSessionService } from './sleepSessionService';
import sleepHoursService from './sleepHoursService';
import { emit as emitPlanEvent } from './planEventService';
import { autoPlanService } from './autoPlanService';
import { getActiveDayKey, setLastWakeTime } from './dayBoundaryService';
import { DailyPlan, type PendingOverlayAction } from '../types';
import { syncPlanFromNative } from './planSyncService';
import { syncOverlaysWithCurrentPlan } from './overlaySchedulerService';

const { OverlayModule, OverlayScheduler, SleepBridge } = NativeModules;

const shouldDeferSleepActionsToNative = (): boolean => {
    return Platform.OS === 'android' && !!SleepBridge;
};

interface OverlayActionResult {
    processed: number;
    failed: number;
    actions: string[];
    recovered: number;
}

let processPendingActionsInFlight: Promise<OverlayActionResult> | null = null;

const completeSleepItemForDate = async (dateKey: string): Promise<void> => {
    const planKey = `${storage.keys.DAILY_PLAN}_${dateKey}`;
    let plan = await storage.get<DailyPlan>(planKey);

    if (!plan) {
        plan = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
    }

    if (!plan || (plan.date && plan.date !== dateKey)) return;

    const sleepItem = plan.items?.find(item => item.type === 'sleep' && !item.completed && !item.skipped);
    if (!sleepItem?.id) return;

    await completeItemWithSync(dateKey, sleepItem.id, { skipSmartLogging: true });
};

/**
 * Check for and process any pending overlay actions.
 * Call this when app launches or resumes.
 * 
 * PHASE 2 IMPROVEMENTS:
 * - Per-event ACK: Remove events individually after successful processing
 * - Failed events remain in queue for retry
 * - Max-age filter: Ignore events older than 7 days
 */
export const processPendingActions = async (): Promise<OverlayActionResult> => {
    if (processPendingActionsInFlight) return processPendingActionsInFlight;

    processPendingActionsInFlight = (async () => {
        const result: OverlayActionResult = { processed: 0, failed: 0, actions: [], recovered: 0 };
        const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days max age

        // First, try to recover any previously failed actions
        try {
            const recovery = await recoverFailedActions();
            result.recovered = recovery.recovered;
            console.log(`[OverlayActionService] Recovered ${recovery.recovered} failed actions`);
        } catch (error) {
            console.error('[OverlayActionService] Error recovery failed:', error);
        }

        if (Platform.OS !== 'android' || !OverlayModule?.getPendingEvents) {
            return result;
        }

        try {
            const pendingJson = await OverlayModule.getPendingEvents();
            const pending: PendingOverlayAction[] = JSON.parse(pendingJson || '[]');

            if (pending.length === 0) {
                return result;
            }

            console.log(`[OverlayActionService] Processing ${pending.length} pending actions`);
            const now = Date.now();

            for (const action of pending) {
                // PHASE 2: Max-age filter - skip stale events
                if (action.timestamp && (now - action.timestamp) > MAX_AGE_MS) {
                    console.log(`[OverlayActionService] Skipping stale event ${action.id} (${Math.round((now - action.timestamp) / (1000 * 60 * 60 * 24))} days old)`);
                    // Remove stale event
                    try {
                        await OverlayModule.removePendingEvent?.(action.id);
                    } catch (e) {
                        console.warn('[OverlayActionService] Failed to remove stale event:', e);
                    }
                    continue;
                }

                try {
                    await processAction(action);

                    // PHASE 2: Per-event ACK - remove only this successfully processed event
                    try {
                        await OverlayModule.removePendingEvent?.(action.id);
                    } catch (e) {
                        console.warn('[OverlayActionService] Failed to ACK event:', e);
                    }

                    result.processed++;
                    result.actions.push(`${action.action}:${action.planItemId || action.id}`);
                } catch (error) {
                    console.error(`[OverlayActionService] Failed to process action ${action.id}:`, error);

                    // Store for later recovery (event remains in pending queue)
                    if (action.planDate && action.planItemId) {
                        await storeFailedAction({
                            planDate: action.planDate,
                            planItemId: action.planItemId,
                            actionType: action.action.toLowerCase() as 'complete' | 'skip' | 'snooze',
                            snoozedUntil: action.snoozedUntil,
                        });
                    }

                    result.failed++;
                    // NOTE: We do NOT remove failed events - they stay for retry on next app open
                }
            }

            if (result.processed > 0) {
                try {
                    await syncPlanFromNative({ emitEvents: true, force: true });
                } catch (syncError) {
                    console.warn('[OverlayActionService] Plan sync after pending actions failed:', syncError);
                }
                try {
                    await syncOverlaysWithCurrentPlan();
                } catch (overlayError) {
                    console.warn('[OverlayActionService] Overlay resync after pending actions failed:', overlayError);
                }
            }

            console.log(`[OverlayActionService] Processed ${result.processed}, failed ${result.failed}`);
            return result;
        } catch (error) {
            console.error('[OverlayActionService] Failed to get pending actions:', error);
            return result;
        }
    })();

    try {
        return await processPendingActionsInFlight;
    } finally {
        processPendingActionsInFlight = null;
    }
};


/**
 * Process a single overlay action using safe sync methods
 */
const processAction = async (action: PendingOverlayAction): Promise<void> => {
    const { planDate, planItemId, type } = action;

    // ==================== SLEEP/WAKE HANDLING ====================
    // These don't require planDate/planItemId
    if (type === 'sleep') {
        if (shouldDeferSleepActionsToNative()) {
            console.log('[OverlayActionService] Deferring sleep action to native pipeline');
            return;
        }
        if (action.action === 'COMPLETE') {
            // User tapped "Yes" on "Going to sleep?" overlay
            console.log('[OverlayActionService] Sleep confirmed via overlay');
            await sleepSessionService.startSession('confirmed');
            const activeDayKey = await getActiveDayKey();
            const dateKey = action.planDate && action.planDate === activeDayKey
                ? action.planDate
                : activeDayKey;
            await completeSleepItemForDate(dateKey);
        } else if (action.action === 'SNOOZE') {
            // User tapped "Snooze" - will be re-prompted later by SleepDetectionWorker
            console.log('[OverlayActionService] Sleep probe snoozed');
        } else if (action.action === 'SKIP') {
            // User tapped "No" - they're not sleeping
            console.log('[OverlayActionService] Sleep probe declined');
        }
        return;
    }

    if (type === 'wakeup') {
        if (shouldDeferSleepActionsToNative()) {
            console.log('[OverlayActionService] Deferring wake action to native pipeline');
            return;
        }
        if (action.action === 'COMPLETE') {
            // User tapped "Yes" on "Good morning!" overlay
            console.log('[OverlayActionService] Wakeup confirmed via overlay');
            const session = await sleepSessionService.endSession();
            if (session) {
                console.log(`[OverlayActionService] Sleep session recorded: ${session.durationHours}h`);
                const totalHours = await sleepHoursService.recomputeForDate(session.date);
                await emitPlanEvent('SLEEP_ANALYZED', { date: session.date, hours: totalHours });
            }

            if (session?.type === 'night') {
                // Store wake time for smart day boundary
                await setLastWakeTime(action.timestamp || Date.now());
                await getActiveDayKey();

                // CRITICAL: Trigger new day's plan generation
                console.log('[OverlayActionService] Triggering WAKE plan generation');
                try {
                    const result = await autoPlanService.generateTodayPlan('WAKE');
                    console.log(`[OverlayActionService] Plan generation result: ${result.status}`);
                } catch (planError) {
                    console.warn('[OverlayActionService] Plan generation failed:', planError);
                    // Will be retried on app foreground
                }
            } else {
                console.log('[OverlayActionService] Wake confirmed for nap; skipping full plan regeneration');
            }
        } else if (action.action === 'SNOOZE') {
            // User tapped "Snooze" - still sleeping
            console.log('[OverlayActionService] Wakeup snoozed, still sleeping');
        }
        return;
    }

    // ==================== STANDARD PLAN ITEM HANDLING ====================
    if (!planDate || !planItemId) {
        console.log(`[OverlayActionService] Action ${action.id} missing plan info, skipping`);
        return;
    }

    // Always cancel related notification to prevent duplicate reminders
    await cancelRelatedNotification(planItemId);

    switch (action.action) {
        case 'COMPLETE':
            await completeItemWithSync(planDate, planItemId);
            break;
        case 'SNOOZE':
            await snoozeItemWithSyncAndReschedule(planDate, planItemId, action.snoozedUntil);
            break;
        case 'SKIP':
            await skipItemWithSync(planDate, planItemId);
            break;
    }

    // CRITICAL: Invalidate React Native cache so it re-reads from AsyncStorage
    // This ensures UI reflects changes made by native overlay actions
    storage.invalidateCache(`${storage.keys.DAILY_PLAN}_${planDate}`);
    storage.invalidateCache(storage.keys.DAILY_PLAN);
    console.log(`[OverlayActionService] Cache invalidated for plan ${planDate}`);

    // Emit PLAN_UPDATED event so UI components refresh
    try {
        const { emit } = require('./planEventService');
        emit('PLAN_UPDATED', { date: planDate, source: 'overlay', itemId: planItemId });
        console.log(`[OverlayActionService] Emitted PLAN_UPDATED for ${planDate}`);
    } catch (e) {
        console.warn('[OverlayActionService] Failed to emit PLAN_UPDATED:', e);
    }
};

/**
 * Snooze with overlay rescheduling via ReconcileWorker
 */
const snoozeItemWithSyncAndReschedule = async (
    planDate: string,
    planItemId: string,
    snoozedUntil?: number
): Promise<void> => {
    const snoozeTime = typeof snoozedUntil === 'number'
        ? snoozedUntil
        : Date.now() + 15 * 60 * 1000;

    await snoozeItemUntilWithSync(planDate, planItemId, snoozeTime);

    // === PHASE 4 FIX: Trigger reconcile instead of direct overlay scheduling ===
    // This makes ReconcileWorker the single owner of AlarmManager state
    const { ReconcileBridge } = require('react-native').NativeModules;
    ReconcileBridge?.triggerReconcile?.();
    console.log(`[OverlayActionService] Snooze processed, reconcile triggered for item ${planItemId}`);
};

/**
 * Set up listener for real-time overlay actions (when app is in foreground).
 * @param onActionProcessed - Optional callback called after each action is processed (e.g., to reload data)
 */
export const setupOverlayActionListener = (
    onActionProcessed?: (action: PendingOverlayAction) => void
): (() => void) | undefined => {
    if (Platform.OS !== 'android' || !OverlayModule) {
        return undefined;
    }

    try {
        // Use OverlayModule for event emitter - events are sent from OverlayWindowService
        const eventEmitter = new NativeEventEmitter(OverlayModule);

        const subscription = eventEmitter.addListener('onOverlayAction', async (event) => {
            console.log('[OverlayActionService] Received real-time action:', event);

            const action: PendingOverlayAction = {
                id: event.id,
                action: event.action,
                planDate: event.planDate,
                planItemId: event.planItemId,
                snoozedUntil: event.snoozedUntil,
                type: event.type, // Gap 2 Fix: Include type for sleep/wake routing
                timestamp: Date.now(),
            };

            try {
                await processAction(action);

                // Notify caller to refresh data
                if (onActionProcessed) {
                    onActionProcessed(action);
                }
            } catch (error) {
                console.error('[OverlayActionService] Failed to process real-time action:', error);

                // Store for later recovery
                if (action.planDate && action.planItemId) {
                    await storeFailedAction({
                        planDate: action.planDate,
                        planItemId: action.planItemId,
                        actionType: action.action.toLowerCase() as 'complete' | 'skip' | 'snooze',
                        snoozedUntil: action.snoozedUntil,
                    });
                }
            }
        });

        return () => subscription.remove();
    } catch (error) {
        console.error('[OverlayActionService] Failed to set up action listener:', error);
        return undefined;
    }
};

export default {
    processPendingActions,
    setupOverlayActionListener,
};

