export type EnvironmentConfidence = {
    environment: 'indoor' | 'outdoor' | 'unknown';
    indoorConfidence: number;
    outdoorConfidence: number;
    source:
        | 'gps'
        | 'speed'
        | 'saved_place'
        | 'magnetometer'
        | 'barometer'
        | 'network'
        | 'wifi'
        | 'mixed'
        | 'unknown';
};

type EnvironmentInputs = {
    accuracy?: number | null;
    speed?: number | null;
    isHome?: boolean;
    isWork?: boolean;
    isGym?: boolean;
    locationLabel?: string | null;
    magnetometerVariance?: number | null;
    pressureStd?: number | null;
    pressureDelta?: number | null;
    networkType?: string | null;
    wifiConnected?: boolean | null;
    wifiLabel?: string | null;
    wifiConfidence?: number | null;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalize = (indoor: number, outdoor: number) => {
    const total = indoor + outdoor;
    if (total <= 0) {
        return { indoorConfidence: 0.5, outdoorConfidence: 0.5 };
    }
    return {
        indoorConfidence: indoor / total,
        outdoorConfidence: outdoor / total,
    };
};

export const computeEnvironmentConfidence = (input: EnvironmentInputs): EnvironmentConfidence => {
    let indoor = 0.5;
    let outdoor = 0.5;
    const sources = new Set<EnvironmentConfidence['source']>();
    let hasSignal = false;

    if (input.isHome || input.isWork || input.isGym) {
        indoor += 0.25;
        hasSignal = true;
        sources.add('saved_place');
    }

    const accuracy = typeof input.accuracy === 'number' ? input.accuracy : null;
    if (accuracy !== null) {
        hasSignal = true;
        sources.add('gps');
        if (accuracy >= 50) {
            indoor += 0.25;
        } else if (accuracy >= 35) {
            indoor += 0.1;
        } else if (accuracy <= 15) {
            outdoor += 0.25;
        } else if (accuracy <= 30) {
            outdoor += 0.1;
        } else {
            indoor += 0.05;
            outdoor += 0.05;
        }
    }

    const speed = typeof input.speed === 'number' ? input.speed : null;
    if (speed !== null) {
        hasSignal = true;
        sources.add('speed');
        if (speed >= 6) {
            outdoor += 0.3;
        } else if (speed >= 3) {
            outdoor += 0.2;
        } else if (speed <= 0.5) {
            indoor += 0.1;
        }
    }

    const magVariance =
        typeof input.magnetometerVariance === 'number' ? input.magnetometerVariance : null;
    if (magVariance !== null) {
        hasSignal = true;
        sources.add('magnetometer');
        if (magVariance >= 12) {
            indoor += 0.2;
        } else if (magVariance <= 3) {
            outdoor += 0.1;
        }
    }

    const pressureStd = typeof input.pressureStd === 'number' ? input.pressureStd : null;
    if (pressureStd !== null) {
        hasSignal = true;
        sources.add('barometer');
        if (pressureStd <= 0.05) {
            indoor += 0.1;
        } else if (pressureStd >= 0.2) {
            outdoor += 0.05;
        }
    }

    const networkType = input.networkType ? input.networkType.toUpperCase() : null;
    if (networkType) {
        hasSignal = true;
        sources.add('network');
        if (networkType === 'WIFI' || networkType === 'ETHERNET') {
            indoor += 0.1;
        } else if (networkType === 'CELLULAR') {
            outdoor += 0.1;
        }
    }

    if (input.wifiConnected) {
        hasSignal = true;
        sources.add('wifi');
        indoor += 0.15;
        const label = input.wifiLabel;
        const confidenceBoost = typeof input.wifiConfidence === 'number' ? input.wifiConfidence : 0;
        if (label === 'home' || label === 'work' || label === 'gym') {
            indoor += 0.2 + Math.min(0.15, confidenceBoost * 0.15);
        } else if (label === 'frequent') {
            indoor += 0.1;
        }
    }

    if (input.locationLabel === 'outside') {
        outdoor += 0.1;
        hasSignal = true;
    }

    if (!hasSignal) {
        return {
            environment: 'unknown',
            indoorConfidence: 0.5,
            outdoorConfidence: 0.5,
            source: 'unknown',
        };
    }

    const normalized = normalize(clamp01(indoor), clamp01(outdoor));
    const diff = normalized.indoorConfidence - normalized.outdoorConfidence;

    let environment: EnvironmentConfidence['environment'] = 'unknown';
    if (diff >= 0.25) {
        environment = 'indoor';
    } else if (diff <= -0.25) {
        environment = 'outdoor';
    }

    let source: EnvironmentConfidence['source'] = 'unknown';
    if (sources.size === 1) {
        source = (Array.from(sources)[0] || 'unknown') as EnvironmentConfidence['source'];
    } else if (sources.size > 1) {
        source = 'mixed';
    }

    return {
        environment,
        indoorConfidence: normalized.indoorConfidence,
        outdoorConfidence: normalized.outdoorConfidence,
        source,
    };
};
