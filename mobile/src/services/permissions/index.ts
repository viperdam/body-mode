// Permission System - Public API
// Central export for all permission-related functionality

// Store and hooks
export {
  usePermissionStore,
  usePermissionStatus,
  useAllPermissions,
  useOEMInfo,
  useCheckInProgress,
  useIsPermissionPending,
  usePermissionActions,
} from './PermissionStore';

// Manager
export { permissionManager, initializePermissionManager } from './PermissionManager';

// Types
export type {
  PermissionType,
  PermissionStatus,
  PermissionState,
  PermissionActions,
  PermissionStore,
  PermissionRequestResult,
  RequestOptions,
  RetryOptions,
  OEMInfo,
  BackgroundReliabilityIssue,
  PermissionMetadata,
  PermissionImportance,
} from './types';

export {
  PermissionError,
  PermissionErrorType,
  DEFAULT_PERMISSION_STATUS,
  DEFAULT_OEM_INFO,
  CRITICAL_PERMISSIONS,
  RECOMMENDED_PERMISSIONS,
  OPTIONAL_PERMISSIONS,
  PERMISSION_METADATA,
  getPermissionImportance,
} from './types';

// Cache and Mutex (for advanced usage)
export { PermissionCache, globalPermissionCache } from './PermissionCache';
export { PermissionMutex, globalPermissionMutex } from './PermissionMutex';
