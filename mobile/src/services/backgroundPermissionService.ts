// Background Permission Service - React Native interface for background reliability
// Handles battery optimization, OEM-specific settings, and permission status

import { NativeModules, Platform, Linking } from 'react-native';
import i18n from '../i18n';

const { BackgroundPermission } = NativeModules;

export interface BackgroundStatus {
    batteryOptimizationDisabled: boolean;
    overlayPermissionGranted: boolean;
    exactAlarmPermissionGranted: boolean;
    manufacturer: string;
    hasAggressiveOem: boolean;
}

export interface BackgroundReliabilityIssue {
    id: string;
    title: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
    action: () => Promise<void>;
    actionLabel: string;
}

/**
 * Check if the app is exempted from battery optimization
 */
export const isIgnoringBatteryOptimizations = async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !BackgroundPermission?.isIgnoringBatteryOptimizations) {
        return true; // iOS doesn't have this concept at the OS level
    }
    try {
        return await BackgroundPermission.isIgnoringBatteryOptimizations();
    } catch (error) {
        console.error('[BackgroundPermissionService] Failed to check battery optimization:', error);
        return false;
    }
};

/**
 * Request exemption from battery optimization
 */
export const requestBatteryOptimizationExemption = async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !BackgroundPermission?.requestBatteryOptimizationExemption) {
        return true;
    }
    try {
        return await BackgroundPermission.requestBatteryOptimizationExemption();
    } catch (error) {
        console.error('[BackgroundPermissionService] Failed to request battery exemption:', error);
        return false;
    }
};

/**
 * Open battery optimization settings
 */
export const openBatteryOptimizationSettings = async (): Promise<void> => {
    if (Platform.OS !== 'android' || !BackgroundPermission?.openBatteryOptimizationSettings) {
        return;
    }
    try {
        await BackgroundPermission.openBatteryOptimizationSettings();
    } catch (error) {
        console.error('[BackgroundPermissionService] Failed to open battery settings:', error);
    }
};

/**
 * Get the device manufacturer
 */
export const getDeviceManufacturer = async (): Promise<string> => {
    if (Platform.OS !== 'android' || !BackgroundPermission?.getDeviceManufacturer) {
        return 'unknown';
    }
    try {
        return await BackgroundPermission.getDeviceManufacturer();
    } catch (error) {
        console.error('[BackgroundPermissionService] Failed to get manufacturer:', error);
        return 'unknown';
    }
};

/**
 * Check if device has aggressive battery management (OEM-specific)
 */
export const hasAggressiveBatteryManagement = async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !BackgroundPermission?.hasAggressiveBatteryManagement) {
        return false;
    }
    try {
        return await BackgroundPermission.hasAggressiveBatteryManagement();
    } catch (error) {
        console.error('[BackgroundPermissionService] Failed to check OEM battery:', error);
        return false;
    }
};

/**
 * Open OEM-specific battery/autostart settings
 */
export const openOemBatterySettings = async (): Promise<void> => {
    if (Platform.OS !== 'android' || !BackgroundPermission?.openOemBatterySettings) {
        return;
    }
    try {
        await BackgroundPermission.openOemBatterySettings();
    } catch (error) {
        console.error('[BackgroundPermissionService] Failed to open OEM settings:', error);
    }
};

/**
 * Get comprehensive background permission status
 */
export const getBackgroundStatus = async (): Promise<BackgroundStatus> => {
    if (Platform.OS !== 'android' || !BackgroundPermission?.getBackgroundStatus) {
        return {
            batteryOptimizationDisabled: true,
            overlayPermissionGranted: true,
            exactAlarmPermissionGranted: true,
            manufacturer: 'ios',
            hasAggressiveOem: false,
        };
    }
    try {
        return await BackgroundPermission.getBackgroundStatus();
    } catch (error) {
        console.error('[BackgroundPermissionService] Failed to get background status:', error);
        return {
            batteryOptimizationDisabled: false,
            overlayPermissionGranted: false,
            exactAlarmPermissionGranted: false,
            manufacturer: 'unknown',
            hasAggressiveOem: true,
        };
    }
};

/**
 * Request exact alarm permission (Android 12+)
 */
export const requestExactAlarmPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !BackgroundPermission?.requestExactAlarmPermission) {
        return true;
    }
    try {
        return await BackgroundPermission.requestExactAlarmPermission();
    } catch (error) {
        console.error('[BackgroundPermissionService] Failed to request exact alarm:', error);
        return false;
    }
};

/**
 * Get human-readable OEM name
 */
export const getOemDisplayName = (manufacturer: string): string => {
    const names: Record<string, string> = {
        xiaomi: 'Xiaomi',
        redmi: 'Redmi',
        poco: 'POCO',
        huawei: 'Huawei',
        honor: 'Honor',
        oppo: 'OPPO',
        realme: 'Realme',
        oneplus: 'OnePlus',
        vivo: 'Vivo',
        iqoo: 'iQOO',
        samsung: 'Samsung',
        meizu: 'Meizu',
        asus: 'ASUS',
        lenovo: 'Lenovo',
    };
    return names[manufacturer.toLowerCase()] || manufacturer;
};

/**
 * Get all background reliability issues that need fixing
 */
export const getBackgroundReliabilityIssues = async (): Promise<BackgroundReliabilityIssue[]> => {
    const issues: BackgroundReliabilityIssue[] = [];

    if (Platform.OS !== 'android') {
        // iOS has its own notification system, no special permissions needed
        return issues;
    }

    const status = await getBackgroundStatus();

    // Battery optimization - most critical
    if (!status.batteryOptimizationDisabled) {
        issues.push({
            id: 'battery_optimization',
            title: i18n.t('background_permissions.battery_optimization.title'),
            description: i18n.t('background_permissions.battery_optimization.description'),
            severity: 'critical',
            action: async () => { await requestBatteryOptimizationExemption(); },
            actionLabel: i18n.t('background_permissions.battery_optimization.action'),
        });
    }

    // Overlay permission
    if (!status.overlayPermissionGranted) {
        issues.push({
            id: 'overlay_permission',
            title: i18n.t('background_permissions.overlay_permission.title'),
            description: i18n.t('background_permissions.overlay_permission.description'),
            severity: 'critical',
            action: async () => {
                // This is handled by OverlayModule
                const { OverlayModule } = NativeModules;
                if (OverlayModule?.requestPermission) {
                    await OverlayModule.requestPermission();
                }
            },
            actionLabel: i18n.t('background_permissions.overlay_permission.action'),
        });
    }

    // Exact alarm permission (Android 12+)
    if (!status.exactAlarmPermissionGranted) {
        issues.push({
            id: 'exact_alarm',
            title: i18n.t('background_permissions.exact_alarm.title'),
            description: i18n.t('background_permissions.exact_alarm.description'),
            severity: 'warning',
            action: async () => { await requestExactAlarmPermission(); },
            actionLabel: i18n.t('background_permissions.exact_alarm.action'),
        });
    }

    // OEM-specific battery killer
    if (status.hasAggressiveOem) {
        const oemName = getOemDisplayName(status.manufacturer);
        issues.push({
            id: 'oem_battery',
            title: i18n.t('background_permissions.oem_battery.title', { oem: oemName }),
            description: i18n.t('background_permissions.oem_battery.description', { oem: oemName }),
            severity: 'warning',
            action: openOemBatterySettings,
            actionLabel: i18n.t('background_permissions.oem_battery.action', { oem: oemName }),
        });
    }

    return issues;
};

/**
 * Run all permission requests at once
 */
export const requestAllBackgroundPermissions = async (): Promise<void> => {
    if (Platform.OS !== 'android') return;

    const status = await getBackgroundStatus();

    if (!status.batteryOptimizationDisabled) {
        await requestBatteryOptimizationExemption();
    }

    if (!status.exactAlarmPermissionGranted) {
        await requestExactAlarmPermission();
    }
};

export default {
    isIgnoringBatteryOptimizations,
    requestBatteryOptimizationExemption,
    openBatteryOptimizationSettings,
    getDeviceManufacturer,
    hasAggressiveBatteryManagement,
    openOemBatterySettings,
    getBackgroundStatus,
    requestExactAlarmPermission,
    getOemDisplayName,
    getBackgroundReliabilityIssues,
    requestAllBackgroundPermissions,
};
