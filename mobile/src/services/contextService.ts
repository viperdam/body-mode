// Context Service for React Native: activity recognition + location context
import { Accelerometer, AccelerometerMeasurement } from 'expo-sensors';
import { NativeModules, Platform, AppState } from 'react-native';
import * as Battery from 'expo-battery';
import storage from './storageService';
import { backgroundHealthService } from './backgroundHealthService';
import locationService, { LocationContext, type Coordinates } from './locationService';
import sleepSessionService from './sleepSessionService';
import { environmentService } from './environmentService';
import type { ContextSnapshot, ContextSource, SignalSnapshot } from './contextTypes';
import { evaluateContext } from './contextEngine';
import { recordSnapshot as recordContextSnapshot } from './contextHistoryService';
import { recordSignalSnapshot } from './contextSignalHistoryService';
import { ensureGeofence as ensureContextGeofence } from './contextGeofenceService';
import {
    recordFailure as recordSensorFailure,
    recordSuccess as recordSensorSuccess,
    shouldUseSensor,
} from './contextReliabilityService';
import wifiService from './wifiService';
import { wifiLearningService } from './wifiLearningService';
import { getContextPolicy } from './contextPolicyService';

const MAX_MEASUREMENTS = 50;
const UPDATE_INTERVAL_MS = 250;
const STALE_REFRESH_MS = 5 * 60_000;
const WIFI_MONITOR_INTERVAL_MS = 30_000;

let subscription: { remove: () => void } | null = null;
let lastMeasurements: AccelerometerMeasurement[] = [];
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastSnapshot: ContextSnapshot | null = null;
let pendingSnapshot: ContextSnapshot | null = null;
let pendingSince = 0;
let pendingCount = 0;
let pollInFlight = false;
let environmentEnabled = true;
let networkEnabled = true;
let environmentUnsubscribe: (() => void) | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let lastEventPollAt = 0;
let wifiMonitorTimer: ReturnType<typeof setInterval> | null = null;
let lastWifiSignature: string | null = null;
let lastOnSnapshot: ((snapshot: ContextSnapshot) => void) | null = null;
let lastVisitUpdateAt = 0;

const { LocationBridge } = NativeModules;

const syncContextToNative = async (snapshot: ContextSnapshot) => {
    if (Platform.OS !== 'android' || !LocationBridge?.syncContext) return;

    try {
        const locationLabel = snapshot.locationLabel ?? 'unknown';
        const outdoorConfidence =
            typeof snapshot.outdoorConfidence === 'number' ? snapshot.outdoorConfidence : -1;
        const isLikelyOutdoor =
            snapshot.environment === 'outdoor' ||
            (outdoorConfidence >= 0.65 && snapshot.environment !== 'indoor');
        await LocationBridge.syncContext({
            state: snapshot.state,
            source: snapshot.source,
            activity: snapshot.activity,
            locationLabel,
            atHome: locationLabel === 'home',
            atWork: locationLabel === 'work',
            atGym: locationLabel === 'gym',
            // Use environment confidence, not raw label fallback, to avoid false "outside".
            outside: isLikelyOutdoor,
            environment: snapshot.environment || 'unknown',
            indoorConfidence: snapshot.indoorConfidence ?? -1,
            outdoorConfidence,
            locationAccuracy: snapshot.locationAccuracy ?? -1,
            locationSpeed: typeof snapshot.locationSpeed === 'number' ? snapshot.locationSpeed : -1,
            updatedAt: snapshot.updatedAt,
        });
    } catch (error) {
        console.warn('[ContextService] Failed to sync context to native:', error);
    }
};

const computeMotionStats = (
    measurements: AccelerometerMeasurement[]
): { variance: number; magnitude: number } | null => {
    if (measurements.length < 5) return null;
    const magnitudes = measurements.map(m => Math.sqrt(m.x * m.x + m.y * m.y + m.z * m.z));
    const avgMagnitude = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const variance =
        magnitudes.reduce((sum, m) => sum + Math.pow(m - avgMagnitude, 2), 0) / magnitudes.length;
    return { variance, magnitude: magnitudes[magnitudes.length - 1] };
};

const getSleepOverride = async (): Promise<boolean> => {
    const [isSleeping, isGhost, isSession] = await Promise.all([
        storage.get<boolean>('is_sleeping'),
        storage.get<boolean>('sleep_ghost_mode'),
        sleepSessionService.isSessionActive(),
    ]);
    return !!(isSleeping || isGhost || isSession);
};

const buildLocationContextFromCoords = async (coords: Coordinates): Promise<LocationContext> => {
    const [nearestSaved, nearestFrequent, visits, frequentPlaces] = await Promise.all([
        locationService.getNearestSavedLocation(coords),
        locationService.getNearestFrequentPlace(coords),
        locationService.getRecentVisits(5),
        locationService.getFrequentPlaces(),
    ]);

    const context: LocationContext = {
        currentLocation: coords,
        lastVisits: visits,
        frequentPlaces,
    };

    if (nearestSaved) {
        context.nearestSavedLocation = nearestSaved;
        context.currentActivity = nearestSaved.label;
        if (nearestSaved.label === 'home') context.isHome = true;
        if (nearestSaved.label === 'work') context.isWork = true;
        if (nearestSaved.label === 'gym') context.isGym = true;
    } else if (nearestFrequent) {
        context.nearestFrequentPlace = nearestFrequent;
    }

    return context;
};

const getDeviceSignals = async (
    chargerConnected?: boolean
): Promise<SignalSnapshot['device']> => {
    if (backgroundHealthService.available()) {
        const status = await backgroundHealthService.getHealthStatus();
        if (status) {
            return {
                batteryLevel:
                    typeof status.batteryLevel === 'number'
                        ? Math.max(0, Math.min(1, status.batteryLevel / 100))
                        : undefined,
                isCharging: status.isCharging ?? chargerConnected,
                isPowerSaveMode: status.isPowerSaveMode,
            };
        }
    }

    try {
        const [level, state] = await Promise.all([
            Battery.getBatteryLevelAsync(),
            Battery.getBatteryStateAsync(),
        ]);
        return {
            batteryLevel: typeof level === 'number' ? level : undefined,
            isCharging:
                state === Battery.BatteryState.CHARGING ||
                state === Battery.BatteryState.FULL ||
                chargerConnected,
            isPowerSaveMode: undefined,
        };
    } catch (error) {
        return {
            isCharging: chargerConnected,
        };
    }
};

const buildSnapshot = async (): Promise<{
    snapshot: ContextSnapshot;
    nextPollMs: number;
    signals: SignalSnapshot;
}> => {
    let source: ContextSource = 'fallback';
    let activityName: string | undefined;
    let chargerConnected: boolean | undefined;

    const activityInfo = await backgroundHealthService.getCurrentUserActivity();
    if (activityInfo?.activity) {
        activityName = activityInfo.activity;
        chargerConnected = activityInfo.chargerConnected;
        source = 'activity_recognition';
        void recordSensorSuccess('activity');
    } else if (backgroundHealthService.available()) {
        void recordSensorFailure('activity');
    }

    const motionStats = computeMotionStats(lastMeasurements);
    if (motionStats) {
        source = source === 'activity_recognition' ? 'mixed' : 'accelerometer';
        void recordSensorSuccess('motion');
    } else {
        void recordSensorFailure('motion');
    }

    let locationContext: LocationContext | undefined;
    try {
        const hasPermission = await locationService.hasPermission();
        if (hasPermission) {
            const canUseGps = await shouldUseSensor('gps');
            if (canUseGps) {
                locationContext = await locationService.getCurrentContext();
                void recordSensorSuccess('gps');
            } else {
                const cached = await locationService.getLastKnownLocation();
                if (cached) {
                    locationContext = await buildLocationContextFromCoords(cached);
                }
            }
        }
    } catch (error) {
        console.warn('[ContextService] Location context failed:', error);
        void recordSensorFailure('gps');
    }

    let environmentSignals = environmentEnabled ? environmentService.getSignals() : undefined;
    if (environmentEnabled) {
        const canUseEnvironment = await shouldUseSensor('environment');
        if (!canUseEnvironment) {
            environmentSignals = undefined;
        } else if (environmentSignals?.updatedAt) {
            void recordSensorSuccess('environment');
        } else {
            void recordSensorFailure('environment');
        }
    }
    if (!networkEnabled && environmentSignals) {
        environmentSignals = {
            ...environmentSignals,
            networkType: undefined,
        };
    }

    const policy = await getContextPolicy();
    let wifiEntry: Awaited<ReturnType<typeof wifiLearningService.getWifiLabel>> | null = null;
    let wifiInfo = null;
    if (networkEnabled) {
        try {
            const canUseWifi = await shouldUseSensor('wifi');
            if (canUseWifi) {
                wifiInfo = await wifiService.getConnectionInfo();
                if (wifiInfo) {
                    if (policy.contextLearningEnabled) {
                        wifiEntry = await wifiLearningService.updateConnection(wifiInfo);
                    } else {
                        wifiEntry = await wifiLearningService.getWifiLabel(wifiInfo.bssid || undefined);
                    }
                    void recordSensorSuccess('wifi');
                }
            }
        } catch (error) {
            console.warn('[ContextService] WiFi info failed:', error);
            void recordSensorFailure('wifi');
        }
    }

    const deviceSignals = await getDeviceSignals(chargerConnected);
    const now = new Date();
    const wifiLabel = wifiEntry?.label;
    const wifiConfidence = wifiEntry?.confidence;
    const wifiIsHome = wifiLabel === 'home';
    const wifiIsWork = wifiLabel === 'work';
    const wifiIsGym = wifiLabel === 'gym';
    const signals: SignalSnapshot = {
        collectedAt: Date.now(),
        gps: locationContext?.currentLocation
            ? {
                coords: locationContext.currentLocation,
                accuracy: locationContext.currentAccuracy,
                speed: locationContext.currentSpeed,
                timestamp: locationContext.currentTimestamp,
            }
            : undefined,
        activity: activityName
            ? {
                type: activityName,
                timestamp: activityInfo?.lastActiveTimestamp || activityInfo?.lastStillTimestamp,
            }
            : undefined,
        motion: motionStats
            ? {
                variance: motionStats.variance,
                magnitude: motionStats.magnitude,
            }
            : undefined,
        environment: environmentSignals
            ? {
                magnetometerVariance: environmentSignals.magnetometerVariance,
                magnetometerMagnitude: environmentSignals.magnetometerMagnitude,
                pressureStd: environmentSignals.pressureStd,
                pressureDelta: environmentSignals.pressureDelta,
                networkType: environmentSignals.networkType,
                updatedAt: environmentSignals.updatedAt,
            }
            : undefined,
        device: deviceSignals,
        temporal: {
            hour: now.getHours(),
            dayOfWeek: now.getDay(),
            isWeekend: now.getDay() === 0 || now.getDay() === 6,
        },
        location: locationContext
            ? {
                isHome: locationContext.isHome || wifiIsHome,
                isWork: locationContext.isWork || wifiIsWork,
                isGym: locationContext.isGym || wifiIsGym,
                nearestLabel:
                    locationContext.nearestSavedLocation?.label ??
                    locationContext.nearestFrequentPlace?.label,
                nearestDistance:
                    locationContext.nearestSavedLocation?.distance ??
                    locationContext.nearestFrequentPlace?.distance,
            }
            : undefined,
        wifi: wifiInfo
            ? {
                connected: wifiInfo.connected,
                bssid: wifiInfo.bssid,
                ssid: wifiInfo.ssid,
                signalStrength: wifiInfo.signalStrength,
                label: wifiLabel,
                confidence: wifiConfidence,
            }
            : undefined,
    };

    const sleepOverride = await getSleepOverride();
    const { snapshot, nextPollMs } = await evaluateContext({
        signals,
        previous: lastSnapshot,
        source,
        sleepOverride,
    });

    let bioFreshness: 'live' | 'cached' | 'stale' | undefined;
    let stressLevel: 'low' | 'moderate' | 'high' | undefined;
    try {
        const { bioSnapshotService } = require('./bioSnapshotService');
        const snap = bioSnapshotService.getLastSnapshot();
        if (snap) {
            bioFreshness = snap.freshness;
            if (snap.stressIndex !== undefined) {
                stressLevel = snap.stressIndex > 70 ? 'high'
                    : snap.stressIndex > 40 ? 'moderate' : 'low';
            }
        }
    } catch (e) {
        console.warn('[ContextService] Bio snapshot lookup failed:', e);
    }

    const decoratedSnapshot: ContextSnapshot = {
        ...snapshot,
        activity: activityName,
        bioFreshness,
        stressLevel,
        chargerConnected,
        locationCoords: locationContext?.currentLocation,
    };

    return {
        snapshot: decoratedSnapshot,
        nextPollMs,
        signals,
    };
};

const redactCoordinates = (coords?: { lat: number; lng: number } | null) => {
    if (!coords) return undefined;
    return undefined;
};

const redactSnapshot = (snapshot: ContextSnapshot): ContextSnapshot => ({
    ...snapshot,
    locationCoords: redactCoordinates(snapshot.locationCoords),
    locationAccuracy: undefined,
    locationSpeed: snapshot.locationSpeed ?? undefined,
});

const redactSignals = (signals: SignalSnapshot): SignalSnapshot => ({
    ...signals,
    gps: signals.gps
        ? {
            accuracy: signals.gps.accuracy,
            speed: signals.gps.speed ?? null,
            timestamp: signals.gps.timestamp,
        }
        : undefined,
    wifi: signals.wifi
        ? {
            connected: signals.wifi.connected,
            label: signals.wifi.label,
            confidence: signals.wifi.confidence,
        }
        : undefined,
});

const updateLocationVisits = async (
    snapshot: ContextSnapshot,
    previousSnapshot: ContextSnapshot | null | undefined
) => {
    const policy = await getContextPolicy();
    if (!policy.contextLearningEnabled) return;
    if (!snapshot.locationCoords) return;
    const now = Date.now();
    if (now - lastVisitUpdateAt < 30_000) return;

    const STATIONARY = 'stationary' as ContextSnapshot['movementType'];
    if (snapshot.movementType === STATIONARY) {
        const prevLabel = previousSnapshot?.locationLabel;
        const nextLabel = snapshot.locationLabel || 'unknown';
        if (!previousSnapshot || prevLabel !== nextLabel || previousSnapshot.movementType !== STATIONARY) {
            const activity =
                nextLabel === 'home'
                    ? 'home'
                    : nextLabel === 'work'
                        ? 'work'
                        : nextLabel === 'gym'
                            ? 'gym'
                            : 'visiting';
            await locationService.recordArrival(snapshot.locationCoords, activity);
            lastVisitUpdateAt = now;
        } else if (snapshot.state === 'working' || snapshot.state === 'gym_workout' || snapshot.state === 'resting') {
            const activity =
                snapshot.state === 'working'
                    ? 'work'
                    : snapshot.state === 'gym_workout'
                        ? 'gym'
                        : nextLabel === 'home'
                            ? 'home'
                            : 'visiting';
            await locationService.updateCurrentVisitActivity(activity);
        }
    } else if (previousSnapshot?.movementType === STATIONARY && snapshot.movementType !== STATIONARY) {
        await locationService.endCurrentVisit();
        lastVisitUpdateAt = now;
    }
};

const snapshotKey = (snapshot: ContextSnapshot): string => {
    const activity = snapshot.activity ?? '';
    const locationLabel = snapshot.locationLabel ?? '';
    const charger = snapshot.chargerConnected ? '1' : '0';
    const environment = snapshot.environment ?? '';
    const indoorBucket =
        typeof snapshot.indoorConfidence === 'number'
            ? Math.round(snapshot.indoorConfidence * 10)
            : -1;
    const movement = snapshot.movementType ?? '';
    return `${snapshot.state}|${movement}|${activity}|${locationLabel}|${charger}|${environment}|${indoorBucket}`;
};

const snapshotChanged = (next: ContextSnapshot): boolean => {
    if (!lastSnapshot) return true;

    const lastKey = snapshotKey(lastSnapshot);
    const nextKey = snapshotKey(next);

    if (lastKey === nextKey) {
        pendingSnapshot = null;
        pendingSince = 0;
        pendingCount = 0;
        return false;
    }

    if (!pendingSnapshot || snapshotKey(pendingSnapshot) !== nextKey) {
        pendingSnapshot = next;
        pendingSince = Date.now();
        pendingCount = 1;
        return false;
    }

    pendingCount += 1;
    const stabilized = pendingCount >= 2 || Date.now() - pendingSince >= 60_000;
    if (stabilized) {
        pendingSnapshot = null;
        pendingSince = 0;
        pendingCount = 0;
        return true;
    }

    return false;
};

const scheduleNextPoll = (onSnapshot: (snapshot: ContextSnapshot) => void, nextPollMs: number) => {
    if (pollTimer) {
        clearTimeout(pollTimer);
    }
    pollTimer = setTimeout(() => {
        void pollContext(onSnapshot);
    }, nextPollMs);
};

const triggerEventPoll = (onSnapshot: (snapshot: ContextSnapshot) => void, reason: string) => {
    const now = Date.now();
    if (now - lastEventPollAt < 15_000) return;
    lastEventPollAt = now;
    void pollContext(onSnapshot);
};

const buildWifiSignature = (info: Awaited<ReturnType<typeof wifiService.getConnectionInfo>>): string => {
    if (!info || !info.connected) return 'disconnected';
    return `${info.bssid ?? ''}|${info.ssid ?? ''}`;
};

const checkWifiSignature = async (
    onSnapshot: (snapshot: ContextSnapshot) => void
): Promise<void> => {
    try {
        if (!networkEnabled) return;
        const canUseWifi = await shouldUseSensor('wifi');
        if (!canUseWifi) return;
        if (Platform.OS === 'android' && AppState.currentState !== 'active') return;

        const info = await wifiService.getConnectionInfo();
        const signature = buildWifiSignature(info);
        if (signature !== lastWifiSignature) {
            lastWifiSignature = signature;
            triggerEventPoll(onSnapshot, 'wifi');
        }
    } catch (error) {
        console.warn('[ContextService] WiFi monitor failed:', error);
    }
};

const pollContext = async (onSnapshot: (snapshot: ContextSnapshot) => void) => {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
        const { snapshot, nextPollMs, signals } = await buildSnapshot();
        const shouldRefresh =
            !lastSnapshot || Date.now() - (lastSnapshot.updatedAt || 0) >= STALE_REFRESH_MS;

        if (snapshotChanged(snapshot) || shouldRefresh) {
            const previousSnapshot = lastSnapshot;
            lastSnapshot = snapshot;
            const policy = await getContextPolicy();
            const storedSnapshot = policy.contextPrivacyMode === 'minimal' ? redactSnapshot(snapshot) : snapshot;
            const storedSignals = policy.contextPrivacyMode === 'minimal' ? redactSignals(signals) : signals;
            await storage.set(storage.keys.LAST_CONTEXT_SNAPSHOT, storedSnapshot);
            void recordContextSnapshot(storedSnapshot);
            void recordSignalSnapshot(storedSignals, storedSnapshot);
            await syncContextToNative(snapshot);
            onSnapshot(snapshot);
            if (snapshot.locationCoords) {
                void ensureContextGeofence(snapshot.locationCoords);
            }
            try {
                void updateLocationVisits(snapshot, previousSnapshot);
            } catch (error) {
                console.warn('[ContextService] Failed to update location visits:', error);
            }
            try {
                const { invalidateLLMContextCache } = require('./llmContextService');
                invalidateLLMContextCache();
            } catch (error) {
                console.warn('[ContextService] Failed to invalidate LLM cache:', error);
            }
            try {
                const { planRefinementService } = require('./planRefinementService');
                if (planRefinementService?.recordContextChange) {
                    planRefinementService.recordContextChange(
                        previousSnapshot?.state ?? snapshot.state,
                        snapshot.state,
                        {
                            location: snapshot.locationLabel,
                            locationContext: snapshot.locationContext,
                        }
                    );
                }
            } catch (error) {
                console.warn('[ContextService] Failed to record context change:', error);
            }
        } else {
            lastSnapshot = snapshot;
        }
        scheduleNextPoll(onSnapshot, nextPollMs);
    } catch (error) {
        console.warn('[ContextService] Context poll failed:', error);
        scheduleNextPoll(onSnapshot, 60_000);
    } finally {
        pollInFlight = false;
    }
};

export const startContextMonitoring = (
    onSnapshot: (snapshot: ContextSnapshot) => void,
    options: { environmentEnabled?: boolean; networkEnabled?: boolean } = {}
): (() => void) => {
    lastMeasurements = [];
    environmentEnabled = options.environmentEnabled !== false;
    networkEnabled = options.networkEnabled !== false;

    if (subscription) {
        subscription.remove();
        subscription = null;
    }
    lastOnSnapshot = onSnapshot;

    Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);
    subscription = Accelerometer.addListener((data: AccelerometerMeasurement) => {
        lastMeasurements.push(data);
        if (lastMeasurements.length > MAX_MEASUREMENTS) {
            lastMeasurements.shift();
        }
    });

    if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }

    if (wifiMonitorTimer) {
        clearInterval(wifiMonitorTimer);
        wifiMonitorTimer = null;
    }
    lastWifiSignature = null;

    if (environmentEnabled) {
        void environmentService.start();
        environmentUnsubscribe = environmentService.subscribe(() => {
            triggerEventPoll(onSnapshot, 'environment');
        });
    } else {
        environmentService.stop();
    }

    appStateSubscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
            triggerEventPoll(onSnapshot, 'foreground');
        }
    });
    if (networkEnabled) {
        void checkWifiSignature(onSnapshot);
        wifiMonitorTimer = setInterval(() => {
            void checkWifiSignature(onSnapshot);
        }, WIFI_MONITOR_INTERVAL_MS);
    }
    void pollContext(onSnapshot);

    return () => {
        stopContextMonitoring();
    };
};

export const stopContextMonitoring = () => {
    if (subscription) {
        subscription.remove();
        subscription = null;
    }
    if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
    if (wifiMonitorTimer) {
        clearInterval(wifiMonitorTimer);
        wifiMonitorTimer = null;
    }
    if (environmentUnsubscribe) {
        environmentUnsubscribe();
        environmentUnsubscribe = null;
    }
    if (appStateSubscription) {
        appStateSubscription.remove();
        appStateSubscription = null;
    }
    environmentService.stop();
    lastMeasurements = [];
    lastSnapshot = null;
    pendingSnapshot = null;
    pendingSince = 0;
    pendingCount = 0;
    lastEventPollAt = 0;
    lastWifiSignature = null;
    lastOnSnapshot = null;
};

export const requestContextRefresh = (reason: string = 'manual') => {
    if (!lastOnSnapshot) return;
    triggerEventPoll(lastOnSnapshot, reason);
};

export const refreshContextOnce = async (reason: string = 'manual'): Promise<ContextSnapshot | null> => {
    try {
        const { snapshot, signals } = await buildSnapshot();
        const previousSnapshot = lastSnapshot;
        lastSnapshot = snapshot;
        const policy = await getContextPolicy();
        const storedSnapshot = policy.contextPrivacyMode === 'minimal' ? redactSnapshot(snapshot) : snapshot;
        const storedSignals = policy.contextPrivacyMode === 'minimal' ? redactSignals(signals) : signals;
        await storage.set(storage.keys.LAST_CONTEXT_SNAPSHOT, storedSnapshot);
        void recordContextSnapshot(storedSnapshot);
        void recordSignalSnapshot(storedSignals, storedSnapshot);
        await syncContextToNative(snapshot);
        if (snapshot.locationCoords) {
            void ensureContextGeofence(snapshot.locationCoords);
        }
        try {
            void updateLocationVisits(snapshot, previousSnapshot);
        } catch (error) {
            console.warn('[ContextService] Failed to update location visits:', error);
        }
        try {
            const { invalidateLLMContextCache } = require('./llmContextService');
            invalidateLLMContextCache();
        } catch (error) {
            console.warn('[ContextService] Failed to invalidate LLM cache:', error);
        }
        try {
            const { planRefinementService } = require('./planRefinementService');
            if (planRefinementService?.recordContextChange) {
                planRefinementService.recordContextChange(
                    previousSnapshot?.state ?? snapshot.state,
                    snapshot.state,
                    {
                        location: snapshot.locationLabel,
                        locationContext: snapshot.locationContext,
                    }
                );
            }
        } catch (error) {
            console.warn('[ContextService] Failed to record context change:', error);
        }
        return snapshot;
    } catch (error) {
        console.warn('[ContextService] Refresh failed:', error);
        return null;
    }
};

export default {
    startContextMonitoring,
    stopContextMonitoring,
    requestContextRefresh,
    refreshContextOnce,
};
