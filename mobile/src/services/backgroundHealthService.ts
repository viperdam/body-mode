/**
 * Background Health Service
 * 
 * TypeScript interface to native BackgroundHealthBridge.
 * Provides mode control, health monitoring, and diagnostics.
 */

import { NativeModules, Platform } from 'react-native';
import type { SleepEvent } from '../types';

const { BackgroundHealthBridge } = NativeModules;

export type BackgroundMode = 'OFF' | 'LIGHT' | 'FULL';
export type BackpressureLevel = 'NONE' | 'LIGHT' | 'MODERATE' | 'SEVERE';

export interface BackgroundHealthStatus {
    // Mode info
    mode: BackgroundMode;
    pendingActionCount: number;
    lastReconcileTime: number;
    lastReconcileResult: string;
    scheduledAlarmCount: number;
    scheduledOverlayCount: number;

    // System state
    batteryLevel: number;
    isCharging: boolean;
    isPowerSaveMode: boolean;
    isDozeMode: boolean;
    backpressureLevel: BackpressureLevel;

    // Audio state
    audioMode: string;
    isInCall: boolean;
    canPlayAlarm: boolean;

    // Permissions
    batteryOptimizationDisabled?: boolean;
    overlayPermissionGranted?: boolean;
    exactAlarmPermissionGranted?: boolean;
}

export interface BackpressureStatus {
    batteryLevel: number;
    isCharging: boolean;
    isPowerSaveMode: boolean;
    isDozeMode: boolean;
    backpressureLevel: BackpressureLevel;
    recommendedDelayMs: number;
}

export interface BackgroundHealthDiagnostics {
    backgroundMode: string;
    currentPlan: string;
    sleepSettings: string;
    overlaySettings: string;
    pendingEvents: string;
    pendingSleepEvents: string;
    sleepState: string;
    currentUserActivity: string;
    lastInteractionTimestamp: number;
    sleepBootPending: boolean;
    sleepBootTime: number;
    activityUpdateType: string;
    activityUpdateConfidence: number;
    activityUpdateTime: number;
    activityStillSequenceStart: number;
    activityActiveSequenceStart: number;
    contextState: string;
    contextLocationLabel: string;
    contextUpdatedAt: number;
    lastOrientationChangeTimestamp: number;
    orientationStable: boolean;
    sleepContext: string;
}

/**
 * Background Health Service - controls and monitors background features
 */
export const backgroundHealthService = {
    /**
     * Check if the native bridge is available
     */
    available(): boolean {
        return Platform.OS === 'android' && !!BackgroundHealthBridge;
    },

    /**
     * Get current background mode
     */
    async getMode(): Promise<BackgroundMode> {
        if (!this.available()) return 'FULL';

        try {
            const mode = await BackgroundHealthBridge.getMode();
            return mode as BackgroundMode;
        } catch (error) {
            console.warn('[BackgroundHealth] Failed to get mode:', error);
            return 'FULL';
        }
    },

    /**
     * Set background mode
     * - OFF: All background features disabled
     * - LIGHT: Notifications only, no overlays
     * - FULL: All features enabled
     */
    async setMode(mode: BackgroundMode): Promise<boolean> {
        if (!this.available()) return false;

        try {
            await BackgroundHealthBridge.setMode(mode);
            console.log('[BackgroundHealth] Mode set to:', mode);
            return true;
        } catch (error) {
            console.error('[BackgroundHealth] Failed to set mode:', error);
            return false;
        }
    },

    /**
     * Emergency stop - disable all background features immediately
     * Use when user reports issues or app is misbehaving
     */
    async emergencyStop(): Promise<boolean> {
        if (!this.available()) return false;

        try {
            await BackgroundHealthBridge.emergencyStop();
            console.warn('[BackgroundHealth] EMERGENCY STOP executed');
            return true;
        } catch (error) {
            console.error('[BackgroundHealth] Emergency stop failed:', error);
            return false;
        }
    },

    /**
     * Get comprehensive health status
     */
    async getHealthStatus(): Promise<BackgroundHealthStatus | null> {
        if (!this.available()) return null;

        try {
            const status = await BackgroundHealthBridge.getHealthStatus();
            return status as BackgroundHealthStatus;
        } catch (error) {
            console.warn('[BackgroundHealth] Failed to get health status:', error);
            return null;
        }
    },

    /**
     * Get backpressure status for work scheduling decisions
     */
    async getBackpressureStatus(): Promise<BackpressureStatus | null> {
        if (!this.available()) return null;

        try {
            const status = await BackgroundHealthBridge.getBackpressureStatus();
            return status as BackpressureStatus;
        } catch (error) {
            console.warn('[BackgroundHealth] Failed to get backpressure status:', error);
            return null;
        }
    },

    /**
     * Get native diagnostics (raw shared preference state).
     */
    async getDiagnostics(): Promise<BackgroundHealthDiagnostics | null> {
        if (!this.available() || !BackgroundHealthBridge?.getDiagnostics) return null;

        try {
            const result = await BackgroundHealthBridge.getDiagnostics();
            if (!result || typeof result !== 'object') return null;
            return {
                backgroundMode: String(result.backgroundMode || 'UNKNOWN'),
                currentPlan: String(result.currentPlan || ''),
                sleepSettings: String(result.sleepSettings || ''),
                overlaySettings: String(result.overlaySettings || ''),
                pendingEvents: String(result.pendingEvents || '[]'),
                pendingSleepEvents: String(result.pendingSleepEvents || '[]'),
                sleepState: String(result.sleepState || 'AWAKE'),
                currentUserActivity: String(result.currentUserActivity || 'UNKNOWN'),
                lastInteractionTimestamp:
                    typeof result.lastInteractionTimestamp === 'number' ? result.lastInteractionTimestamp : 0,
                sleepBootPending: Boolean(result.sleepBootPending),
                sleepBootTime: typeof result.sleepBootTime === 'number' ? result.sleepBootTime : 0,
                activityUpdateType: String(result.activityUpdateType || 'UNKNOWN'),
                activityUpdateConfidence:
                    typeof result.activityUpdateConfidence === 'number' ? result.activityUpdateConfidence : 0,
                activityUpdateTime: typeof result.activityUpdateTime === 'number' ? result.activityUpdateTime : 0,
                activityStillSequenceStart:
                    typeof result.activityStillSequenceStart === 'number' ? result.activityStillSequenceStart : 0,
                activityActiveSequenceStart:
                    typeof result.activityActiveSequenceStart === 'number' ? result.activityActiveSequenceStart : 0,
                contextState: String(result.contextState || 'unknown'),
                contextLocationLabel: String(result.contextLocationLabel || ''),
                contextUpdatedAt: typeof result.contextUpdatedAt === 'number' ? result.contextUpdatedAt : 0,
                lastOrientationChangeTimestamp:
                    typeof result.lastOrientationChangeTimestamp === 'number'
                        ? result.lastOrientationChangeTimestamp
                        : 0,
                orientationStable: Boolean(result.orientationStable),
                sleepContext: String(result.sleepContext || ''),
            };
        } catch (error) {
            console.warn('[BackgroundHealth] Failed to get diagnostics:', error);
            return null;
        }
    },

    /**
     * Get current user activity state from native activity recognition.
     */
    async getCurrentUserActivity(): Promise<{
        activity: string;
        lastStillTimestamp?: number;
        lastActiveTimestamp?: number;
        chargerConnected?: boolean;
    } | null> {
        if (!this.available() || !BackgroundHealthBridge?.getCurrentUserActivity) return null;

        try {
            const result = await BackgroundHealthBridge.getCurrentUserActivity();
            if (!result || typeof result !== 'object') return null;
            return {
                activity: String(result.activity || 'UNKNOWN'),
                lastStillTimestamp:
                    typeof result.lastStillTimestamp === 'number' ? result.lastStillTimestamp : undefined,
                lastActiveTimestamp:
                    typeof result.lastActiveTimestamp === 'number' ? result.lastActiveTimestamp : undefined,
                chargerConnected:
                    typeof result.chargerConnected === 'boolean' ? result.chargerConnected : undefined,
            };
        } catch (error) {
            console.warn('[BackgroundHealth] Failed to get current user activity:', error);
            return null;
        }
    },

    /**
     * Check if alarm audio can be played (VoIP/call detection)
     */
    async canPlayAlarmAudio(): Promise<boolean> {
        if (!this.available()) return true;

        try {
            return await BackgroundHealthBridge.canPlayAlarmAudio();
        } catch (error) {
            console.warn('[BackgroundHealth] Failed to check audio state:', error);
            return true; // Default to allowing audio
        }
    },

    /**
     * Get human-readable mode description
     */
    getModeDescription(mode: BackgroundMode): string {
        switch (mode) {
            case 'OFF':
                return 'All background features disabled. No reminders will be shown.';
            case 'LIGHT':
                return 'Notifications only. Overlays and sleep detection disabled.';
            case 'FULL':
                return 'All features enabled including overlays and sleep detection.';
        }
    },

    /**
     * Get backpressure level description
     */
    getBackpressureDescription(level: BackpressureLevel): string {
        switch (level) {
            case 'NONE':
                return 'Normal operation';
            case 'LIGHT':
                return 'Reduced background activity';
            case 'MODERATE':
                return 'Critical operations only';
            case 'SEVERE':
                return 'Emergency operations only';
        }
    },
};

// ============ Sleep Event Handling ============
export type { SleepEvent };

/**
 * Get pending sleep events from native (stored when app was closed)
 */
export const getPendingSleepEvents = async (): Promise<SleepEvent[]> => {
    if (!backgroundHealthService.available()) return [];

    try {
        const eventsJson = await BackgroundHealthBridge.getPendingSleepEvents();
        return JSON.parse(eventsJson || '[]');
    } catch (error) {
        console.warn('[BackgroundHealth] Failed to get pending sleep events:', error);
        return [];
    }
};

/**
 * Clear pending sleep events after processing
 */
export const clearPendingSleepEvents = async (): Promise<boolean> => {
    if (!backgroundHealthService.available()) return false;

    try {
        await BackgroundHealthBridge.clearPendingSleepEvents();
        return true;
    } catch (error) {
        console.warn('[BackgroundHealth] Failed to clear sleep events:', error);
        return false;
    }
};

/**
 * Sync sleep settings to native SharedPreferences
 */
export const syncSleepSettings = async (settings: {
    enabled: boolean;
    anytimeMode?: boolean;
    requireCharging?: boolean;
}): Promise<boolean> => {
    if (!backgroundHealthService.available()) return false;

    try {
        await BackgroundHealthBridge.syncSleepSettings(JSON.stringify(settings));
        console.log('[BackgroundHealth] Sleep settings synced to native');
        return true;
    } catch (error) {
        console.warn('[BackgroundHealth] Failed to sync sleep settings:', error);
        return false;
    }
};

/**
 * Process pending sleep events on app launch
 * Call this from App.tsx or DashboardScreen on mount
 */
export const processPendingSleepEvents = async (
    onSleepDetected?: () => void,
    onWakeDetected?: () => void
): Promise<{ processed: number }> => {
    const events = await getPendingSleepEvents();

    if (events.length === 0) {
        return { processed: 0 };
    }

    console.log(`[BackgroundHealth] Processing ${events.length} pending sleep events`);

    for (const event of events) {
        if (event.type === 'SLEEP_DETECTED' && onSleepDetected) {
            onSleepDetected();
        } else if (event.type === 'WAKE_DETECTED' && onWakeDetected) {
            onWakeDetected();
        }
    }

    // Clear after processing
    await clearPendingSleepEvents();

    return { processed: events.length };
};

export default backgroundHealthService;
