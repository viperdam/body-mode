// usePermissionDetection - Detects when user returns from settings
// Implements AppState listening with debouncing

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { permissionManager } from '../services/permissions/PermissionManager';
import { globalPermissionCache } from '../services/permissions/PermissionCache';

/**
 * usePermissionDetection - Hook for detecting permission changes
 *
 * Purpose:
 * - Listen for AppState changes (background → active)
 * - When user returns from settings, re-check all permissions
 * - Debounce rapid state changes
 * - Invalidate cache on resume
 *
 * Flow:
 * 1. User taps "Enable" → Opens settings
 * 2. AppState → 'inactive' or 'background'
 * 3. User grants permission → Returns to app
 * 4. AppState → 'active'
 * 5. This hook triggers
 * 6. Cache invalidated
 * 7. All permissions re-checked
 * 8. Store updated
 * 9. UI re-renders with new permission states
 *
 * @param enabled - Whether detection is enabled (default: true)
 *
 * @example
 * ```typescript
 * function PermissionsScreen() {
 *   usePermissionDetection(); // Auto re-checks when returning from settings
 *
 *   return <View>...</View>;
 * }
 * ```
 */
export function usePermissionDetection(enabled: boolean = true): void {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastCheckTime = useRef<number>(0);

  // Debounce threshold in milliseconds
  const DEBOUNCE_MS = 1000;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      const previousState = appState.current;

      // Detect when app comes to foreground
      const isResuming =
        (previousState === 'background' || previousState === 'inactive') &&
        nextAppState === 'active';

      if (isResuming) {
        const now = Date.now();
        const timeSinceLastCheck = now - lastCheckTime.current;

        // Debounce - only check if enough time has passed
        if (timeSinceLastCheck > DEBOUNCE_MS) {
          console.log('[usePermissionDetection] App resumed, re-checking permissions...');

          // Invalidate cache - force fresh checks
          globalPermissionCache.invalidate();

          // Re-check all permissions
          try {
            await permissionManager.checkAllPermissions();
            console.log('[usePermissionDetection] Permissions re-checked successfully');

            // CRITICAL: Explicitly clear requesting state for settings-based permissions
            // This handles cases where AppState transitions don't fire properly on some devices
            const { usePermissionStore } = require('../services/permissions/PermissionStore');
            const store = usePermissionStore.getState();
            const permissions = store.permissions;

            // If any permission is still in "requesting" state, clear it
            if (permissions.overlay?.requesting) {
              store.updatePermissionStatus('overlay', { requesting: false });
              console.log('[usePermissionDetection] Cleared stuck overlay requesting state');
            }
            if (permissions.batteryOptimization?.requesting) {
              store.updatePermissionStatus('batteryOptimization', { requesting: false });
              console.log('[usePermissionDetection] Cleared stuck battery requesting state');
            }
          } catch (error) {
            console.error('[usePermissionDetection] Failed to re-check permissions:', error);
          }

          lastCheckTime.current = now;
        } else {
          console.log(
            `[usePermissionDetection] Skipping check (debounced, ${timeSinceLastCheck}ms since last)`
          );
        }
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [enabled]);
}

/**
 * usePermissionDetectionWithCallback - Hook with custom callback
 *
 * Same as usePermissionDetection but calls a custom callback when permissions are re-checked
 *
 * @param callback - Function to call after permissions are re-checked
 * @param enabled - Whether detection is enabled (default: true)
 *
 * @example
 * ```typescript
 * usePermissionDetectionWithCallback(() => {
 *   console.log('Permissions updated!');
 *   // Do something when permissions change
 * });
 * ```
 */
export function usePermissionDetectionWithCallback(
  callback: () => void | Promise<void>,
  enabled: boolean = true
): void {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastCheckTime = useRef<number>(0);

  const DEBOUNCE_MS = 1000;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      const previousState = appState.current;

      const isResuming =
        (previousState === 'background' || previousState === 'inactive') &&
        nextAppState === 'active';

      if (isResuming) {
        const now = Date.now();
        const timeSinceLastCheck = now - lastCheckTime.current;

        if (timeSinceLastCheck > DEBOUNCE_MS) {
          console.log('[usePermissionDetectionWithCallback] App resumed, re-checking...');

          // Invalidate cache
          globalPermissionCache.invalidate();

          // Re-check all permissions
          try {
            await permissionManager.checkAllPermissions();

            // Call custom callback
            await callback();

            console.log('[usePermissionDetectionWithCallback] Callback executed');
          } catch (error) {
            console.error('[usePermissionDetectionWithCallback] Error:', error);
          }

          lastCheckTime.current = now;
        }
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [enabled, callback]);
}
