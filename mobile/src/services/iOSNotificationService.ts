// iOS Notification Service - Enhanced iOS-specific notification features
// Handles Time Sensitive notifications, Critical Alerts, and iOS-specific settings

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * iOS Notification Priority Levels
 */
export type iOSNotificationPriority = 'passive' | 'active' | 'time-sensitive' | 'critical';

/**
 * Check if running on iOS
 */
export const isIOS = (): boolean => Platform.OS === 'ios';

/**
 * Check iOS version (for feature compatibility)
 */
export const getIOSVersion = (): number => {
    if (!isIOS()) return 0;
    const version = Platform.Version;
    return typeof version === 'string' ? parseFloat(version) : version;
};

/**
 * Check if Time Sensitive notifications are available (iOS 15+)
 */
export const isTimeSensitiveAvailable = (): boolean => {
    return isIOS() && getIOSVersion() >= 15;
};

/**
 * Check if Focus modes are available (iOS 15+)
 */
export const isFocusModeAvailable = (): boolean => {
    return isIOS() && getIOSVersion() >= 15;
};

/**
 * Schedule a Time Sensitive notification (iOS 15+)
 * Time Sensitive notifications can break through Focus modes and deliver immediately
 */
export const scheduleTimeSensitiveNotification = async (
    title: string,
    body: string,
    triggerTime: Date,
    data?: Record<string, any>,
    categoryIdentifier?: string
): Promise<string | null> => {
    if (!isIOS()) {
        console.log('[iOSNotificationService] Not iOS, using standard notification');
        return scheduleStandardNotification(title, body, triggerTime, data, categoryIdentifier);
    }

    try {
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: true,
                categoryIdentifier,
                data: {
                    ...data,
                    iosInterruptionLevel: 'timeSensitive',
                },
                // iOS-specific: Time Sensitive priority
                ...(isTimeSensitiveAvailable() && {
                    interruptionLevel: 'timeSensitive' as any,
                }),
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: triggerTime,
            },
        });

        console.log(`[iOSNotificationService] Scheduled Time Sensitive notification: ${id}`);
        return id;
    } catch (error) {
        console.error('[iOSNotificationService] Failed to schedule notification:', error);
        return null;
    }
};

/**
 * Schedule a standard notification
 */
export const scheduleStandardNotification = async (
    title: string,
    body: string,
    triggerTime: Date,
    data?: Record<string, any>,
    categoryIdentifier?: string
): Promise<string | null> => {
    try {
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: true,
                categoryIdentifier,
                data,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: triggerTime,
            },
        });
        return id;
    } catch (error) {
        console.error('[iOSNotificationService] Failed to schedule notification:', error);
        return null;
    }
};

/**
 * Schedule an immediate notification (useful for testing)
 */
export const sendImmediateNotification = async (
    title: string,
    body: string,
    data?: Record<string, any>,
    priority: iOSNotificationPriority = 'active'
): Promise<string | null> => {
    try {
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: true,
                data: {
                    ...data,
                    iosInterruptionLevel: priority,
                },
                // iOS-specific settings
                ...(isIOS() && {
                    interruptionLevel: priority as any,
                }),
            },
            trigger: null, // Immediate delivery
        });
        return id;
    } catch (error) {
        console.error('[iOSNotificationService] Failed to send notification:', error);
        return null;
    }
};

/**
 * Request notification permissions with iOS-specific options
 */
export const requestIOSNotificationPermissions = async (): Promise<{
    granted: boolean;
    canUseTimeSensitive: boolean;
    canUseCritical: boolean;
}> => {
    if (!isIOS()) {
        return { granted: false, canUseTimeSensitive: false, canUseCritical: false };
    }

    try {
        const { status } = await Notifications.requestPermissionsAsync({
            ios: {
                allowAlert: true,
                allowBadge: true,
                allowSound: true,
                allowDisplayInCarPlay: true,
                allowCriticalAlerts: false, // Requires Apple entitlement
                provideAppNotificationSettings: true,
                allowProvisional: false,
            },
        });

        const granted = status === 'granted';

        return {
            granted,
            canUseTimeSensitive: granted && isTimeSensitiveAvailable(),
            canUseCritical: false, // Requires special Apple entitlement
        };
    } catch (error) {
        console.error('[iOSNotificationService] Failed to request permissions:', error);
        return { granted: false, canUseTimeSensitive: false, canUseCritical: false };
    }
};

/**
 * Get current iOS notification settings
 */
export const getIOSNotificationSettings = async (): Promise<{
    alertsEnabled: boolean;
    badgesEnabled: boolean;
    soundsEnabled: boolean;
    notificationsEnabled: boolean;
    timeSensitiveEnabled: boolean;
}> => {
    if (!isIOS()) {
        return {
            alertsEnabled: true,
            badgesEnabled: true,
            soundsEnabled: true,
            notificationsEnabled: true,
            timeSensitiveEnabled: false,
        };
    }

    try {
        const settings = await Notifications.getPermissionsAsync();
        const ios = (settings as any).ios || {};

        return {
            alertsEnabled: ios.allowsAlert ?? settings.granted,
            badgesEnabled: ios.allowsBadge ?? settings.granted,
            soundsEnabled: ios.allowsSound ?? settings.granted,
            notificationsEnabled: settings.granted,
            timeSensitiveEnabled: settings.granted && isTimeSensitiveAvailable(),
        };
    } catch (error) {
        console.error('[iOSNotificationService] Failed to get settings:', error);
        return {
            alertsEnabled: false,
            badgesEnabled: false,
            soundsEnabled: false,
            notificationsEnabled: false,
            timeSensitiveEnabled: false,
        };
    }
};

/**
 * Open iOS notification settings (System Settings > App > Notifications)
 */
export const openIOSNotificationSettings = async (): Promise<void> => {
    if (!isIOS()) return;

    try {
        const { Linking } = await import('react-native');
        await Linking.openSettings();
    } catch (error) {
        console.error('[iOSNotificationService] Failed to open settings:', error);
    }
};

/**
 * Set badge count on app icon
 */
export const setBadgeCount = async (count: number): Promise<void> => {
    if (!isIOS()) return;

    try {
        await Notifications.setBadgeCountAsync(count);
    } catch (error) {
        console.error('[iOSNotificationService] Failed to set badge:', error);
    }
};

/**
 * Clear badge count
 */
export const clearBadge = async (): Promise<void> => {
    await setBadgeCount(0);
};

export default {
    isIOS,
    getIOSVersion,
    isTimeSensitiveAvailable,
    isFocusModeAvailable,
    scheduleTimeSensitiveNotification,
    scheduleStandardNotification,
    sendImmediateNotification,
    requestIOSNotificationPermissions,
    getIOSNotificationSettings,
    openIOSNotificationSettings,
    setBadgeCount,
    clearBadge,
};
