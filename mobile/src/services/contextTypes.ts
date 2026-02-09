import type { UserContextState } from '../types';

export type ContextSource =
    | 'activity_recognition'
    | 'accelerometer'
    | 'mixed'
    | 'fallback'
    | 'background_location'
    | 'manual';

export type EnvironmentType = 'indoor' | 'outdoor' | 'unknown';
export type MovementType = 'stationary' | 'walking' | 'running' | 'vehicle' | 'unknown';
export type LocationType = 'home' | 'work' | 'gym' | 'frequent' | 'unknown';
export type PollTier = 'aggressive' | 'active' | 'monitoring' | 'background' | 'sleep' | 'power_save';

export type ContextSnapshot = {
    state: UserContextState;
    source: ContextSource;
    activity?: string;
    locationLabel?: string;
    locationContext?: string;
    environment?: EnvironmentType;
    indoorConfidence?: number;
    outdoorConfidence?: number;
    locationAccuracy?: number;
    locationSpeed?: number | null;
    locationCoords?: { lat: number; lng: number };
    bioFreshness?: 'live' | 'cached' | 'stale';
    stressLevel?: 'low' | 'moderate' | 'high';
    updatedAt: number;
    stateStartedAt?: number;
    chargerConnected?: boolean;
    confidence?: number;
    confidenceLevel?: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
    movementType?: MovementType;
    locationType?: LocationType;
    pollTier?: PollTier;
    conflicts?: string[];
    signalsUsed?: string[];
};

export type SignalSnapshot = {
    collectedAt: number;
    gps?: {
        coords?: { lat: number; lng: number };
        accuracy?: number;
        speed?: number | null;
        timestamp?: number;
    };
    activity?: {
        type?: string;
        confidence?: number;
        timestamp?: number;
    };
    motion?: {
        variance?: number;
        magnitude?: number;
    };
    environment?: {
        magnetometerVariance?: number;
        magnetometerMagnitude?: number;
        pressureStd?: number;
        pressureDelta?: number;
        networkType?: string;
        updatedAt?: number;
    };
    wifi?: {
        connected: boolean;
        bssid?: string;
        ssid?: string;
        signalStrength?: number;
        label?: string;
        confidence?: number;
    };
    device?: {
        batteryLevel?: number;
        isCharging?: boolean;
        isPowerSaveMode?: boolean;
    };
    temporal?: {
        hour: number;
        dayOfWeek: number;
        isWeekend: boolean;
    };
    location?: {
        isHome?: boolean;
        isWork?: boolean;
        isGym?: boolean;
        nearestLabel?: string;
        nearestDistance?: number;
    };
};
