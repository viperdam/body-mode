// BioSnapshot Service - Unified bio data facade with caching & freshness
// Platform-agnostic: uses Health Connect (Android) or HealthKit (iOS)

import { Platform } from 'react-native';
import type { BioSnapshot, BioContextConfig, BioDailyRollup } from '../types';
import { DEFAULT_BIO_CONTEXT_CONFIG } from '../types';
import {
    formatBloodGlucoseMgDl,
    formatDistanceMeters,
    formatHydrationMl,
    formatWeightKg,
} from '../utils/unitFormat';
import { healthService } from './healthService';
import { healthConnectService } from './healthConnectService';
import storage from './storageService';
import { healthConsentService } from './healthConsentService';
import { bioTrendsAccessService } from './bioTrendsAccessService';

const STORAGE_KEY_BIO_SNAPSHOT = '@bio_snapshot';
const STORAGE_KEY_BIO_CONFIG = '@bio_config';
const STORAGE_KEY_BIO_HISTORY = '@bio_history';
const STORAGE_KEY_BIO_ROLLUP = '@bio_rollup';

// Freshness thresholds
const LIVE_THRESHOLD_MS = 30 * 60 * 1000;       // 30 minutes
const CACHED_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const STALE_TTL_MS = 24 * 60 * 60 * 1000;       // 24 hours max offline
const DEBOUNCE_MS = 30 * 1000;                   // 30 seconds between fetches
const MAX_HISTORY_PER_DAY = 48;                  // One per 30min
const MAX_TREND_DAYS = 7;
const MAX_ROLLUP_DAYS = 90;

const ROLLUP_FIELDS: Array<keyof BioSnapshot> = [
    'steps',
    'distanceMeters',
    'activeCalories',
    'sleepScore',
    'hrv',
    'restingHR',
    'currentHR',
    'spo2',
    'bodyTemp',
    'basalBodyTemp',
    'respiratoryRate',
    'vo2Max',
    'bloodGlucoseMgDl',
    'basalMetabolicRateKcal',
    'bodyWeightKg',
    'bodyFatPct',
    'hydrationMl',
    'nutritionKcal',
    'nutritionCarbsG',
    'nutritionProteinG',
    'nutritionFatG',
    'exerciseMinutes24h',
    'stressIndex',
    'readinessScore',
];

const TOTAL_FIELDS: Array<keyof BioSnapshot> = [
    'steps',
    'distanceMeters',
    'activeCalories',
    'hydrationMl',
    'nutritionKcal',
    'nutritionCarbsG',
    'nutritionProteinG',
    'nutritionFatG',
    'exerciseMinutes24h',
];

type RollupField = (typeof ROLLUP_FIELDS)[number];
type TotalField = (typeof TOTAL_FIELDS)[number];

class BioSnapshotServiceImpl {
    private config: BioContextConfig = DEFAULT_BIO_CONTEXT_CONFIG;
    private lastSnapshot: BioSnapshot | null = null;
    private initialized = false;
    private lastFetchTime = 0;

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // Load config
            const savedConfig = await storage.get<BioContextConfig>(STORAGE_KEY_BIO_CONFIG);
            if (savedConfig) {
                this.config = { ...DEFAULT_BIO_CONTEXT_CONFIG, ...savedConfig };
            }

            // Load cached snapshot
            const cached = await storage.get<BioSnapshot>(STORAGE_KEY_BIO_SNAPSHOT);
            if (cached) {
                this.lastSnapshot = cached;
            }

            // Initialize platform health service
            if (Platform.OS === 'android') {
                await healthConnectService.initialize();
            }

            await this.cleanupHistory(this.config.dataRetentionDays);

            this.initialized = true;
            console.log('[BioSnapshot] Initialized');
        } catch (e) {
            console.error('[BioSnapshot] Initialization failed:', e);
            this.initialized = true; // Continue with defaults
        }
    }

    async getSnapshot(options: { force?: boolean; ignoreDebounce?: boolean } = {}): Promise<BioSnapshot> {
        await this.initialize();
        const forceFetch = !!options.force;
        const ignoreDebounce = !!options.ignoreDebounce || forceFetch;

        const hasConsent = await healthConsentService.hasConsent();
        if (!hasConsent) {
            return this.buildFallbackSnapshot();
        }

        // Check if cached snapshot is still live
        if (!forceFetch && this.lastSnapshot) {
            const age = Date.now() - this.lastSnapshot.timestamp;
            if (age < LIVE_THRESHOLD_MS) {
                return this.applyPremiumGate(this.lastSnapshot);
            }
        }

        if (Platform.OS === 'android' && healthConnectService.isAvailable()) {
            const hasPermission = await healthConnectService.hasAnyPermission();
            if (!hasPermission) {
                this.lastFetchTime = Date.now();
                if (this.lastSnapshot) {
                    const age = Date.now() - this.lastSnapshot.timestamp;
                    return {
                        ...this.applyPremiumGate(this.lastSnapshot),
                        freshness: age < CACHED_THRESHOLD_MS ? 'cached' : 'stale',
                    };
                }
                return this.applyPremiumGate(this.buildFallbackSnapshot());
            }
        }

        // Debounce: don't fetch more than once per 30s
        if (!ignoreDebounce && Date.now() - this.lastFetchTime < DEBOUNCE_MS && this.lastSnapshot) {
            return this.applyPremiumGate(this.lastSnapshot);
        }

        // Try to fetch fresh data
        try {
            const fresh = await this.fetchFreshSnapshot();
            if (fresh) {
                this.lastSnapshot = fresh;
                this.lastFetchTime = Date.now();
                await storage.set(STORAGE_KEY_BIO_SNAPSHOT, fresh);
                await this.appendToHistory(fresh);
                return this.applyPremiumGate(fresh);
            }
        } catch (e) {
            this.lastFetchTime = Date.now();
            console.warn('[BioSnapshot] Fetch failed, using cached:', e);
        }

        // Return cached with updated freshness
        if (this.lastSnapshot) {
            const age = Date.now() - this.lastSnapshot.timestamp;
            if (age > STALE_TTL_MS) {
                return this.applyPremiumGate(this.buildFallbackSnapshot());
            }
            return {
                ...this.applyPremiumGate(this.lastSnapshot),
                freshness: age < CACHED_THRESHOLD_MS ? 'cached' : 'stale',
            };
        }

        return this.applyPremiumGate(this.buildFallbackSnapshot());
    }

    async ingestSnapshot(trigger: 'foreground' | 'background' | 'manual' | 'system' = 'manual'): Promise<BioSnapshot | null> {
        await this.initialize();

        const hasConsent = await healthConsentService.hasConsent();
        if (!hasConsent) return null;

        if (Platform.OS === 'android' && healthConnectService.isAvailable()) {
            const hasPermission = await healthConnectService.hasAnyPermission();
            if (!hasPermission) return null;
        }

        try {
            const fresh = await this.fetchFreshSnapshot();
            if (!fresh) return null;

            this.lastSnapshot = fresh;
            this.lastFetchTime = Date.now();
            await storage.set(STORAGE_KEY_BIO_SNAPSHOT, fresh);
            await this.appendToHistory(fresh);
            console.log(`[BioSnapshot] Ingested (${trigger})`);
            return this.applyPremiumGate(fresh);
        } catch (e) {
            console.warn(`[BioSnapshot] Ingest failed (${trigger}):`, e);
            return null;
        }
    }

    private async fetchFreshSnapshot(): Promise<BioSnapshot | null> {
        let hrv: number | undefined;
        let restingHR: number | undefined;
        let spo2: number | undefined;
        let bodyTemp: number | undefined;
        let basalBodyTemp: number | undefined;
        let respiratoryRate: number | undefined;
        let vo2Max: number | undefined;
        let bloodGlucoseMgDl: number | undefined;
        let basalMetabolicRateKcal: number | undefined;
        let bodyWeightKg: number | undefined;
        let bodyFatPct: number | undefined;
        let hydrationMl: number | undefined;
        let nutritionKcal: number | undefined;
        let nutritionCarbsG: number | undefined;
        let nutritionProteinG: number | undefined;
        let nutritionFatG: number | undefined;
        let exerciseMinutes24h: number | undefined;
        let lastExerciseType: number | undefined;
        let menstruationFlow: number | undefined;
        let menstruationActive: boolean | undefined;
        let steps: number | undefined;
        let distanceMeters: number | undefined;
        let activeCalories: number | undefined;
        let currentHR: number | undefined;
        let sleepScore: number | undefined;
        let source: BioSnapshot['source'];
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        try {
            const { errorRecoveryService } = require('./errorRecoveryService');
            const breakerSource = Platform.OS === 'android' ? 'health_connect' : 'apple_health';
            if (await errorRecoveryService.isHealthCircuitOpen(breakerSource)) {
                console.log('[BioSnapshot] Health circuit breaker open, skipping fresh fetch');
                return null;
            }
        } catch {
            // ignore breaker failures
        }

        try {
            if (Platform.OS === 'android' && healthConnectService.isAvailable()) {
                source = 'health_connect';
                const metrics = await healthConnectService.readAllBioMetrics();
                if (this.config.enableHRV) hrv = metrics.hrv ?? undefined;
                if (this.config.enableRestingHR) restingHR = metrics.restingHR ?? undefined;
                if (this.config.enableSpO2) spo2 = metrics.spo2 ?? undefined;
                if (this.config.enableBodyTemp) bodyTemp = metrics.bodyTemp ?? undefined;
                if (this.config.enableBasalBodyTemp) basalBodyTemp = metrics.basalBodyTemp ?? undefined;
                if (this.config.enableRespiratoryRate) respiratoryRate = metrics.respiratoryRate ?? undefined;
                if (this.config.enableVo2Max) vo2Max = metrics.vo2Max ?? undefined;
                if (this.config.enableBloodGlucose) bloodGlucoseMgDl = metrics.bloodGlucoseMgDl ?? undefined;
                if (this.config.enableBasalMetabolicRate) basalMetabolicRateKcal = metrics.basalMetabolicRateKcal ?? undefined;
                if (this.config.enableBodyWeight) bodyWeightKg = metrics.bodyWeightKg ?? undefined;
                if (this.config.enableBodyFat) bodyFatPct = metrics.bodyFatPct ?? undefined;
                if (this.config.enableHydration) hydrationMl = metrics.hydrationMl ?? undefined;
                if (this.config.enableNutrition) {
                    nutritionKcal = metrics.nutritionKcal ?? undefined;
                    nutritionCarbsG = metrics.nutritionCarbsG ?? undefined;
                    nutritionProteinG = metrics.nutritionProteinG ?? undefined;
                    nutritionFatG = metrics.nutritionFatG ?? undefined;
                }
                if (this.config.enableExerciseSessions) {
                    exerciseMinutes24h = metrics.exerciseMinutes24h ?? undefined;
                    lastExerciseType = metrics.lastExerciseType ?? undefined;
                }
                if (this.config.enableMenstruation) {
                    menstruationFlow = metrics.menstruationFlow ?? undefined;
                    menstruationActive = metrics.menstruationActive;
                }
                if (this.config.enableSteps) steps = metrics.steps ?? undefined;
                if (this.config.enableDistance) distanceMeters = metrics.distanceMeters ?? undefined;
                if (this.config.enableActiveCalories) activeCalories = metrics.activeCalories ?? undefined;
                if (this.config.enableCurrentHR) currentHR = metrics.currentHR ?? undefined;
            } else if (Platform.OS === 'ios' && healthService.isInitialized()) {
                source = 'apple_health';
                const metrics = await healthService.getBioMetrics();
                if (this.config.enableHRV) hrv = metrics.hrv ?? undefined;
                if (this.config.enableRestingHR) restingHR = metrics.restingHR ?? undefined;
                if (this.config.enableSpO2) spo2 = metrics.spo2 ?? undefined;
                if (this.config.enableCurrentHR) currentHR = metrics.heartRate ?? undefined;
            } else if (Platform.OS === 'android' && healthService.isInitialized()) {
                // Fallback to Google Fit (limited bio data)
                source = 'google_fit';
                const hr = await healthService.getHeartRate();
                if (hr) restingHR = hr.bpm;
                if (this.config.enableCurrentHR) currentHR = hr?.bpm ?? undefined;
            } else {
                return null;
            }
        } catch (e) {
            try {
                const { errorRecoveryService } = require('./errorRecoveryService');
                const breakerSource = Platform.OS === 'android' ? 'health_connect' : 'apple_health';
                await errorRecoveryService.recordHealthFailure(breakerSource);
            } catch {}
            throw e;
        }

        if (this.config.enableSleepStages && Platform.OS === 'android' && healthConnectService.isAvailable()) {
            try {
                const stages = await healthConnectService.readSleepStages(dayAgo, now);
                const stageScore = this.computeSleepScoreFromStages(stages);
                if (stageScore !== undefined) {
                    sleepScore = stageScore;
                }
            } catch (e) {
                console.warn('[BioSnapshot] Failed to compute sleep score from stages:', e);
            }
        }

        if (this.config.enableSleepStages && sleepScore === undefined) {
            try {
                const { sleepSessionService } = require('./sleepSessionService');
                const lastNight = await sleepSessionService.getLastNightSleep();
                const nightSessions = lastNight?.sessions?.filter((s: any) => s.type === 'night') || [];
                if (nightSessions.length > 0) {
                    const longest = [...nightSessions].sort((a: any, b: any) => b.durationHours - a.durationHours)[0];
                    if (longest) {
                        sleepScore = await sleepSessionService.computeSleepScore(longest);
                    }
                }
            } catch (e) {
                console.warn('[BioSnapshot] Failed to compute sleep score:', e);
            }
        }

        // If we got no data at all, return null
        if (
            !hrv &&
            !restingHR &&
            !spo2 &&
            !bodyTemp &&
            basalBodyTemp === undefined &&
            respiratoryRate === undefined &&
            vo2Max === undefined &&
            bloodGlucoseMgDl === undefined &&
            basalMetabolicRateKcal === undefined &&
            bodyWeightKg === undefined &&
            bodyFatPct === undefined &&
            hydrationMl === undefined &&
            nutritionKcal === undefined &&
            nutritionCarbsG === undefined &&
            nutritionProteinG === undefined &&
            nutritionFatG === undefined &&
            exerciseMinutes24h === undefined &&
            lastExerciseType === undefined &&
            menstruationFlow === undefined &&
            menstruationActive === undefined &&
            steps === undefined &&
            distanceMeters === undefined &&
            activeCalories === undefined &&
            currentHR === undefined &&
            sleepScore === undefined
        ) return null;

        // Compute derived scores
        const stressIndex = this.computeStressIndex(hrv, restingHR);
        const readinessScore = this.computeReadinessScore(hrv, restingHR, spo2, sleepScore);

        return {
            hrv,
            restingHR,
            currentHR,
            spo2,
            bodyTemp,
            basalBodyTemp,
            respiratoryRate,
            vo2Max,
            bloodGlucoseMgDl,
            basalMetabolicRateKcal,
            bodyWeightKg,
            bodyFatPct,
            hydrationMl,
            nutritionKcal,
            nutritionCarbsG,
            nutritionProteinG,
            nutritionFatG,
            exerciseMinutes24h,
            lastExerciseType,
            menstruationFlow,
            menstruationActive,
            steps,
            distanceMeters,
            activeCalories,
            sleepScore,
            stressIndex,
            readinessScore,
            timestamp: Date.now(),
            source: source!,
            freshness: 'live',
        };
    }

    // Stress: 0 = calm, 100 = very stressed
    private computeStressIndex(hrv?: number, restingHR?: number): number | undefined {
        if (hrv === undefined && restingHR === undefined) return undefined;

        let stress = 50; // baseline

        if (hrv !== undefined) {
            // Lower HRV = higher stress. Average adult HRV ~40-60ms
            if (hrv < 20) stress += 30;
            else if (hrv < 35) stress += 15;
            else if (hrv > 60) stress -= 15;
            else if (hrv > 80) stress -= 25;
        }

        if (restingHR !== undefined) {
            // Higher resting HR = higher stress
            if (restingHR > 85) stress += 20;
            else if (restingHR > 75) stress += 10;
            else if (restingHR > 65) stress += 5;
            else if (restingHR < 55) stress -= 10;
        }

        return Math.max(0, Math.min(100, Math.round(stress)));
    }

    // Readiness: 0 = exhausted, 100 = fully recovered
    private computeReadinessScore(
        hrv?: number,
        restingHR?: number,
        spo2?: number,
        sleepScore?: number
    ): number | undefined {
        const factors: number[] = [];

        if (hrv !== undefined) {
            // HRV score: higher = better readiness (cap at 80ms = 100%)
            factors.push(Math.min(100, (hrv / 80) * 100));
        }
        if (restingHR !== undefined) {
            // Lower resting HR = better readiness (45bpm = 100%, 90bpm = 0%)
            factors.push(Math.max(0, Math.min(100, 100 - ((restingHR - 45) / 45) * 100)));
        }
        if (spo2 !== undefined) {
            // SpO2 > 95% = good
            factors.push(Math.min(100, (spo2 / 98) * 100));
        }
        if (sleepScore !== undefined) {
            factors.push(sleepScore);
        }

        if (factors.length === 0) return undefined;
        return Math.round(factors.reduce((a, b) => a + b, 0) / factors.length);
    }

    private computeSleepScoreFromStages(stages: { stage: string; startTime: number; endTime: number }[]): number | undefined {
        if (!Array.isArray(stages) || stages.length === 0) return undefined;

        let deepMs = 0;
        let remMs = 0;
        let lightMs = 0;
        let awakeMs = 0;

        for (const stage of stages) {
            const duration = Math.max(0, stage.endTime - stage.startTime);
            const label = String(stage.stage || '').toLowerCase();
            if (label.includes('deep')) deepMs += duration;
            else if (label.includes('rem')) remMs += duration;
            else if (label.includes('light')) lightMs += duration;
            else if (label.includes('awake') || label.includes('out')) awakeMs += duration;
        }

        const totalSleepMs = deepMs + remMs + lightMs;
        const totalWindowMs = totalSleepMs + awakeMs;
        if (totalSleepMs <= 0 || totalWindowMs <= 0) return undefined;

        const totalHours = totalSleepMs / (1000 * 60 * 60);
        let score = 50;

        if (totalHours >= 7 && totalHours <= 9) score += 25;
        else if (totalHours >= 6) score += 15;
        else if (totalHours >= 5) score += 5;
        else if (totalHours < 5) score -= 10;
        else if (totalHours > 9) score += 10;

        const deepRatio = deepMs / totalSleepMs;
        const remRatio = remMs / totalSleepMs;
        const awakeRatio = awakeMs / totalWindowMs;

        if (deepRatio >= 0.2) score += 10;
        else if (deepRatio < 0.1) score -= 10;

        if (remRatio >= 0.2) score += 5;
        else if (remRatio < 0.1) score -= 5;

        if (awakeRatio > 0.25) score -= 15;
        else if (awakeRatio > 0.15) score -= 10;

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    private buildFallbackSnapshot(): BioSnapshot {
        return {
            timestamp: Date.now(),
            source: 'fallback',
            freshness: 'stale',
        };
    }

    private applyPremiumGate(snapshot: BioSnapshot): BioSnapshot {
        return snapshot;
    }

    private async appendToHistory(snapshot: BioSnapshot): Promise<void> {
        try {
            const dateKey = this.getDateKey(snapshot.timestamp);
            const key = `${STORAGE_KEY_BIO_HISTORY}_${dateKey}`;
            const existing = await storage.get<BioSnapshot[]>(key) || [];

            // Cap at MAX_HISTORY_PER_DAY entries per day
            if (existing.length >= MAX_HISTORY_PER_DAY) {
                existing.shift();
            }
            existing.push(snapshot);
            await storage.set(key, existing);
            await this.updateDailyRollup(dateKey, existing);
        } catch (e) {
            console.warn('[BioSnapshot] Failed to append history:', e);
        }
    }

    private getDateKey(timestamp: number): string {
        return new Date(timestamp).toISOString().split('T')[0];
    }

    private async updateDailyRollup(dateKey: string, snapshots?: BioSnapshot[]): Promise<void> {
        try {
            let history = snapshots;
            if (!history) {
                const key = `${STORAGE_KEY_BIO_HISTORY}_${dateKey}`;
                history = await storage.get<BioSnapshot[]>(key) || [];
            }
            if (!history.length) return;

            const rollup = this.computeDailyRollup(dateKey, history);
            if (!rollup) return;

            const store = await storage.get<Record<string, BioDailyRollup>>(STORAGE_KEY_BIO_ROLLUP) || {};
            store[dateKey] = rollup;
            await storage.set(STORAGE_KEY_BIO_ROLLUP, this.pruneRollupStore(store));
        } catch (e) {
            console.warn('[BioSnapshot] Failed to update rollup:', e);
        }
    }

    private computeDailyRollup(dateKey: string, snapshots: BioSnapshot[]): BioDailyRollup | null {
        if (!snapshots.length) return null;
        const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
        const last = sorted[sorted.length - 1];

        const averages: Partial<Record<RollupField, number>> = {};
        const mins: Partial<Record<RollupField, number>> = {};
        const maxs: Partial<Record<RollupField, number>> = {};

        for (const field of ROLLUP_FIELDS) {
            const values = sorted
                .map((s) => s[field])
                .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
            if (!values.length) continue;
            const sum = values.reduce((a, b) => a + b, 0);
            const avg = sum / values.length;
            averages[field] = Math.round(avg * 10) / 10;
            mins[field] = Math.min(...values);
            maxs[field] = Math.max(...values);
        }

        const totals: Partial<Record<TotalField, number>> = {};
        for (const field of TOTAL_FIELDS) {
            const value = last[field];
            if (typeof value === 'number' && Number.isFinite(value)) {
                totals[field] = value;
            }
        }

        return {
            date: dateKey,
            updatedAt: Date.now(),
            sampleCount: sorted.length,
            averages: averages as Partial<BioSnapshot>,
            totals: Object.keys(totals).length ? (totals as Partial<BioSnapshot>) : undefined,
            mins: Object.keys(mins).length ? (mins as Partial<BioSnapshot>) : undefined,
            maxs: Object.keys(maxs).length ? (maxs as Partial<BioSnapshot>) : undefined,
        };
    }

    private pruneRollupStore(store: Record<string, BioDailyRollup>): Record<string, BioDailyRollup> {
        const dateKeys = Object.keys(store).sort().reverse();
        const trimmed: Record<string, BioDailyRollup> = {};
        for (const key of dateKeys.slice(0, MAX_ROLLUP_DAYS)) {
            trimmed[key] = store[key];
        }
        return trimmed;
    }

    private async loadRollups(days: number): Promise<BioDailyRollup[]> {
        const maxDays = Math.max(1, Math.min(days, MAX_ROLLUP_DAYS));
        const store = await storage.get<Record<string, BioDailyRollup>>(STORAGE_KEY_BIO_ROLLUP) || {};
        const rollups: BioDailyRollup[] = [];
        let mutated = false;

        for (let i = 0; i < maxDays; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateKey = d.toISOString().split('T')[0];
            let rollup: BioDailyRollup | null = store[dateKey] ?? null;
            if (!rollup) {
                const historyKey = `${STORAGE_KEY_BIO_HISTORY}_${dateKey}`;
                const history = await storage.get<BioSnapshot[]>(historyKey);
                if (history && history.length) {
                    rollup = this.computeDailyRollup(dateKey, history);
                    if (rollup) {
                        store[dateKey] = rollup;
                        mutated = true;
                    }
                }
            }
            if (rollup) rollups.push(rollup);
        }

        if (mutated) {
            await storage.set(STORAGE_KEY_BIO_ROLLUP, this.pruneRollupStore(store));
        }

        return rollups;
    }

    async getRollupSummary(days: number = 7): Promise<string | undefined> {
        try {
            const rollups = await this.loadRollups(days);
            if (!rollups.length) return undefined;

            const lines: string[] = [];
            lines.push(`Bio history (last ${Math.min(days, rollups.length)} days):`);

            for (const rollup of rollups) {
                const parts: string[] = [];
                const totals = rollup.totals || {};
                const averages = rollup.averages || {};

                if (typeof totals.steps === 'number') {
                    parts.push(`steps ${Math.round(totals.steps).toLocaleString()}`);
                }
                if (typeof totals.distanceMeters === 'number') {
                    parts.push(`distance ${formatDistanceMeters(totals.distanceMeters)}`);
                }
                if (typeof totals.activeCalories === 'number') {
                    parts.push(`active ${Math.round(totals.activeCalories)} kcal`);
                }
                if (typeof totals.hydrationMl === 'number') {
                    parts.push(`hydration ${formatHydrationMl(totals.hydrationMl)}`);
                }
                if (typeof totals.nutritionKcal === 'number') {
                    const macros: string[] = [];
                    if (typeof totals.nutritionProteinG === 'number') macros.push(`P${Math.round(totals.nutritionProteinG)}g`);
                    if (typeof totals.nutritionCarbsG === 'number') macros.push(`C${Math.round(totals.nutritionCarbsG)}g`);
                    if (typeof totals.nutritionFatG === 'number') macros.push(`F${Math.round(totals.nutritionFatG)}g`);
                    parts.push(`nutrition ${Math.round(totals.nutritionKcal)} kcal${macros.length ? ` (${macros.join(', ')})` : ''}`);
                }

                if (typeof averages.sleepScore === 'number') {
                    parts.push(`sleep ${Math.round(averages.sleepScore)}/100`);
                }
                if (typeof averages.hrv === 'number') {
                    parts.push(`HRV ${Math.round(averages.hrv)}ms`);
                }
                if (typeof averages.restingHR === 'number') {
                    parts.push(`resting HR ${Math.round(averages.restingHR)} bpm`);
                }
                if (typeof averages.readinessScore === 'number') {
                    parts.push(`readiness ${Math.round(averages.readinessScore)}/100`);
                }
                if (typeof averages.stressIndex === 'number') {
                    parts.push(`stress ${Math.round(averages.stressIndex)}/100`);
                }
                if (typeof averages.bodyWeightKg === 'number') {
                    parts.push(`weight ${formatWeightKg(averages.bodyWeightKg)}`);
                }
                if (typeof averages.bloodGlucoseMgDl === 'number') {
                    parts.push(`glucose ${formatBloodGlucoseMgDl(averages.bloodGlucoseMgDl)}`);
                }

                if (!parts.length) continue;
                lines.push(`- ${rollup.date}: ${parts.join(', ')}`);
            }

            return lines.length > 1 ? lines.join('\n') : undefined;
        } catch (e) {
            console.warn('[BioSnapshot] Failed to build rollup summary:', e);
            return undefined;
        }
    }

    async getHistory(days: number = 7): Promise<BioSnapshot[]> {
        try {
            const { subscriptionService } = require('./subscriptionService');
            if (!subscriptionService.isPremiumActive()) {
                const unlocked = await bioTrendsAccessService.isUnlocked();
                if (!unlocked) return [];
            }
        } catch {
            const unlocked = await bioTrendsAccessService.isUnlocked();
            if (!unlocked) return [];
        }
        const maxDays = Math.min(days, MAX_TREND_DAYS);
        return this.loadHistory(maxDays);
    }

    async getHistoryForAI(days: number = 7): Promise<BioSnapshot[]> {
        const retention = Math.max(1, this.config.dataRetentionDays || MAX_TREND_DAYS);
        const maxDays = Math.min(days, retention);
        return this.loadHistory(maxDays);
    }

    async updateConfig(config: Partial<BioContextConfig>): Promise<void> {
        const prevRetention = this.config.dataRetentionDays;
        this.config = { ...this.config, ...config };
        await storage.set(STORAGE_KEY_BIO_CONFIG, this.config);
        if (this.config.dataRetentionDays !== prevRetention) {
            await this.cleanupHistory(this.config.dataRetentionDays);
        }
        console.log('[BioSnapshot] Config updated');
    }

    getConfig(): BioContextConfig {
        return { ...this.config };
    }

    getLastSnapshot(): BioSnapshot | null {
        return this.lastSnapshot;
    }

    async clearAllData(): Promise<void> {
        this.lastSnapshot = null;
        await storage.set(STORAGE_KEY_BIO_SNAPSHOT, null);

        // Clear history for retention period
        await this.cleanupHistory(0);
        console.log('[BioSnapshot] All bio data cleared');
    }

    async exportData(): Promise<{ config: BioContextConfig; history: BioSnapshot[] }> {
        const history = await this.loadHistory(this.config.dataRetentionDays);
        return {
            config: this.config,
            history,
        };
    }

    private async loadHistory(days: number): Promise<BioSnapshot[]> {
        const all: BioSnapshot[] = [];
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = `${STORAGE_KEY_BIO_HISTORY}_${d.toISOString().split('T')[0]}`;
            const data = await storage.get<BioSnapshot[]>(key);
            if (data) all.push(...data);
        }
        return all.sort((a, b) => a.timestamp - b.timestamp);
    }

    private async cleanupHistory(retentionDays: number): Promise<void> {
        const daysToKeep = Math.max(0, Math.floor(retentionDays));
        const maxScanDays = 365;
        for (let i = daysToKeep; i < maxScanDays; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = `${STORAGE_KEY_BIO_HISTORY}_${d.toISOString().split('T')[0]}`;
            await storage.remove(key);
        }
        await this.cleanupRollups(daysToKeep);
    }

    private async cleanupRollups(retentionDays: number): Promise<void> {
        try {
            const daysToKeep = Math.min(MAX_ROLLUP_DAYS, Math.max(0, Math.floor(retentionDays)));
            if (daysToKeep === 0) {
                await storage.remove(STORAGE_KEY_BIO_ROLLUP);
                return;
            }

            const store = await storage.get<Record<string, BioDailyRollup>>(STORAGE_KEY_BIO_ROLLUP);
            if (!store) return;

            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - daysToKeep);
            const pruned: Record<string, BioDailyRollup> = {};
            for (const [dateKey, rollup] of Object.entries(store)) {
                const date = new Date(`${dateKey}T00:00:00Z`);
                if (date >= cutoff) {
                    pruned[dateKey] = rollup;
                }
            }
            await storage.set(STORAGE_KEY_BIO_ROLLUP, this.pruneRollupStore(pruned));
        } catch (e) {
            console.warn('[BioSnapshot] Failed to cleanup rollups:', e);
        }
    }
}

export const bioSnapshotService = new BioSnapshotServiceImpl();
