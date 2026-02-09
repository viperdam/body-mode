// usePermissionLifecycle - Manages permission checks during component lifecycle
// Checks permissions on mount and integrates with detection hook

import { useEffect, useRef } from 'react';
import { permissionManager } from '../services/permissions/PermissionManager';
import { usePermissionDetection } from './usePermissionDetection';

/**
 * usePermissionLifecycle - Hook for managing permission lifecycle
 *
 * Purpose:
 * - Check permissions on component mount
 * - Integrate AppState detection for resume checks
 * - Cleanup on unmount
 *
 * Flow:
 * 1. Component mounts → Check all permissions
 * 2. App goes to background → (no action)
 * 3. App returns to foreground → Re-check all permissions (via usePermissionDetection)
 * 4. Component unmounts → Cleanup
 *
 * @param checkOnMount - Whether to check permissions on mount (default: true)
 * @param detectChanges - Whether to detect permission changes on resume (default: true)
 *
 * @example
 * ```typescript
 * function PermissionsScreen() {
 *   usePermissionLifecycle(); // Checks on mount + detects changes
 *
 *   const { permissions } = usePermissionStore();
 *
 *   return <View>...</View>;
 * }
 * ```
 */
export function usePermissionLifecycle(
  checkOnMount: boolean = true,
  detectChanges: boolean = false
): void {
  const isFirstMount = useRef(true);

  // Enable detection hook
  usePermissionDetection(detectChanges);

  useEffect(() => {
    // Check permissions on first mount
    if (checkOnMount && isFirstMount.current) {
      isFirstMount.current = false;

      console.log('[usePermissionLifecycle] Checking permissions on mount...');

      permissionManager
        .checkAllPermissions()
        .then(() => {
          console.log('[usePermissionLifecycle] Initial permission check complete');
        })
        .catch((error) => {
          console.error('[usePermissionLifecycle] Failed to check permissions on mount:', error);
        });
    }
  }, [checkOnMount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[usePermissionLifecycle] Component unmounting');
      // No cleanup needed currently, but hook is here for future use
    };
  }, []);
}

/**
 * usePermissionLifecycleWithCallback - Lifecycle with custom callback
 *
 * Calls a custom callback after permissions are checked
 *
 * @param callback - Function to call after permission checks
 * @param checkOnMount - Whether to check on mount (default: true)
 * @param detectChanges - Whether to detect changes (default: true)
 *
 * @example
 * ```typescript
 * usePermissionLifecycleWithCallback(async () => {
 *   console.log('Permissions checked!');
 *   // Navigate if all granted, show prompt if not, etc.
 * });
 * ```
 */
export function usePermissionLifecycleWithCallback(
  callback: () => void | Promise<void>,
  checkOnMount: boolean = true,
  detectChanges: boolean = false
): void {
  const isFirstMount = useRef(true);

  // Enable detection hook with callback
  usePermissionDetection(detectChanges);

  useEffect(() => {
    if (checkOnMount && isFirstMount.current) {
      isFirstMount.current = false;

      console.log('[usePermissionLifecycleWithCallback] Checking permissions on mount...');

      permissionManager
        .checkAllPermissions()
        .then(async () => {
          await callback();
          console.log('[usePermissionLifecycleWithCallback] Callback executed');
        })
        .catch((error) => {
          console.error('[usePermissionLifecycleWithCallback] Error:', error);
        });
    }
  }, [checkOnMount, callback]);
}
