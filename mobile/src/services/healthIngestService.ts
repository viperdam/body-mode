import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { AppState, AppStateStatus, Platform } from 'react-native';
import type { BioSnapshot } from '../types';
import storage from './storageService';
import { bioSnapshotService } from './bioSnapshotService';
import { healthConsentService } from './healthConsentService';
import { backgroundHealthService } from './backgroundHealthService';
import { healthConnectService } from './healthConnectService';

type IngestTrigger = 'foreground' | 'background' | 'manual' | 'system';

type HealthIngestStatus = {
    lastAttemptAt?: number;
    lastSuccessAt?: number;
    lastSnapshotAt?: number;
    lastError?: string;
    lastErrorAt?: number;
    lastTrigger?: IngestTrigger;
    lastSampleCount?: number;
    consecutiveFailures?: number;
};

const TASK_NAME = 'BACKGROUND_HEALTH_INGEST';
const STATUS_KEY = 'ls_health_ingest_status_v1';
const FOREGROUND_MIN_INTERVAL_MS = 30 * 60 * 1000;
const BACKGROUND_MIN_INTERVAL_MS = 60 * 60 * 1000;
const BACKGROUND_FETCH_MIN_INTERVAL_SEC = 30 * 60;
const RETRY_DELAY_MS = 15000;
const RETRY_MAX_ATTEMPTS = 2;

let initialized = false;
let backgroundRegistered = false;
let foregroundTimer: NodeJS.Timeout | null = null;
let appState: AppStateStatus = 'active';
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let inFlight: Promise<boolean> | null = null;

const countSnapshotMetrics = (snapshot: BioSnapshot): number => {
    const ignored = new Set(['timestamp', 'source', 'freshness']);
    let count = 0;
    for (const [key, value] of Object.entries(snapshot)) {
        if (ignored.has(key)) continue;
        if (value === undefined || value === null) continue;
        count += 1;
    }
    return count;
};

const readStatus = async (): Promise<HealthIngestStatus> => {
    return (await storage.get<HealthIngestStatus>(STATUS_KEY)) || {};
};

const writeStatus = async (patch: Partial<HealthIngestStatus>): Promise<void> => {
    const current = await readStatus();
    await storage.set(STATUS_KEY, { ...current, ...patch });
};

const delay = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

const recordSuccess = async (snapshot: BioSnapshot): Promise<void> => {
    await writeStatus({
        lastSuccessAt: Date.now(),
        lastSnapshotAt: snapshot.timestamp,
        lastSampleCount: countSnapshotMetrics(snapshot),
        lastError: undefined,
        lastErrorAt: undefined,
        consecutiveFailures: 0,
    });
    try {
        const { invalidateLLMContextCache } = require('./llmContextService');
        invalidateLLMContextCache();
    } catch (error) {
        console.warn('[HealthIngest] Failed to invalidate LLM cache:', error);
    }
};

const recordFailure = async (error: unknown): Promise<void> => {
    const status = await readStatus();
    const message = error instanceof Error ? error.message : String(error);
    await writeStatus({
        lastError: message,
        lastErrorAt: Date.now(),
        consecutiveFailures: (status.consecutiveFailures ?? 0) + 1,
    });
};

const shouldIngest = async (
    trigger: IngestTrigger,
    status: HealthIngestStatus,
    options?: { ignoreMinInterval?: boolean }
): Promise<{ allowed: boolean; minIntervalMs: number }> => {
    const hasConsent = await healthConsentService.hasConsent();
    if (!hasConsent) return { allowed: false, minIntervalMs: FOREGROUND_MIN_INTERVAL_MS };

    if (Platform.OS === 'android') {
        const available = await healthConnectService.initialize();
        if (!available) return { allowed: false, minIntervalMs: FOREGROUND_MIN_INTERVAL_MS };
        const hasPermission = await healthConnectService.hasAnyPermission();
        if (!hasPermission) return { allowed: false, minIntervalMs: FOREGROUND_MIN_INTERVAL_MS };
    }

    if (Platform.OS === 'android' && backgroundHealthService.available()) {
        const mode = await backgroundHealthService.getMode();
        if (mode === 'OFF') return { allowed: false, minIntervalMs: FOREGROUND_MIN_INTERVAL_MS };
        if (trigger === 'background' && mode === 'LIGHT') {
            return { allowed: false, minIntervalMs: BACKGROUND_MIN_INTERVAL_MS };
        }
    }

    let minIntervalMs = trigger === 'background' ? BACKGROUND_MIN_INTERVAL_MS : FOREGROUND_MIN_INTERVAL_MS;
    const backpressure = await backgroundHealthService.getBackpressureStatus();
    if (backpressure?.recommendedDelayMs) {
        minIntervalMs = Math.max(minIntervalMs, backpressure.recommendedDelayMs);
    }

    if (!options?.ignoreMinInterval && status.lastAttemptAt && Date.now() - status.lastAttemptAt < minIntervalMs) {
        return { allowed: false, minIntervalMs };
    }

    return { allowed: true, minIntervalMs };
};

const performIngest = async (trigger: IngestTrigger): Promise<boolean> => {
    if (inFlight) return inFlight;

    inFlight = (async () => {
        const status = await readStatus();
        const decision = await shouldIngest(trigger, status);
        if (!decision.allowed) return false;

        await writeStatus({ lastAttemptAt: Date.now(), lastTrigger: trigger });

        const attemptIngest = async (allowRetry = false): Promise<{ success: boolean; error?: unknown }> => {
            const guard = allowRetry
                ? await shouldIngest(trigger, await readStatus(), { ignoreMinInterval: true })
                : { allowed: true, minIntervalMs: decision.minIntervalMs };
            if (!guard.allowed) return { success: false };

            try {
                const snapshot = await bioSnapshotService.ingestSnapshot(trigger);
                if (!snapshot) return { success: false };
                await recordSuccess(snapshot);
                return { success: true };
            } catch (error) {
                await recordFailure(error);
                return { success: false, error };
            }
        };

        let result = await attemptIngest(false);
        if (result.success) return true;
        if (!result.error || trigger === 'background') return false;

        for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt += 1) {
            await delay(RETRY_DELAY_MS);
            result = await attemptIngest(true);
            if (result.success) return true;
            if (!result.error) break;
        }

        return false;
    })();

    try {
        return await inFlight;
    } finally {
        inFlight = null;
    }
};

TaskManager.defineTask(TASK_NAME, async () => {
    try {
        const didRun = await performIngest('background');
        return didRun
            ? BackgroundFetch.BackgroundFetchResult.NewData
            : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
        console.warn('[HealthIngest] Background task failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

const registerBackgroundTask = async (): Promise<void> => {
    if (backgroundRegistered) return;

    try {
        const status = await BackgroundFetch.getStatusAsync();
        if (status !== BackgroundFetch.BackgroundFetchStatus.Available) {
            console.warn('[HealthIngest] Background fetch unavailable:', status);
            return;
        }

        const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
        if (!isRegistered) {
            await BackgroundFetch.registerTaskAsync(TASK_NAME, {
                minimumInterval: BACKGROUND_FETCH_MIN_INTERVAL_SEC,
                stopOnTerminate: false,
                startOnBoot: true,
            });
        }
        backgroundRegistered = true;
    } catch (error) {
        console.warn('[HealthIngest] Failed to register background task:', error);
    }
};

const unregisterBackgroundTask = async (): Promise<void> => {
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
        if (isRegistered) {
            await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
        }
    } catch (error) {
        console.warn('[HealthIngest] Failed to unregister background task:', error);
    } finally {
        backgroundRegistered = false;
    }
};

const startForegroundLoop = () => {
    if (foregroundTimer) return;
    foregroundTimer = setInterval(() => {
        void performIngest('foreground');
    }, FOREGROUND_MIN_INTERVAL_MS);
    void performIngest('foreground');
};

const stopForegroundLoop = () => {
    if (foregroundTimer) {
        clearInterval(foregroundTimer);
        foregroundTimer = null;
    }
};

export const healthIngestService = {
    async initialize(): Promise<void> {
        if (initialized) return;
        initialized = true;
        appState = AppState.currentState || 'active';
        await bioSnapshotService.initialize();
        if (!appStateSubscription) {
            appStateSubscription = AppState.addEventListener('change', (state) => {
                appState = state;
                if (state === 'active') {
                    startForegroundLoop();
                } else {
                    stopForegroundLoop();
                }
            });
        }
    },

    async start(): Promise<void> {
        await this.initialize();
        await registerBackgroundTask();
        if (appState === 'active') {
            startForegroundLoop();
        }
    },

    async stop(): Promise<void> {
        stopForegroundLoop();
        await unregisterBackgroundTask();
    },

    async ingestNow(trigger: IngestTrigger = 'manual'): Promise<boolean> {
        return performIngest(trigger);
    },

    async getStatus(): Promise<HealthIngestStatus> {
        return readStatus();
    },
};

export default healthIngestService;
