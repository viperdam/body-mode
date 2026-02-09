// Notification service for React Native using Expo Notifications
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { DailyPlan, NotificationPlanMode, PlanItem, OverlaySettings } from '../types';
import storage from './storageService';
import overlayService from './overlayService';
import { txStoreService } from './txStoreService';
import { getActiveDayKey, getPlanItemDateTime } from './dayBoundaryService';
import i18n from '../i18n';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
        return {
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
        };
    },
});

// Helper to trigger overlay from notification data
async function triggerOverlayFromNotification(data: {
    type?: string;
    planDate?: string;
    planItemId?: string;
    planItem?: PlanItem;
}) {
    try {
        if (Platform.OS === 'android') {
            const settings = await overlayService.getOverlaySettings();
            if (!settings.enabled || !settings.permissionGranted) {
                return;
            }
            const visible = await overlayService.isOverlayVisible();
            if (visible) {
                return;
            }
        }

        // Get stored plan to find the item
        const planDate = data.planDate || await getActiveDayKey();
        // Try date-specific key first, then fallback to base key
        const planKey = `${storage.keys.DAILY_PLAN}_${planDate}`;
        let plan = await storage.get<DailyPlan>(planKey);
        if (!plan) {
            plan = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
        }

        if (plan && data.planItemId) {
            const item = plan.items.find(i => i.id === data.planItemId);
            if (item) {
                await overlayService.showPlanItemOverlay(item, planDate);
            }
        } else if (data.type === 'HYDRATION_REMINDER') {
            // Create a hydration item if no specific item
            const hydrationItem: PlanItem = {
                id: 'hydration-' + Date.now(),
                type: 'hydration',
                title: i18n.t('notifications.hydration.title'),
                description: i18n.t('notifications.hydration.body'),
                time: new Date().toTimeString().slice(0, 5),
                completed: false,
            };
            await overlayService.showPlanItemOverlay(hydrationItem, planDate);
        }
    } catch (error) {
        console.warn('Failed to trigger overlay from notification:', error);
    }
}

// Subscription holder for cleanup
let notificationReceivedSubscription: Notifications.Subscription | null = null;

const shouldScheduleNotifications = async (): Promise<boolean> => {
    const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
    if (prefs?.notificationsEnabled === false) return false;

    if (Platform.OS === 'android' && txStoreService.available()) {
        try {
            const config = await txStoreService.getConfig();
            if (config) {
                if (String(config.mode || '').toUpperCase() === 'OFF') return false;
                if (config.notificationsEnabled === false) return false;
            }
        } catch {
            // Fall back to prefs above if config fetch fails
        }
    }

    return true;
};

const isPlanItemCoveredByOverlay = (item: PlanItem, settings: OverlaySettings | null): boolean => {
    if (!settings || !settings.enabled || !settings.permissionGranted) return false;

    const types = settings.types;
    if (!types) return false;

    const raw = (item.type || '').toLowerCase();
    if (raw.includes('meal')) return !!types.meal;
    if (raw.includes('hydration') || raw.includes('water')) return !!types.hydration;
    if (raw.includes('work_break')) return !!types.workBreak || !!types.workout;
    if (raw.includes('workout') || raw.includes('activity')) return !!types.workout;
    if (raw.includes('sleep') || raw.includes('wakeup')) return !!types.sleep;
    return false;
};

/**
 * Set up notification listener to trigger overlays.
 * Call this in App.tsx useEffect on mount.
 * This handles notifications when app is in background/killed.
 */
export const setupOverlayNotificationListener = () => {
    if (Platform.OS !== 'android') {
        console.log('[NotificationService] Overlay listener skipped on non-Android platform');
        return () => undefined;
    }

    // Avoid duplicate subscriptions
    if (notificationReceivedSubscription) {
        notificationReceivedSubscription.remove();
    }

    // Listen for notifications received (fires even in background on Android)
    notificationReceivedSubscription = Notifications.addNotificationReceivedListener(
        async (notification) => {
            const data = notification.request.content.data as {
                type?: string;
                planDate?: string;
                planItemId?: string;
                planItem?: PlanItem;
            };
            if (!data) return;
            await triggerOverlayFromNotification(data);
        }
    );

    console.log('[NotificationService] Overlay listener set up');

    return () => {
        if (notificationReceivedSubscription) {
            notificationReceivedSubscription.remove();
            notificationReceivedSubscription = null;
        }
    };
};

export const requestNotificationPermission = async (): Promise<boolean> => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('Failed to get notification permission');
        return false;
    }

    // Configure for Android
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: i18n.t('notifications.channel_name'),
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#06b6d4',
        });
    }

    const logWaterLabel = i18n.t('notifications.actions.log_water', {
        amount: 250,
        unit: i18n.t('units.ml'),
    });

    // Register Categories for Interactive Notifications
    const openForegroundForActions = true;

    await Notifications.setNotificationCategoryAsync('SLEEP_PROBE', [
        { identifier: 'YES_SLEEP', buttonTitle: i18n.t('notifications.actions.yes_sleeping'), options: { isDestructive: false, opensAppToForeground: true } },
        { identifier: 'NO_SLEEP', buttonTitle: i18n.t('notifications.actions.no'), options: { isDestructive: true, opensAppToForeground: true } },
    ]);

    await Notifications.setNotificationCategoryAsync('WAKE_CONFIRMATION', [
        { identifier: 'YES_AWAKE', buttonTitle: i18n.t('notifications.actions.yes_awake'), options: { isDestructive: false, opensAppToForeground: true } }, // Open app to log
        { identifier: 'DIDNT_SLEEP', buttonTitle: i18n.t('overlay.native.button.didnt_sleep'), options: { isDestructive: true, opensAppToForeground: true } },
        { identifier: 'NO_SNOOZE', buttonTitle: i18n.t('notifications.actions.snooze'), options: { isDestructive: false, opensAppToForeground: true } },
    ]);

    await Notifications.setNotificationCategoryAsync('SLEEP_REVIEW', [
        { identifier: 'CONFIRM_SLEEP', buttonTitle: i18n.t('sleep_draft.confirm_action'), options: { isDestructive: false, opensAppToForeground: true } },
        { identifier: 'DISCARD_SLEEP', buttonTitle: i18n.t('sleep_draft.discard_action'), options: { isDestructive: true, opensAppToForeground: true } },
    ]);

    await Notifications.setNotificationCategoryAsync('HYDRATION_REMINDER', [
        { identifier: 'LOG_WATER', buttonTitle: logWaterLabel, options: { isDestructive: false, opensAppToForeground: true } },
        { identifier: 'SNOOZE', buttonTitle: i18n.t('notifications.actions.snooze'), options: { isDestructive: false, opensAppToForeground: openForegroundForActions } },
    ]);

    await Notifications.setNotificationCategoryAsync('WRAP_UP_REMINDER', [
        { identifier: 'START_WRAP_UP', buttonTitle: i18n.t('notifications.actions.start_wrap_up'), options: { isDestructive: false, opensAppToForeground: true } },
        { identifier: 'SNOOZE', buttonTitle: i18n.t('notifications.actions.later'), options: { isDestructive: false, opensAppToForeground: openForegroundForActions } },
    ]);

    // Plan item reminder category - enables inline action buttons on iOS
    await Notifications.setNotificationCategoryAsync('PLAN_ITEM_REMINDER', [
        { identifier: 'DONE', buttonTitle: i18n.t('notifications.actions.done'), options: { isDestructive: false, opensAppToForeground: openForegroundForActions } },
        { identifier: 'SNOOZE_15', buttonTitle: i18n.t('notifications.actions.snooze_15'), options: { isDestructive: false, opensAppToForeground: openForegroundForActions } },
        { identifier: 'SKIP', buttonTitle: i18n.t('notifications.actions.skip'), options: { isDestructive: true, opensAppToForeground: openForegroundForActions } },
        { identifier: 'MORE_OPTIONS', buttonTitle: i18n.t('notifications.actions.more'), options: { isDestructive: false, opensAppToForeground: true } },
    ]);

    return true;
};

export const sendNotification = async (title: string, body: string): Promise<void> => {
    if (!(await shouldScheduleNotifications())) return;

    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: true,
                priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: null, // Immediate notification
        });
    } catch (error) {
        console.error('Error sending notification:', error);
    }
};

export const scheduleNotification = async (
    title: string,
    body: string,
    triggerTime: Date
): Promise<string | null> => {
    if (!(await shouldScheduleNotifications())) return null;

    try {
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: true,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: triggerTime
            },
        });
        return id;
    } catch (error) {
        console.error('Error scheduling notification:', error);
        return null;
    }
};

export const scheduleDailyNotification = async (
    title: string,
    body: string,
    hour: number,
    minute: number
): Promise<string | null> => {
    if (!(await shouldScheduleNotifications())) return null;

    try {
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: true,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour,
                minute,
            },
        });
        return id;
    } catch (error) {
        console.error('Error scheduling daily notification:', error);
        return null;
    }
};

export const scheduleHydrationReminders = async (startHour: number, endHour: number, intervalHours: number): Promise<void> => {
    if (!(await shouldScheduleNotifications())) return;

    // Clear existing hydration notifications to avoid duplicates (naive approach)
    // In a real app, we'd track IDs. For now, we rely on the caller to manage cleanup or just schedule new ones.

    for (let h = startHour; h < endHour; h += intervalHours) {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: i18n.t('notifications.hydration.schedule_title'),
                body: i18n.t('notifications.hydration.schedule_body'),
                categoryIdentifier: 'HYDRATION_REMINDER',
                sound: true,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: h,
                minute: 0,
            },
        });
    }
};

export const scheduleWrapUpReminder = async (hour: number, minute: number): Promise<void> => {
    await Notifications.scheduleNotificationAsync({
        content: {
            title: i18n.t('notifications.wrap_up.title'),
            body: i18n.t('notifications.wrap_up.body'),
            categoryIdentifier: 'WRAP_UP_REMINDER',
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
        },
    });
};

export const cancelNotification = async (notificationId: string): Promise<void> => {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
};

export const cancelAllNotifications = async (): Promise<void> => {
    await Notifications.cancelAllScheduledNotificationsAsync();
};

type ScheduledNotificationType = 'plan' | 'hydration' | 'wrapup' | 'hydration_snooze' | 'wrapup_snooze';

type SchedulePlanNotificationsOptions = {
    mode?: NotificationPlanMode;
};

interface StoredNotification {
    id: string;
    type: ScheduledNotificationType;
    data?: {
        planDate?: string;
        planItemId?: string;
    };
    scheduledFor: string;
}

const NOTIFICATION_STORAGE_KEY = storage.keys.SCHEDULED_NOTIFICATIONS;

const getStoredNotifications = async (): Promise<StoredNotification[]> => {
    return (await storage.get<StoredNotification[]>(NOTIFICATION_STORAGE_KEY)) || [];
};

const saveStoredNotifications = async (records: StoredNotification[]) => {
    await storage.set(NOTIFICATION_STORAGE_KEY, records);
};

const rememberNotification = async (record: StoredNotification) => {
    const existing = await getStoredNotifications();
    existing.push(record);
    await saveStoredNotifications(existing);
};

const removeNotifications = async (
    predicate: (record: StoredNotification) => boolean
): Promise<void> => {
    const existing = await getStoredNotifications();
    const keep: StoredNotification[] = [];
    const toCancel: StoredNotification[] = [];

    for (const record of existing) {
        if (predicate(record)) {
            toCancel.push(record);
        } else {
            keep.push(record);
        }
    }

    await Promise.all(
        toCancel.map(record =>
            Notifications.cancelScheduledNotificationAsync(record.id).catch(() => undefined)
        )
    );

    await saveStoredNotifications(keep);
};

export const clearNotificationType = async (type: ScheduledNotificationType) => {
    await removeNotifications(record => record.type === type);
};

const buildTriggerDate = async (dateKey: string, time: string): Promise<Date | null> => {
    return getPlanItemDateTime(dateKey, time);
};

const shouldScheduleDate = (date: Date) => date.getTime() > Date.now();

const descriptionForItem = (item: PlanItem): string => {
    if (item.description) return item.description;
    switch (item.type) {
        case 'meal':
            return i18n.t('notifications.description.meal');
        case 'workout':
            return i18n.t('notifications.description.workout');
        case 'hydration':
            return i18n.t('notifications.description.hydration');
        case 'sleep':
            return i18n.t('notifications.description.sleep');
        default:
            return i18n.t('notifications.description.default');
    }
};

const shouldNotifyForMode = (item: PlanItem, mode: NotificationPlanMode): boolean => {
    if (mode === 'high') return true;
    if (mode === 'medium') return item.type === 'meal' || item.type === 'workout';
    return item.type === 'meal';
};

// ============ NOTIFICATION STAGGERING (Anti-Throttle) ============
// Android mutes notifications as "recently noisy" when too many fire at once.
// Stagger notifications at the same scheduled time to prevent throttling.

const NOTIFICATION_STAGGER_MS = 5000; // 5 seconds between notifications at same time
const MAX_NOTIFICATIONS_PER_SLOT = 3;  // Max notifications in a single time slot

/**
 * Stagger notification times to prevent Android "recently noisy" throttling.
 * Groups items by scheduled minute, then spreads them 5 seconds apart.
 */
const staggerNotificationTimes = async (
    items: Array<{ id: string; time: string; completed?: boolean; skipped?: boolean }>,
    planDate: string
): Promise<Map<string, Date>> => {
    const result = new Map<string, Date>();
    const timeGroups = new Map<string, string[]>();

    // Group items by their scheduled time (HH:MM)
    for (const item of items) {
        if (!item.time || item.completed || item.skipped) continue;

        const existing = timeGroups.get(item.time) || [];
        existing.push(item.id);
        timeGroups.set(item.time, existing);
    }

    // For each time group, stagger the actual trigger times
    for (const [time, ids] of timeGroups) {
        const baseDate = await buildTriggerDate(planDate, time);
        if (!baseDate) continue;

        ids.forEach((id, index) => {
            // Stagger by index * 5 seconds, but cap at MAX_NOTIFICATIONS_PER_SLOT
            const cappedIndex = Math.min(index, MAX_NOTIFICATIONS_PER_SLOT - 1);
            const staggeredDate = new Date(baseDate.getTime() + (cappedIndex * NOTIFICATION_STAGGER_MS));
            result.set(id, staggeredDate);
        });

        if (ids.length > MAX_NOTIFICATIONS_PER_SLOT) {
            console.log(`[NotificationService] Time ${time} has ${ids.length} items, capping stagger at ${MAX_NOTIFICATIONS_PER_SLOT}`);
        }
    }

    return result;
};

export const schedulePlanNotifications = async (plan: DailyPlan, options: SchedulePlanNotificationsOptions = {}) => {
    const mode: NotificationPlanMode = options.mode || 'high';

    // CRITICAL: Cancel ALL existing scheduled notifications to prevent alarm accumulation
    // This addresses Android's 500 concurrent alarm limit
    try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        console.log('[NotificationService] Cancelled all existing scheduled notifications');
    } catch (cleanupError) {
        console.warn('[NotificationService] Failed to cancel existing notifications:', cleanupError);
    }

    // Clear our internal tracking of stored notifications
    await saveStoredNotifications([]);

    // Respect background mode + user preferences (OFF mode must not schedule notifications)
    if (!(await shouldScheduleNotifications())) {
        console.log('[NotificationService] Notifications disabled by mode/preferences - skipping scheduling');
        return;
    }

    let overlaySettings: OverlaySettings | null = null;
    if (Platform.OS === 'android') {
        try {
            overlaySettings = await overlayService.getOverlaySettings();
        } catch (error) {
            console.warn('[NotificationService] Failed to load overlay settings:', error);
        }
    }

    // Filter items that should be scheduled
    const itemsToSchedule = plan.items.filter(item => {
        if (!item.time) return false;
        if (!shouldNotifyForMode(item, mode)) return false;
        if (item.completed || item.skipped) return false;
        if (Platform.OS === 'android' && isPlanItemCoveredByOverlay(item, overlaySettings)) return false;
        return true;
    });

    // Pre-compute staggered trigger times to prevent "recently noisy" throttling
    const staggeredTimes = await staggerNotificationTimes(itemsToSchedule, plan.date);

    let scheduledCount = 0;
    const MAX_NOTIFICATIONS = 50; // Stay well under Android's 500 alarm limit

    // Group by HH:MM to prevent Android "recently noisy" muting when multiple notifications
    // are delivered in a burst (common under Doze / inexact delivery).
    const timeGroups = new Map<string, PlanItem[]>();
    for (const item of itemsToSchedule) {
        if (!item.time) continue;
        const existing = timeGroups.get(item.time) || [];
        existing.push(item);
        timeGroups.set(item.time, existing);
    }

    const sortedGroups = [...timeGroups.entries()].sort(([a], [b]) => a.localeCompare(b));

    for (const [time, slotItems] of sortedGroups) {
        if (scheduledCount >= MAX_NOTIFICATIONS) {
            console.warn(`[NotificationService] Reached max notifications limit (${MAX_NOTIFICATIONS}), skipping remaining items`);
            break;
        }

        // Android-only: if multiple items share the exact same time slot, schedule ONE summary notification.
        // This is the most reliable way to avoid OS-level muting (staggering by seconds is often batched).
        if (Platform.OS === 'android' && slotItems.length > 1) {
            const triggerDate = await buildTriggerDate(plan.date, time);
            if (!triggerDate || !shouldScheduleDate(triggerDate)) continue;

            const isHydrationSlot = slotItems.every(
                item => item.type === 'hydration' || item.linkedAction === 'log_water'
            );

            const titles = slotItems
                .map(item => (item.title || '').trim())
                .filter(Boolean)
                .slice(0, 4);
            const remaining = Math.max(0, slotItems.length - titles.length);
            const bodyLines = titles.map(title => i18n.t('notifications.group.body_line', { title }));
            if (remaining > 0) bodyLines.push(i18n.t('notifications.group.body_more', { count: remaining }));
            const body = bodyLines.join('\n') || i18n.t('notifications.group.body_default');

            const type: ScheduledNotificationType = isHydrationSlot ? 'hydration' : 'plan';

            try {
                const id = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: isHydrationSlot ? i18n.t('notifications.hydration.title') : i18n.t('notifications.group.title', { count: slotItems.length }),
                        body,
                        sound: true,
                        // Keep hydration action buttons; for mixed slots omit category to avoid per-item actions.
                        ...(isHydrationSlot
                            ? { categoryIdentifier: 'HYDRATION_REMINDER' as const }
                            : {}),
                        data: {
                            type: isHydrationSlot ? 'HYDRATION_REMINDER' : 'PLAN_ITEM',
                            planDate: plan.date,
                            planItemIds: slotItems.map(item => item.id),
                        },
                    },
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.DATE,
                        date: triggerDate,
                    },
                });

                await rememberNotification({
                    id,
                    type,
                    scheduledFor: triggerDate.toISOString(),
                    data: {
                        planDate: plan.date,
                        // Best-effort anchor for debugging; grouped notifications don't map 1:1 with items.
                        planItemId: slotItems[0]?.id,
                    },
                });

                scheduledCount++;
            } catch (error: any) {
                if (error?.message?.includes('Maximum limit of concurrent alarms')) {
                    console.error('[NotificationService] Android alarm limit reached! Stopping scheduling.');
                    break;
                }
                console.warn('[NotificationService] Failed to schedule grouped notification:', error);
            }

            continue;
        }

        // Single-item slot (or iOS): schedule per-item notifications (with staggering map).
        for (const item of slotItems) {
            if (scheduledCount >= MAX_NOTIFICATIONS) break;

            const triggerDate = staggeredTimes.get(item.id) || await buildTriggerDate(plan.date, item.time);
            if (!triggerDate || !shouldScheduleDate(triggerDate)) continue;

            const type: ScheduledNotificationType =
                item.type === 'hydration' || item.linkedAction === 'log_water'
                    ? 'hydration'
                    : 'plan';

            try {
                const id = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: type === 'hydration' ? i18n.t('notifications.hydration.title') : i18n.t('notifications.plan_item.title', { item: item.title || i18n.t('notifications.plan_item.fallback') }),
                        body: descriptionForItem(item),
                        sound: true,
                        categoryIdentifier: type === 'hydration' ? 'HYDRATION_REMINDER' : 'PLAN_ITEM_REMINDER',
                        data: {
                            type: type === 'hydration' ? 'HYDRATION_REMINDER' : 'PLAN_ITEM',
                            planDate: plan.date,
                            planItemId: item.id,
                            itemType: item.type,
                        },
                        ...(Platform.OS === 'ios' && {
                            interruptionLevel: 'timeSensitive' as any,
                        }),
                    },
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.DATE,
                        date: triggerDate,
                    },
                });

                await rememberNotification({
                    id,
                    type,
                    scheduledFor: triggerDate.toISOString(),
                    data: {
                        planDate: plan.date,
                        planItemId: item.id,
                    },
                });

                scheduledCount++;
            } catch (error: any) {
                if (error?.message?.includes('Maximum limit of concurrent alarms')) {
                    console.error('[NotificationService] Android alarm limit reached! Stopping scheduling.');
                    break;
                }
                console.warn('[NotificationService] Failed to schedule notification:', error);
            }
        }
    }

    console.log(`[NotificationService] Scheduled ${scheduledCount} notifications for plan`);
};

export const snoozeHydrationReminder = async (
    minutes: number = 15,
    data?: { planDate?: string; planItemId?: string }
): Promise<void> => {
    // Replace any existing hydration snooze to avoid stacking.
    await clearNotificationType('hydration_snooze');

    if (!(await shouldScheduleNotifications())) return;

    const trigger = new Date(Date.now() + minutes * 60 * 1000);

    try {
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: i18n.t('notifications.hydration.title'),
                body: i18n.t('notifications.hydration.snooze_body'),
                sound: true,
                categoryIdentifier: 'HYDRATION_REMINDER',
                data: {
                    type: 'HYDRATION_REMINDER',
                    ...data,
                    snoozedMinutes: minutes,
                },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: trigger,
            },
        });

        await rememberNotification({
            id,
            type: 'hydration_snooze',
            scheduledFor: trigger.toISOString(),
            data: {
                planDate: data?.planDate,
                planItemId: data?.planItemId,
            },
        });
    } catch (error: any) {
        if (error?.message?.includes('Maximum limit of concurrent alarms')) {
            console.error('[NotificationService] Android alarm limit reached when snoozing hydration');
        } else {
            console.warn('[NotificationService] Failed to snooze hydration reminder:', error);
        }
    }
};

export const snoozeWrapUpReminder = async (minutes: number = 30): Promise<void> => {
    await clearNotificationType('wrapup_snooze');

    if (!(await shouldScheduleNotifications())) return;

    const trigger = new Date(Date.now() + minutes * 60 * 1000);

    try {
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: i18n.t('notifications.wrap_up.title'),
                body: i18n.t('notifications.wrap_up.body_snooze'),
                sound: true,
                categoryIdentifier: 'WRAP_UP_REMINDER',
                data: { type: 'WRAP_UP', snoozedMinutes: minutes },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: trigger,
            },
        });

        await rememberNotification({
            id,
            type: 'wrapup_snooze',
            scheduledFor: trigger.toISOString(),
        });
    } catch (error: any) {
        if (error?.message?.includes('Maximum limit of concurrent alarms')) {
            console.error('[NotificationService] Android alarm limit reached when snoozing wrap-up');
        } else {
            console.warn('[NotificationService] Failed to snooze wrap-up reminder:', error);
        }
    }
};


export const scheduleNightlyWrapUpReminder = async (
    hour: number = 21,
    minute: number = 30
): Promise<void> => {
    await clearNotificationType('wrapup');

    if (!(await shouldScheduleNotifications())) {
        console.log('[NotificationService] Wrap-up notifications disabled by mode/preferences');
        return;
    }

    const trigger = new Date();
    trigger.setHours(hour, minute, 0, 0);
    if (!shouldScheduleDate(trigger)) {
        trigger.setDate(trigger.getDate() + 1);
    }

    try {
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: i18n.t('notifications.wrap_up.title'),
                body: i18n.t('notifications.wrap_up.body_snooze'),
                sound: true,
                categoryIdentifier: 'WRAP_UP_REMINDER',
                data: { type: 'WRAP_UP' },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: trigger,
            },
        });

        await rememberNotification({
            id,
            type: 'wrapup',
            scheduledFor: trigger.toISOString(),
        });
    } catch (error: any) {
        if (error?.message?.includes('Maximum limit of concurrent alarms')) {
            console.error('[NotificationService] Android alarm limit reached when scheduling wrap-up reminder');
        } else {
            console.warn('[NotificationService] Failed to schedule wrap-up reminder:', error);
        }
    }
};

// ============ PLAN RETRY FAILURE NOTIFICATION ============


/**
 * Schedule a notification to inform the user that plan retry failed
 * Shows in user's language with a retry action
 */
export const schedulePlanRetryFailureNotification = async (language: string = 'en'): Promise<void> => {
    try {
        const locale = language || i18n.locale;
        const title = i18n.t('notifications.plan_retry.title', { locale });
        const body = i18n.t('notifications.plan_retry.body', { locale });

        // Send immediate notification
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data: { type: 'plan_retry_failure', action: 'open_dashboard' },
                sound: true,
                priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: null, // Immediate
        });

        console.log('[NotificationService] Scheduled plan retry failure notification');
    } catch (error) {
        console.error('[NotificationService] Failed to schedule retry failure notification:', error);
    }
};
