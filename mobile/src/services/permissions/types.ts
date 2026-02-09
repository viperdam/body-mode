// Permission Management Type Definitions
// Comprehensive type system for permission management architecture

/**
 * Supported permission types in the application
 */
export type PermissionType =
  | 'notifications'
  | 'overlay'
  | 'camera'
  | 'location'
  | 'backgroundLocation'
  | 'batteryOptimization'
  | 'exactAlarm'
  | 'microphone'
  | 'activityRecognition'
  | 'healthConnect';

/**
 * Permission status with metadata
 */
export interface PermissionStatus {
  /** Whether permission is granted (null = unknown) */
  granted: boolean | null;
  /** Whether a permission request is currently in flight */
  requesting: boolean;
  /** Timestamp of last check (null = never checked) */
  lastChecked: number | null;
  /** Error message if check/request failed */
  error: string | null;
}

/**
 * OEM (Original Equipment Manufacturer) information
 */
export interface OEMInfo {
  /** Device manufacturer (lowercase, e.g., "xiaomi", "huawei") */
  manufacturer: string;
  /** Whether manufacturer has aggressive battery management */
  hasAggressiveBattery: boolean;
}

/**
 * Global permission store state
 */
export interface PermissionState {
  /** Current permission statuses for all permission types */
  permissions: Record<PermissionType, PermissionStatus>;
  /** OEM information for the current device */
  oemInfo: OEMInfo;
  /** Whether permission check is currently in progress (mutex flag) */
  checkInProgress: boolean;
  /** Timestamp of last permission check */
  lastCheckTimestamp: number;
  /** Set of permission types with pending requests (race condition prevention) */
  pendingRequests: Set<PermissionType>;
}

/**
 * Permission store actions
 */
export interface PermissionActions {
  /** Check status of a specific permission */
  checkPermission: (type: PermissionType) => Promise<PermissionStatus>;
  /** Check status of all permissions */
  checkAllPermissions: () => Promise<void>;
  /** Request a specific permission */
  requestPermission: (type: PermissionType) => Promise<boolean>;
  /** Request all critical permissions */
  requestAllPermissions: () => Promise<PermissionRequestResult>;
  /** Update permission status in store */
  updatePermissionStatus: (type: PermissionType, status: Partial<PermissionStatus>) => void;
  /** Update OEM information */
  updateOEMInfo: (info: Partial<OEMInfo>) => void;
  /** Set mutex flag for check in progress */
  setCheckInProgress: (inProgress: boolean) => void;
  /** Add permission to pending requests */
  addPendingRequest: (type: PermissionType) => void;
  /** Remove permission from pending requests */
  removePendingRequest: (type: PermissionType) => void;
  /** Reset all permission states */
  resetPermissions: () => void;
}

/**
 * Combined permission store type
 */
export type PermissionStore = PermissionState & PermissionActions;

/**
 * Result of requesting all permissions
 */
export interface PermissionRequestResult {
  /** Whether all critical permissions were granted */
  allGranted: boolean;
  /** Map of permission types to their grant status */
  results: Record<PermissionType, boolean>;
  /** Permissions that failed to be granted */
  failed: PermissionType[];
}

/**
 * Options for permission requests
 */
export interface RequestOptions {
  /** Whether to show rationale before requesting */
  showRationale?: boolean;
  /** Whether to retry on failure */
  retryOnFail?: boolean;
  /** Maximum number of retry attempts */
  maxRetries?: number;
}

/**
 * Options for retry logic
 */
export interface RetryOptions {
  /** Maximum number of attempts */
  maxAttempts?: number;
  /** Delay between attempts in milliseconds */
  delayMs?: number;
  /** Callback when retry occurs */
  onRetry?: (attempt: number) => void;
}

/**
 * Cached permission result
 */
export interface CachedPermissionResult {
  /** Permission status */
  status: PermissionStatus;
  /** Timestamp when cached */
  timestamp: number;
}

/**
 * Permission error types
 */
export enum PermissionErrorType {
  /** Native module not available */
  MODULE_NOT_AVAILABLE = 'MODULE_NOT_AVAILABLE',
  /** Native module method not found */
  MODULE_METHOD_NOT_FOUND = 'MODULE_METHOD_NOT_FOUND',
  /** Permission was denied by user */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /** Permission was blocked (never ask again) */
  PERMISSION_BLOCKED = 'PERMISSION_BLOCKED',
  /** System settings page unavailable */
  SETTINGS_UNAVAILABLE = 'SETTINGS_UNAVAILABLE',
  /** Android intent not found */
  INTENT_NOT_FOUND = 'INTENT_NOT_FOUND',
  /** User cancelled permission request */
  USER_CANCELLED = 'USER_CANCELLED',
  /** Permission request already in progress */
  REQUEST_IN_PROGRESS = 'REQUEST_IN_PROGRESS',
  /** Too many requests (rate limited) */
  RATE_LIMITED = 'RATE_LIMITED',
}

/**
 * Custom permission error class
 */
export class PermissionError extends Error {
  constructor(
    public type: PermissionErrorType,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'PermissionError';
  }
}

/**
 * Background reliability issue
 */
export interface BackgroundReliabilityIssue {
  /** Unique identifier */
  id: string;
  /** Issue title */
  title: string;
  /** Detailed description */
  description: string;
  /** Severity level */
  severity: 'critical' | 'warning' | 'info';
  /** Action to resolve the issue */
  action: () => Promise<void>;
  /** Label for action button */
  actionLabel: string;
}

/**
 * Default permission status (unknown)
 */
export const DEFAULT_PERMISSION_STATUS: PermissionStatus = {
  granted: null,
  requesting: false,
  lastChecked: null,
  error: null,
};

/**
 * Default OEM info (unknown manufacturer)
 */
export const DEFAULT_OEM_INFO: OEMInfo = {
  manufacturer: 'unknown',
  hasAggressiveBattery: false,
};

/**
 * List of critical permissions required for core functionality
 */
export const CRITICAL_PERMISSIONS: PermissionType[] = [
  'notifications',
  'camera',
];

/**
 * List of recommended permissions for best experience
 */
export const RECOMMENDED_PERMISSIONS: PermissionType[] = [
  'location',
  'batteryOptimization',
  'overlay',
];

/**
 * List of optional permissions
 */
export const OPTIONAL_PERMISSIONS: PermissionType[] = [
  'exactAlarm',
];

/**
 * Permission importance levels
 */
export type PermissionImportance = 'critical' | 'recommended' | 'optional';

/**
 * Get importance level of a permission
 */
export function getPermissionImportance(type: PermissionType): PermissionImportance {
  if (CRITICAL_PERMISSIONS.includes(type)) return 'critical';
  if (RECOMMENDED_PERMISSIONS.includes(type)) return 'recommended';
  return 'optional';
}

/**
 * Permission metadata for UI display
 */
export interface PermissionMetadata {
  /** Permission type */
  type: PermissionType;
  /** Display name */
  name: string;
  /** Icon emoji or name */
  icon: string;
  /** Short description */
  description: string;
  /** Detailed rationale for why permission is needed */
  rationale: string;
  /** Importance level */
  importance: PermissionImportance;
  /** Platform availability */
  platforms: ('ios' | 'android')[];
}

/**
 * Permission metadata registry
 */
export const PERMISSION_METADATA: Record<PermissionType, PermissionMetadata> = {
  notifications: {
    type: 'notifications',
    name: 'Notifications',
    icon: '📱',
    description: 'Get timely reminders',
    rationale: 'Notifications are essential for receiving meal, workout, and hydration reminders throughout the day. Without notifications, you may miss important health goals.',
    importance: 'critical',
    platforms: ['ios', 'android'],
  },
  overlay: {
    type: 'overlay',
    name: 'Floating Reminders',
    icon: '🪟',
    description: 'Show reminders over other apps',
    rationale: 'Floating reminders appear on top of other apps to ensure you never miss a health reminder, even when using other applications.',
    importance: 'recommended',
    platforms: ['android'],
  },
  camera: {
    type: 'camera',
    name: 'Camera',
    icon: '📷',
    description: 'Scan food for nutritional analysis',
    rationale: 'Camera access allows you to quickly scan food items and get instant nutritional information powered by AI.',
    importance: 'critical',
    platforms: ['ios', 'android'],
  },
  location: {
    type: 'location',
    name: 'Location',
    icon: '📍',
    description: 'Get weather-based recommendations',
    rationale: 'Location access enables weather-based health recommendations and local context for your daily plan.',
    importance: 'recommended',
    platforms: ['ios', 'android'],
  },
  backgroundLocation: {
    type: 'backgroundLocation',
    name: 'Background Location',
    icon: '🌙',
    description: 'Improve sleep detection accuracy',
    rationale: 'Body Mode needs to access your LOCATION in the BACKGROUND to determine if you are indoors or outdoors. This improves SLEEP DETECTION accuracy by distinguishing actual sleep from stationary periods outside. Location data is processed locally on your device and never uploaded to external servers.',
    importance: 'recommended',
    platforms: ['ios', 'android'],
  },
  batteryOptimization: {
    type: 'batteryOptimization',
    name: 'Background Activity',
    icon: '🔋',
    description: 'Reliable background reminders',
    rationale: 'Disabling battery optimization ensures reminders work reliably even when the app is in the background, preventing Android from killing the app to save battery.',
    importance: 'recommended',
    platforms: ['android'],
  },
  exactAlarm: {
    type: 'exactAlarm',
    name: 'Exact Alarms',
    icon: '⏰',
    description: 'Precise reminder timing',
    rationale: 'Exact alarm permission allows reminders to trigger at precisely the scheduled time, rather than being delayed by the system.',
    importance: 'optional',
    platforms: ['android'],
  },
  microphone: {
    type: 'microphone',
    name: 'Microphone',
    icon: '🎤',
    description: 'Record audio for video scanning',
    rationale: 'Microphone access allows you to capture video with audio when scanning food for nutritional analysis.',
    importance: 'recommended',
    platforms: ['ios', 'android'],
  },
  activityRecognition: {
    type: 'activityRecognition',
    name: 'Physical Activity',
    icon: '🏃',
    description: 'Detect activity for smart sleep detection',
    rationale: 'Activity recognition allows the app to detect when you are still or moving, enabling smarter automatic sleep detection.',
    importance: 'recommended',
    platforms: ['android'],
  },
  healthConnect: {
    type: 'healthConnect',
    name: 'Health Connect',
    icon: '❤️',
    description: 'Sync weight, sleep, and nutrition data',
    rationale: 'Health Connect allows Body Mode to read your health data from other apps (like Samsung Health, Google Fit, Oura) to provide personalized insights.',
    importance: 'recommended',
    platforms: ['android'],
  },
};
