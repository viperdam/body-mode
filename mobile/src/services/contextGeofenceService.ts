import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { NativeModules, Platform } from 'react-native';
import storage from './storageService';
import locationService, { calculateDistance, type Coordinates } from './locationService';
import type { ContextSnapshot, SignalSnapshot } from './contextTypes';
import { evaluateContext } from './contextEngine';
import { recordSnapshot as recordContextSnapshot } from './contextHistoryService';
import { recordSignalSnapshot } from './contextSignalHistoryService';
import { getContextPolicy } from './contextPolicyService';

const GEOFENCE_TASK = 'CONTEXT_GEOFENCE_EVENTS';
const GEOFENCE_ID = 'context_geofence';
const DEFAULT_RADIUS_METERS = 200;
const UPDATE_THRESHOLD_METERS = 120;

const { LocationBridge } = NativeModules;

type GeofenceState = {
  coords: Coordinates;
  radius: number;
  updatedAt: number;
};

const isBackgroundContextEnabled = async (): Promise<boolean> => {
  const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
  const contextEnabled = prefs?.contextSensingEnabled !== false;
  const backgroundEnabled = await storage.get<boolean>('settings:backgroundLocation:enabled');
  return contextEnabled && backgroundEnabled === true;
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
    console.warn('[ContextGeofence] Failed to sync context:', error);
  }
};

const buildSignalsForCoords = async (
  coords: Coordinates,
  fix?: { accuracy?: number; speed?: number | null; timestamp?: number }
): Promise<SignalSnapshot> => {
  const nearestSaved = await locationService.getNearestSavedLocation(coords);
  const nearestFrequent = await locationService.getNearestFrequentPlace(coords);
  const now = new Date();

  return {
    collectedAt: Date.now(),
    gps: {
      coords,
      accuracy: fix?.accuracy,
      speed: typeof fix?.speed === 'number' ? fix.speed : null,
      timestamp: fix?.timestamp,
    },
    location: {
      isHome: nearestSaved?.label === 'home',
      isWork: nearestSaved?.label === 'work',
      isGym: nearestSaved?.label === 'gym',
      nearestLabel: nearestSaved?.label ?? nearestFrequent?.label,
      nearestDistance: nearestSaved?.distance ?? nearestFrequent?.distance,
    },
    temporal: {
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
      isWeekend: now.getDay() === 0 || now.getDay() === 6,
    },
  };
};

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[ContextGeofence] Task error:', error);
    return;
  }

  const event = data as { eventType: Location.GeofencingEventType; region: Location.LocationRegion };
  if (!event?.region) return;

  try {
    const previous = await storage.get<ContextSnapshot>(storage.keys.LAST_CONTEXT_SNAPSHOT);
    const sleepOverride =
      !!(await storage.get<boolean>('is_sleeping')) ||
      !!(await storage.get<boolean>('sleep_ghost_mode'));

    let fix = null;
    try {
      fix = await locationService.getCurrentFix();
    } catch (err) {
      fix = null;
    }

    const coords: Coordinates = fix?.coords || {
      lat: event.region.latitude,
      lng: event.region.longitude,
    };

    const signals = await buildSignalsForCoords(coords, fix || undefined);
    const { snapshot } = await evaluateContext({
      signals,
      previous,
      source: 'background_location',
      sleepOverride,
    });

    const finalSnapshot: ContextSnapshot = {
      ...snapshot,
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
    await syncContextToNative(finalSnapshot);
    try {
      const { invalidateLLMContextCache } = require('./llmContextService');
      invalidateLLMContextCache();
    } catch (error) {
      console.warn('[ContextGeofence] Failed to invalidate LLM cache:', error);
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
      console.warn('[ContextGeofence] Failed to record context change:', error);
    }
  } catch (taskError) {
    console.warn('[ContextGeofence] Failed to handle event:', taskError);
  }
});

const getStoredGeofence = async (): Promise<GeofenceState | null> => {
  return await storage.get<GeofenceState>(storage.keys.CONTEXT_GEOFENCE);
};

const setStoredGeofence = async (state: GeofenceState): Promise<void> => {
  await storage.set(storage.keys.CONTEXT_GEOFENCE, state);
};

export const ensureGeofence = async (
  coords?: Coordinates | null,
  radius: number = DEFAULT_RADIUS_METERS
): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  if (!coords) return false;
  if (!(await isBackgroundContextEnabled())) return false;

  const stored = await getStoredGeofence();
  if (stored) {
    const distance = calculateDistance(coords, stored.coords);
    if (distance < UPDATE_THRESHOLD_METERS && stored.radius === radius) {
      return true;
    }
  }

  try {
    const hasPermission = await Location.getBackgroundPermissionsAsync();
    if (!hasPermission.granted) return false;

    await Location.startGeofencingAsync(GEOFENCE_TASK, [
      {
        identifier: GEOFENCE_ID,
        latitude: coords.lat,
        longitude: coords.lng,
        radius,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);

    await setStoredGeofence({ coords, radius, updatedAt: Date.now() });
    return true;
  } catch (error) {
    console.warn('[ContextGeofence] Failed to start geofence:', error);
    return false;
  }
};

export const stopGeofence = async (): Promise<void> => {
  try {
    const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
    if (isRunning) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  } catch (error) {
    console.warn('[ContextGeofence] Failed to stop geofence:', error);
  } finally {
    await storage.remove(storage.keys.CONTEXT_GEOFENCE);
  }
};

export default {
  ensureGeofence,
  stopGeofence,
};
