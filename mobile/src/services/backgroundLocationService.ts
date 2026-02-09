import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { NativeModules, Platform, AppState } from 'react-native';
import storage from './storageService';
import { calculateDistance, type Coordinates } from './locationService';
import locationService from './locationService';
import i18n from '../i18n';
import type { ContextSnapshot, SignalSnapshot } from './contextTypes';
import { evaluateContext } from './contextEngine';
import { recordSnapshot as recordContextSnapshot } from './contextHistoryService';
import { recordSignalSnapshot } from './contextSignalHistoryService';
import { backgroundHealthService } from './backgroundHealthService';
import {
  recordFailure as recordSensorFailure,
  recordSuccess as recordSensorSuccess,
} from './contextReliabilityService';
import { ensureGeofence as ensureContextGeofence, stopGeofence as stopContextGeofence } from './contextGeofenceService';
import { getContextPolicy } from './contextPolicyService';

const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_UPDATES';
const DISTANCE_THRESHOLD_METERS = 150;
const LOCATION_DISTANCE_INTERVAL_METERS = 200;
const LOCATION_TIME_INTERVAL_MS = 15 * 60 * 1000;

const STORAGE_KEYS = {
  SAVED_LOCATIONS: '@saved_locations',
  LAST_KNOWN_LOCATION: '@last_known_location',
};

const { LocationBridge } = NativeModules;

let pendingStart = false;
let appStateSubscription: { remove: () => void } | null = null;

const isBackgroundContextEnabled = async (): Promise<boolean> => {
  const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
  const contextEnabled = prefs?.contextSensingEnabled !== false;
  const backgroundEnabled = await storage.get<boolean>('settings:backgroundLocation:enabled');
  return contextEnabled && backgroundEnabled === true;
};

const scheduleStartOnForeground = (): void => {
  if (pendingStart) return;
  pendingStart = true;
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!pendingStart) return;
      pendingStart = false;
      appStateSubscription?.remove();
      appStateSubscription = null;
      void backgroundLocationService.ensureRunning();
    });
  }
};

type SavedLocation = {
  lat: number;
  lng: number;
  label: string;
  customName?: string;
};

const resolveLocationLabel = (coords: Coordinates, saved: Record<string, SavedLocation>) => {
  let nearestLabel: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestType: string | null = null;

  for (const location of Object.values(saved)) {
    const distance = calculateDistance(coords, { lat: location.lat, lng: location.lng });
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestLabel = location.customName || location.label;
      nearestType = location.label;
    }
  }

  if (nearestLabel && nearestDistance <= DISTANCE_THRESHOLD_METERS) {
    return { label: nearestLabel, distance: nearestDistance, type: nearestType };
  }

  return null;
};

const syncContextToNative = async (snapshot: ContextSnapshot) => {
  if (Platform.OS !== 'android' || !LocationBridge?.syncContext) return;

  try {
    await LocationBridge.syncContext({
      state: snapshot.state,
      source: snapshot.source,
      activity: snapshot.activity,
      locationLabel: snapshot.locationLabel ?? 'unknown',
      atHome: snapshot.locationLabel === 'home',
      atWork: snapshot.locationLabel === 'work',
      atGym: snapshot.locationLabel === 'gym',
      outside: snapshot.locationLabel === 'outside',
      environment: snapshot.environment || 'unknown',
      indoorConfidence: snapshot.indoorConfidence ?? -1,
      outdoorConfidence: snapshot.outdoorConfidence ?? -1,
      locationAccuracy: snapshot.locationAccuracy ?? -1,
      locationSpeed: typeof snapshot.locationSpeed === 'number' ? snapshot.locationSpeed : -1,
      updatedAt: snapshot.updatedAt,
    });
  } catch (error) {
    console.warn('[BackgroundLocation] Failed to sync context:', error);
  }
};

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[BackgroundLocation] Task error:', error);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] })?.locations || [];
  if (!locations.length) return;

  const latest = locations[locations.length - 1];
  const coords: Coordinates = {
    lat: latest.coords.latitude,
    lng: latest.coords.longitude,
  };
  const speed = latest.coords.speed;
  const accuracy = latest.coords.accuracy;

  try {
    await storage.set(STORAGE_KEYS.LAST_KNOWN_LOCATION, coords);
    void recordSensorSuccess('gps');
    let activityInfo: Awaited<ReturnType<typeof backgroundHealthService.getCurrentUserActivity>> | null = null;
    if (backgroundHealthService.available()) {
      activityInfo = await backgroundHealthService.getCurrentUserActivity();
      if (activityInfo?.activity) {
        void recordSensorSuccess('activity');
      } else {
        void recordSensorFailure('activity');
      }
    }
    const saved = (await storage.get<Record<string, SavedLocation>>(STORAGE_KEYS.SAVED_LOCATIONS)) || {};
    const nearest = resolveLocationLabel(coords, saved);
    const label = nearest?.label || (coords ? 'outside' : null);
    const now = new Date();
    const previous = await storage.get<ContextSnapshot>(storage.keys.LAST_CONTEXT_SNAPSHOT);
    const sleepOverride = !!(await storage.get<boolean>('is_sleeping')) || !!(await storage.get<boolean>('sleep_ghost_mode'));

    const signals: SignalSnapshot = {
      collectedAt: Date.now(),
      gps: {
        coords,
        accuracy: typeof accuracy === 'number' ? accuracy : undefined,
        speed: typeof speed === 'number' ? speed : null,
        timestamp: typeof latest.timestamp === 'number' ? latest.timestamp : undefined,
      },
      activity: activityInfo?.activity
        ? {
          type: activityInfo.activity,
          timestamp: activityInfo.lastActiveTimestamp || activityInfo.lastStillTimestamp,
        }
        : undefined,
      device: activityInfo?.chargerConnected ? { isCharging: activityInfo.chargerConnected } : undefined,
      location: {
        isHome: nearest?.type === 'home',
        isWork: nearest?.type === 'work',
        isGym: nearest?.type === 'gym',
        nearestLabel: nearest?.label,
        nearestDistance: nearest?.distance,
      },
      temporal: {
        hour: now.getHours(),
        dayOfWeek: now.getDay(),
        isWeekend: now.getDay() === 0 || now.getDay() === 6,
      },
    };

    const { snapshot } = await evaluateContext({
      signals,
      previous,
      source: 'background_location',
      sleepOverride,
    });

    const finalSnapshot: ContextSnapshot = {
      ...snapshot,
      locationLabel: snapshot.locationLabel ?? label ?? undefined,
      locationCoords: coords,
      updatedAt: Date.now(),
    };

    const policy = await getContextPolicy();
    const storedSnapshot =
      policy.contextPrivacyMode === 'minimal'
        ? { ...finalSnapshot, locationCoords: undefined, locationAccuracy: undefined }
        : finalSnapshot;
    const storedSignals =
      policy.contextPrivacyMode === 'minimal'
        ? {
            ...signals,
            gps: signals.gps
              ? { accuracy: signals.gps.accuracy, speed: signals.gps.speed ?? null, timestamp: signals.gps.timestamp }
              : undefined,
            wifi: signals.wifi ? { connected: signals.wifi.connected, label: signals.wifi.label } : undefined,
          }
        : signals;
    await storage.set(storage.keys.LAST_CONTEXT_SNAPSHOT, storedSnapshot);
    void recordContextSnapshot(storedSnapshot);
    void recordSignalSnapshot(storedSignals, storedSnapshot);
    void ensureContextGeofence(coords);
    try {
      const STATIONARY = 'stationary' as ContextSnapshot['movementType'];
      if (!policy.contextLearningEnabled) {
        // Skip visit learning if disabled.
      } else if (finalSnapshot.movementType === STATIONARY) {
        const activity =
          finalSnapshot.locationLabel === 'home'
            ? 'home'
            : finalSnapshot.locationLabel === 'work'
              ? 'work'
              : finalSnapshot.locationLabel === 'gym'
                ? 'gym'
                : 'visiting';
        await locationService.recordArrival(coords, activity);
      } else if (previous?.movementType === STATIONARY && finalSnapshot.movementType !== STATIONARY) {
        await locationService.endCurrentVisit();
      }
    } catch (visitError) {
      console.warn('[BackgroundLocation] Failed to update visits:', visitError);
    }

    await syncContextToNative(finalSnapshot);
    try {
      const { invalidateLLMContextCache } = require('./llmContextService');
      invalidateLLMContextCache();
    } catch (error) {
      console.warn('[BackgroundLocation] Failed to invalidate LLM cache:', error);
    }
    try {
      const { planRefinementService } = require('./planRefinementService');
      if (planRefinementService?.recordContextChange) {
        planRefinementService.recordContextChange(
          previous?.state ?? finalSnapshot.state,
          finalSnapshot.state,
          {
            location: finalSnapshot.locationLabel,
            locationContext: finalSnapshot.locationContext,
          }
        );
      }
    } catch (error) {
      console.warn('[BackgroundLocation] Failed to record context change:', error);
    }
  } catch (taskError) {
    console.warn('[BackgroundLocation] Failed to process location update:', taskError);
    void recordSensorFailure('gps');
  }
});

export const backgroundLocationService = {
  async isRunning(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
      return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch (error) {
      console.warn('[BackgroundLocation] Failed to check running state:', error);
      return false;
    }
  },

  async ensureRunning(): Promise<boolean> {
    if (Platform.OS === 'web') return false;

    try {
      if (!(await isBackgroundContextEnabled())) {
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (running) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }
        await stopContextGeofence();
        return false;
      }

      if (AppState.currentState !== 'active') {
        scheduleStartOnForeground();
        return false;
      }

      const hasForeground = await Location.getForegroundPermissionsAsync();
      if (!hasForeground.granted) return false;

      const hasBackground = await Location.getBackgroundPermissionsAsync();
      if (!hasBackground.granted) return false;

      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isRunning) return true;

      const options: Location.LocationTaskOptions = {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: LOCATION_TIME_INTERVAL_MS,
        distanceInterval: LOCATION_DISTANCE_INTERVAL_METERS,
        showsBackgroundLocationIndicator: false,
        pausesUpdatesAutomatically: true,
      };

      if (Platform.OS === 'android') {
        options.foregroundService = {
          notificationTitle: i18n.t('background_location.notification_title'),
          notificationBody: i18n.t('background_location.notification_body'),
        };
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, options);

      return true;
    } catch (error) {
      console.warn('[BackgroundLocation] Failed to start updates:', error);
      // If the system rejected because we're in background, retry on foreground.
      scheduleStartOnForeground();
      return false;
    }
  },

  async stop(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      pendingStart = false;
      if (appStateSubscription) {
        appStateSubscription.remove();
        appStateSubscription = null;
      }
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
      await stopContextGeofence();
    } catch (error) {
      console.warn('[BackgroundLocation] Failed to stop updates:', error);
    }
  },
};

export default backgroundLocationService;
