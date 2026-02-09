// Notification Bridge - Wrapper for Expo Notifications API
// Unified interface for notification permissions across platforms

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { PermissionError, PermissionErrorType } from '../permissions/types';
import i18n from '../../i18n';

/**
 * NotificationBridge - Wrapper for notification permissions
 *
 * Uses Expo Notifications API for cross-platform notification management
 *
 * Purpose:
 * - Check notification permission status
 * - Request notification permissions
 * - Handle iOS and Android differences
 */
export class NotificationBridge {
  /**
   * Check if notification permission is granted
   *
   * @returns True if notifications are allowed, false otherwise
   *
   * @example
   * ```typescript
   * const granted = await NotificationBridge.checkPermission();
   * if (granted) {
   *   console.log('Notifications enabled');
   * }
   * ```
   */
  static async checkPermission(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('[NotificationBridge] checkPermission failed:', error);
      throw new PermissionError(
        PermissionErrorType.MODULE_METHOD_NOT_FOUND,
        i18n.t('errors.permissions.notifications.check_failed'),
        error as Error
      );
    }
  }

  /**
   * Request notification permission
   *
   * On iOS: Shows system dialog
   * On Android: Typically granted by default (unless manually disabled)
   *
   * @returns True if permission granted, false if denied
   *
   * @example
   * ```typescript
   * const granted = await NotificationBridge.requestPermission();
   * if (!granted) {
   *   console.log('User denied notifications');
   * }
   * ```
   */
  static async requestPermission(): Promise<boolean> {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('[NotificationBridge] requestPermission failed:', error);
      throw new PermissionError(
        PermissionErrorType.PERMISSION_DENIED,
        i18n.t('errors.permissions.notifications.request_failed'),
        error as Error
      );
    }
  }

  /**
   * Get detailed permission status
   *
   * @returns Object with status, canAskAgain, etc.
   */
  static async getPermissionStatus() {
    try {
      return await Notifications.getPermissionsAsync();
    } catch (error) {
      console.error('[NotificationBridge] getPermissionStatus failed:', error);
      throw new PermissionError(
        PermissionErrorType.MODULE_METHOD_NOT_FOUND,
        i18n.t('errors.permissions.notifications.status_failed'),
        error as Error
      );
    }
  }

  /**
   * Check if we can ask for permission again
   *
   * On iOS, returns false if user selected "Don't Allow" previously
   *
   * @returns True if we can request permission, false if blocked
   */
  static async canAskAgain(): Promise<boolean> {
    try {
      const { canAskAgain } = await Notifications.getPermissionsAsync();
      return canAskAgain;
    } catch (error) {
      console.error('[NotificationBridge] canAskAgain failed:', error);
      return false;
    }
  }

  /**
   * Check if notification module is available
   */
  static isAvailable(): boolean {
    return true; // Expo Notifications is always available
  }
}
