// Permission Manager - Central orchestrator for all permission operations
// Coordinates permission checks, requests, caching, and state management

import * as Camera from 'expo-camera';
import * as Location from 'expo-location';
import { Platform, AppState, AppStateStatus } from 'react-native';

import { OverlayBridge } from '../nativeBridge/OverlayBridge';
import { BackgroundBridge } from '../nativeBridge/BackgroundBridge';
import { NotificationBridge } from '../nativeBridge/NotificationBridge';
import backgroundLocationService from '../backgroundLocationService';
import i18n from '../../i18n';

import { globalPermissionMutex } from './PermissionMutex';
import { globalPermissionCache } from './PermissionCache';
import { usePermissionStore } from './PermissionStore';
import {
  locationPermissionMachine,
  type PermissionDisclosureType,
  type PermissionDecision,
  type PermissionState as LocationPermissionState,
} from './PermissionStateMachine';

// Import overlay services for sync chain
import * as overlayService from '../overlayService';
import { syncOverlaysWithCurrentPlan } from '../overlaySchedulerService';
import { healthConnectService } from '../healthConnectService';

import type {
  PermissionType,
  PermissionStatus,
  PermissionRequestResult,
  DEFAULT_PERMISSION_STATUS,
  CRITICAL_PERMISSIONS,
  RECOMMENDED_PERMISSIONS,
} from './types';
import { PermissionError, PermissionErrorType } from './types';

type PermissionEventName =
  | 'disclosure:foreground:show'
  | 'disclosure:foreground:hide'
  | 'disclosure:background:show'
  | 'disclosure:background:hide'
  | 'permission:foreground:granted'
  | 'permission:foreground:denied'
  | 'permission:background:granted'
  | 'permission:background:denied'
  | 'permission:blocked'
  | 'permission:error';

type PermissionEventPayload = {
  type?: 'foreground' | 'background';
  error?: string;
};

type PermissionEventListener = (payload?: PermissionEventPayload) => void;

type PendingDisclosure = {
  promise: Promise<boolean>;
  resolve: (value: boolean) => void;
};

class PermissionEventEmitter {
  private listeners = new Map<PermissionEventName, Set<PermissionEventListener>>();

  on(event: PermissionEventName, listener: PermissionEventListener): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return () => {
      set.delete(listener);
    };
  }

  emit(event: PermissionEventName, payload?: PermissionEventPayload): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach(listener => listener(payload));
  }
}

const permissionEvents = new PermissionEventEmitter();

/**
 * PermissionManager - Central orchestrator for permission management
 *
 * Architecture:
 * - Coordinates all permission operations
 * - Integrates with PermissionStore (state)
 * - Uses PermissionCache (performance)
 * - Uses PermissionMutex (race condition prevention)
 * - Calls native bridges (OverlayBridge, BackgroundBridge, NotificationBridge)
 *
 * Responsibilities:
 * - Check permissions (with caching)
 * - Request permissions (with retry logic)
 * - Update store state
 * - Handle errors gracefully
 * - Invalidate cache when needed
 */
export class PermissionManager {
  private disclosureRequests = new Map<PermissionDisclosureType, PendingDisclosure>();
  private locationCheckPromise: Promise<LocationPermissionState> | null = null;

  private async getLocationState(): Promise<LocationPermissionState> {
    if (!this.locationCheckPromise) {
      this.locationCheckPromise = locationPermissionMachine
        .checkPermissions()
        .finally(() => {
          this.locationCheckPromise = null;
        });
    }
    return this.locationCheckPromise;
  }

  private getDisclosurePromise(type: PermissionDisclosureType): Promise<boolean> {
    const existing = this.disclosureRequests.get(type);
    if (existing) return existing.promise;

    let resolve: (value: boolean) => void = () => { };
    const promise = new Promise<boolean>(res => {
      resolve = res;
    });

    this.disclosureRequests.set(type, { promise, resolve });

    permissionEvents.emit(
      type === 'foreground' ? 'disclosure:foreground:show' : 'disclosure:background:show',
      { type }
    );

    return promise;
  }

  resolveDisclosure(type: PermissionDisclosureType, result: boolean): void {
    const pending = this.disclosureRequests.get(type);
    if (!pending) return;

    pending.resolve(result);
    this.disclosureRequests.delete(type);

    permissionEvents.emit(
      type === 'foreground' ? 'disclosure:foreground:hide' : 'disclosure:background:hide',
      { type }
    );
  }

  notifyLocationDecision(type: PermissionDisclosureType, decision: PermissionDecision): void {
    globalPermissionCache.invalidate('location');
    globalPermissionCache.invalidate('backgroundLocation');

    if (decision === 'granted') {
      permissionEvents.emit(
        type === 'foreground' ? 'permission:foreground:granted' : 'permission:background:granted',
        { type }
      );
      return;
    }

    if (decision === 'blocked') {
      permissionEvents.emit('permission:blocked', { type });
      return;
    }

    if (decision === 'denied') {
      permissionEvents.emit(
        type === 'foreground' ? 'permission:foreground:denied' : 'permission:background:denied',
        { type }
      );
    }
  }

  /**
   * Subscribe to disclosure events (foreground/background).
   */
  onDisclosureNeeded(callback: (type: 'foreground' | 'background') => void): () => void {
    const unsubForeground = permissionEvents.on('disclosure:foreground:show', () => callback('foreground'));
    const unsubBackground = permissionEvents.on('disclosure:background:show', () => callback('background'));
    return () => {
      unsubForeground();
      unsubBackground();
    };
  }

  /**
   * Check if a permission is blocked (cannot ask again).
   */
  async isPermissionBlocked(type: PermissionType): Promise<boolean> {
    try {
      switch (type) {
        case 'location': {
          const status = await Location.getForegroundPermissionsAsync();
          return status.status === 'denied' && status.canAskAgain === false;
        }
        case 'backgroundLocation': {
          const status = await Location.getBackgroundPermissionsAsync();
          return status.status === 'denied' && status.canAskAgain === false;
        }
        case 'camera': {
          const status = await Camera.Camera.getCameraPermissionsAsync();
          return status.status === 'denied' && status.canAskAgain === false;
        }
        case 'microphone': {
          const status = await Camera.Camera.getMicrophonePermissionsAsync();
          return status.status === 'denied' && status.canAskAgain === false;
        }
        default:
          return false;
      }
    } catch (error) {
      console.warn('[PermissionManager] isPermissionBlocked failed:', error);
      return false;
    }
  }

  /**
   * Request foreground location with disclosure flow.
   * Emits a disclosure event when user action is needed.
   */
  async requestForegroundLocationWithDisclosure(): Promise<boolean> {
    const state = await this.getLocationState();
    if (state.foreground === 'granted') {
      permissionEvents.emit('permission:foreground:granted', { type: 'foreground' });
      return true;
    }
    if (state.foreground === 'blocked') {
      permissionEvents.emit('permission:blocked', { type: 'foreground' });
      return false;
    }
    return this.getDisclosurePromise('foreground');
  }

  /**
   * Request background location with disclosure flow.
   * Emits a disclosure event when user action is needed.
   */
  async requestBackgroundLocationWithDisclosure(): Promise<boolean> {
    const state = await this.getLocationState();
    if (state.foreground !== 'granted') {
      return false;
    }
    if (state.background === 'granted') {
      permissionEvents.emit('permission:background:granted', { type: 'background' });
      return true;
    }
    if (state.background === 'blocked') {
      permissionEvents.emit('permission:blocked', { type: 'background' });
      return false;
    }
    return this.getDisclosurePromise('background');
  }
  /**
   * Check status of a specific permission
   *
   * Flow:
   * 1. Check cache (if fresh, return cached)
   * 2. Acquire mutex (prevent concurrent checks)
   * 3. Call native module/API
   * 4. Update cache
   * 5. Update store
   * 6. Return status
   *
   * @param type - Permission type to check
   * @returns Permission status
   */
  async checkPermission(type: PermissionType): Promise<PermissionStatus> {
    // Check cache first
    const cached = globalPermissionCache.get(type);
    if (cached) {
      console.log(`[PermissionManager] Using cached status for ${type}`);
      return cached;
    }

    // Location permissions are coordinated by the state machine (which already uses the mutex).
    if (type === 'location' || type === 'backgroundLocation') {
      try {
        const state = await this.getLocationState();
        const granted = type === 'location'
          ? state.foreground === 'granted'
          : state.background === 'granted';

        const status: PermissionStatus = {
          granted,
          requesting: false,
          lastChecked: Date.now(),
          error: null,
        };

        globalPermissionCache.set(type, status);
        usePermissionStore.getState().updatePermissionStatus(type, status);

        return status;
      } catch (error) {
        console.error(`[PermissionManager] Failed to check ${type}:`, error);
        const errorMessage = error instanceof PermissionError
          ? error.message
          : i18n.t('errors.permissions.check_failed');
        permissionEvents.emit('permission:error', { error: errorMessage });

        const errorStatus: PermissionStatus = {
          granted: null,
          requesting: false,
          lastChecked: Date.now(),
          error: errorMessage,
        };

        usePermissionStore.getState().updatePermissionStatus(type, errorStatus);
        return errorStatus;
      }
    }

    // Acquire mutex to prevent concurrent checks
    return await globalPermissionMutex.acquire(async () => {
      try {
        let granted: boolean | null = null;

        // Check based on permission type
        switch (type) {
          case 'notifications':
            granted = await NotificationBridge.checkPermission();
            break;

          case 'overlay':
            if (Platform.OS === 'android') {
              // Use overlayService to benefit from caching + state sync
              granted = await overlayService.checkOverlayPermission();
            } else {
              granted = null; // Not applicable on iOS
            }
            break;

          case 'camera':
            const cameraStatus = await Camera.Camera.getCameraPermissionsAsync();
            granted = cameraStatus.granted;
            break;

          case 'batteryOptimization':
            if (Platform.OS === 'android') {
              granted = await BackgroundBridge.isIgnoringBatteryOptimizations();
            } else {
              granted = true; // iOS doesn't have battery optimization
            }
            break;

          case 'exactAlarm':
            if (Platform.OS === 'android') {
              const status = await BackgroundBridge.getBackgroundStatus();
              granted = status.exactAlarmPermissionGranted;
            } else {
              granted = true; // iOS doesn't have exact alarm permission
            }
            break;

          case 'microphone':
            const micStatus = await Camera.Camera.getMicrophonePermissionsAsync();
            granted = micStatus.granted;
            break;

          case 'activityRecognition':
            if (Platform.OS === 'android') {
              try {
                const { NativeModules } = require('react-native');
                const { SleepBridge } = NativeModules;
                if (SleepBridge?.checkActivityRecognitionPermission) {
                  granted = await SleepBridge.checkActivityRecognitionPermission();
                } else {
                  granted = true; // Assume granted if module not available
                }
              } catch (e) {
                console.warn('[PermissionManager] activityRecognition check failed:', e);
                granted = null;
              }
            } else {
              granted = true; // iOS uses CMMotionActivityManager, different flow
            }
            break;

          case 'healthConnect':
            if (Platform.OS === 'android') {
              granted = await healthConnectService.hasAnyPermission();
            } else {
              granted = null;
            }
            break;

          default:
            console.warn(`[PermissionManager] Unknown permission type: ${type}`);
            granted = null;
        }

        // Create permission status object
        const status: PermissionStatus = {
          granted,
          requesting: false,
          lastChecked: Date.now(),
          error: null,
        };

        // Update cache
        globalPermissionCache.set(type, status);

        // Update store
        usePermissionStore.getState().updatePermissionStatus(type, status);

        return status;
      } catch (error) {
        console.error(`[PermissionManager] Failed to check ${type}:`, error);
        const errorMessage = error instanceof PermissionError
          ? error.message
          : i18n.t('errors.permissions.check_failed');
        permissionEvents.emit('permission:error', { error: errorMessage });

        const errorStatus: PermissionStatus = {
          granted: null,
          requesting: false,
          lastChecked: Date.now(),
          error: errorMessage,
        };

        // Update store with error
        usePermissionStore.getState().updatePermissionStatus(type, errorStatus);

        return errorStatus;
      }
    });
  }

  /**
   * Check all permissions
   *
   * Runs individual checks via `checkPermission` (which already serializes via mutex).
   * Avoids acquiring the mutex here to prevent self-deadlock.
   */
  async checkAllPermissions(): Promise<void> {
    try {
      const permissionTypes: PermissionType[] = [
        'notifications',
        'overlay',
        'camera',
        'location',
        'backgroundLocation',
        'batteryOptimization',
        'exactAlarm',
        'microphone',
        'activityRecognition',
      ];
      if (Platform.OS === 'android') {
        permissionTypes.push('healthConnect');
      }

      // `checkPermission` handles mutex + caching.
      // Use allSettled so one failure doesn't block the rest.
      await Promise.allSettled(permissionTypes.map(type => this.checkPermission(type)));

      usePermissionStore.setState({
        lastCheckTimestamp: Date.now(),
      });
    } catch (error) {
      console.error('[PermissionManager] Failed to check all permissions:', error);
    }
  }

  /**
   * Request a specific permission
   *
   * Flow:
   * 1. Check if already granted (return early)
   * 2. Check if request already pending (prevent duplicate)
   * 3. Mark as requesting in store
   * 4. Call native module/API to request
   * 5. Re-check status after request
   * 6. Update store
   * 7. Return grant status
   *
   * @param type - Permission type to request
   * @returns True if granted, false if denied
   */
  async requestPermission(type: PermissionType): Promise<boolean> {
    const store = usePermissionStore.getState();

    // Check if already granted
    const currentStatus = store.permissions[type];
    if (currentStatus.granted === true) {
      console.log(`[PermissionManager] ${type} already granted`);
      return true;
    }

    // Check if request already pending
    if (store.pendingRequests.has(type)) {
      console.warn(`[PermissionManager] Request for ${type} already pending`);
      throw new PermissionError(
        PermissionErrorType.REQUEST_IN_PROGRESS,
        i18n.t('errors.permissions.request_in_progress', { permission: type })
      );
    }

    // Mark as pending and requesting
    store.addPendingRequest(type);
    store.updatePermissionStatus(type, { requesting: true });

    try {
      let granted = false;
      let blocked: boolean | null = null;

      // Request based on permission type
      switch (type) {
        case 'notifications':
          granted = await NotificationBridge.requestPermission();
          break;

        case 'overlay':
          if (Platform.OS === 'android') {
            // This opens settings, doesn't return grant status
            await OverlayBridge.requestPermissionWithFallback();
            // Mark as awaiting - DON'T set granted=false as that will show wrong UI
            // The actual status will be checked when user returns from settings
            // Keep requesting=true to indicate we're waiting for user action
            store.updatePermissionStatus(type, {
              requesting: true, // Keep requesting state to show loading
              error: null,
            });
            // Return early - don't update granted status yet
            // Start polling to detect when permission is granted (more reliable than AppState)
            store.removePendingRequest(type);
            startPermissionPolling('overlay');
            return false;
          }
          break;

        case 'camera':
          const cameraResult = await Camera.Camera.requestCameraPermissionsAsync();
          granted = cameraResult.granted;
          break;

        case 'location':
          // Only request FOREGROUND location permission
          // Background location must be requested separately via 'backgroundLocation'
          granted = await locationPermissionMachine.requestForeground();
          blocked = locationPermissionMachine.getState().foreground === 'blocked';
          break;

        case 'backgroundLocation':
          // IMPORTANT: Background location requires foreground to be granted first
          // This should be called AFTER showing BackgroundLocationDisclosure
          try {
            granted = await locationPermissionMachine.requestBackground();
            blocked = locationPermissionMachine.getState().background === 'blocked';
            if (granted) {
              await backgroundLocationService.ensureRunning();
              console.log('[PermissionManager] Background location granted, service started');
            }
          } catch (bgError) {
            console.warn('[PermissionManager] Background location request failed:', bgError);
            granted = false;
          }
          break;

        case 'batteryOptimization':
          if (Platform.OS === 'android') {
            // Check if already exempted BEFORE opening dialog
            const alreadyExempted = await BackgroundBridge.isIgnoringBatteryOptimizations();
            if (alreadyExempted) {
              granted = true;
            } else {
              // This opens settings dialog
              await BackgroundBridge.requestBatteryOptimizationExemption();
              // Mark as awaiting - DON'T set granted=false
              store.updatePermissionStatus(type, {
                requesting: true,
                error: null,
              });
              store.removePendingRequest(type);
              startPermissionPolling('batteryOptimization');
              return false;
            }
          } else {
            granted = true;
          }
          break;

        case 'exactAlarm':
          if (Platform.OS === 'android') {
            await BackgroundBridge.requestExactAlarmPermission();
            // Check status after request
            const status = await BackgroundBridge.getBackgroundStatus();
            granted = status.exactAlarmPermissionGranted;
          } else {
            granted = true;
          }
          break;

        case 'microphone':
          const micResult = await Camera.Camera.requestMicrophonePermissionsAsync();
          granted = micResult.granted;
          break;

        case 'activityRecognition':
          if (Platform.OS === 'android') {
            try {
              const { NativeModules } = require('react-native');
              const { SleepBridge } = NativeModules;
              if (SleepBridge?.requestActivityRecognitionPermission) {
                granted = await SleepBridge.requestActivityRecognitionPermission();
              } else {
                granted = true; // Assume granted if module not available
              }
            } catch (e) {
              console.warn('[PermissionManager] activityRecognition request failed:', e);
              granted = false;
            }
          } else {
            granted = true; // iOS uses different flow
          }
          break;

        case 'healthConnect':
          if (Platform.OS === 'android') {
            // Initialize if needed
            if (!healthConnectService.isInitialized()) {
              await healthConnectService.initialize();
            }
            granted = await healthConnectService.requestPermissions();
          } else {
            granted = false;
          }
          break;

        default:
          throw new PermissionError(
            PermissionErrorType.MODULE_METHOD_NOT_FOUND,
            i18n.t('errors.permissions.unknown_type', { permission: type })
          );
      }

      // Update status in store
      store.updatePermissionStatus(type, {
        granted,
        requesting: false,
        error: null,
      });

      // Invalidate cache
      globalPermissionCache.invalidate(type);

      if (type === 'location') {
        if (granted) {
          permissionEvents.emit('permission:foreground:granted', { type: 'foreground' });
        } else if (blocked) {
          permissionEvents.emit('permission:blocked', { type: 'foreground' });
        } else {
          permissionEvents.emit('permission:foreground:denied', { type: 'foreground' });
        }
      }

      if (type === 'backgroundLocation') {
        if (granted) {
          permissionEvents.emit('permission:background:granted', { type: 'background' });
        } else if (blocked) {
          permissionEvents.emit('permission:blocked', { type: 'background' });
        } else {
          permissionEvents.emit('permission:background:denied', { type: 'background' });
        }
      }

      return granted;
    } catch (error) {
      console.error(`[PermissionManager] Failed to request ${type}:`, error);
      const errorMessage = error instanceof PermissionError
        ? error.message
        : i18n.t('errors.permissions.request_failed');
      permissionEvents.emit('permission:error', { error: errorMessage });

      // Update store with error
      store.updatePermissionStatus(type, {
        requesting: false,
        error: errorMessage,
      });

      throw error;
    } finally {
      // Always remove from pending
      store.removePendingRequest(type);
    }
  }

  /**
   * Request all critical permissions
   *
   * Requests permissions sequentially to avoid overwhelming the user
   *
   * @returns Object with results for each permission
   */
  async requestAllPermissions(): Promise<PermissionRequestResult> {
    const critical: PermissionType[] = ['notifications', 'camera'];
    const recommended: PermissionType[] = ['location', 'batteryOptimization', 'overlay'];

    const results: Record<PermissionType, boolean> = {} as Record<PermissionType, boolean>;
    const failed: PermissionType[] = [];

    // Request critical permissions first
    for (const type of critical) {
      try {
        const granted = await this.requestPermission(type);
        results[type] = granted;
        if (!granted) {
          failed.push(type);
        }
      } catch (error) {
        console.error(`[PermissionManager] Failed to request ${type}:`, error);
        results[type] = false;
        failed.push(type);
      }
    }

    // Request recommended permissions
    for (const type of recommended) {
      try {
        const granted = await this.requestPermission(type);
        results[type] = granted;
        if (!granted) {
          failed.push(type);
        }
      } catch (error) {
        console.error(`[PermissionManager] Failed to request ${type}:`, error);
        results[type] = false;
        failed.push(type);
      }
    }

    const allGranted = failed.length === 0;

    return {
      allGranted,
      results,
      failed,
    };
  }

  /**
   * Initialize OEM information
   *
   * Detects device manufacturer and aggressive battery management
   */
  async initializeOEMInfo(): Promise<void> {
    if (Platform.OS !== 'android') {
      usePermissionStore.getState().updateOEMInfo({
        manufacturer: 'apple',
        hasAggressiveBattery: false,
      });
      return;
    }

    try {
      const manufacturer = await BackgroundBridge.getDeviceManufacturer();
      const hasAggressiveBattery = await BackgroundBridge.hasAggressiveBatteryManagement();

      usePermissionStore.getState().updateOEMInfo({
        manufacturer,
        hasAggressiveBattery,
      });

      console.log(`[PermissionManager] OEM: ${manufacturer}, Aggressive: ${hasAggressiveBattery}`);
    } catch (error) {
      console.error('[PermissionManager] Failed to initialize OEM info:', error);
    }
  }

  /**
   * Invalidate all caches
   *
   * Call this when user returns from settings
   */
  invalidateCache(): void {
    globalPermissionCache.invalidate();
  }

  /**
   * Initialize permission manager
   *
   * Call this on app startup
   * Has timeout protection to prevent infinite hangs
   */
  async initialize(): Promise<void> {
    console.log('[PermissionManager] Initializing...');

    // Wrap in timeout to prevent infinite hang if native modules are missing
    const TIMEOUT_MS = 5000;

    try {
      await Promise.race([
        this._doInitialize(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(i18n.t('errors.permissions.init_timeout'))), TIMEOUT_MS)
        ),
      ]);
      console.log('[PermissionManager] Initialized successfully');
    } catch (error) {
      console.warn('[PermissionManager] Initialization failed or timed out:', error);
      // Don't throw - allow app to continue without full permission state
      // Permissions will be checked on-demand when needed
    }
  }

  /**
   * Internal initialization logic
   */
  private async _doInitialize(): Promise<void> {
    // Initialize OEM info (non-critical, can fail silently)
    try {
      await this.initializeOEMInfo();
    } catch (error) {
      console.warn('[PermissionManager] OEM info failed:', error);
    }

    // Check critical permissions only
    // Skip permissions that require missing native modules
    try {
      // Only check permissions that are likely to work
      const safePermissions: PermissionType[] = ['notifications', 'camera', 'location'];

      // Add Android-specific permissions only if bridges exist
      if (Platform.OS === 'android') {
        safePermissions.push('overlay');
        safePermissions.push('healthConnect');

        // Initialize Health Connect
        healthConnectService.initialize().catch(e => {
          console.warn('[PermissionManager] Health Connect init warning:', e);
        });
      }

      await Promise.allSettled(
        safePermissions.map(type => this.checkPermission(type))
      );

      usePermissionStore.setState({
        lastCheckTimestamp: Date.now(),
      });
    } catch (error) {
      console.warn('[PermissionManager] Permission check failed:', error);
    }
  }
}

/**
 * Global permission manager instance
 */
export const permissionManager = new PermissionManager();

let permissionManagerInitPromise: Promise<void> | null = null;

// Track the last app state to detect coming back from settings
let lastAppState: AppStateStatus = 'active';
let appStateSubscription: { remove: () => void } | null = null;
let lastPermissionCheckTime = 0;
const PERMISSION_CHECK_DEBOUNCE_MS = 2000; // 2 second debounce

// ===== POLLING MECHANISM =====
// Polling is more reliable than AppState events on Android
let overlayPollingTimer: ReturnType<typeof setInterval> | null = null;
let batteryPollingTimer: ReturnType<typeof setInterval> | null = null;
const POLLING_INTERVAL_MS = 1000; // Check every 1 second
const POLLING_TIMEOUT_MS = 60000; // Stop after 60 seconds

/**
 * Stop polling for a specific permission type
 */
function stopPermissionPolling(type: 'overlay' | 'batteryOptimization'): void {
  if (type === 'overlay' && overlayPollingTimer) {
    clearInterval(overlayPollingTimer);
    overlayPollingTimer = null;
    console.log('[PermissionManager] Stopped overlay polling');
  } else if (type === 'batteryOptimization' && batteryPollingTimer) {
    clearInterval(batteryPollingTimer);
    batteryPollingTimer = null;
    console.log('[PermissionManager] Stopped battery polling');
  }
}

/**
 * Start polling for a specific permission type
 * This is called when user is sent to Settings to grant permission
 * Polls every 1 second to check if permission was granted
 */
function startPermissionPolling(type: 'overlay' | 'batteryOptimization'): void {
  // Prevent duplicate polling timers (Zombie Timer Fix)
  if (type === 'overlay' && overlayPollingTimer !== null) {
    console.log('[PermissionManager] Overlay polling already active, skipping start');
    return;
  }
  if (type === 'batteryOptimization' && batteryPollingTimer !== null) {
    console.log('[PermissionManager] Battery polling already active, skipping start');
    return;
  }

  // Stop any existing polling first
  stopPermissionPolling(type);

  const startTime = Date.now();
  console.log(`[PermissionManager] Starting ${type} polling`);

  const pollFn = async () => {
    try {
      const store = usePermissionStore.getState();
      const elapsed = Date.now() - startTime;

      // Stop if no longer requesting
      if (!store.permissions[type]?.requesting) {
        console.log(`[PermissionManager] ${type} no longer requesting, stopping poll`);
        stopPermissionPolling(type);
        return;
      }

      // Stop on timeout
      if (elapsed > POLLING_TIMEOUT_MS) {
        console.log(`[PermissionManager] ${type} polling timeout, clearing requesting state`);
        stopPermissionPolling(type);
        store.updatePermissionStatus(type, { requesting: false });
        return;
      }

      // Check actual permission status from native
      let granted = false;
      if (type === 'overlay') {
        // Use overlayService cache to avoid spamming native calls
        granted = await overlayService.checkOverlayPermission();
      } else {
        granted = await BackgroundBridge.isIgnoringBatteryOptimizations();
      }

      console.log(`[PermissionManager] Poll ${type}: granted=${granted}, elapsed=${elapsed}ms`);

      if (granted) {
        console.log(`[PermissionManager] ${type} permission granted! Updating store.`);
        stopPermissionPolling(type);
        store.updatePermissionStatus(type, {
          granted: true,
          requesting: false,
          lastChecked: Date.now(),
          error: null,
        });

        // If overlay was granted, run the sync chain
        if (type === 'overlay') {
          try {
            await overlayService.enableOverlays();
            await overlayService.syncSettingsToNative();
            await syncOverlaysWithCurrentPlan();
            console.log('[PermissionManager] Overlay sync chain completed via polling');
          } catch (syncError) {
            console.warn('[PermissionManager] Overlay sync chain error:', syncError);
          }
        }
      }
    } catch (error) {
      console.warn(`[PermissionManager] Poll error for ${type}:`, error);
    }
  };

  // Start the interval
  if (type === 'overlay') {
    overlayPollingTimer = setInterval(pollFn, POLLING_INTERVAL_MS);
    // Also run immediately
    pollFn();
  } else {
    batteryPollingTimer = setInterval(pollFn, POLLING_INTERVAL_MS);
    pollFn();
  }
}

/**
 * Setup AppState listener to re-check permissions when returning from settings
 */
const setupAppStateListener = (): (() => void) => {
  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    console.log(`[PermissionManager] AppState changed: ${lastAppState} -> ${nextAppState}`);

    // Check if any permission has requesting=true (user went to Settings and hasn't returned yet)
    const store = usePermissionStore.getState();
    const hasPendingRequesting =
      store.permissions.overlay?.requesting === true ||
      store.permissions.batteryOptimization?.requesting === true;

    // Only run the check if:
    // 1. App is becoming active AND
    // 2. Either: coming from non-active state, OR a permission has requesting=true (stuck)
    const shouldCheck = nextAppState === 'active' &&
      (lastAppState !== 'active' || hasPendingRequesting);

    // Debounce to prevent excessive checks (at least 2 seconds between checks)
    const now = Date.now();
    const timeSinceLastCheck = now - lastPermissionCheckTime;
    const isDebounced = timeSinceLastCheck < PERMISSION_CHECK_DEBOUNCE_MS;

    // CRITICAL FIX: Even if debounced, ALWAYS clear requesting states if they're stuck
    // This prevents spinner from being stuck forever when debounce kicks in
    if (nextAppState === 'active' && hasPendingRequesting && isDebounced) {
      console.log('[PermissionManager] Debounced but has pending requests - clearing stuck states');
      store.updatePermissionStatus('overlay', { requesting: false });
      store.updatePermissionStatus('batteryOptimization', { requesting: false });
    }

    if (shouldCheck && !isDebounced) {
      console.log('[PermissionManager] App came to foreground, refreshing permissions...');
      lastPermissionCheckTime = now;

      // Invalidate cache to force fresh check
      globalPermissionCache.invalidate();

      // Re-check permissions that require settings navigation
      try {
        // Delay to ensure Android settings have been applied
        await new Promise(resolve => setTimeout(resolve, 500));

        if (Platform.OS === 'android') {
          // Check BOTH overlay and battery optimization (both require settings)
          const [overlayStatus, batteryStatus] = await Promise.all([
            permissionManager.checkPermission('overlay'),
            permissionManager.checkPermission('batteryOptimization'),
          ]);

          console.log('[PermissionManager] After settings return - Overlay:', overlayStatus.granted, 'Battery:', batteryStatus.granted);

          // Clear requesting state for both permissions
          // This is critical for UI to update from "loading" to "granted/denied"
          const store = usePermissionStore.getState();

          // DEBUG: Log current state before update
          console.log('[PermissionManager] BEFORE update - overlay.requesting:', store.permissions.overlay?.requesting, 'battery.requesting:', store.permissions.batteryOptimization?.requesting);

          store.updatePermissionStatus('overlay', {
            granted: overlayStatus.granted,
            requesting: false, // Clear the requesting state
            lastChecked: Date.now(),
            error: null,
          });
          console.log('[PermissionManager] >>> Set overlay.requesting = FALSE');

          store.updatePermissionStatus('batteryOptimization', {
            granted: batteryStatus.granted,
            requesting: false, // Clear the requesting state
            lastChecked: Date.now(),
            error: null,
          });
          console.log('[PermissionManager] >>> Set battery.requesting = FALSE');

          // DEBUG: Log state after update
          const afterStore = usePermissionStore.getState();
          console.log('[PermissionManager] AFTER update - overlay.requesting:', afterStore.permissions.overlay?.requesting, 'battery.requesting:', afterStore.permissions.batteryOptimization?.requesting);

          // If overlay is now granted, run the complete sync chain
          if (overlayStatus.granted === true) {
            console.log('[PermissionManager] Overlay permission granted! Running sync chain...');

            try {
              // 1. Auto-enable overlay settings
              const enabled = await overlayService.enableOverlays();
              console.log('[PermissionManager] Overlays enabled:', enabled);

              // 2. Sync settings to native SharedPreferences
              await overlayService.syncSettingsToNative();
              console.log('[PermissionManager] Settings synced to native');

              // 3. Schedule overlays for today's plan
              const result = await syncOverlaysWithCurrentPlan();
              console.log(`[PermissionManager] Scheduled ${result.scheduled} overlays`);
            } catch (syncError) {
              console.warn('[PermissionManager] Overlay sync chain error:', syncError);
            }
          }
        }

        // Force a timestamp update to trigger any subscribers
        usePermissionStore.setState({
          lastCheckTimestamp: Date.now(),
        });
      } catch (error) {
        console.warn('[PermissionManager] Failed to refresh permissions:', error);
        // Even on error, clear requesting states to avoid stuck UI
        const store = usePermissionStore.getState();
        store.updatePermissionStatus('overlay', { requesting: false });
        store.updatePermissionStatus('batteryOptimization', { requesting: false });
      }
    }
    lastAppState = nextAppState;
  };

  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

  return () => {
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
  };
};

/**
 * Initialize permission manager and bind to store
 * Call this early in app lifecycle (e.g., App.tsx)
 */
export const initializePermissionManager = async (): Promise<void> => {
  if (permissionManagerInitPromise) {
    return permissionManagerInitPromise;
  }

  permissionManagerInitPromise = (async () => {
    // Bind manager methods to store
    usePermissionStore.setState({
      checkPermission: (type: PermissionType) => permissionManager.checkPermission(type),
      checkAllPermissions: () => permissionManager.checkAllPermissions(),
      requestPermission: (type: PermissionType) => permissionManager.requestPermission(type),
      requestAllPermissions: () => permissionManager.requestAllPermissions(),
    });

    // Setup AppState listener to detect return from settings
    const cleanupAppState = setupAppStateListener();

    // Initialize
    await permissionManager.initialize();

    // Start background location updates if permissions already granted.
    try {
      await backgroundLocationService.ensureRunning();
    } catch (error) {
      console.warn('[PermissionManager] Background location init failed:', error);
    }

    // Store cleanup in case it's needed
    (permissionManager as any)._cleanup = cleanupAppState;
  })()
    .catch((error) => {
      console.warn('[PermissionManager] Init failed:', error);
      permissionManagerInitPromise = null;
    });

  return permissionManagerInitPromise;
};
