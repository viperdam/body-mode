// Health Sync Service - Real-time health data sync with threshold detection
// Polls Google Fit / Apple Health periodically and triggers plan refinement

import { Platform, AppState, AppStateStatus } from 'react-native';
import { healthService, HealthData } from './healthService';
import storage from './storageService';
import { analytics } from './analyticsService';
import { healthConsentService } from './healthConsentService';
import { permissionManager } from './permissions/PermissionManager';

// Simple EventEmitter implementation for React Native
type EventHandler = (data: any) => void;

class SimpleEventEmitter {
    private handlers: Map<string, Set<EventHandler>> = new Map();

    on(event: string, handler: EventHandler): void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);
    }

    off(event: string, handler: EventHandler): void {
        this.handlers.get(event)?.delete(handler);
    }

    emit(event: string, data: any): void {
        this.handlers.get(event)?.forEach(handler => {
            try {
                handler(data);
            } catch (e) {
                console.error(`[EventEmitter] Handler error for ${event}:`, e);
            }
        });
    }

    removeAllListeners(): void {
        this.handlers.clear();
    }
}

// Event types for health updates
export type HealthEventType =
    | 'HEALTH_DATA_UPDATED'
    | 'BIO_SNAPSHOT_UPDATED'
    | 'STEP_GOAL_REACHED'
    | 'HIGH_ACTIVITY_DETECTED'
    | 'LOW_ACTIVITY_DETECTED'
    | 'WORKOUT_COMPLETED'
    | 'HEALTH_PERMISSION_GRANTED'
    | 'HEALTH_PERMISSION_DENIED';

export interface HealthThresholds {
    dailyStepGoal: number;
    highActivityCalories: number;
    lowActivityStepsByNoon: number;
}

export interface StoredHealthData extends HealthData {
    date: string;
    timestamp: number;
    goalReached: boolean;
}

const DEFAULT_THRESHOLDS: HealthThresholds = {
    dailyStepGoal: 10000,
    highActivityCalories: 500,
    lowActivityStepsByNoon: 3000,
};

const STORAGE_KEY_HEALTH_DATA = 'ls_health_data';
const STORAGE_KEY_HEALTH_SETTINGS = 'ls_health_settings';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_ACTIVE_MS = 2 * 60 * 1000; // 2 minutes when app is active

class HealthSyncServiceImpl {
    private eventEmitter = new SimpleEventEmitter();
    private pollInterval: NodeJS.Timeout | null = null;
    private isInitialized = false;
    private isEnabled = false;
    private thresholds: HealthThresholds = DEFAULT_THRESHOLDS;
    private lastHealthData: HealthData | null = null;
    private goalReachedToday = false;
    private appState: AppStateStatus = 'active';
    private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

    /**
     * Initialize health sync service
     */
    async initialize(): Promise<boolean> {
        if (this.isInitialized) return true;

        try {
            // Load settings
            const settings = await storage.get<{ enabled: boolean; thresholds: HealthThresholds }>(STORAGE_KEY_HEALTH_SETTINGS);
            if (settings) {
                this.isEnabled = settings.enabled;
                this.thresholds = { ...DEFAULT_THRESHOLDS, ...settings.thresholds };
            }

            // Check if already granted permission today
            const todayData = await this.getTodayHealthData();
            if (todayData) {
                this.lastHealthData = todayData;
                this.goalReachedToday = todayData.goalReached;
            }

            // Listen for app state changes
            this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

            if (this.isEnabled) {
                this.startPolling();
                try {
                    const { healthIngestService } = require('./healthIngestService');
                    await healthIngestService.start();
                } catch (error) {
                    console.warn('[HealthSync] Failed to start health ingest service:', error);
                }
            }

            this.isInitialized = true;
            console.log('[HealthSync] Initialized');
            return true;
        } catch (error) {
            analytics.logError(error instanceof Error ? error : new Error(String(error)), 'HealthSync', { action: 'initialize' });
            return false;
        }
    }

    /**
     * Request health permissions and start syncing
     */
    async enable(): Promise<boolean> {
        try {
            const hasConsent = await healthConsentService.hasConsent();
            if (!hasConsent) {
                console.warn('[HealthSync] Consent required before requesting health permissions');
                this.emit('HEALTH_PERMISSION_DENIED', { reason: 'consent_required' });
                return false;
            }

            let granted = false;

            if (Platform.OS === 'android') {
                // HealthService handles Health Connect first, then falls back to Google Fit.
                granted = await healthService.requestPermissions();
            } else {
                granted = await healthService.requestPermissions();
            }

            if (granted) {
                this.isEnabled = true;
                await this.saveSettings();
                this.startPolling();
                this.emit('HEALTH_PERMISSION_GRANTED', {});
                console.log('[HealthSync] Enabled and polling started');
                try {
                    const { healthIngestService } = require('./healthIngestService');
                    await healthIngestService.start();
                } catch (error) {
                    console.warn('[HealthSync] Failed to start health ingest service:', error);
                }
                if (Platform.OS === 'android') {
                    const preferred = await healthService.getPreferredProvider();
                    if (preferred !== 'googleFit') {
                        try {
                            const { healthConnectService } = require('./healthConnectService');
                            const hasAny = await healthConnectService.hasAnyPermission(true);
                            if (hasAny) {
                                await healthService.setPreferredProvider('healthConnect');
                            }
                        } catch (e) {
                            console.warn('[HealthSync] Failed to persist Health Connect provider:', e);
                        }
                        await permissionManager.checkPermission('healthConnect');
                    }
                }
                return true;
            } else {
                this.emit('HEALTH_PERMISSION_DENIED', {});
                console.log('[HealthSync] Permission denied');
                return false;
            }
        } catch (error) {
            analytics.logError(error instanceof Error ? error : new Error(String(error)), 'HealthSync', { action: 'enable' });
            return false;
        }
    }

    /**
     * Disable health sync
     */
    async disable(): Promise<void> {
        this.isEnabled = false;
        this.stopPolling();
        await this.saveSettings();
        try {
            const { healthIngestService } = require('./healthIngestService');
            await healthIngestService.stop();
        } catch (error) {
            console.warn('[HealthSync] Failed to stop health ingest service:', error);
        }
        console.log('[HealthSync] Disabled');
    }

    /**
     * Start polling for health data
     */
    startPolling(): void {
        if (this.pollInterval) return;
        if (!this.isEnabled) return;

        const interval = this.appState === 'active' ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_MS;

        // Immediate fetch
        this.fetchAndProcessHealthData();

        // Set up interval
        this.pollInterval = setInterval(() => {
            this.fetchAndProcessHealthData();
        }, interval);

        console.log(`[HealthSync] Polling started (interval: ${interval / 1000}s)`);
    }

    /**
     * Stop polling
     */
    stopPolling(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            console.log('[HealthSync] Polling stopped');
        }
    }

    /**
     * Fetch health data and check thresholds
     */
    async fetchAndProcessHealthData(): Promise<HealthData | null> {
        if (!this.isEnabled) return null;

        try {
            if (Platform.OS === 'android') {
                try {
                    const preferred = await healthService.getPreferredProvider();
                    if (preferred !== 'googleFit') {
                        const { healthConnectService } = require('./healthConnectService');
                        const hcAvailable = await healthConnectService.initialize();
                        if (hcAvailable && !(await healthConnectService.hasAnyPermission())) {
                            console.warn('[HealthSync] Health Connect permissions missing, disabling sync');
                            this.emit('HEALTH_PERMISSION_DENIED', { reason: 'health_connect_missing' });
                            await this.disable();
                            return null;
                        }
                    }
                } catch (e) {
                    console.warn('[HealthSync] Health Connect permission check failed:', e);
                }
            }

            const data = await healthService.getDailySummary();

            if (!data || (data.steps === 0 && data.calories === 0)) {
                return null; // No data available
            }

            // Store the data
            await this.storeHealthData(data);

            // Check thresholds and emit events
            this.checkThresholds(data);

            // Emit general update
            this.emit('HEALTH_DATA_UPDATED', data);

            // Also refresh bio snapshot
            try {
                const { bioSnapshotService } = require('./bioSnapshotService');
                const snapshot = await bioSnapshotService.getSnapshot();
                if (snapshot.freshness !== 'stale' && snapshot.source !== 'fallback') {
                    this.emit('BIO_SNAPSHOT_UPDATED', snapshot);
                }
            } catch (e) {
                console.warn('[HealthSync] Bio snapshot refresh failed:', e);
            }

            this.lastHealthData = data;
            return data;
        } catch (error) {
            console.error('[HealthSync] Fetch error:', error);
            return null;
        }
    }

    /**
     * Check if any thresholds are crossed
     */
    private checkThresholds(data: HealthData): void {
        const now = new Date();
        const hour = now.getHours();

        // Step goal reached
        if (!this.goalReachedToday && data.steps >= this.thresholds.dailyStepGoal) {
            this.goalReachedToday = true;
            this.emit('STEP_GOAL_REACHED', { steps: data.steps, goal: this.thresholds.dailyStepGoal });
            console.log(`[HealthSync] Step goal reached! ${data.steps} / ${this.thresholds.dailyStepGoal}`);
        }

        // High activity detected
        if (data.calories >= this.thresholds.highActivityCalories) {
            this.emit('HIGH_ACTIVITY_DETECTED', { calories: data.calories, threshold: this.thresholds.highActivityCalories });
        }

        // Low activity by noon
        if (hour >= 12 && hour < 13 && data.steps < this.thresholds.lowActivityStepsByNoon) {
            this.emit('LOW_ACTIVITY_DETECTED', { steps: data.steps, expected: this.thresholds.lowActivityStepsByNoon });
        }
    }

    /**
     * Store health data for the day
     */
    private async storeHealthData(data: HealthData): Promise<void> {
        const today = new Date().toISOString().split('T')[0];
        const storedData: StoredHealthData = {
            ...data,
            date: today,
            timestamp: Date.now(),
            goalReached: this.goalReachedToday || data.steps >= this.thresholds.dailyStepGoal,
        };
        await storage.set(`${STORAGE_KEY_HEALTH_DATA}_${today}`, storedData);
    }

    /**
     * Get today's health data from storage
     */
    async getTodayHealthData(): Promise<StoredHealthData | null> {
        const today = new Date().toISOString().split('T')[0];
        return storage.get<StoredHealthData>(`${STORAGE_KEY_HEALTH_DATA}_${today}`);
    }

    /**
     * Get health data for a specific date
     */
    async getHealthDataForDate(date: string): Promise<StoredHealthData | null> {
        return storage.get<StoredHealthData>(`${STORAGE_KEY_HEALTH_DATA}_${date}`);
    }

    /**
     * Get last N days of health data
     */
    async getHealthHistory(days: number = 7): Promise<StoredHealthData[]> {
        const history: StoredHealthData[] = [];
        const today = new Date();

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            const data = await storage.get<StoredHealthData>(`${STORAGE_KEY_HEALTH_DATA}_${dateKey}`);
            if (data) {
                history.push(data);
            }
        }

        return history;
    }

    /**
     * Update thresholds
     */
    async setThresholds(thresholds: Partial<HealthThresholds>): Promise<void> {
        this.thresholds = { ...this.thresholds, ...thresholds };
        await this.saveSettings();
    }

    /**
     * Get current thresholds
     */
    getThresholds(): HealthThresholds {
        return { ...this.thresholds };
    }

    /**
     * Get current health data
     */
    getCurrentHealthData(): HealthData | null {
        return this.lastHealthData;
    }

    /**
     * Check if enabled
     */
    isHealthSyncEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Subscribe to health events
     */
    on(event: HealthEventType, listener: (data: any) => void): void {
        this.eventEmitter.on(event, listener);
    }

    /**
     * Unsubscribe from health events
     */
    off(event: HealthEventType, listener: (data: any) => void): void {
        this.eventEmitter.off(event, listener);
    }

    /**
     * Emit event
     */
    private emit(event: HealthEventType, data: any): void {
        this.eventEmitter.emit(event, data);
    }

    /**
     * Handle app state changes
     */
    private handleAppStateChange = (nextState: AppStateStatus): void => {
        const wasActive = this.appState === 'active';
        const isActive = nextState === 'active';

        if (!wasActive && isActive && this.isEnabled) {
            // App came to foreground - poll immediately and restart with faster interval
            console.log('[HealthSync] App became active, refreshing data');
            this.stopPolling();
            this.startPolling();
        } else if (wasActive && !isActive) {
            // App went to background - slow down polling
            this.stopPolling();
            if (this.isEnabled) {
                this.pollInterval = setInterval(() => {
                    this.fetchAndProcessHealthData();
                }, POLL_INTERVAL_MS);
            }
        }

        this.appState = nextState;
    };

    /**
     * Save settings to storage
     */
    private async saveSettings(): Promise<void> {
        await storage.set(STORAGE_KEY_HEALTH_SETTINGS, {
            enabled: this.isEnabled,
            thresholds: this.thresholds,
        });
    }

    /**
     * Reset goal reached flag (call at midnight)
     */
    resetDailyGoal(): void {
        this.goalReachedToday = false;
    }

    /**
     * Cleanup
     */
    cleanup(): void {
        this.stopPolling();
        this.appStateSubscription?.remove();
        this.appStateSubscription = null;
    }
}

export const healthSyncService = new HealthSyncServiceImpl();
export default healthSyncService;
