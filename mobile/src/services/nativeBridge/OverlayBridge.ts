// Overlay Bridge - TypeScript wrapper for OverlayModule native module
// Provides proper integration with OverlayModule.kt instead of generic Linking API

import { NativeModules, Platform, Linking } from 'react-native';
import { PermissionError, PermissionErrorType } from '../permissions/types';
import i18n from '../../i18n';

const SHOULD_LOG = typeof __DEV__ !== 'undefined' && __DEV__;
let lastOverlayDebugAt = 0;
const OVERLAY_LOG_THROTTLE_MS = 2000;

const debugLog = (...args: any[]) => {
  if (!SHOULD_LOG) return;
  const now = Date.now();
  if (now - lastOverlayDebugAt < OVERLAY_LOG_THROTTLE_MS) return;
  lastOverlayDebugAt = now;
  console.log(...args);
};

/**
 * Native module interface for overlay permissions
 */
interface OverlayNativeModule {
  checkPermission: () => Promise<boolean>;
  requestPermission: () => Promise<void>;
  showOverlay: (data: unknown) => Promise<void>;
  hideOverlay: () => Promise<void>;
  isOverlayVisible: () => Promise<boolean>;
  getPendingEvents: () => Promise<string>;
  clearPendingEvents: () => Promise<void>;
  // Phase 2: Per-event ACK
  removePendingEvent: (eventId: string) => Promise<boolean>;
  // Phase 3: NativeEventEmitter support
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
  // Phase 6: Exact alarm permission
  canScheduleExactAlarms: () => Promise<boolean>;
  requestExactAlarmPermission: () => Promise<boolean>;
}

/**
 * Pending overlay action event
 */
export interface PendingOverlayEvent {
  id: string;
  action: 'COMPLETE' | 'SKIP' | 'SNOOZE';
  planDate?: string;
  planItemId?: string;
  snoozedUntil?: number;
  timestamp: number;
}

/**
 * Get OverlayModule native module
 */
const getOverlayModule = (): OverlayNativeModule | null => {
  if (Platform.OS !== 'android') {
    return null;
  }

  const module = NativeModules.OverlayModule;
  if (!module) {
    console.warn('[OverlayBridge] OverlayModule not found in NativeModules');
    return null;
  }

  return module as OverlayNativeModule;
};

/**
 * OverlayBridge - Wrapper for native overlay module with fallbacks
 *
 * Purpose:
 * - Replace Linking.openSettings() with proper native module calls
 * - Opens Settings.ACTION_MANAGE_OVERLAY_PERMISSION (specific overlay permission page)
 * - NOT the generic App Info page
 *
 * Architecture:
 * - Primary: Call OverlayModule.requestPermission() (native)
 * - Fallback 1: Use Linking API if module unavailable
 * - Fallback 2: Handle errors gracefully
 */
export class OverlayBridge {
  /**
   * Check if overlay permission is granted
   *
   * Native: Settings.canDrawOverlays(context)
   *
   * @returns True if permission granted, false otherwise
   *
   * @example
   * ```typescript
   * const granted = await OverlayBridge.checkPermission();
   * if (granted) {
   *   console.log('Overlay permission granted');
   * }
   * ```
   */
  static async checkPermission(): Promise<boolean> {
    // iOS doesn't have overlay permission
    if (Platform.OS !== 'android') {
      debugLog('[OverlayBridge] iOS - returning true (no overlay permission needed)');
      return true;
    }

    const module = getOverlayModule();
    debugLog('[OverlayBridge] Module available:', !!module);
    debugLog('[OverlayBridge] checkPermission method available:', !!module?.checkPermission);

    // Module not available - return false
    if (!module || !module.checkPermission) {
      console.error('[OverlayBridge] Module or method not available!');
      throw new PermissionError(
        PermissionErrorType.MODULE_NOT_AVAILABLE,
        i18n.t('errors.permissions.overlay.module_unavailable')
      );
    }

    try {
    debugLog('[OverlayBridge] Calling native checkPermission...');
    const granted = await module.checkPermission();
    debugLog('[OverlayBridge] Native returned:', granted);
    return granted;
    } catch (error) {
      console.error('[OverlayBridge] checkPermission failed:', error);
      throw new PermissionError(
        PermissionErrorType.MODULE_METHOD_NOT_FOUND,
        i18n.t('errors.permissions.overlay.check_failed'),
        error as Error
      );
    }
  }

  /**
   * Request overlay permission
   *
   * Native: Opens Settings.ACTION_MANAGE_OVERLAY_PERMISSION
   * Intent data: package:com.viperdam.bodymode
   *
   * This opens the SPECIFIC overlay permission page for this app,
   * NOT the generic App Info page!
   *
   * @throws PermissionError if module unavailable
   *
   * @example
   * ```typescript
   * try {
   *   await OverlayBridge.requestPermission();
   *   // User navigated to overlay settings
   *   // Permission status will be checked when they return (AppState)
   * } catch (error) {
   *   if (error.type === PermissionErrorType.MODULE_NOT_AVAILABLE) {
   *     // Fallback to Linking
   *     await Linking.openSettings();
   *   }
   * }
   * ```
   */
  static async requestPermission(): Promise<void> {
    // iOS doesn't have overlay permission
    if (Platform.OS !== 'android') {
      return;
    }

    const module = getOverlayModule();

    // Module not available - use fallback
    if (!module || !module.requestPermission) {
      console.warn('[OverlayBridge] OverlayModule.requestPermission not available, using Linking fallback');

      throw new PermissionError(
        PermissionErrorType.MODULE_NOT_AVAILABLE,
        i18n.t('errors.permissions.overlay.module_unavailable')
      );
    }

    try {
      // Call native module - opens specific overlay settings page
      await module.requestPermission();
    } catch (error) {
      console.error('[OverlayBridge] requestPermission failed:', error);

      throw new PermissionError(
        PermissionErrorType.INTENT_NOT_FOUND,
        i18n.t('errors.permissions.overlay.request_failed'),
        error as Error
      );
    }
  }

  /**
   * Request permission with automatic fallback
   *
   * Tries native module first, falls back to Linking.openSettings() on error
   *
   * @returns Promise that resolves when settings opened (doesn't indicate grant status)
   */
  static async requestPermissionWithFallback(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      await OverlayBridge.requestPermission();
    } catch (error) {
      // Fallback to generic settings
      console.warn('[OverlayBridge] Using Linking.openSettings() fallback');
      try {
        await Linking.openSettings();
      } catch (fallbackError) {
        console.error('[OverlayBridge] Fallback also failed:', fallbackError);
        throw new PermissionError(
          PermissionErrorType.SETTINGS_UNAVAILABLE,
          i18n.t('errors.permissions.overlay.settings_failed'),
          fallbackError as Error
        );
      }
    }
  }

  /**
   * Show overlay with specific data
   *
   * @param data - Overlay data (type, title, description, etc.)
   */
  static async showOverlay(data: unknown): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    const module = getOverlayModule();

    if (!module || !module.showOverlay) {
      throw new PermissionError(
        PermissionErrorType.MODULE_NOT_AVAILABLE,
        i18n.t('errors.permissions.overlay.module_unavailable')
      );
    }

    try {
      await module.showOverlay(data);
    } catch (error) {
      console.error('[OverlayBridge] showOverlay failed:', error);
      throw new PermissionError(
        PermissionErrorType.MODULE_METHOD_NOT_FOUND,
        i18n.t('errors.permissions.overlay.show_failed'),
        error as Error
      );
    }
  }

  /**
   * Hide currently displayed overlay
   */
  static async hideOverlay(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    const module = getOverlayModule();

    if (!module || !module.hideOverlay) {
      throw new PermissionError(
        PermissionErrorType.MODULE_NOT_AVAILABLE,
        i18n.t('errors.permissions.overlay.module_unavailable')
      );
    }

    try {
      await module.hideOverlay();
    } catch (error) {
      console.error('[OverlayBridge] hideOverlay failed:', error);
      throw new PermissionError(
        PermissionErrorType.MODULE_METHOD_NOT_FOUND,
        i18n.t('errors.permissions.overlay.hide_failed'),
        error as Error
      );
    }
  }

  /**
   * Check if overlay is currently visible
   */
  static async isOverlayVisible(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    const module = getOverlayModule();

    if (!module || !module.isOverlayVisible) {
      return false;
    }

    try {
      return await module.isOverlayVisible();
    } catch (error) {
      console.error('[OverlayBridge] isOverlayVisible failed:', error);
      return false;
    }
  }

  /**
   * Check if overlay module is available
   */
  static isAvailable(): boolean {
    return Platform.OS === 'android' && getOverlayModule() !== null;
  }

  /**
   * Get pending overlay action events
   * These are events that occurred when app was in background and React context was unavailable
   * Call this on app startup/foreground to process any missed events
   */
  static async getPendingEvents(): Promise<PendingOverlayEvent[]> {
    if (Platform.OS !== 'android') {
      return [];
    }

    const module = getOverlayModule();

    if (!module || !module.getPendingEvents) {
      return [];
    }

    try {
      const jsonString = await module.getPendingEvents();
      const events = JSON.parse(jsonString) as PendingOverlayEvent[];
      console.log('[OverlayBridge] getPendingEvents:', events.length, 'events');
      return events;
    } catch (error) {
      console.error('[OverlayBridge] getPendingEvents failed:', error);
      return [];
    }
  }

  /**
   * Clear all pending overlay action events
   * Call this after successfully processing the events
   */
  static async clearPendingEvents(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    const module = getOverlayModule();

    if (!module || !module.clearPendingEvents) {
      return;
    }

    try {
      await module.clearPendingEvents();
      console.log('[OverlayBridge] clearPendingEvents: Cleared');
    } catch (error) {
      console.error('[OverlayBridge] clearPendingEvents failed:', error);
    }
  }

  /**
   * Remove a single pending event by ID (Phase 2: Per-event ACK)
   * Call this after successfully processing a single event
   * 
   * @param eventId - The ID of the event to remove
   * @returns True if event was found and removed, false otherwise
   */
  static async removePendingEvent(eventId: string): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    const module = getOverlayModule();

    if (!module || !module.removePendingEvent) {
      console.warn('[OverlayBridge] removePendingEvent not available');
      return false;
    }

    try {
      const removed = await module.removePendingEvent(eventId);
      console.log(`[OverlayBridge] removePendingEvent: ${eventId} -> ${removed}`);
      return removed;
    } catch (error) {
      console.error('[OverlayBridge] removePendingEvent failed:', error);
      return false;
    }
  }

  /**
   * Check if exact alarms can be scheduled (Phase 6)
   * On Android 12+, this requires SCHEDULE_EXACT_ALARM permission
   * 
   * @returns True if exact alarms can be scheduled
   */
  static async canScheduleExactAlarms(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true; // Not relevant on iOS
    }

    const module = getOverlayModule();

    if (!module || !module.canScheduleExactAlarms) {
      return true; // Assume we can on old devices
    }

    try {
      return await module.canScheduleExactAlarms();
    } catch (error) {
      console.error('[OverlayBridge] canScheduleExactAlarms failed:', error);
      return false;
    }
  }

  /**
   * Request exact alarm permission (Phase 6)
   * Opens the system settings page for exact alarm permission on Android 12+
   * 
   * @returns True if settings page was opened
   */
  static async requestExactAlarmPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true; // Not needed on iOS
    }

    const module = getOverlayModule();

    if (!module || !module.requestExactAlarmPermission) {
      console.warn('[OverlayBridge] requestExactAlarmPermission not available');
      return false;
    }

    try {
      return await module.requestExactAlarmPermission();
    } catch (error) {
      console.error('[OverlayBridge] requestExactAlarmPermission failed:', error);
      return false;
    }
  }
}
