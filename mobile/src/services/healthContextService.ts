import { Platform } from 'react-native';
import healthSyncService from './healthSyncService';
import { healthService } from './healthService';
import { HealthContextData, BioSnapshot, BioTrend } from '../types';
import { bioSnapshotService } from './bioSnapshotService';
import { computeBioTrends } from './bioAlgorithms';

export const getHealthContextData = async (): Promise<HealthContextData | undefined> => {
    try {
        await healthSyncService.initialize();
        if (!healthSyncService.isHealthSyncEnabled()) return undefined;

        const stored = await healthSyncService.getTodayHealthData();
        let daily = stored;

        if (!daily && healthService.isInitialized()) {
            const live = await healthService.getDailySummary();
            if (live && (live.steps > 0 || live.distance > 0 || live.calories > 0)) {
                daily = {
                    ...live,
                    date: new Date().toISOString().split('T')[0],
                    timestamp: Date.now(),
                    goalReached: false,
                };
            }
        }

        if (!daily) return undefined;

        let sleepMinutes: number | undefined;
        let sleepQuality: string | undefined;
        let latestWeight: number | undefined;
        let heartRateBpm: number | undefined;

        if (healthService.isInitialized()) {
            const [sleep, weight, heartRate] = await Promise.all([
                healthService.getLastNightSleep(),
                healthService.getLatestWeight(),
                healthService.getHeartRate(),
            ]);
            sleepMinutes = sleep?.durationMinutes;
            sleepQuality = sleep?.quality;
            latestWeight = weight?.weight;
            heartRateBpm = heartRate?.bpm;
        }

        const steps = Number.isFinite(daily.steps) ? daily.steps : 0;
        const distance = Number.isFinite(daily.distance) ? daily.distance : 0;
        const calories = Number.isFinite(daily.calories) ? daily.calories : 0;

        // Get bio snapshot
        let bioSnapshot: BioSnapshot | undefined;
        try {
            const snap = await bioSnapshotService.getSnapshot();
            if (snap.source !== 'fallback') {
                bioSnapshot = snap;
            }
        } catch (e) {
            console.warn('[HealthContext] Bio snapshot unavailable:', e);
        }

        let source: HealthContextData['source'] = 'unknown';
        if (Platform.OS === 'ios') {
            source = 'apple_health';
        } else if (Platform.OS === 'android') {
            source = 'google_fit';
            try {
                const { healthConnectService } = require('./healthConnectService');
                if (healthConnectService.isAvailable() && await healthConnectService.hasAnyPermission()) {
                    source = 'health_connect';
                }
            } catch (e) {
                // keep google_fit fallback
            }
        }

        return {
            steps,
            distance,
            calories,
            sleepMinutes,
            sleepQuality,
            latestWeight,
            heartRateBpm,
            source,
            updatedAt: daily.timestamp || Date.now(),
            bioSnapshot,
        };
    } catch (error) {
        console.warn('[HealthContext] Failed to build health context:', error);
        return undefined;
    }
};

export const getBioContextForAppContext = async (): Promise<{
    bioSnapshot?: BioSnapshot;
    bioTrends?: BioTrend[];
    bioHistorySummary?: string;
}> => {
    try {
        await bioSnapshotService.initialize();
        const config = bioSnapshotService.getConfig();
        if (!config.shareWithAI) return {};

        const snap = await bioSnapshotService.getSnapshot();
        if (snap.source === 'fallback') return {};

        let bioTrends: BioTrend[] | undefined;
        let bioHistorySummary: string | undefined;
        try {
            const history = await bioSnapshotService.getHistoryForAI(7);
            if (history.length > 0) {
                bioTrends = computeBioTrends(history);
            }
        } catch (e) {
            console.warn('[HealthContext] Failed to compute bio trends:', e);
        }

        try {
            bioHistorySummary = await bioSnapshotService.getRollupSummary(7);
        } catch (e) {
            console.warn('[HealthContext] Failed to build bio rollup summary:', e);
        }

        return { bioSnapshot: snap, bioTrends, bioHistorySummary };
    } catch (error) {
        console.warn('[HealthContext] Failed to build bio context:', error);
        return {};
    }
};

export default {
    getHealthContextData,
    getBioContextForAppContext,
};
