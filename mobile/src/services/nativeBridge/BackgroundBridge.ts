// Background Bridge - TypeScript wrapper for BackgroundPermissionModule
// Provides battery optimization and background permission management

import { NativeModules, Platform } from 'react-native';
import { PermissionError, PermissionErrorType } from '../permissions/types';
import i18n from '../../i18n';

/**
 * Background status from native module
 */
export interface BackgroundStatus {
  batteryOptimizationDisabled: boolean;
  overlayPermissionGranted: boolean;
  exactAlarmPermissionGranted: boolean;
  manufacturer: string;
  hasAggressiveOem: boolean;
}

/**
 * Native module interface for background permissions
 */
interface BackgroundPermissionNativeModule {
  isIgnoringBatteryOptimizations: () => Promise<boolean>;
  requestBatteryOptimizationExemption: () => Promise<boolean>;
  openBatteryOptimizationSettings: () => Promise<void>;
  getDeviceManufacturer: () => Promise<string>;
  hasAggressiveBatteryManagement: () => Promise<boolean>;
  openOemBatterySettings: () => Promise<void>;
  getBackgroundStatus: () => Promise<BackgroundStatus>;
  requestExactAlarmPermission: () => Promise<void>;
}

/**
 * Get BackgroundPermission native module
 */
const getBackgroundModule = (): BackgroundPermissionNativeModule | null => {
  if (Platform.OS !== 'android') {
    return null;
  }

  const module = NativeModules.BackgroundPermission;
  if (!module) {
    console.warn('[BackgroundBridge] BackgroundPermission module not found');
    return null;
  }

  return module as BackgroundPermissionNativeModule;
};

/**
 * BackgroundBridge - Wrapper for battery optimization and background permissions
 *
 * Purpose:
 * - Check if app is exempted from battery optimization
 * - Request battery optimization exemption (opens system dialog)
 * - Open battery settings
 * - Detect OEM manufacturer and aggressive battery management
 * - Open OEM-specific battery settings
 *
 * Native API:
 * - PowerManager.isIgnoringBatteryOptimizations()
 * - Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
 * - OEM-specific intents for Xiaomi, Huawei, OPPO, etc.
 */
export class BackgroundBridge {
  /**
   * Check if app is exempted from battery optimization
   *
   * Native: PowerManager.isIgnoringBatteryOptimizations(packageName)
   *
   * @returns True if app is exempted (unrestricted), false if optimized
   *
   * @example
   * ```typescript
   * const exempted = await BackgroundBridge.isIgnoringBatteryOptimizations();
   * if (!exempted) {
   *   console.log('App may be killed by battery optimization');
   * }
   * ```
   */
  static async isIgnoringBatteryOptimizations(): Promise<boolean> {
    // iOS doesn't have battery optimization
    if (Platform.OS !== 'android') {
      return true;
    }

    const module = getBackgroundModule();

    if (!module || !module.isIgnoringBatteryOptimizations) {
      throw new PermissionError(
        PermissionErrorType.MODULE_NOT_AVAILABLE,
        i18n.t('errors.permissions.background.module_unavailable')
      );
    }

    try {
      return await module.isIgnoringBatteryOptimizations();
    } catch (error) {
      console.error('[BackgroundBridge] isIgnoringBatteryOptimizations failed:', error);
      throw new PermissionError(
        PermissionErrorType.MODULE_METHOD_NOT_FOUND,
        i18n.t('errors.permissions.background.battery_status_failed'),
        error as Error
      );
    }
  }

  /**
   * Request battery optimization exemption
   *
   * Native: Opens Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
   * This shows a SYSTEM DIALOG asking to exempt the app
   *
   * NOT the generic App Info page!
   *
   * @returns True if already exempted, false if dialog was shown
   *
   * @example
   * ```typescript
   * const alreadyExempted = await BackgroundBridge.requestBatteryOptimizationExemption();
   * if (!alreadyExempted) {
   *   // User will see system dialog
   *   // Check status when they return (AppState)
   * }
   * ```
   */
  static async requestBatteryOptimizationExemption(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    const module = getBackgroundModule();

    if (!module || !module.requestBatteryOptimizationExemption) {
      throw new PermissionError(
        PermissionErrorType.MODULE_NOT_AVAILABLE,
        i18n.t('errors.permissions.background.module_unavailable')
      );
    }

    try {
      return await module.requestBatteryOptimizationExemption();
    } catch (error) {
      console.error('[BackgroundBridge] requestBatteryOptimizationExemption failed:', error);
      throw new PermissionError(
        PermissionErrorType.INTENT_NOT_FOUND,
        i18n.t('errors.permissions.background.battery_request_failed'),
        error as Error
      );
    }
  }

  /**
   * Open battery optimization settings page
   *
   * Native: Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
   * Shows list of all apps with battery optimization status
   *
   * @example
   * ```typescript
   * await BackgroundBridge.openBatteryOptimizationSettings();
   * // User can manually find and configure the app
   * ```
   */
  static async openBatteryOptimizationSettings(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    const module = getBackgroundModule();

    if (!module || !module.openBatteryOptimizationSettings) {
      throw new PermissionError(
        PermissionErrorType.MODULE_NOT_AVAILABLE,
        i18n.t('errors.permissions.background.module_unavailable')
      );
    }

    try {
      await module.openBatteryOptimizationSettings();
    } catch (error) {
      console.error('[BackgroundBridge] openBatteryOptimizationSettings failed:', error);
      throw new PermissionError(
        PermissionErrorType.SETTINGS_UNAVAILABLE,
        i18n.t('errors.permissions.background.battery_settings_failed'),
        error as Error
      );
    }
  }

  /**
   * Get device manufacturer
   *
   * @returns Lowercase manufacturer name (e.g., "xiaomi", "huawei", "samsung")
   *
   * @example
   * ```typescript
   * const manufacturer = await BackgroundBridge.getDeviceManufacturer();
   * if (manufacturer === 'xiaomi') {
   *   console.log('MIUI device detected');
   * }
   * ```
   */
  static async getDeviceManufacturer(): Promise<string> {
    if (Platform.OS !== 'android') {
      return 'apple';
    }

    const module = getBackgroundModule();

    if (!module || !module.getDeviceManufacturer) {
      return 'unknown';
    }

    try {
      return await module.getDeviceManufacturer();
    } catch (error) {
      console.error('[BackgroundBridge] getDeviceManufacturer failed:', error);
      return 'unknown';
    }
  }

  /**
   * Check if device has aggressive battery management
   *
   * Detects: Xiaomi, Huawei, OPPO, Vivo, Samsung, OnePlus, ASUS, etc.
   *
   * @returns True if manufacturer is known for aggressive battery killing
   *
   * @example
   * ```typescript
   * const aggressive = await BackgroundBridge.hasAggressiveBatteryManagement();
   * if (aggressive) {
   *   // Show OEM-specific setup guide
   * }
   * ```
   */
  static async hasAggressiveBatteryManagement(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    const module = getBackgroundModule();

    if (!module || !module.hasAggressiveBatteryManagement) {
      return false;
    }

    try {
      return await module.hasAggressiveBatteryManagement();
    } catch (error) {
      console.error('[BackgroundBridge] hasAggressiveBatteryManagement failed:', error);
      return false;
    }
  }

  /**
   * Open OEM-specific battery settings
   *
   * Opens manufacturer-specific settings:
   * - Xiaomi/MIUI: Security Center → AutoStart
   * - Huawei: Startup Manager
   * - OPPO/ColorOS: Startup Apps
   * - Vivo: Background Startup
   * - Samsung: Battery Activity
   * - OnePlus: Chain Launch
   * - ASUS: Auto-start
   *
   * Fallback to general battery settings if OEM intent fails
   *
   * @example
   * ```typescript
   * await BackgroundBridge.openOemBatterySettings();
   * // Opens MIUI Security Center on Xiaomi devices
   * ```
   */
  static async openOemBatterySettings(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    const module = getBackgroundModule();

    if (!module || !module.openOemBatterySettings) {
      throw new PermissionError(
        PermissionErrorType.MODULE_NOT_AVAILABLE,
        i18n.t('errors.permissions.background.module_unavailable')
      );
    }

    try {
      await module.openOemBatterySettings();
    } catch (error) {
      console.error('[BackgroundBridge] openOemBatterySettings failed:', error);
      throw new PermissionError(
        PermissionErrorType.SETTINGS_UNAVAILABLE,
        i18n.t('errors.permissions.background.oem_settings_failed'),
        error as Error
      );
    }
  }

  /**
   * Get comprehensive background status
   *
   * Returns all background-related permission statuses in one call
   *
   * @returns Object with battery optimization, overlay, exact alarm, manufacturer info
   *
   * @example
   * ```typescript
   * const status = await BackgroundBridge.getBackgroundStatus();
   * console.log('Battery optimized:', !status.batteryOptimizationDisabled);
   * console.log('Manufacturer:', status.manufacturer);
   * console.log('Aggressive OEM:', status.hasAggressiveOem);
   * ```
   */
  static async getBackgroundStatus(): Promise<BackgroundStatus> {
    if (Platform.OS !== 'android') {
      return {
        batteryOptimizationDisabled: true,
        overlayPermissionGranted: false,
        exactAlarmPermissionGranted: true,
        manufacturer: 'apple',
        hasAggressiveOem: false,
      };
    }

    const module = getBackgroundModule();

    if (!module || !module.getBackgroundStatus) {
      throw new PermissionError(
        PermissionErrorType.MODULE_NOT_AVAILABLE,
        i18n.t('errors.permissions.background.module_unavailable')
      );
    }

    try {
      return await module.getBackgroundStatus();
    } catch (error) {
      console.error('[BackgroundBridge] getBackgroundStatus failed:', error);
      throw new PermissionError(
        PermissionErrorType.MODULE_METHOD_NOT_FOUND,
        i18n.t('errors.permissions.background.status_failed'),
        error as Error
      );
    }
  }

  /**
   * Request exact alarm permission (Android 12+)
   *
   * Opens Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM
   *
   * @example
   * ```typescript
   * await BackgroundBridge.requestExactAlarmPermission();
   * ```
   */
  static async requestExactAlarmPermission(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    const module = getBackgroundModule();

    if (!module || !module.requestExactAlarmPermission) {
      throw new PermissionError(
        PermissionErrorType.MODULE_NOT_AVAILABLE,
        i18n.t('errors.permissions.background.module_unavailable')
      );
    }

    try {
      await module.requestExactAlarmPermission();
    } catch (error) {
      console.error('[BackgroundBridge] requestExactAlarmPermission failed:', error);
      throw new PermissionError(
        PermissionErrorType.INTENT_NOT_FOUND,
        i18n.t('errors.permissions.background.exact_alarm_failed'),
        error as Error
      );
    }
  }

  /**
   * Check if background module is available
   */
  static isAvailable(): boolean {
    return Platform.OS === 'android' && getBackgroundModule() !== null;
  }
}
