// Boot Recovery Service - Ensures notifications/reminders persist after device restart
// Cross-platform handling for Android and iOS
// Now includes error recovery for failed actions

import { Platform, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import storage from './storageService';
import { DailyPlan } from '../types';
import { schedulePlanNotifications } from './notificationService';
import { recoverFailedActions, withRetry } from './actionSyncService';
import { archiveYesterdaysData } from './historyService';
import { getLocalDateKey } from '../utils/dateUtils';
import { getActiveDayKey } from './dayBoundaryService';
import { syncOverlaysWithPlan } from './overlaySchedulerService';
import { txStoreService } from './txStoreService';

// Track if we've already synced this session
let hasSyncedThisSession = false;
let appStateSubscription: { remove: () => void } | null = null;
let retryAttempts = 0;
const MAX_RETRY_ATTEMPTS = 3;

const resolvePlanForKeys = async (
    candidateKeys: string[]
): Promise<{ plan: DailyPlan | null; dateKey: string | null }> => {
    const keys = Array.from(new Set(candidateKeys.filter(Boolean)));

    for (const key of keys) {
        const planKey = `${storage.keys.DAILY_PLAN}_${key}`;
        const plan = await storage.get<DailyPlan>(planKey);
        if (plan && (!plan.date || plan.date === key)) {
            return { plan, dateKey: plan.date || key };
        }
    }

    const legacy = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
    if (legacy) {
        const legacyDate = legacy.date || keys[0] || null;
        if (!legacy.date || (legacy.date && keys.includes(legacy.date))) {
            return { plan: legacy, dateKey: legacyDate };
        }
    }

    return { plan: null, dateKey: null };
};

const parseDateKey = (key: string): Date | null => {
    const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
};

/**
 * Initialize boot recovery - call this in App.tsx on mount
 */
export const initBootRecovery = (): (() => void) => {
    // Sync on initial mount
    syncRemindersAfterBoot();

    // Also sync when app comes to foreground (in case of soft restart)
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
        if (appStateSubscription) {
            appStateSubscription.remove();
            appStateSubscription = null;
        }
    };
};

/**
 * Handle app state changes to re-sync when coming to foreground
 */
const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
        // iOS: Force resync every time since iOS aggressively kills background tasks
        // Android: Only sync once per session
        if (Platform.OS === 'ios') {
            hasSyncedThisSession = false; // Force resync on iOS
            console.log('[BootRecovery] iOS foregrounded - forcing resync');
        }

        // Small delay to ensure we don't interfere with normal app launch
        setTimeout(() => {
            syncRemindersAfterBoot();
        }, Platform.OS === 'ios' ? 500 : 1000);
    }
};

/**
 * Sync all reminders after boot/restart
 * This ensures:
 * - Today's plan notifications are scheduled
 * - Android overlays are scheduled via native module
 * - iOS notifications are re-verified
 * - Yesterday's data is archived for history summary
 */
export const syncRemindersAfterBoot = async (): Promise<void> => {
    // Only sync once per app session to avoid duplicate notifications
    if (hasSyncedThisSession) {
        console.log('[BootRecovery] Already synced this session, skipping');
        return;
    }

    console.log('[BootRecovery] Syncing reminders after boot/restart...');

    try {
        // First, recover any previously failed actions
        const recovery = await recoverFailedActions();
        if (recovery.recovered > 0) {
            console.log(`[BootRecovery] Recovered ${recovery.recovered} previously failed actions`);
        }

        // Archive yesterday's data for comprehensive history
        await archiveYesterdaysData();
        console.log('[BootRecovery] Archived yesterday\'s data for history summary');

        const activeDayKey = await getActiveDayKey();
        const calendarDayKey = getLocalDateKey(new Date());
        const candidateKeys = activeDayKey === calendarDayKey
            ? [activeDayKey]
            : [activeDayKey, calendarDayKey];

        const { plan, dateKey } = await resolvePlanForKeys(candidateKeys);

        if (plan && dateKey) {
            // Re-schedule notifications for active-day plan
            console.log(`[BootRecovery] Found plan for ${dateKey}, rescheduling notifications...`);
            await schedulePlanNotifications(plan, { mode: 'high' });

            // Count future items (for logging only)
            const now = new Date();
            const planDate = parseDateKey(dateKey) || now;
            const futureItems = plan.items.filter(item => {
                if (!item.time || item.completed || item.skipped) return false;
                const [h, m] = item.time.split(':').map(Number);
                const itemTime = new Date(planDate);
                itemTime.setHours(h, m, 0, 0);
                return itemTime > now;
            });

            console.log(`[BootRecovery] Rescheduled ${futureItems.length} future reminders`);

            // For Android, also ensure native overlays are scheduled
            if (Platform.OS === 'android') {
                // Respect background mode (OFF/LIGHT should not schedule overlays)
                if (txStoreService.available()) {
                    try {
                        const config = await txStoreService.getConfig();
                        const mode = String(config?.mode || '').toUpperCase();
                        if (mode === 'FULL') {
                            await syncAndroidOverlays(plan, dateKey);
                        } else {
                            console.log(`[BootRecovery] Skipping overlay sync due to background mode: ${mode || 'UNKNOWN'}`);
                        }
                    } catch (e) {
                        console.warn('[BootRecovery] Failed to read background mode, skipping overlay sync:', e);
                    }
                } else {
                    // Legacy behavior if TxStore is not available
                    await syncAndroidOverlays(plan, dateKey);
                }
            }
        } else {
            console.log(`[BootRecovery] No plan for active/calendar day (${candidateKeys.join(', ')}), skipping sync`);
        }

        // Verify iOS notification permissions
        if (Platform.OS === 'ios') {
            await verifyIOSNotifications();
        }

        hasSyncedThisSession = true;
        console.log('[BootRecovery] Sync complete');
    } catch (error) {
        console.error('[BootRecovery] Failed to sync reminders:', error);
    }
};

/**
 * Sync Android overlays via native module
 * Android native side also handles BOOT_COMPLETED, but this is a fallback
 */
const syncAndroidOverlays = async (plan: DailyPlan, dateKey: string): Promise<void> => {
    // Delegate to the unified scheduler (TxStore on Android, legacy on other platforms).
    // This enforces safety limits and avoids duplicating scheduling logic here.
    await syncOverlaysWithPlan(plan);
};

/**
 * Verify iOS notifications are still scheduled
 */
const verifyIOSNotifications = async (): Promise<void> => {
    try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        console.log(`[BootRecovery] iOS has ${scheduled.length} scheduled notifications`);

        // If no notifications scheduled but we have a plan, they may have been cleared
        // schedulePlanNotifications will handle re-scheduling
    } catch (error) {
        console.error('[BootRecovery] Failed to verify iOS notifications:', error);
    }
};

/**
 * Force re-sync (for manual testing or after significant changes)
 */
export const forceResync = async (): Promise<void> => {
    hasSyncedThisSession = false;
    await syncRemindersAfterBoot();
};

/**
 * Get sync status for debugging
 */
export const getSyncStatus = (): { synced: boolean } => {
    return { synced: hasSyncedThisSession };
};

export default {
    initBootRecovery,
    syncRemindersAfterBoot,
    forceResync,
    getSyncStatus,
};
