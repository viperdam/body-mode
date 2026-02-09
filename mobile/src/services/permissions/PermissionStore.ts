// Permission Store - Global state management for permissions using Zustand
// Single source of truth for all permission-related state

import { create } from 'zustand';
import type {
  PermissionStore,
  PermissionType,
  PermissionStatus,
  PermissionRequestResult,
} from './types';
import { DEFAULT_PERMISSION_STATUS, DEFAULT_OEM_INFO } from './types';

let permissionManagerReady = false;
let permissionManagerInitPromise: Promise<void> | null = null;

const ensurePermissionManagerReady = async (): Promise<boolean> => {
  if (permissionManagerReady) return true;
  if (!permissionManagerInitPromise) {
    permissionManagerInitPromise = (async () => {
      try {
        const { initializePermissionManager } = await import('./PermissionManager');
        await initializePermissionManager();
        permissionManagerReady = true;
      } catch (error) {
        console.warn('[PermissionStore] Failed to initialize PermissionManager:', error);
        permissionManagerReady = false;
        permissionManagerInitPromise = null;
      }
    })();
  }
  await permissionManagerInitPromise;
  return permissionManagerReady;
};

/**
 * Create initial permission state
 * All permissions start in unknown state (granted: null)
 */
const createInitialPermissions = (): Record<PermissionType, PermissionStatus> => ({
  notifications: { ...DEFAULT_PERMISSION_STATUS },
  overlay: { ...DEFAULT_PERMISSION_STATUS },
  camera: { ...DEFAULT_PERMISSION_STATUS },
  location: { ...DEFAULT_PERMISSION_STATUS },
  backgroundLocation: { ...DEFAULT_PERMISSION_STATUS },
  batteryOptimization: { ...DEFAULT_PERMISSION_STATUS },
  exactAlarm: { ...DEFAULT_PERMISSION_STATUS },
  microphone: { ...DEFAULT_PERMISSION_STATUS },
  activityRecognition: { ...DEFAULT_PERMISSION_STATUS },
  healthConnect: { ...DEFAULT_PERMISSION_STATUS },
});

/**
 * Global permission store
 *
 * Architecture:
 * - Single source of truth for all permission states
 * - Used by both PermissionsScreen and SettingsScreen
 * - Reactive updates - all subscribers re-render when state changes
 * - No local state in components
 *
 * Usage:
 * ```typescript
 * // In a component
 * const { permissions, updatePermissionStatus } = usePermissionStore();
 *
 * // Check specific permission
 * const isNotificationGranted = permissions.notifications.granted;
 *
 * // Update permission
 * updatePermissionStatus('notifications', { granted: true });
 * ```
 */
export const usePermissionStore = create<PermissionStore>((set, get) => ({
  // --- STATE ---

  permissions: createInitialPermissions(),

  oemInfo: { ...DEFAULT_OEM_INFO },

  checkInProgress: false,

  lastCheckTimestamp: 0,

  pendingRequests: new Set<PermissionType>(),

  // --- ACTIONS ---

  /**
   * Check status of a specific permission
   * Note: Actual implementation delegated to PermissionManager
   * This is a placeholder that will be overridden
   */
  checkPermission: async (type: PermissionType): Promise<PermissionStatus> => {
    if (!(await ensurePermissionManagerReady())) {
      console.warn('[PermissionStore] checkPermission called before PermissionManager ready');
      return get().permissions[type];
    }
    return get().checkPermission(type);
  },

  /**
   * Check status of all permissions
   * Note: Actual implementation delegated to PermissionManager
   */
  checkAllPermissions: async (): Promise<void> => {
    if (!(await ensurePermissionManagerReady())) {
      console.warn('[PermissionStore] checkAllPermissions called before PermissionManager ready');
      return;
    }
    await get().checkAllPermissions();
  },

  /**
   * Request a specific permission
   * Note: Actual implementation delegated to PermissionManager
   */
  requestPermission: async (type: PermissionType): Promise<boolean> => {
    if (!(await ensurePermissionManagerReady())) {
      console.warn('[PermissionStore] requestPermission called before PermissionManager ready');
      return get().permissions[type].granted ?? false;
    }
    return get().requestPermission(type);
  },

  /**
   * Request all critical permissions
   * Note: Actual implementation delegated to PermissionManager
   */
  requestAllPermissions: async (): Promise<PermissionRequestResult> => {
    if (!(await ensurePermissionManagerReady())) {
      console.warn('[PermissionStore] requestAllPermissions called before PermissionManager ready');
      return {
        allGranted: false,
        results: {} as Record<PermissionType, boolean>,
        failed: [],
      };
    }
    return get().requestAllPermissions();
  },

  /**
   * Update permission status in store
   * This is the core method for updating permission state
   */
  updatePermissionStatus: (type: PermissionType, updates: Partial<PermissionStatus>): void => {
    set(state => ({
      permissions: {
        ...state.permissions,
        [type]: {
          ...state.permissions[type],
          ...updates,
          lastChecked: Date.now(),
        },
      },
    }));
  },

  /**
   * Update OEM information
   */
  updateOEMInfo: (info: Partial<typeof DEFAULT_OEM_INFO>): void => {
    set(state => ({
      oemInfo: {
        ...state.oemInfo,
        ...info,
      },
    }));
  },

  /**
   * Set mutex flag for check in progress
   */
  setCheckInProgress: (inProgress: boolean): void => {
    set({ checkInProgress: inProgress });
  },

  /**
   * Add permission to pending requests
   */
  addPendingRequest: (type: PermissionType): void => {
    set(state => ({
      pendingRequests: new Set([...state.pendingRequests, type]),
    }));
  },

  /**
   * Remove permission from pending requests
   */
  removePendingRequest: (type: PermissionType): void => {
    set(state => {
      const newSet = new Set(state.pendingRequests);
      newSet.delete(type);
      return { pendingRequests: newSet };
    });
  },

  /**
   * Reset all permission states to initial (unknown)
   * Useful for testing or debugging
   */
  resetPermissions: (): void => {
    set({
      permissions: createInitialPermissions(),
      oemInfo: { ...DEFAULT_OEM_INFO },
      checkInProgress: false,
      lastCheckTimestamp: 0,
      pendingRequests: new Set<PermissionType>(),
    });
  },
}));

/**
 * Selector hooks for specific parts of state
 * Optimizes re-renders by only subscribing to needed state slices
 */

/**
 * Get status of a specific permission
 */
export const usePermissionStatus = (type: PermissionType): PermissionStatus => {
  return usePermissionStore(state => state.permissions[type]);
};

/**
 * Get all permission statuses
 */
export const useAllPermissions = (): Record<PermissionType, PermissionStatus> => {
  return usePermissionStore(state => state.permissions);
};

/**
 * Get OEM information
 */
export const useOEMInfo = () => {
  return usePermissionStore(state => state.oemInfo);
};

/**
 * Check if any permission check is in progress
 */
export const useCheckInProgress = (): boolean => {
  return usePermissionStore(state => state.checkInProgress);
};

/**
 * Check if specific permission has pending request
 */
export const useIsPermissionPending = (type: PermissionType): boolean => {
  return usePermissionStore(state => state.pendingRequests.has(type));
};

/**
 * Get all permission actions (for components that need to trigger actions)
 */
export const usePermissionActions = () => {
  return usePermissionStore(state => ({
    checkPermission: state.checkPermission,
    checkAllPermissions: state.checkAllPermissions,
    requestPermission: state.requestPermission,
    requestAllPermissions: state.requestAllPermissions,
    updatePermissionStatus: state.updatePermissionStatus,
    updateOEMInfo: state.updateOEMInfo,
    setCheckInProgress: state.setCheckInProgress,
    addPendingRequest: state.addPendingRequest,
    removePendingRequest: state.removePendingRequest,
    resetPermissions: state.resetPermissions,
  }));
};
