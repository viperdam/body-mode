
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppleHealthKit, {
    HealthValue,
    HealthKitPermissions,
} from 'react-native-health';
import GoogleFit, { Scopes, BucketUnit } from 'react-native-google-fit';
import { healthConsentService } from './healthConsentService';

const PREFERRED_PROVIDER_KEY = 'ls_health_provider_v1';

// Types representing health data
export interface HealthData {
    steps: number;
    distance: number; // meters
    calories: number;
    flights: number;
}

export interface SleepData {
    date: string;
    durationMinutes: number;
    startTime: string;
    endTime: string;
    quality?: 'poor' | 'fair' | 'good' | 'excellent';
}

export interface WeightData {
    date: string;
    weight: number; // kg
    timestamp: number;
}

export interface HeartRateData {
    timestamp: number;
    bpm: number;
    restingBpm?: number;
}

export interface WorkoutData {
    id: string;
    type: string;
    duration: number; // minutes
    calories: number;
    date: string;
}

export interface ComprehensiveHealthData extends HealthData {
    sleep?: SleepData;
    weight?: WeightData;
    heartRate?: HeartRateData;
}

class HealthServiceImpl {
    private initialized = false;
    private provider: 'healthConnect' | 'googleFit' | 'appleHealth' | null = null;

    constructor() { }

    async getPreferredProvider(): Promise<'healthConnect' | 'googleFit' | 'appleHealth' | null> {
        try {
            const stored = await AsyncStorage.getItem(PREFERRED_PROVIDER_KEY);
            if (stored === 'healthConnect' || stored === 'googleFit' || stored === 'appleHealth') {
                return stored;
            }
        } catch (e) {
            console.warn('[HealthService] Failed to load preferred provider:', e);
        }
        return null;
    }

    async setPreferredProvider(provider: 'healthConnect' | 'googleFit' | 'appleHealth' | null): Promise<void> {
        try {
            if (!provider) {
                await AsyncStorage.removeItem(PREFERRED_PROVIDER_KEY);
                this.provider = null;
                this.initialized = false;
                return;
            }
            await AsyncStorage.setItem(PREFERRED_PROVIDER_KEY, provider);
            this.provider = provider;
            if (provider === 'googleFit') {
                this.initialized = await this.ensureGoogleFitAuthorized();
            } else if (provider === 'healthConnect' && Platform.OS === 'android') {
                try {
                    const { healthConnectService } = require('./healthConnectService');
                    const hcAvailable = await healthConnectService.initialize();
                    this.initialized = !!hcAvailable && (await healthConnectService.hasAnyPermission(true));
                } catch {
                    this.initialized = false;
                }
            } else if (provider === 'appleHealth') {
                this.initialized = Platform.OS === 'ios' ? this.initialized : false;
            }
        } catch (e) {
            console.warn('[HealthService] Failed to persist preferred provider:', e);
        }
    }

    private async shouldUseHealthConnect(): Promise<boolean> {
        if (Platform.OS !== 'android') return false;
        const preferred = await this.getPreferredProvider();
        if (preferred === 'googleFit') return false;
        try {
            const { healthConnectService } = require('./healthConnectService');
            const hcAvailable = await healthConnectService.initialize();
            if (!hcAvailable) return false;
            if (!(await healthConnectService.hasAnyPermission())) return false;
            this.provider = 'healthConnect';
            this.initialized = true;
            return true;
        } catch (e) {
            console.warn('[HealthService] Health Connect availability check failed:', e);
            return false;
        }
    }

    private async ensureGoogleFitAuthorized(): Promise<boolean> {
        if (Platform.OS !== 'android') return false;
        try {
            await GoogleFit.checkIsAuthorized();
            if (GoogleFit.isAuthorized) {
                this.provider = 'googleFit';
                this.initialized = true;
                return true;
            }
        } catch (error) {
            console.warn('[HealthService] Google Fit authorization check failed:', error);
        }
        return false;
    }

    private async shouldUseGoogleFit(): Promise<boolean> {
        if (Platform.OS !== 'android') return false;
        const preferred = await this.getPreferredProvider();
        if (preferred === 'healthConnect') return false;
        return await this.ensureGoogleFitAuthorized();
    }

    async requestPermissions(): Promise<boolean> {
        const hasConsent = await healthConsentService.hasConsent();
        if (!hasConsent) {
            console.warn('[HealthService] Consent required before requesting health permissions');
            return false;
        }

        if (Platform.OS === 'ios') {
            const granted = await this.requestAppleHealthPermissions();
            if (granted) {
                this.provider = 'appleHealth';
            }
            return granted;
        } else if (Platform.OS === 'android') {
            const preferred = await this.getPreferredProvider();
            if (preferred === 'googleFit') {
                const granted = await this.requestGoogleFitPermissions();
                if (granted) {
                    this.provider = 'googleFit';
                    return true;
                }
                // If Google Fit fails, try Health Connect if available.
                try {
                    const { healthConnectService } = require('./healthConnectService');
                    const hcAvailable = await healthConnectService.initialize();
                if (hcAvailable) {
                    const hcGranted = await healthConnectService.requestPermissions();
                    if (hcGranted) {
                        this.initialized = true;
                        this.provider = 'healthConnect';
                        try {
                            await this.setPreferredProvider('healthConnect');
                        } catch (e) {
                            console.warn('[HealthService] Failed to persist Health Connect provider:', e);
                        }
                        return true;
                    }
                }
                } catch (e) {
                    console.log('[HealthService] Health Connect not available after Google Fit failure');
                }
                return false;
            }

            // Default: Try Health Connect first, fallback to Google Fit only if HC not available.
            try {
                const { healthConnectService } = require('./healthConnectService');
                const hcAvailable = await healthConnectService.initialize();
                if (hcAvailable) {
                    const granted = await healthConnectService.requestPermissions();
                    if (granted) {
                        this.initialized = true;
                        this.provider = 'healthConnect';
                        try {
                            await this.setPreferredProvider('healthConnect');
                        } catch (e) {
                            console.warn('[HealthService] Failed to persist Health Connect provider:', e);
                        }
                        return true;
                    }
                    // If Health Connect is available but permission was not granted, do not
                    // silently fall back to Google Fit.
                    return false;
                }
            } catch (e) {
                console.log('[HealthService] Health Connect not available, falling back to Google Fit');
            }
            const granted = await this.requestGoogleFitPermissions();
            if (granted) {
                this.provider = 'googleFit';
            }
            return granted;
        }
        return false;
    }

    private async requestAppleHealthPermissions(): Promise<boolean> {
        const permissions = {
            permissions: {
                read: [
                    AppleHealthKit.Constants.Permissions.Steps,
                    AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
                    AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
                    AppleHealthKit.Constants.Permissions.FlightsClimbed,
                    AppleHealthKit.Constants.Permissions.Workout,
                    AppleHealthKit.Constants.Permissions.SleepAnalysis,
                    AppleHealthKit.Constants.Permissions.Weight,
                    AppleHealthKit.Constants.Permissions.HeartRate,
                    AppleHealthKit.Constants.Permissions.HeartRateVariability,
                    AppleHealthKit.Constants.Permissions.RestingHeartRate,
                    AppleHealthKit.Constants.Permissions.OxygenSaturation,
                ],
                write: [
                    AppleHealthKit.Constants.Permissions.Weight,
                    AppleHealthKit.Constants.Permissions.Workout,
                ],
            },
        } as HealthKitPermissions;

        return new Promise((resolve) => {
            AppleHealthKit.initHealthKit(permissions, (error: string) => {
                if (error) {
                    console.error('[HealthService] iOS Init Error:', error);
                    resolve(false);
                } else {
                    this.initialized = true;
                    this.provider = 'appleHealth';
                    resolve(true);
                }
            });
        });
    }

    private async requestGoogleFitPermissions(): Promise<boolean> {
        const options = {
            scopes: [
                Scopes.FITNESS_ACTIVITY_READ,
                Scopes.FITNESS_BODY_READ,
                Scopes.FITNESS_LOCATION_READ,
                Scopes.FITNESS_SLEEP_READ,
            ],
        };

        try {
            const authResult = await GoogleFit.authorize(options);
            if (authResult.success) {
                this.initialized = true;
                this.provider = 'googleFit';
                return true;
            } else {
                console.error('[HealthService] Google Fit Auth Failed:', authResult.message);
                return false;
            }
        } catch (error) {
            console.error('[HealthService] Google Fit Error:', error);
            return false;
        }
    }

    async getDailySummary(date: Date = new Date()): Promise<HealthData> {
        if (!this.initialized) {
            if (Platform.OS === 'android') {
                const hcReady = await this.shouldUseHealthConnect();
                if (!hcReady) {
                    const gfReady = await this.ensureGoogleFitAuthorized();
                    if (!gfReady) {
                        console.warn('[HealthService] Not initialized. Call requestPermissions() first.');
                        return { steps: 0, distance: 0, calories: 0, flights: 0 };
                    }
                } else {
                    // Health Connect is ready, proceed without probing Google Fit.
                    if (!this.initialized) {
                        this.initialized = true;
                    }
                }
            } else {
                console.warn('[HealthService] Not initialized. Call requestPermissions() first.');
                return { steps: 0, distance: 0, calories: 0, flights: 0 };
            }
        }

        if (Platform.OS === 'ios') {
            return this.getIOSDailySummary(date);
        } else if (Platform.OS === 'android') {
            return this.getAndroidDailySummary(date);
        }

        return { steps: 0, distance: 0, calories: 0, flights: 0 };
    }

    private async getIOSDailySummary(date: Date): Promise<HealthData> {
        const options = {
            date: date.toISOString(),
            includeManuallyAdded: true,
        };

        return new Promise((resolve) => {
            AppleHealthKit.getStepCount(options, (err: string, results: HealthValue) => {
                const steps = results ? results.value : 0;

                AppleHealthKit.getDistanceWalkingRunning(options, (err2: string, distResults: HealthValue) => {
                    const distance = distResults ? distResults.value : 0;

                    // getActiveEnergyBurned returns array, handle accordingly
                    AppleHealthKit.getActiveEnergyBurned(
                        { ...options, startDate: new Date(date.getTime() - 86400000).toISOString(), endDate: date.toISOString() },
                        (err3: string, calResults: HealthValue[]) => {
                            const calories = Array.isArray(calResults) && calResults.length > 0 ? calResults.reduce((sum, v) => sum + v.value, 0) : 0;

                            AppleHealthKit.getFlightsClimbed(options, (err4: string, flightResults: HealthValue) => {
                                const flights = flightResults ? flightResults.value : 0;
                                resolve({ steps, distance, calories, flights });
                            });
                        }
                    );
                });
            });
        });
    }

    private async getAndroidDailySummary(date: Date): Promise<HealthData> {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();

        const opt = {
            startDate: todayStart.toISOString(),
            endDate: todayEnd.toISOString(),
            bucketUnit: 'DAY' as BucketUnit,
            bucketInterval: 1,
        };

        try {
            const preferred = await this.getPreferredProvider();
            if (preferred !== 'googleFit') {
                try {
                    const { healthConnectService } = require('./healthConnectService');
                    const hcAvailable = await healthConnectService.initialize();
                    if (hcAvailable && await healthConnectService.hasAnyPermission()) {
                        this.provider = this.provider ?? 'healthConnect';
                        const summary = await healthConnectService.readDailySummary(todayStart, todayEnd);
                        if (summary) {
                            return {
                                steps: Math.round(summary.steps),
                                distance: summary.distance,
                                calories: summary.calories,
                                flights: 0,
                            };
                        }
                        // If Health Connect is available and permissioned but no data, do not fall back
                        // to Google Fit (it may not be initialized and can crash).
                        return { steps: 0, distance: 0, calories: 0, flights: 0 };
                    }
                } catch (hcError) {
                    console.warn('[HealthService] Health Connect daily summary failed:', hcError);
                }
            }

            // Only query Google Fit if it is authorized.
            const googleFitReady = await this.ensureGoogleFitAuthorized();
            if (!googleFitReady || this.provider !== 'googleFit') {
                return { steps: 0, distance: 0, calories: 0, flights: 0 };
            }

            const stepsRes = await GoogleFit.getDailyStepCountSamples(opt);
            const steps = stepsRes.reduce((acc: number, item: any) => {
                if (item.source === 'com.google.android.gms:estimated_steps') {
                    return acc + item.steps.reduce((s: number, i: any) => s + i.value, 0);
                }
                return acc;
            }, 0);

            const distRes = await GoogleFit.getDailyDistanceSamples(opt);
            const distance = distRes.length > 0 ? distRes[0].distance : 0;

            const calRes = await GoogleFit.getDailyCalorieSamples(opt);
            const calories = calRes.length > 0 ? calRes[0].calorie : 0;

            return { steps: Math.round(steps), distance, calories, flights: 0 };
        } catch (e) {
            console.error('[HealthService] Android Fetch Error:', e);
            return { steps: 0, distance: 0, calories: 0, flights: 0 };
        }
    }

    /**
     * Get last night's sleep data
     */
    async getLastNightSleep(): Promise<SleepData | null> {
        if (!this.initialized) {
            if (Platform.OS === 'android') {
                const hcReady = await this.shouldUseHealthConnect();
                if (!hcReady) {
                    const gfReady = await this.ensureGoogleFitAuthorized();
                    if (!gfReady) return null;
                }
            } else {
                return null;
            }
        }

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(18, 0, 0, 0); // Start from 6 PM yesterday

        if (Platform.OS === 'ios') {
            return new Promise((resolve) => {
                AppleHealthKit.getSleepSamples(
                    {
                        startDate: yesterday.toISOString(),
                        endDate: today.toISOString(),
                    },
                    (err: string, results: any[]) => {
                        if (err || !results || results.length === 0) {
                            resolve(null);
                            return;
                        }

                        // Aggregate sleep samples
                        const totalMinutes = results.reduce((sum, sample) => {
                            if (sample.value === 'ASLEEP' || sample.value === 'INBED') {
                                const start = new Date(sample.startDate).getTime();
                                const end = new Date(sample.endDate).getTime();
                                return sum + (end - start) / 60000;
                            }
                            return sum;
                        }, 0);

                        const firstSleep = results[0];
                        const lastSleep = results[results.length - 1];

                        resolve({
                            date: today.toISOString().split('T')[0],
                            durationMinutes: Math.round(totalMinutes),
                            startTime: firstSleep?.startDate || '',
                            endTime: lastSleep?.endDate || '',
                            quality: totalMinutes >= 420 ? 'good' : totalMinutes >= 360 ? 'fair' : 'poor',
                        });
                    }
                );
            });
        } else {
            try {
                if (await this.shouldUseHealthConnect()) {
                    const { healthConnectService } = require('./healthConnectService');
                    const summary = await healthConnectService.readSleepStages(yesterday, today);
                    if (!summary) return null;
                    return {
                        date: today.toISOString().split('T')[0],
                        durationMinutes: Math.round(summary.totalMinutes),
                        startTime: summary.startTime,
                        endTime: summary.endTime,
                        quality: summary.totalMinutes >= 420 ? 'good' : summary.totalMinutes >= 360 ? 'fair' : 'poor',
                    };
                }

                if (!(await this.shouldUseGoogleFit())) {
                    return null;
                }

                // Android: Google Fit sleep API
                const sleepRes = await GoogleFit.getSleepSamples({
                    startDate: yesterday.toISOString(),
                    endDate: today.toISOString(),
                }, true); // inLocalTimeZone = true

                if (!sleepRes || sleepRes.length === 0) return null;

                const totalMinutes = sleepRes.reduce((sum: number, sample: any) => {
                    const start = new Date(sample.startDate).getTime();
                    const end = new Date(sample.endDate).getTime();
                    return sum + (end - start) / 60000;
                }, 0);

                return {
                    date: today.toISOString().split('T')[0],
                    durationMinutes: Math.round(totalMinutes),
                    startTime: sleepRes[0]?.startDate || '',
                    endTime: sleepRes[sleepRes.length - 1]?.endDate || '',
                    quality: totalMinutes >= 420 ? 'good' : totalMinutes >= 360 ? 'fair' : 'poor',
                };
            } catch (e) {
                console.error('[HealthService] Android Sleep Fetch Error:', e);
                return null;
            }
        }
    }

    /**
     * Get latest weight from health platform
     */
    async getLatestWeight(): Promise<WeightData | null> {
        if (!this.initialized) {
            if (Platform.OS === 'android') {
                const hcReady = await this.shouldUseHealthConnect();
                if (!hcReady) {
                    const gfReady = await this.ensureGoogleFitAuthorized();
                    if (!gfReady) return null;
                }
            } else {
                return null;
            }
        }

        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        if (Platform.OS === 'ios') {
            return new Promise((resolve) => {
                AppleHealthKit.getLatestWeight({}, (err: string, results: any) => {
                    if (err || !results) {
                        resolve(null);
                        return;
                    }

                    resolve({
                        date: new Date().toISOString().split('T')[0],
                        weight: results.value, // Already in kg if using metric
                        timestamp: new Date(results.endDate || Date.now()).getTime(),
                    });
                });
            });
        } else {
            try {
                if (await this.shouldUseHealthConnect()) {
                    const { healthConnectService } = require('./healthConnectService');
                    const weight = await healthConnectService.readWeight(thirtyDaysAgo, now);
                    if (weight === null) return null;
                    return {
                        date: new Date().toISOString().split('T')[0],
                        weight,
                        timestamp: Date.now(),
                    };
                }

                if (!(await this.shouldUseGoogleFit())) {
                    return null;
                }

                const weightRes = await GoogleFit.getWeightSamples({
                    startDate: thirtyDaysAgo.toISOString(),
                    endDate: now.toISOString(),
                });

                if (!weightRes || weightRes.length === 0) return null;

                const latest = weightRes[weightRes.length - 1];
                return {
                    date: new Date(latest.endDate).toISOString().split('T')[0],
                    weight: latest.value,
                    timestamp: new Date(latest.endDate).getTime(),
                };
            } catch (e) {
                console.error('[HealthService] Android Weight Fetch Error:', e);
                return null;
            }
        }
    }

    /**
     * Get heart rate data
     */
    async getHeartRate(): Promise<HeartRateData | null> {
        if (!this.initialized) {
            if (Platform.OS === 'android') {
                const hcReady = await this.shouldUseHealthConnect();
                if (!hcReady) {
                    const gfReady = await this.ensureGoogleFitAuthorized();
                    if (!gfReady) return null;
                }
            } else {
                return null;
            }
        }

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        if (Platform.OS === 'ios') {
            return new Promise((resolve) => {
                AppleHealthKit.getHeartRateSamples(
                    {
                        startDate: oneHourAgo.toISOString(),
                        endDate: now.toISOString(),
                        ascending: false,
                        limit: 1,
                    },
                    (err: string, results: any[]) => {
                        if (err || !results || results.length === 0) {
                            resolve(null);
                            return;
                        }

                        resolve({
                            timestamp: new Date(results[0].endDate).getTime(),
                            bpm: Math.round(results[0].value),
                        });
                    }
                );
            });
        } else {
            try {
                if (await this.shouldUseHealthConnect()) {
                    const { healthConnectService } = require('./healthConnectService');
                    const bpm = await healthConnectService.readHeartRate(oneHourAgo, now);
                    if (bpm === null) return null;
                    return {
                        timestamp: Date.now(),
                        bpm: Math.round(bpm),
                    };
                }

                if (!(await this.shouldUseGoogleFit())) {
                    return null;
                }

                // Google Fit heart rate (if available from watch)
                const hrRes = await GoogleFit.getHeartRateSamples({
                    startDate: oneHourAgo.toISOString(),
                    endDate: now.toISOString(),
                });

                if (!hrRes || hrRes.length === 0) return null;

                const latest = hrRes[hrRes.length - 1];
                return {
                    timestamp: new Date(latest.endDate).getTime(),
                    bpm: Math.round(latest.value),
                };
            } catch (e) {
                console.error('[HealthService] Android Heart Rate Fetch Error:', e);
                return null;
            }
        }
    }

    /**
     * Get Heart Rate Variability (SDNN) - iOS only via HealthKit
     */
    async getHRV(): Promise<number | null> {
        if (!this.initialized || Platform.OS !== 'ios') return null;

        return new Promise((resolve) => {
            try {
                AppleHealthKit.getHeartRateVariabilitySamples(
                    {
                        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                        endDate: new Date().toISOString(),
                        ascending: false,
                        limit: 1,
                    },
                    (err: string, results: any[]) => {
                        if (err || !results || results.length === 0) {
                            resolve(null);
                            return;
                        }
                        // value is SDNN in ms
                        resolve(results[0].value ?? null);
                    }
                );
            } catch {
                resolve(null);
            }
        });
    }

    /**
     * Get Resting Heart Rate - iOS only via HealthKit
     */
    async getRestingHR(): Promise<number | null> {
        if (!this.initialized || Platform.OS !== 'ios') return null;

        return new Promise((resolve) => {
            try {
                AppleHealthKit.getRestingHeartRate(
                    {
                        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                        endDate: new Date().toISOString(),
                    },
                    (err: string, results: any) => {
                        if (err || !results) {
                            resolve(null);
                            return;
                        }
                        resolve(Math.round(results.value));
                    }
                );
            } catch {
                resolve(null);
            }
        });
    }

    /**
     * Get Blood Oxygen Saturation (SpO2) - iOS only via HealthKit
     */
    async getSpO2(): Promise<number | null> {
        if (!this.initialized || Platform.OS !== 'ios') return null;

        return new Promise((resolve) => {
            try {
                AppleHealthKit.getOxygenSaturationSamples(
                    {
                        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                        endDate: new Date().toISOString(),
                        ascending: false,
                        limit: 1,
                    },
                    (err: string, results: any[]) => {
                        if (err || !results || results.length === 0) {
                            resolve(null);
                            return;
                        }
                        // Convert 0-1 fraction to percentage
                        const val = results[0].value;
                        resolve(val > 1 ? Math.round(val) : Math.round(val * 100));
                    }
                );
            } catch {
                resolve(null);
            }
        });
    }

    /**
     * Get all bio metrics at once (HRV, RestingHR, SpO2, HeartRate)
     */
    async getBioMetrics(): Promise<{
        hrv: number | null;
        restingHR: number | null;
        spo2: number | null;
        heartRate: number | null;
    }> {
        const [hrv, restingHR, spo2, heartRate] = await Promise.all([
            this.getHRV(),
            this.getRestingHR(),
            this.getSpO2(),
            this.getHeartRate().then(hr => hr?.bpm ?? null),
        ]);
        return { hrv, restingHR, spo2, heartRate };
    }

    /**
     * Get comprehensive health data for AI context
     */
    async getComprehensiveData(): Promise<ComprehensiveHealthData> {
        const [basicData, sleep, weight, heartRate] = await Promise.all([
            this.getDailySummary(),
            this.getLastNightSleep(),
            this.getLatestWeight(),
            this.getHeartRate(),
        ]);

        return {
            ...basicData,
            sleep: sleep || undefined,
            weight: weight || undefined,
            heartRate: heartRate || undefined,
        };
    }

    async getWorkouts(): Promise<WorkoutData[]> {
        // Real implementation for workout fetching would go here
        return [];
    }

    /**
     * Check if health service is available on this device
     */
    isAvailable(): boolean {
        return Platform.OS === 'ios' || Platform.OS === 'android';
    }

    /**
     * Check if initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}

export const healthService = new HealthServiceImpl();
