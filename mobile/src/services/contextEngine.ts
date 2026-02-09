import type {
    ContextSnapshot,
    SignalSnapshot,
    MovementType,
    PollTier,
    EnvironmentType,
    LocationType,
} from './contextTypes';
import { computeEnvironmentConfidence } from './contextUtils';

type EvaluationInput = {
    signals: SignalSnapshot;
    source: ContextSnapshot['source'];
    previous?: ContextSnapshot | null;
    sleepOverride?: boolean;
};

type MovementResolution = {
    movementType: MovementType;
    movingScore: number;
    stationaryScore: number;
    confidence: number;
    conflicts: string[];
    signalsUsed: string[];
};

type EnvironmentResolution = {
    environment: EnvironmentType;
    indoorConfidence: number;
    outdoorConfidence: number;
    conflicts: string[];
    signalsUsed: string[];
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const isTruthyNumber = (value?: number | null) => typeof value === 'number' && Number.isFinite(value);

const distanceMeters = (a?: { lat: number; lng: number } | null, b?: { lat: number; lng: number } | null) => {
    if (!a || !b) return null;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h =
        sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
};

const freshnessWeight = (ageMs?: number | null): number => {
    if (ageMs === null || ageMs === undefined) return 1;
    if (ageMs <= 60_000) return 1;
    if (ageMs <= 5 * 60_000) return 0.8;
    if (ageMs <= 15 * 60_000) return 0.5;
    if (ageMs <= 60 * 60_000) return 0.2;
    return 0;
};

const resolveMovement = (
    signals: SignalSnapshot,
    previous?: ContextSnapshot | null
): MovementResolution => {
    const conflicts: string[] = [];
    const signalsUsed: string[] = [];
    let movingScore = 0.1;
    let stationaryScore = 0.1;
    let movementType: MovementType = 'unknown';

    const now = Date.now();
    const speedMps = signals.gps?.speed ?? null;
    const speedKmh = isTruthyNumber(speedMps) ? (speedMps as number) * 3.6 : null;
    const speedWeight = freshnessWeight(
        signals.gps?.timestamp ? now - signals.gps.timestamp : null
    );
    if (isTruthyNumber(speedKmh) && speedWeight > 0) {
        signalsUsed.push('gps_speed');
        if ((speedKmh as number) >= 18) {
            movingScore += 0.7 * speedWeight;
            movementType = 'vehicle';
        } else if ((speedKmh as number) >= 7) {
            movingScore += 0.45 * speedWeight;
        } else if ((speedKmh as number) >= 3) {
            movingScore += 0.25 * speedWeight;
        } else if ((speedKmh as number) <= 0.5) {
            stationaryScore += 0.35 * speedWeight;
        }
    }

    if (signals.gps?.coords && previous?.locationCoords && previous.updatedAt) {
        const dist = distanceMeters(previous.locationCoords, signals.gps.coords);
        const dtMs = Math.max(1, now - previous.updatedAt);
        if (dist !== null) {
            const rate = dist / (dtMs / 1000);
            signalsUsed.push('gps_delta');
            if (rate > 5) {
                movingScore += 0.5;
                movementType = 'vehicle';
            } else if (rate > 1.5) {
                movingScore += 0.3;
                if (movementType !== 'vehicle') movementType = 'walking';
            } else if (rate < 0.3) {
                stationaryScore += 0.25;
            }
        }
    }

    const activity = signals.activity?.type?.toUpperCase();
    const activityWeight = freshnessWeight(
        signals.activity?.timestamp ? now - signals.activity.timestamp : null
    );
    if (activity && activityWeight > 0) {
        signalsUsed.push('activity');
        if (activity === 'IN_VEHICLE') {
            movingScore += 0.7 * activityWeight;
            movementType = 'vehicle';
        } else if (activity === 'ON_BICYCLE') {
            movingScore += 0.5 * activityWeight;
        } else if (activity === 'RUNNING') {
            movingScore += 0.55 * activityWeight;
            movementType = movementType === 'vehicle' ? 'vehicle' : 'running';
        } else if (activity === 'WALKING' || activity === 'ON_FOOT') {
            movingScore += 0.45 * activityWeight;
            movementType = movementType === 'vehicle' ? 'vehicle' : 'walking';
        } else if (activity === 'STILL') {
            stationaryScore += 0.6 * activityWeight;
        }
    }

    const variance = signals.motion?.variance;
    if (isTruthyNumber(variance)) {
        signalsUsed.push('accelerometer');
        if ((variance as number) < 0.01) {
            stationaryScore += 0.35;
        } else if ((variance as number) < 0.05) {
            movingScore += 0.2;
        } else if ((variance as number) < 0.2) {
            movingScore += 0.35;
            movementType = movementType === 'vehicle' ? 'vehicle' : 'walking';
        } else {
            movingScore += 0.5;
            movementType = movementType === 'vehicle' ? 'vehicle' : 'running';
        }
    }

    if (activity === 'STILL' && isTruthyNumber(speedKmh) && (speedKmh as number) >= 10) {
        conflicts.push('activity_still_vs_speed');
    }

    if (movementType === 'unknown') {
        if (movingScore > stationaryScore + 0.25) {
            movementType = isTruthyNumber(speedKmh) && (speedKmh as number) >= 10 ? 'vehicle' : 'walking';
        } else if (stationaryScore > movingScore + 0.25) {
            movementType = 'stationary';
        }
    }

    const confidence = clamp01(
        Math.abs(movingScore - stationaryScore) / (movingScore + stationaryScore + 0.001)
    );

    return {
        movementType,
        movingScore,
        stationaryScore,
        confidence,
        conflicts,
        signalsUsed,
    };
};

const resolveLocationType = (signals: SignalSnapshot): LocationType => {
    if (signals.location?.isHome) return 'home';
    if (signals.location?.isWork) return 'work';
    if (signals.location?.isGym) return 'gym';
    if (signals.location?.nearestLabel) return 'frequent';
    return 'unknown';
};

const resolveEnvironment = (
    signals: SignalSnapshot,
    movement: MovementResolution,
    locationType: LocationType
): EnvironmentResolution => {
    const envSignals = signals.environment;
    const environmentBase = computeEnvironmentConfidence({
        accuracy: signals.gps?.accuracy,
        speed: signals.gps?.speed,
        isHome: locationType === 'home',
        isWork: locationType === 'work',
        isGym: locationType === 'gym',
        locationLabel: signals.location?.nearestLabel ?? null,
        magnetometerVariance: envSignals?.magnetometerVariance,
        pressureStd: envSignals?.pressureStd,
        pressureDelta: envSignals?.pressureDelta,
        networkType: envSignals?.networkType,
        wifiConnected: signals.wifi?.connected,
        wifiLabel: signals.wifi?.label ?? null,
        wifiConfidence: signals.wifi?.confidence ?? null,
    });

    let indoorConfidence = environmentBase.indoorConfidence;
    let outdoorConfidence = environmentBase.outdoorConfidence;
    const conflicts: string[] = [];
    const signalsUsed = new Set<string>();
    if (environmentBase.source && environmentBase.source !== 'unknown') {
        signalsUsed.add(environmentBase.source);
    }

    if (movement.movementType === 'vehicle') {
        outdoorConfidence = clamp01(outdoorConfidence + 0.25);
        indoorConfidence = clamp01(indoorConfidence - 0.25);
        signalsUsed.add('movement_vehicle');
    }

    if (movement.movementType !== 'stationary' && indoorConfidence >= 0.7) {
        conflicts.push('moving_vs_indoor');
    }

    if (signals.temporal) {
        const hour = signals.temporal.hour;
        if (hour >= 22 || hour <= 6) {
            if (movement.movementType === 'stationary') {
                indoorConfidence = clamp01(indoorConfidence + 0.07);
                outdoorConfidence = clamp01(outdoorConfidence - 0.03);
                signalsUsed.add('nighttime');
            } else if (movement.movementType !== 'unknown') {
                conflicts.push('night_active');
                outdoorConfidence = clamp01(outdoorConfidence + 0.05);
                indoorConfidence = clamp01(indoorConfidence - 0.05);
            }
        }
    }

    if (locationType === 'home' || locationType === 'work' || locationType === 'gym') {
        indoorConfidence = clamp01(indoorConfidence + 0.18);
        outdoorConfidence = clamp01(outdoorConfidence - 0.18);
        signalsUsed.add('saved_location');
    }

    if (signals.wifi?.connected && !signals.wifi?.label && signals.environment?.networkType === 'CELLULAR') {
        conflicts.push('wifi_vs_cellular');
    }

    if (signals.device?.isCharging && movement.movementType === 'vehicle') {
        signalsUsed.add('charging_vehicle');
    }

    const speedMps = signals.gps?.speed ?? null;
    const speedKmh = isTruthyNumber(speedMps) ? (speedMps as number) * 3.6 : null;
    if (signals.wifi?.label && (signals.wifi.label === 'home' || signals.wifi.label === 'work' || signals.wifi.label === 'gym')) {
        signalsUsed.add('wifi_label');
        if (isTruthyNumber(speedKmh) && (speedKmh as number) >= 10) {
            conflicts.push('wifi_place_vs_speed');
            outdoorConfidence = clamp01(outdoorConfidence + 0.15);
            indoorConfidence = clamp01(indoorConfidence - 0.1);
        }
    }

    if (signals.device?.isCharging && isTruthyNumber(speedKmh) && (speedKmh as number) >= 12) {
        conflicts.push('charging_vs_moving');
    }

    const diff = indoorConfidence - outdoorConfidence;
    let environment: EnvironmentType = 'unknown';
    if (diff >= 0.25) {
        environment = 'indoor';
    } else if (diff <= -0.25) {
        environment = 'outdoor';
    }

    return {
        environment,
        indoorConfidence,
        outdoorConfidence,
        conflicts,
        signalsUsed: Array.from(signalsUsed),
    };
};

const resolveConfidenceLevel = (confidence: number): ContextSnapshot['confidenceLevel'] => {
    if (confidence >= 0.9) return 'very_high';
    if (confidence >= 0.75) return 'high';
    if (confidence >= 0.55) return 'medium';
    if (confidence >= 0.35) return 'low';
    return 'very_low';
};

const determinePollTier = (
    state: ContextSnapshot['state'],
    movement: MovementResolution,
    environment: EnvironmentResolution,
    confidence: number,
    device?: SignalSnapshot['device']
): PollTier => {
    if (device?.isPowerSaveMode || (device?.batteryLevel ?? 1) < 0.15) {
        return 'power_save';
    }
    if (state === 'sleeping') return 'sleep';
    if (state === 'commuting' || state === 'gym_workout') return 'monitoring';
    if (environment.conflicts.length > 0 || movement.conflicts.length > 0) return 'aggressive';
    if (confidence < 0.45) return 'active';
    if (movement.movementType !== 'stationary' && movement.movementType !== 'unknown') return 'monitoring';
    if (confidence > 0.85) return 'background';
    return 'active';
};

const computeNextPollMs = (
    tier: PollTier,
    confidence: number,
    device?: SignalSnapshot['device'],
    stateDurationMs: number = 0
): number => {
    const baseIntervals: Record<PollTier, number> = {
        aggressive: 15_000,
        active: 45_000,
        monitoring: 120_000,
        background: 420_000,
        sleep: 1_200_000,
        power_save: 2_400_000,
    };

    let interval = baseIntervals[tier];
    if (confidence >= 0.85) {
        interval *= 1.4;
    } else if (confidence < 0.5) {
        interval *= 0.7;
    }

    const batteryLevel = device?.batteryLevel ?? 1;
    if (batteryLevel < 0.25) {
        interval *= 1.4;
    } else if (batteryLevel < 0.4) {
        interval *= 1.2;
    }

    if (device?.isCharging) {
        interval *= 0.85;
    }

    if (stateDurationMs > 30 * 60_000) {
        interval *= 1.2;
    } else if (stateDurationMs < 5 * 60_000) {
        interval *= 0.85;
    }

    return clamp(Math.round(interval), 10_000, 3_600_000);
};

const deriveLocationLabel = (signals: SignalSnapshot): string | undefined => {
    if (signals.location?.isHome) return 'home';
    if (signals.location?.isWork) return 'work';
    if (signals.location?.isGym) return 'gym';
    if (signals.location?.nearestLabel) return signals.location.nearestLabel;
    if (signals.gps?.coords) return 'outside';
    return undefined;
};

const buildLocationContext = (
    signals: SignalSnapshot,
    movement: MovementResolution,
    environment: EnvironmentResolution,
    confidence: number
): string | undefined => {
    const parts: string[] = [];
    const label = deriveLocationLabel(signals);
    if (label) parts.push(`Location: ${label}`);
    if (movement.movementType && movement.movementType !== 'unknown') {
        parts.push(`Movement: ${movement.movementType}`);
    }
    if (environment.environment && environment.environment !== 'unknown') {
        parts.push(
            `Environment: ${environment.environment} (indoor ${Math.round(environment.indoorConfidence * 100)}%, ` +
            `outdoor ${Math.round(environment.outdoorConfidence * 100)}%)`
        );
    }
    if (confidence) {
        parts.push(`Context confidence: ${Math.round(confidence * 100)}%`);
    }
    if (signals.location?.nearestLabel && isTruthyNumber(signals.location?.nearestDistance)) {
        parts.push(`Nearest place: ${signals.location?.nearestLabel} (${Math.round(signals.location?.nearestDistance as number)}m)`);
    }
    return parts.length ? parts.join('. ') : undefined;
};

const normalizeState = (state?: ContextSnapshot['state'] | null): ContextSnapshot['state'] | undefined => {
    if (!state) return undefined;
    return state === 'idle' ? 'resting' : state;
};

const resolveState = (
    movement: MovementResolution,
    locationType: LocationType,
    environment: EnvironmentResolution,
    previous?: ContextSnapshot | null,
    sleepOverride?: boolean
): ContextSnapshot['state'] => {
    if (sleepOverride) return 'sleeping';

    const prevState = normalizeState(previous?.state);

    if (movement.movementType === 'vehicle') {
        if (locationType === 'home' || locationType === 'work' || locationType === 'gym') {
            return 'commuting';
        }
        if (prevState && ['resting', 'home_active', 'working', 'gym_workout', 'sleeping', 'walking'].includes(prevState)) {
            return 'commuting';
        }
        return 'driving';
    }

    if (movement.movementType === 'running') {
        if (locationType === 'gym') return 'gym_workout';
        return 'running';
    }

    if (movement.movementType === 'walking') {
        if (locationType === 'gym') return 'gym_workout';
        if (locationType === 'home' && environment.environment === 'indoor') return 'home_active';
        return 'walking';
    }

    if (movement.movementType === 'stationary') {
        if (locationType === 'gym') return 'gym_workout';
        if (locationType === 'work') return 'working';
        if (locationType === 'home') return 'resting';
        return 'resting';
    }

    return 'unknown';
};

const applyTransitionRules = (
    previous: ContextSnapshot | null | undefined,
    candidate: ContextSnapshot,
    movement: MovementResolution,
    confidence: number
): ContextSnapshot => {
    if (!previous) {
        return { ...candidate, stateStartedAt: candidate.updatedAt };
    }

    const now = candidate.updatedAt;
    const prevStarted = previous.stateStartedAt ?? previous.updatedAt;
    const timeSincePrev = now - previous.updatedAt;
    const prevState = normalizeState(previous.state) || previous.state;
    const candidateState = normalizeState(candidate.state) || candidate.state;
    let nextState = candidateState;

    if (prevState === 'sleeping' && nextState !== 'sleeping') {
        if (confidence < 0.75 && timeSincePrev < 2 * 60_000) {
            nextState = prevState;
        }
    }

    if ((prevState === 'driving' || prevState === 'commuting') && nextState !== prevState) {
        if (movement.movementType === 'vehicle' || confidence < 0.65) {
            nextState = prevState;
        }
    }

    if (prevState === 'working' && nextState === 'resting') {
        if (candidate.locationType === 'work' && confidence < 0.7) {
            nextState = prevState;
        }
    }

    if ((prevState === 'resting' || prevState === 'home_active') && nextState === 'working') {
        if (candidate.locationType !== 'work' && confidence < 0.8) {
            nextState = prevState;
        }
    }

    if (prevState === 'gym_workout' && nextState !== 'gym_workout') {
        if (candidate.locationType === 'gym' && confidence < 0.7) {
            nextState = prevState;
        }
    }

    if (nextState === 'sleeping' && movement.movementType !== 'stationary' && confidence < 0.85) {
        nextState = prevState;
    }

    const stateStartedAt = nextState === prevState ? prevStarted : now;
    return { ...candidate, state: nextState, stateStartedAt };
};

export const evaluateContext = async (input: EvaluationInput): Promise<{
    snapshot: ContextSnapshot;
    nextPollMs: number;
}> => {
    const { signals, previous, source, sleepOverride } = input;
    const movement = resolveMovement(signals, previous);
    const locationType = resolveLocationType(signals);
    const environment = resolveEnvironment(signals, movement, locationType);

    const envDiff = Math.abs(environment.indoorConfidence - environment.outdoorConfidence);
    const signalConfidence =
        0.4 +
        0.3 * movement.confidence +
        0.3 * envDiff;

    let confidence = clamp01(signalConfidence);
    const conflicts = [...movement.conflicts, ...environment.conflicts];
    if (conflicts.length > 0) {
        confidence = clamp01(confidence - 0.1 * conflicts.length);
    }
    const signalCoverage = new Set([...movement.signalsUsed, ...environment.signalsUsed]);
    if (signalCoverage.size <= 1) {
        confidence = clamp01(confidence * 0.7);
    } else if (signalCoverage.size <= 2) {
        confidence = clamp01(confidence * 0.85);
    }

    const state = resolveState(movement, locationType, environment, previous, sleepOverride);
    const locationLabel = deriveLocationLabel(signals);
    const locationContext = buildLocationContext(signals, movement, environment, confidence);

    const candidate: ContextSnapshot = {
        state,
        source,
        activity: signals.activity?.type,
        locationLabel,
        locationContext,
        environment: environment.environment,
        indoorConfidence: environment.indoorConfidence,
        outdoorConfidence: environment.outdoorConfidence,
        locationAccuracy: signals.gps?.accuracy,
        locationSpeed: signals.gps?.speed ?? null,
        updatedAt: Date.now(),
        chargerConnected: signals.device?.isCharging,
        confidence,
        confidenceLevel: resolveConfidenceLevel(confidence),
        movementType: movement.movementType,
        locationType,
        conflicts,
        signalsUsed: Array.from(
            new Set([...movement.signalsUsed, ...environment.signalsUsed])
        ),
    };

    const snapshot = applyTransitionRules(previous, candidate, movement, confidence);
    const stateDurationMs = snapshot.stateStartedAt
        ? Math.max(0, snapshot.updatedAt - snapshot.stateStartedAt)
        : 0;
    const pollTier = determinePollTier(snapshot.state, movement, environment, confidence, signals.device);
    const nextPollMs = computeNextPollMs(pollTier, confidence, signals.device, stateDurationMs);
    snapshot.pollTier = pollTier;

    return { snapshot, nextPollMs };
};

export default {
    evaluateContext,
};
