import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Battery from 'expo-battery';
import * as Notifications from 'expo-notifications';
import { NativeModules, Platform } from 'react-native';
import { storage } from './storageService';
import { sleepDraftService } from './sleepDraftService';
import { sleepSessionService } from './sleepSessionService';
import { healthService } from './healthService';
import { processNativeSleepEvents } from './sleepEventService';
import { uncompleteItemWithSync } from './actionSyncService';
import { getLocalDateKey } from '../utils/dateUtils';
import { AutoSleepSettings, DEFAULT_AUTO_SLEEP_SETTINGS, DailyPlan } from '../types';
import i18n from '../i18n';

const { SleepBridge, BatteryOptimization } = NativeModules;

const SLEEP_TASK_NAME = 'BACKGROUND_SLEEP_TRACKING';
const WAKE_CONFIRMATION_LAST_SENT_KEY = 'wake_confirmation_last_sent';
const WAKE_CONFIRMATION_SNOOZED_UNTIL_KEY = 'wake_confirmation_snoozed_until';
const SLEEP_PROBE_SNOOZED_UNTIL_KEY = 'sleep_probe_snoozed_until';
const IOS_HEALTHKIT_LAST_END_KEY = 'ios_healthkit_last_sleep_end';
const IOS_HEALTHKIT_LAST_SYNC_KEY = 'ios_healthkit_last_sleep_sync';

const WAKE_CONFIRMATION_THROTTLE_MS = 30 * 60 * 1000;
const FIRST_INSTALL_GRACE_PERIOD_MS = 2 * 60 * 60 * 1000; // 2 hours
const IOS_HEALTHKIT_SYNC_COOLDOWN_MS = 30 * 60 * 1000;
const IOS_HEALTHKIT_MIN_DURATION_MS = 60 * 60 * 1000;
const IOS_HEALTHKIT_DUPLICATE_GRACE_MS = 5 * 60 * 1000;

const NATIVE_STRING_KEYS = [
    'overlay.native.activity.instructions',
    'overlay.native.ad_recharge.body',
    'overlay.native.ad_recharge.button_later',
    'overlay.native.ad_recharge.button_watch',
    'overlay.native.ad_recharge.title',
    'overlay.native.badge.reminder',
    'overlay.native.button.back',
    'overlay.native.button.camera',
    'overlay.native.button.didnt_sleep',
    'overlay.native.button.dismiss',
    'overlay.native.button.done',
    'overlay.native.button.done_anyway',
    'overlay.native.button.edit_sleep',
    'overlay.native.button.not_yet',
    'overlay.native.button.open_app',
    'overlay.native.button.other_meal',
    'overlay.native.button.other_workout',
    'overlay.native.button.skip',
    'overlay.native.button.snooze',
    'overlay.native.button.start_sleep',
    'overlay.native.button.still_sleeping',
    'overlay.native.button.yes_awake',
    'overlay.native.button.yes_done',
    'overlay.native.food_options.title',
    'overlay.native.location.body',
    'overlay.native.location.option.errand',
    'overlay.native.location.option.gym',
    'overlay.native.location.option.home',
    'overlay.native.location.option.save_place',
    'overlay.native.location.option.visiting',
    'overlay.native.location.option.work',
    'overlay.native.location.title',
    'overlay.native.notification.body',
    'overlay.native.notification.channel_desc',
    'overlay.native.notification.channel_name',
    'overlay.native.notification.title',
    'overlay.native.sleep.description',
    'overlay.native.sleep.title',
    'overlay.native.snooze.minutes',
    'overlay.native.snooze.title',
    'overlay.native.title.reminder',
    'overlay.native.wake.description',
    'overlay.native.wake.title',
    'sleep.native.notification.channel_desc',
    'sleep.native.notification.channel_name',
    'sleep.native.notification.title',
    'sleep.native.notification.body',
];

const buildNativeStrings = (): Record<string, string> => {
    const strings: Record<string, string> = {};
    for (const key of NATIVE_STRING_KEYS) {
        strings[key] = i18n.t(key) as string;
    }
    return strings;
};

const uncompleteSleepPlanItemForDate = async (dateKey: string): Promise<void> => {
    const planKey = `${storage.keys.DAILY_PLAN}_${dateKey}`;
    let plan = await storage.get<DailyPlan>(planKey);
    if (!plan) {
        plan = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
    }
    if (!plan || (plan.date && plan.date !== dateKey)) return;

    const candidates = plan.items?.filter(item => item.type === 'sleep' && item.completed && !item.skipped) || [];
    if (candidates.length === 0) return;

    const target = [...candidates].sort((a, b) => {
        const aCompleted = typeof (a as any).completedAt === 'number' ? (a as any).completedAt : 0;
        const bCompleted = typeof (b as any).completedAt === 'number' ? (b as any).completedAt : 0;
        if (aCompleted !== bCompleted) return bCompleted - aCompleted;
        return (b.time || '').localeCompare(a.time || '');
    })[0];

    if (!target?.id) return;
    await uncompleteItemWithSync(dateKey, target.id);
};

const getResolvedAutoSleepSettings = async (): Promise<AutoSleepSettings> => {
    const stored = await storage.get<AutoSleepSettings>(storage.keys.AUTO_SLEEP_SETTINGS);
    return { ...DEFAULT_AUTO_SLEEP_SETTINGS, ...(stored || {}) };
};

const queueLocalSleepEvent = async (event: {
    type: string;
    timestamp?: number;
    data?: Record<string, any>;
}): Promise<void> => {
    const payload = {
        type: event.type,
        timestamp: event.timestamp ?? Date.now(),
        data: event.data ?? {},
    };

    try {
        const key = storage.keys.PENDING_SLEEP_EVENTS_LOCAL;
        const existing = await storage.get<any[]>(key);
        const next = Array.isArray(existing) ? [...existing, payload] : [payload];
        await storage.set(key, next);
    } catch (error) {
        console.warn('[SleepService] Failed to queue local sleep event:', error);
    }
};

const pushNativeSleepEvent = async (event: {
    type: string;
    timestamp?: number;
    data?: Record<string, any>;
}): Promise<void> => {
    if (Platform.OS !== 'android' || !SleepBridge?.addPendingSleepEvent) {
        await queueLocalSleepEvent(event);
        return;
    }

    const payload = {
        type: event.type,
        timestamp: event.timestamp ?? Date.now(),
        data: event.data ?? {},
    };

    try {
        await SleepBridge.addPendingSleepEvent(JSON.stringify(payload));
    } catch (error) {
        console.warn('[SleepService] Failed to queue native sleep event:', error);
    }
};

const parseSleepTimestamp = (value?: string): number | null => {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
};

const formatDurationHours = (hours: number): string => {
    const rounded = Math.round(hours * 10) / 10;
    const unit = i18n.t('units.h');
    return `${rounded}${unit}`;
};

const scheduleSleepReviewNotification = async (
    draftId: string,
    durationHours: number
): Promise<void> => {
    try {
        const permissions = await Notifications.getPermissionsAsync();
        if (permissions.status !== 'granted') return;
        const durationLabel = formatDurationHours(durationHours);

        await Notifications.scheduleNotificationAsync({
            content: {
                title: i18n.t('sleep_draft.confirm_title'),
                body: i18n.t('sleep_draft.confirm_body', { duration: durationLabel }),
                categoryIdentifier: 'SLEEP_REVIEW',
                data: { type: 'SLEEP_REVIEW', draftId },
                sound: true,
            },
            trigger: null,
        });
    } catch (error) {
        console.warn('[SleepService] Failed to schedule sleep review notification:', error);
    }
};

const syncIosSleepFromHealthKit = async (
    trigger: 'background' | 'foreground' | 'manual' = 'background'
): Promise<{ status: string; draftId?: string }> => {
    if (Platform.OS !== 'ios') return { status: 'skipped_platform' };
    if (!healthService.isInitialized()) return { status: 'healthkit_unavailable' };

    const now = Date.now();
    const lastSync = await storage.get<number>(IOS_HEALTHKIT_LAST_SYNC_KEY);
    if (typeof lastSync === 'number' && now - lastSync < IOS_HEALTHKIT_SYNC_COOLDOWN_MS) {
        return { status: 'throttled' };
    }

    await storage.set(IOS_HEALTHKIT_LAST_SYNC_KEY, now);

    const sleep = await healthService.getLastNightSleep();
    if (!sleep) return { status: 'no_data' };

    const startTime = parseSleepTimestamp(sleep.startTime);
    const endTime = parseSleepTimestamp(sleep.endTime);
    if (!startTime || !endTime || endTime <= startTime) {
        return { status: 'invalid_sample' };
    }

    const durationMs = endTime - startTime;
    if (durationMs < IOS_HEALTHKIT_MIN_DURATION_MS) {
        return { status: 'too_short' };
    }

    const lastEnd = await storage.get<number>(IOS_HEALTHKIT_LAST_END_KEY);
    if (typeof lastEnd === 'number' && endTime <= lastEnd + IOS_HEALTHKIT_DUPLICATE_GRACE_MS) {
        return { status: 'already_processed' };
    }

    const durationHours = durationMs / (1000 * 60 * 60);
    const draftId = sleepDraftService.buildDraftId(startTime);

    await pushNativeSleepEvent({
        type: 'WAKE_CONFIRMED',
        timestamp: endTime,
        data: {
            sleepStartTime: startTime,
            wakeTime: endTime,
            durationMs,
            durationHours,
            confirmed: false,
            autoAssumed: true,
            tags: ['healthkit'],
            sleepContext: {
                source: 'healthkit',
                trigger,
                quality: sleep.quality,
            },
        },
    });

    await storage.set(IOS_HEALTHKIT_LAST_END_KEY, endTime);

    try {
        await processNativeSleepEvents();
    } catch (error) {
        console.warn('[SleepService] Failed to process HealthKit sleep event:', error);
    }

    await scheduleSleepReviewNotification(draftId, durationHours);
    return { status: 'queued', draftId };
};

// Define the task
TaskManager.defineTask(SLEEP_TASK_NAME, async () => {
    try {
        if (Platform.OS === 'android' && SleepBridge) {
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        const now = Date.now();
        const hour = new Date().getHours();

        // Check for first-install grace period - don't probe users immediately after install
        const firstInstallTime = await storage.get<number>(storage.keys.FIRST_INSTALL_TIME);
        if (firstInstallTime && (now - firstInstallTime) < FIRST_INSTALL_GRACE_PERIOD_MS) {
            console.log('[SleepService] In first-install grace period, skipping sleep detection');
            return BackgroundFetch.BackgroundFetchResult.NewData;
        }

        if (Platform.OS === 'ios') {
            await syncIosSleepFromHealthKit('background');
        }

        // 1. Get Current State
        const isTracking = await storage.get<boolean>('is_sleeping');
        const isGhost = await storage.get<boolean>('sleep_ghost_mode');
        const probeTime = await storage.get<number>('sleep_probe_time');
        const sleepProbeSnoozedUntil = await storage.get<number>(SLEEP_PROBE_SNOOZED_UNTIL_KEY);
        const lastContext = await storage.get<any>(storage.keys.LAST_CONTEXT_SNAPSHOT);
        const contextUpdatedAt = lastContext?.updatedAt;
        const contextFresh =
            typeof contextUpdatedAt === 'number' && (now - contextUpdatedAt) < 30 * 60 * 1000;
        const contextState = contextFresh ? String(lastContext?.state || '') : '';
        const outdoorConfidence =
            typeof lastContext?.outdoorConfidence === 'number' ? lastContext.outdoorConfidence : null;
        const outdoorLikely =
            contextFresh &&
            typeof outdoorConfidence === 'number' &&
            outdoorConfidence >= 0.7 &&
            lastContext?.locationLabel !== 'home';


        // --- STATE: TRACKING (REAL OR GHOST) ---
        if (isTracking || isGhost) {
            const startTime = await storage.get<number>('sleep_start_time');
            const wakeSnoozedUntil = await storage.get<number>(WAKE_CONFIRMATION_SNOOZED_UNTIL_KEY);
            const wakeLastSent = await storage.get<number>(WAKE_CONFIRMATION_LAST_SENT_KEY);

            // CHECK FOR WAKE UP
            // Use stored settings for morning detection (dynamic, not hardcoded)
            const autoSleepSettings = await storage.get<any>(storage.keys.AUTO_SLEEP_SETTINGS);
            const nightEndHour = autoSleepSettings?.nightEndHour ?? 7;
            const morningEndHour = (nightEndHour + 5) % 24; // 5 hours after wake

            // Dynamic morning check (respects user's schedule)
            const isMorning = nightEndHour <= morningEndHour
                ? (hour >= nightEndHour && hour < morningEndHour)
                : (hour >= nightEndHour || hour < morningEndHour);

            const batteryState = await Battery.getBatteryStateAsync();
            const isUnplugged = batteryState === Battery.BatteryState.UNPLUGGED;

            if (isUnplugged && isMorning) {
                if (typeof wakeSnoozedUntil === 'number' && wakeSnoozedUntil > now) {
                    return BackgroundFetch.BackgroundFetchResult.NewData;
                }
                if (typeof wakeLastSent === 'number' && now - wakeLastSent < WAKE_CONFIRMATION_THROTTLE_MS) {
                    return BackgroundFetch.BackgroundFetchResult.NewData;
                }

                // Potential Wake Up
                console.log('[SleepService] Wake detected (Unplugged + Morning)');
                await storage.set(WAKE_CONFIRMATION_LAST_SENT_KEY, now);
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: i18n.t('notifications.wake_confirmation.title'),
                        body: i18n.t('notifications.wake_confirmation.body'),
                        categoryIdentifier: 'WAKE_CONFIRMATION',
                        data: { type: 'WAKE_CONFIRMATION' },
                        sound: true,
                    },
                    trigger: null
                });
                // We don't stop tracking yet, we wait for user confirmation
            }
            return BackgroundFetch.BackgroundFetchResult.NewData;
        }

        // --- STATE: IDLE or PROBING ---

        if (contextFresh && (contextState === 'driving' || contextState === 'commuting')) {
            if (probeTime) {
                await storage.remove('sleep_probe_time');
            }
            return BackgroundFetch.BackgroundFetchResult.NewData;
        }

        if (outdoorLikely) {
            if (probeTime) {
                await storage.remove('sleep_probe_time');
            }
            return BackgroundFetch.BackgroundFetchResult.NewData;
        }

        // 2. Calculate Sleep Probability using stored settings
        const autoSleepSettings = await storage.get<any>(storage.keys.AUTO_SLEEP_SETTINGS);
        const nightStartHour = autoSleepSettings?.nightStartHour ?? 21;
        const nightEndHour = autoSleepSettings?.nightEndHour ?? 7;
        const anytimeMode = autoSleepSettings?.anytimeMode ?? false;

        const batteryState = await Battery.getBatteryStateAsync();
        const isCharging = batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL;

        // Dynamic night check (respects user's schedule) or anytime mode
        const isNight = anytimeMode || (nightStartHour > nightEndHour
            ? (hour >= nightStartHour || hour < nightEndHour)
            : (hour >= nightStartHour && hour < nightEndHour));

        // If the user recently indicated they're not sleeping, temporarily suppress probing.
        if (typeof sleepProbeSnoozedUntil === 'number' && sleepProbeSnoozedUntil > now) {
            if (probeTime) {
                await storage.remove('sleep_probe_time');
            }
            return BackgroundFetch.BackgroundFetchResult.NewData;
        }

        // Simple Probability: Charging + Night = High
        if (isNight && isCharging) {
            console.log('[SleepService] High Sleep Probability detected');

            if (probeTime) {
                // We already probed. Did the user respond? 
                // If we are here, they ignored the notification.
                // GHOST MODE ENGAGE.
                const timeSinceProbe = now - probeTime;
                if (timeSinceProbe > 15 * 60 * 1000) { // 15 mins passed
                    console.log('[SleepService] Engaging GHOST MODE');
                    await storage.set('sleep_ghost_mode', true);
                    await storage.set('sleep_start_time', probeTime); // Start from when we moved/probed
                    await storage.remove('sleep_probe_time');

                    await pushNativeSleepEvent({
                        type: 'SLEEP_STARTED',
                        timestamp: probeTime,
                        data: { sleepStartTime: probeTime, confirmed: false, autoAssumed: true },
                    });

                    // Silent entry, no notification needed, we already asked.
                    return BackgroundFetch.BackgroundFetchResult.NewData;
                }
            } else {
                // First detection. Probe the user.
                console.log('[SleepService] Probing user');
                await storage.set('sleep_probe_time', now);
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: i18n.t('notifications.sleep_probe.title'),
                        body: i18n.t('notifications.sleep_probe.body'),
                        categoryIdentifier: 'SLEEP_PROBE',
                        data: { type: 'SLEEP_PROBE' },
                        sound: true,
                    },
                    trigger: null
                });
            }
        } else {
            // Reset probe if conditions lost (e.g. unplugged)
            if (probeTime) {
                await storage.remove('sleep_probe_time');
            }
        }

        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
        console.error('[SleepService] Task failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

export const sleepService = {
    startTracking: async () => {
        try {
            const startTime = Date.now();
            await storage.set('is_sleeping', true);
            await storage.set('sleep_start_time', startTime);
            await storage.remove('sleep_ghost_mode'); // Real tracking overrides ghost
            await storage.remove('sleep_probe_time');
            await storage.remove(SLEEP_PROBE_SNOOZED_UNTIL_KEY);

            // Register background fetch if not already
            await registerBackgroundTask();
            await pushNativeSleepEvent({
                type: 'SLEEP_STARTED',
                timestamp: startTime,
                data: { sleepStartTime: startTime, confirmed: true },
            });
            console.log('[SleepService] Tracking started (Manual)');
        } catch (err) {
            console.error('[SleepService] Start failed:', err);
        }
    },

    acceptSleepProbe: async () => {
        try {
            const now = Date.now();
            const probeTime = await storage.get<number>('sleep_probe_time');
            const startTime = typeof probeTime === 'number' ? probeTime : now;

            await storage.set('is_sleeping', true);
            await storage.set('sleep_start_time', startTime);
            await storage.remove('sleep_ghost_mode');
            await storage.remove('sleep_probe_time');
            await storage.remove(SLEEP_PROBE_SNOOZED_UNTIL_KEY);

            await registerBackgroundTask();
            await pushNativeSleepEvent({
                type: 'SLEEP_STARTED',
                timestamp: startTime,
                data: { sleepStartTime: startTime, confirmed: true },
            });
        } catch (err) {
            console.error('[SleepService] acceptSleepProbe failed:', err);
        }
    },

    declineSleepProbe: async (minutes?: number) => {
        try {
            const now = Date.now();
            const resolved = minutes ?? (await getResolvedAutoSleepSettings()).sleepProbeSnoozeMinutes;
            await storage.set(SLEEP_PROBE_SNOOZED_UNTIL_KEY, now + resolved * 60 * 1000);
            await storage.remove('sleep_probe_time');
            await storage.set('sleep_ghost_mode', false);
        } catch (err) {
            console.error('[SleepService] declineSleepProbe failed:', err);
        }
    },

    snoozeWakeConfirmation: async (minutes?: number) => {
        try {
            const now = Date.now();
            const resolved = minutes ?? (await getResolvedAutoSleepSettings()).wakeSnoozeMinutes;
            await storage.set(WAKE_CONFIRMATION_SNOOZED_UNTIL_KEY, now + resolved * 60 * 1000);
            await storage.set(WAKE_CONFIRMATION_LAST_SENT_KEY, now);
        } catch (err) {
            console.error('[SleepService] snoozeWakeConfirmation failed:', err);
        }
    },

    clearWakeConfirmationThrottle: async () => {
        try {
            await storage.remove(WAKE_CONFIRMATION_SNOOZED_UNTIL_KEY);
            await storage.remove(WAKE_CONFIRMATION_LAST_SENT_KEY);
        } catch {
            // ignore
        }
    },

    confirmGhostWakeup: async () => {
        // User confirmed they are awake. Convert ghost session to real session end.
        try {
            // We treat it as if they just stopped tracking now.
            // The logic in SleepTrackerScreen will handle the "Stop" call which calculates duration.
            // Here we just ensure state is ready for that stop call.
            await storage.set('is_sleeping', true); // promote ghost to real so stopTracking works standardly
            await storage.remove('sleep_ghost_mode');
            await sleepService.clearWakeConfirmationThrottle();
        } catch (e) { }
    },

    markDidntSleep: async () => {
        try {
            const startTime = await storage.get<number>('sleep_start_time');
            if (typeof startTime === 'number' && startTime > 0) {
                await sleepDraftService.removeDraft(sleepDraftService.buildDraftId(startTime));
                await uncompleteSleepPlanItemForDate(getLocalDateKey(new Date(startTime)));
            }
            await sleepSessionService.cancelActiveSession();
            await storage.set('is_sleeping', false);
            await storage.set('sleep_ghost_mode', false);
            await storage.remove('sleep_start_time');
            await storage.remove('sleep_probe_time');
            await sleepService.clearWakeConfirmationThrottle();
        } catch (err) {
            console.error('[SleepService] markDidntSleep failed:', err);
        }
    },

    stopTracking: async () => {
        try {
            const wasGhost = await storage.get<boolean>('sleep_ghost_mode');
            await storage.set('is_sleeping', false);
            await storage.set('sleep_ghost_mode', false);
            await storage.remove('sleep_probe_time');

            const startTime = await storage.get<number>('sleep_start_time');
            const endTime = Date.now();

            // We KEEP the background task running for auto-detection
            // await BackgroundFetch.unregisterTaskAsync(SLEEP_TASK_NAME); 

            console.log('[SleepService] Tracking stopped');

            if (typeof startTime === 'number' && Number.isFinite(startTime)) {
                await pushNativeSleepEvent({
                    type: 'WAKE_CONFIRMED',
                    timestamp: endTime,
                    data: {
                        sleepStartTime: startTime,
                        wakeTime: endTime,
                        durationMs: endTime - startTime,
                        autoAssumed: !!wasGhost,
                    },
                });
            }

            return {
                startTime,
                endTime,
                durationMinutes: startTime ? (endTime - startTime) / 1000 / 60 : 0
            };
        } catch (err) {
            console.error('[SleepService] Stop failed:', err);
            return null;
        }
    },

    isTracking: async () => {
        const isSleeping = await storage.get<boolean>('is_sleeping');
        const isGhost = await storage.get<boolean>('sleep_ghost_mode');
        return isSleeping || isGhost;
    },

    initializeBackground: async () => {
        await registerBackgroundTask();
    },

    syncIosSleepFromHealthKit: async (trigger: 'background' | 'foreground' | 'manual' = 'manual') => {
        return syncIosSleepFromHealthKit(trigger);
    },

    // Native WorkManager integration for Android
    setAutoSleepEnabled: async (enabled: boolean): Promise<boolean> => {
        try {
            if (Platform.OS === 'android' && SleepBridge) {
                return await SleepBridge.setAutoSleepEnabled(enabled);
            }
            if (enabled) {
                await registerBackgroundTask();
            } else {
                try {
                    const isRegistered = await TaskManager.isTaskRegisteredAsync(SLEEP_TASK_NAME);
                    if (isRegistered) {
                        await BackgroundFetch.unregisterTaskAsync(SLEEP_TASK_NAME);
                    }
                } catch (e) {
                    console.warn('[SleepService] Failed to unregister background task:', e);
                }
            }
            return enabled;
        } catch (e) {
            console.warn('[SleepService] Failed to set auto sleep:', e);
            return false;
        }
    },

    syncSettingsToNative: async (settings: AutoSleepSettings): Promise<boolean> => {
        try {
            if (Platform.OS === 'android' && SleepBridge) {
                const useActivityRecognition = settings.useActivityRecognition ?? true;
                // If enabling activity recognition, request permission first
                if (useActivityRecognition) {
                    try {
                        const hasPermission = await SleepBridge.checkActivityRecognitionPermission();
                        if (!hasPermission) {
                            console.log('[SleepService] Requesting ACTIVITY_RECOGNITION permission...');
                            const granted = await SleepBridge.requestActivityRecognitionPermission();
                            if (!granted) {
                                console.warn('[SleepService] ACTIVITY_RECOGNITION permission denied');
                                // Disable activity recognition if permission denied
                                settings.useActivityRecognition = false;
                            } else if (SleepBridge.registerActivityRecognitionAfterPermission) {
                                try {
                                    await SleepBridge.registerActivityRecognitionAfterPermission();
                                } catch (registerError) {
                                    console.warn('[SleepService] Failed to register activity recognition after permission:', registerError);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('[SleepService] Failed to check/request activity permission:', e);
                    }
                }

                await SleepBridge.updateSettings({
                    enabled: settings.enabled,
                    anytimeMode: settings.anytimeMode,
                    sensitivity: settings.sensitivityLevel || 'low',
                    useActivityRecognition: settings.useActivityRecognition ?? useActivityRecognition,
                    nightStartHour: settings.nightStartHour,
                    nightEndHour: settings.nightEndHour,
                    requireCharging: settings.requireCharging,
                    stillnessThresholdMinutes: settings.stillnessThresholdMinutes,
                    sleepProbeSnoozeMinutes: settings.sleepProbeSnoozeMinutes,
                    wakeSnoozeMinutes: settings.wakeSnoozeMinutes,
                    maxTrackingHours: settings.maxTrackingHours,
                });
                return true;
            }
            await storage.set(storage.keys.AUTO_SLEEP_SETTINGS, settings);
            if (settings.enabled) {
                await registerBackgroundTask();
            }
            return true;
        } catch (e) {
            console.warn('[SleepService] Failed to sync settings to native:', e);
            return false;
        }
    },

    getNativeTrackingState: async (): Promise<{
        isTracking: boolean;
        isGhostMode: boolean;
        sleepStartTime: number;
        enabled: boolean;
    } | null> => {
        try {
            if (Platform.OS === 'android' && SleepBridge) {
                return await SleepBridge.getTrackingState();
            }
            const [isTracking, isGhostMode, sleepStartTime] = await Promise.all([
                storage.get<boolean>('is_sleeping'),
                storage.get<boolean>('sleep_ghost_mode'),
                storage.get<number>('sleep_start_time'),
            ]);
            const settings = await getResolvedAutoSleepSettings();
            return {
                isTracking: !!isTracking,
                isGhostMode: !!isGhostMode,
                sleepStartTime: sleepStartTime ?? 0,
                enabled: settings.enabled,
            };
        } catch (e) {
            console.warn('[SleepService] Failed to get native state:', e);
            return null;
        }
    },

    checkPendingNativeEvents: async (): Promise<string | null> => {
        try {
            if (Platform.OS === 'android' && SleepBridge) {
                return await SleepBridge.checkPendingEvents();
            }
            return null;
        } catch (e) {
            console.warn('[SleepService] Failed to check pending events:', e);
            return null;
        }
    },

    /**
     * STORAGE SYNC: Sync native SharedPreferences settings to AsyncStorage
     * Makes native (SharedPreferences) the single source of truth
     * Call this on app startup and after settings changes to ensure consistency
     */
    syncNativeSettingsToAsyncStorage: async (): Promise<boolean> => {
        try {
            if (Platform.OS === 'android' && SleepBridge) {
                console.log('[SleepService] Syncing native settings to AsyncStorage...');

                // Get settings from native SharedPreferences
                const nativeSettings = await SleepBridge.getNativeSettings();

                if (nativeSettings) {
                    // Sync to AsyncStorage with proper structure
                    const defaults = DEFAULT_AUTO_SLEEP_SETTINGS;
                    const autoSleepSettings: AutoSleepSettings = {
                        enabled: nativeSettings.enabled ?? defaults.enabled,
                        nightStartHour: nativeSettings.nightStartHour ?? defaults.nightStartHour,
                        nightEndHour: nativeSettings.nightEndHour ?? defaults.nightEndHour,
                        requireCharging: nativeSettings.requireCharging ?? defaults.requireCharging,
                        anytimeMode: nativeSettings.anytimeMode ?? defaults.anytimeMode,
                        sensitivityLevel: nativeSettings.sensitivity ?? defaults.sensitivityLevel,
                        stillnessThresholdMinutes: nativeSettings.stillnessThresholdMinutes ?? defaults.stillnessThresholdMinutes,
                        sleepProbeSnoozeMinutes: nativeSettings.sleepProbeSnoozeMinutes ?? defaults.sleepProbeSnoozeMinutes,
                        wakeSnoozeMinutes: nativeSettings.wakeSnoozeMinutes ?? defaults.wakeSnoozeMinutes,
                        maxTrackingHours: nativeSettings.maxTrackingHours ?? defaults.maxTrackingHours,
                        useActivityRecognition: nativeSettings.useActivityRecognition ?? defaults.useActivityRecognition ?? true,
                    };

                    // Save to AsyncStorage
                    await storage.set(storage.keys.AUTO_SLEEP_SETTINGS, autoSleepSettings);

                    console.log('[SleepService] Native settings synced to AsyncStorage:', autoSleepSettings);
                    return true;
                }
            }
            return false;
        } catch (e) {
            console.error('[SleepService] Failed to sync native settings:', e);
            return false;
        }
    },

    // Battery optimization helpers
    isIgnoringBatteryOptimizations: async (): Promise<boolean> => {
        try {
            if (Platform.OS === 'android' && BatteryOptimization) {
                return await BatteryOptimization.isIgnoringBatteryOptimizations();
            }
            return true; // iOS doesn't have this
        } catch (e) {
            console.warn('[SleepService] Failed to check battery optimization:', e);
            return true;
        }
    },

    requestIgnoreBatteryOptimizations: async (): Promise<boolean> => {
        try {
            if (Platform.OS === 'android' && BatteryOptimization) {
                try {
                    // Try direct request first (shows dialog on supported devices)
                    return await BatteryOptimization.requestIgnoreBatteryOptimizations();
                } catch {
                    // Fall back to opening battery optimization settings
                    console.log('[SleepService] Direct request failed, opening settings page');
                    return await BatteryOptimization.openBatterySettings();
                }
            }
            return true;
        } catch (e) {
            console.warn('[SleepService] Failed to request battery optimization:', e);
            return false;
        }
    },

    openBatterySettings: async (): Promise<boolean> => {
        try {
            if (Platform.OS === 'android' && BatteryOptimization) {
                return await BatteryOptimization.openBatterySettings();
            }
            return false;
        } catch (e) {
            console.warn('[SleepService] Failed to open battery settings:', e);
            return false;
        }
    },

    getDeviceManufacturer: async (): Promise<string> => {
        try {
            if (Platform.OS === 'android' && BatteryOptimization) {
                return await BatteryOptimization.getDeviceManufacturer();
            }
            return 'unknown';
        } catch (e) {
            console.warn('[SleepService] Failed to get manufacturer:', e);
            return 'unknown';
        }
    },

    // Check if device is known to aggressively kill background tasks
    isAggressiveOEM: async (): Promise<boolean> => {
        const manufacturer = await sleepService.getDeviceManufacturer();
        const aggressiveOEMs = ['xiaomi', 'huawei', 'oppo', 'vivo', 'realme', 'oneplus', 'samsung'];
        return aggressiveOEMs.includes(manufacturer.toLowerCase());
    },

    /**
     * Sync the current app language to native for overlay translations.
     * Call this when language changes and on app startup.
     */
    syncCurrentLanguage: async (languageCode: string): Promise<boolean> => {
        try {
            if (Platform.OS === 'android' && SleepBridge?.setCurrentLanguage) {
                await SleepBridge.setCurrentLanguage(languageCode);
                if (SleepBridge?.setNativeStrings) {
                    const nativeStrings = buildNativeStrings();
                    await SleepBridge.setNativeStrings(JSON.stringify(nativeStrings));
                }
                console.log('[SleepService] Language synced to native:', languageCode);
                return true;
            }
            return false;
        } catch (e) {
            console.warn('[SleepService] Failed to sync language:', e);
            return false;
        }
    },
};

const registerBackgroundTask = async () => {
    // Android: Prefer native WorkManager (SleepBridge) to avoid duplicate schedulers.
    if (Platform.OS === 'android' && SleepBridge) {
        // Devices upgrading from older builds may still have the Expo task registered.
        // Proactively unregister it to ensure there's only one scheduler (native WorkManager).
        try {
            const isRegistered = await TaskManager.isTaskRegisteredAsync(SLEEP_TASK_NAME);
            if (isRegistered) {
                await BackgroundFetch.unregisterTaskAsync(SLEEP_TASK_NAME);
                console.log('[SleepService] Unregistered legacy Expo BackgroundFetch sleep task');
            }
        } catch (e) {
            console.warn('[SleepService] Failed to unregister legacy Expo sleep task:', e);
        }

        console.log('[SleepService] Native SleepBridge available, skipping Expo BackgroundFetch registration');
        return;
    }

    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(SLEEP_TASK_NAME);
        if (!isRegistered) {
            await BackgroundFetch.registerTaskAsync(SLEEP_TASK_NAME, {
                minimumInterval: 15 * 60, // 15 minutes
                stopOnTerminate: false,
                startOnBoot: true,
            });
            console.log('[SleepService] Background Task Registered');
        }
    } catch (e) {
        console.warn('Background Register Failed', e);
    }
};
