import { Barometer, Magnetometer } from 'expo-sensors';
import * as Network from 'expo-network';

type NetworkType =
    | 'WIFI'
    | 'CELLULAR'
    | 'NONE'
    | 'UNKNOWN'
    | 'BLUETOOTH'
    | 'ETHERNET'
    | 'VPN'
    | string;

export type EnvironmentSignals = {
    magnetometerVariance?: number;
    magnetometerMagnitude?: number;
    pressureStd?: number;
    pressureDelta?: number;
    networkType?: NetworkType;
    updatedAt: number;
};

const MAG_WINDOW = 32;
const BARO_WINDOW = 32;
const MAG_UPDATE_MS = 1000;
const BARO_UPDATE_MS = 1500;
const NETWORK_POLL_MS = 60_000;

let magnetometerSub: { remove: () => void } | null = null;
let barometerSub: { remove: () => void } | null = null;
let networkTimer: ReturnType<typeof setInterval> | null = null;
let networkListener: { remove: () => void } | null = null;

const magSamples: number[] = [];
const baroSamples: number[] = [];
let lastNetworkType: NetworkType | undefined;
let lastUpdatedAt = 0;
let started = false;
const listeners = new Set<(signals: EnvironmentSignals, reason?: string) => void>();

const clampWindow = (arr: number[], max: number) => {
    if (arr.length > max) {
        arr.splice(0, arr.length - max);
    }
};

const mean = (arr: number[]) => arr.reduce((sum, v) => sum + v, 0) / arr.length;

const variance = (arr: number[]) => {
    if (arr.length < 2) return 0;
    const avg = mean(arr);
    return arr.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / arr.length;
};

const stddev = (arr: number[]) => Math.sqrt(variance(arr));

const updateNetworkState = async () => {
    try {
        const state = await Network.getNetworkStateAsync();
        const nextType = state.type || 'UNKNOWN';
        if (nextType !== lastNetworkType) {
            lastNetworkType = nextType;
            lastUpdatedAt = Date.now();
            const snapshot = getSignals();
            listeners.forEach(listener => {
                try {
                    listener(snapshot, 'network');
                } catch (error) {
                    console.warn('[Environment] Listener error:', error);
                }
            });
            return;
        }
        lastNetworkType = nextType;
    } catch (error) {
        console.warn('[Environment] Failed to read network state:', error);
    }
};

const start = async () => {
    if (started) return;
    started = true;

    try {
        const magAvailable = await Magnetometer.isAvailableAsync();
        if (magAvailable) {
            Magnetometer.setUpdateInterval(MAG_UPDATE_MS);
            magnetometerSub = Magnetometer.addListener(({ x, y, z }) => {
                const magnitude = Math.sqrt(x * x + y * y + z * z);
                magSamples.push(magnitude);
                clampWindow(magSamples, MAG_WINDOW);
                lastUpdatedAt = Date.now();
            });
        }
    } catch (error) {
        console.warn('[Environment] Magnetometer unavailable:', error);
    }

    try {
        const baroAvailable = await Barometer.isAvailableAsync();
        if (baroAvailable) {
            Barometer.setUpdateInterval(BARO_UPDATE_MS);
            barometerSub = Barometer.addListener(({ pressure }) => {
                if (typeof pressure === 'number') {
                    baroSamples.push(pressure);
                    clampWindow(baroSamples, BARO_WINDOW);
                    lastUpdatedAt = Date.now();
                }
            });
        }
    } catch (error) {
        console.warn('[Environment] Barometer unavailable:', error);
    }

    await updateNetworkState();
    networkListener = Network.addNetworkStateListener((state) => {
        const nextType = state.type || 'UNKNOWN';
        if (nextType !== lastNetworkType) {
            lastNetworkType = nextType;
            lastUpdatedAt = Date.now();
            const snapshot = getSignals();
            listeners.forEach(listener => {
                try {
                    listener(snapshot, 'network');
                } catch (error) {
                    console.warn('[Environment] Listener error:', error);
                }
            });
        }
    });
    networkTimer = setInterval(() => {
        void updateNetworkState();
    }, NETWORK_POLL_MS);
};

const stop = () => {
    magnetometerSub?.remove();
    barometerSub?.remove();
    magnetometerSub = null;
    barometerSub = null;
    if (networkTimer) {
        clearInterval(networkTimer);
        networkTimer = null;
    }
    if (networkListener) {
        networkListener.remove();
        networkListener = null;
    }
    magSamples.length = 0;
    baroSamples.length = 0;
    lastNetworkType = undefined;
    lastUpdatedAt = 0;
    started = false;
};

const getSignals = (): EnvironmentSignals => {
    const magVariance = magSamples.length >= 6 ? variance(magSamples) : undefined;
    const magMagnitude = magSamples.length > 0 ? magSamples[magSamples.length - 1] : undefined;
    const pressureStd = baroSamples.length >= 6 ? stddev(baroSamples) : undefined;
    const pressureDelta =
        baroSamples.length >= 6 ? baroSamples[baroSamples.length - 1] - baroSamples[0] : undefined;

    return {
        magnetometerVariance: magVariance,
        magnetometerMagnitude: magMagnitude,
        pressureStd,
        pressureDelta,
        networkType: lastNetworkType,
        updatedAt: lastUpdatedAt || Date.now(),
    };
};

export const environmentService = {
    start,
    stop,
    getSignals,
    subscribe(listener: (signals: EnvironmentSignals, reason?: string) => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};

export default environmentService;
