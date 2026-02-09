// Health Connect Service - Android 14+ Health Connect SDK wrapper
// Reads: HRV, RestingHR, SpO2, BodyTemp, SleepStages, Steps, Calories, and extended metrics

import { Platform, Linking } from 'react-native';
import type { BioSnapshot } from '../types';

type HealthConnectRecord = {
    startTime: string;
    endTime: string;
    [key: string]: any;
};

class HealthConnectServiceImpl {
    private initialized = false;
    private available = false;
    private sdk: any = null;
    private sdkStatus: number | null = null;
    private grantedPermissions = new Set<string>();
    private permissionsCheckedAt = 0;
    private permissionsCheckInFlight: Promise<void> | null = null;
    private missingPermissionLogged = new Set<string>();
    private permissionErrorCooldownUntil = 0;
    private recordCooldowns = new Map<string, number>();
    private static PERMISSION_COOLDOWN_MS = 10 * 60 * 1000;
    private static RECORD_COOLDOWN_MS = 10 * 60 * 1000;
    private static KG_PER_LB = 0.45359237;
    private static GRAMS_PER_OUNCE = 28.349523125;
    private static ML_PER_FL_OZ = 29.5735295625;

    async initialize(): Promise<boolean> {
        if (Platform.OS !== 'android') return false;
        if (this.initialized) return this.available;

        try {
            this.sdk = require('react-native-health-connect');
            const status = await this.sdk.getSdkStatus();
            this.sdkStatus = status;
            this.available = status === 3; // SDK_AVAILABLE = 3
            if (this.available) {
                await this.sdk.initialize();
                this.initialized = true;
                console.log('[HealthConnect] Initialized successfully');
            } else {
                console.log('[HealthConnect] SDK not available, status:', status);
            }
            return this.available;
        } catch (e) {
            console.warn('[HealthConnect] Not available:', e);
            this.available = false;
            return false;
        }
    }

    async getSdkStatus(): Promise<number | null> {
        if (Platform.OS !== 'android') return null;
        try {
            if (!this.sdk) {
                this.sdk = require('react-native-health-connect');
            }
            const status = await this.sdk.getSdkStatus();
            this.sdkStatus = status;
            return status;
        } catch (e) {
            console.warn('[HealthConnect] Failed to get SDK status:', e);
            return this.sdkStatus;
        }
    }

    async openHealthConnectSettings(): Promise<void> {
        if (Platform.OS !== 'android') return;
        try {
            if (!this.sdk) {
                this.sdk = require('react-native-health-connect');
            }
            this.sdk.openHealthConnectSettings();
        } catch (e) {
            console.warn('[HealthConnect] Failed to open settings:', e);
        }
    }

    async openHealthConnectUpdate(): Promise<void> {
        if (Platform.OS !== 'android') return;
        const packageId = 'com.google.android.apps.healthdata';
        const marketUrl = `market://details?id=${packageId}`;
        const webUrl = `https://play.google.com/store/apps/details?id=${packageId}`;
        try {
            const canOpenMarket = await Linking.canOpenURL(marketUrl);
            if (canOpenMarket) {
                await Linking.openURL(marketUrl);
                return;
            }
        } catch (e) {
            console.warn('[HealthConnect] Failed to open Play Store app:', e);
        }

        try {
            await Linking.openURL(webUrl);
        } catch (e) {
            console.warn('[HealthConnect] Failed to open Play Store web:', e);
        }
    }

    async openHealthConnectDataManagement(): Promise<void> {
        if (Platform.OS !== 'android') return;
        try {
            if (!this.sdk) {
                this.sdk = require('react-native-health-connect');
            }
            this.sdk.openHealthConnectDataManagement();
        } catch (e) {
            console.warn('[HealthConnect] Failed to open data management:', e);
        }
    }

    async getGrantedPermissions(): Promise<any[]> {
        if (!this.available) return [];
        try {
            if (!this.sdk) {
                this.sdk = require('react-native-health-connect');
            }
            const granted = await this.sdk.getGrantedPermissions();
            const list = Array.isArray(granted) ? granted : [];
            this.grantedPermissions = new Set(
                list
                    .filter((perm: any) => perm?.accessType === 'read' && typeof perm?.recordType === 'string')
                    .map((perm: any) => perm.recordType)
            );
            this.permissionsCheckedAt = Date.now();
            // Clear any missing markers for permissions that are now granted
            this.grantedPermissions.forEach((recordType) => {
                if (this.missingPermissionLogged.has(recordType)) {
                    this.missingPermissionLogged.delete(recordType);
                }
                if (this.recordCooldowns.has(recordType)) {
                    this.recordCooldowns.delete(recordType);
                }
            });
            return list;
        } catch (e) {
            console.warn('[HealthConnect] Failed to read granted permissions:', e);
            return [];
        }
    }

    async hasAnyPermission(force: boolean = false): Promise<boolean> {
        if (Platform.OS !== 'android') return false;
        if (!this.initialized) {
            const available = await this.initialize();
            if (!available) return false;
        }
        if (!this.available || !this.sdk) return false;
        if (!force && this.isPermissionCooldownActive()) return false;
        const granted = await this.getGrantedPermissions();
        return Array.isArray(granted) && granted.length > 0 && this.grantedPermissions.size > 0;
    }

    async requestPermissions(): Promise<boolean> {
        if (!this.available || !this.sdk) return false;

        try {
            const permissions = [
                { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
                { accessType: 'read', recordType: 'RestingHeartRate' },
                { accessType: 'read', recordType: 'OxygenSaturation' },
                { accessType: 'read', recordType: 'BodyTemperature' },
                { accessType: 'read', recordType: 'BasalBodyTemperature' },
                { accessType: 'read', recordType: 'RespiratoryRate' },
                { accessType: 'read', recordType: 'Vo2Max' },
                { accessType: 'read', recordType: 'BloodGlucose' },
                { accessType: 'read', recordType: 'BasalMetabolicRate' },
                { accessType: 'read', recordType: 'BodyFat' },
                { accessType: 'read', recordType: 'Weight' },
                { accessType: 'read', recordType: 'Hydration' },
                { accessType: 'read', recordType: 'Nutrition' },
                { accessType: 'read', recordType: 'ExerciseSession' },
                { accessType: 'read', recordType: 'MenstruationFlow' },
                { accessType: 'read', recordType: 'MenstruationPeriod' },
                { accessType: 'read', recordType: 'SleepSession' },
                { accessType: 'read', recordType: 'Steps' },
                { accessType: 'read', recordType: 'Distance' },
                { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
                { accessType: 'read', recordType: 'HeartRate' },
            ];

            const requested = await this.sdk.requestPermission(permissions);
            const requestedList = Array.isArray(requested) ? requested : [];
            this.grantedPermissions = new Set(
                requestedList
                    .filter((perm: any) => perm?.accessType === 'read' && typeof perm?.recordType === 'string')
                    .map((perm: any) => perm.recordType)
            );
            this.permissionsCheckedAt = 0;
            this.missingPermissionLogged.clear();
            this.recordCooldowns.clear();
            this.permissionErrorCooldownUntil = 0;

            // Verify actual granted permissions from SDK to avoid stale/misreported results
            await this.getGrantedPermissions();
            const grantedCount = this.grantedPermissions.size;
            console.log('[HealthConnect] Permissions result:', grantedCount, 'granted');
            if (grantedCount > 0) {
                try {
                    const { healthIngestService } = require('./healthIngestService');
                    await healthIngestService.start();
                } catch (error) {
                    console.warn('[HealthConnect] Failed to start health ingest service:', error);
                }
            }
            return grantedCount > 0;
        } catch (e) {
            console.error('[HealthConnect] Permission request failed:', e);
            return false;
        }
    }

    private async refreshGrantedPermissions(force = false): Promise<void> {
        if (!this.available || !this.sdk) return;
        const now = Date.now();
        const maxAgeMs = 5 * 60 * 1000;
        if (!force && now - this.permissionsCheckedAt < maxAgeMs) return;
        if (this.permissionsCheckInFlight) {
            await this.permissionsCheckInFlight;
            return;
        }

        this.permissionsCheckInFlight = (async () => {
            try {
                const granted = await this.sdk.getGrantedPermissions();
                this.grantedPermissions = new Set(
                    Array.isArray(granted)
                        ? granted
                            .filter((perm: any) => perm?.accessType === 'read' && typeof perm?.recordType === 'string')
                            .map((perm: any) => perm.recordType)
                        : []
                );
                this.permissionsCheckedAt = Date.now();
                this.grantedPermissions.forEach((recordType) => {
                    if (this.missingPermissionLogged.has(recordType)) {
                        this.missingPermissionLogged.delete(recordType);
                    }
                    if (this.recordCooldowns.has(recordType)) {
                        this.recordCooldowns.delete(recordType);
                    }
                });
            } catch (error) {
                console.warn('[HealthConnect] Failed to refresh permissions:', error);
            }
        })();

        try {
            await this.permissionsCheckInFlight;
        } finally {
            this.permissionsCheckInFlight = null;
        }
    }

    private async ensureCanRead(recordType: string): Promise<boolean> {
        if (!this.available || !this.sdk) return false;
        if (this.isPermissionCooldownActive()) return false;
        if (this.isRecordCooldownActive(recordType)) return false;
        await this.refreshGrantedPermissions(false);
        if (this.isRecordCooldownActive(recordType)) return false;
        return this.grantedPermissions.has(recordType);
    }

    private async ensureReadyForRead(forceRefresh: boolean = false): Promise<boolean> {
        if (!this.available || !this.sdk) return false;
        if (this.isPermissionCooldownActive()) return false;

        const stale = !this.permissionsCheckedAt || Date.now() - this.permissionsCheckedAt > 60 * 1000;
        if (forceRefresh || stale || this.missingPermissionLogged.size > 0) {
            await this.getGrantedPermissions();
        }

        if (this.grantedPermissions.size === 0) {
            this.permissionErrorCooldownUntil = Date.now() + HealthConnectServiceImpl.PERMISSION_COOLDOWN_MS;
            return false;
        }

        return true;
    }

    private handleReadError(recordType: string, label: string, error: any): void {
        const message = [
            typeof error === 'string' ? error : '',
            error?.message ?? '',
            error?.cause?.message ?? '',
            String(error ?? ''),
        ]
            .filter(Boolean)
            .join(' ');
        const isSecurity = message.includes('SecurityException') || message.includes('PERMISSION_DENIED');
        if (isSecurity) {
            if (!this.missingPermissionLogged.has(recordType)) {
                console.warn(`[HealthConnect] Missing permission for ${recordType}.`);
                this.missingPermissionLogged.add(recordType);
            }
            this.grantedPermissions.delete(recordType);
            this.markRecordCooldown(recordType);
            this.permissionsCheckedAt = 0;
            if (this.grantedPermissions.size === 0) {
                this.permissionErrorCooldownUntil = Date.now() + HealthConnectServiceImpl.PERMISSION_COOLDOWN_MS;
            }
            return;
        }
        console.warn(`[HealthConnect] ${label}:`, error);
    }

    async readHRV(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('HeartRateVariabilityRmssd')) return null;

        try {
            const result = await this.sdk.readRecords('HeartRateVariabilityRmssd', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (!result?.records?.length) return null;
            // Return latest SDNN value in ms
            const latest = result.records[result.records.length - 1];
            return latest.heartRateVariabilityMillis ?? null;
        } catch (e) {
            this.handleReadError('HeartRateVariabilityRmssd', 'HRV read failed', e);
            return null;
        }
    }

    async readRestingHR(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('RestingHeartRate')) return null;

        try {
            const result = await this.sdk.readRecords('RestingHeartRate', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            return latest.beatsPerMinute ?? null;
        } catch (e) {
            this.handleReadError('RestingHeartRate', 'Resting HR read failed', e);
            return null;
        }
    }

    async readSpO2(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('OxygenSaturation')) return null;

        try {
            const result = await this.sdk.readRecords('OxygenSaturation', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            return latest.percentage ?? null;
        } catch (e) {
            this.handleReadError('OxygenSaturation', 'SpO2 read failed', e);
            return null;
        }
    }

    async readBodyTemperature(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('BodyTemperature')) return null;

        try {
            const result = await this.sdk.readRecords('BodyTemperature', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            return latest.temperature?.inCelsius ?? null;
        } catch (e) {
            this.handleReadError('BodyTemperature', 'Body temp read failed', e);
            return null;
        }
    }

    async readBasalBodyTemperature(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('BasalBodyTemperature')) return null;

        try {
            const result = await this.sdk.readRecords('BasalBodyTemperature', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            return this.convertTemperatureToC(latest.temperature) ?? null;
        } catch (e) {
            this.handleReadError('BasalBodyTemperature', 'Basal body temp read failed', e);
            return null;
        }
    }

    async readRespiratoryRate(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('RespiratoryRate')) return null;

        try {
            const result = await this.sdk.readRecords('RespiratoryRate', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            return latest.rate ?? null;
        } catch (e) {
            this.handleReadError('RespiratoryRate', 'Respiratory rate read failed', e);
            return null;
        }
    }

    async readVo2Max(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('Vo2Max')) return null;

        try {
            const result = await this.sdk.readRecords('Vo2Max', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            return latest.vo2MillilitersPerMinuteKilogram ?? null;
        } catch (e) {
            this.handleReadError('Vo2Max', 'Vo2Max read failed', e);
            return null;
        }
    }

    async readBloodGlucose(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('BloodGlucose')) return null;

        try {
            const result = await this.sdk.readRecords('BloodGlucose', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            return this.convertGlucoseToMgDl(latest.level) ?? null;
        } catch (e) {
            this.handleReadError('BloodGlucose', 'Blood glucose read failed', e);
            return null;
        }
    }

    async readBasalMetabolicRate(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('BasalMetabolicRate')) return null;

        try {
            const result = await this.sdk.readRecords('BasalMetabolicRate', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            return this.convertPowerToKcalPerDay(latest.basalMetabolicRate) ?? null;
        } catch (e) {
            this.handleReadError('BasalMetabolicRate', 'Basal metabolic rate read failed', e);
            return null;
        }
    }

    async readBodyFat(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('BodyFat')) return null;

        try {
            const result = await this.sdk.readRecords('BodyFat', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            return latest.percentage ?? null;
        } catch (e) {
            this.handleReadError('BodyFat', 'Body fat read failed', e);
            return null;
        }
    }

    async readWeight(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('Weight')) return null;

        try {
            const result = await this.sdk.readRecords('Weight', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            return this.convertMassToKg(latest.weight) ?? null;
        } catch (e) {
            this.handleReadError('Weight', 'Weight read failed', e);
            return null;
        }
    }

    async readHydration(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('Hydration')) return null;

        try {
            const result = await this.sdk.readRecords('Hydration', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;
            const total = result.records.reduce((sum: number, record: any) => {
                const ml = this.convertVolumeToMl(record.volume);
                return sum + (ml ?? 0);
            }, 0);
            return total > 0 ? Math.round(total) : null;
        } catch (e) {
            this.handleReadError('Hydration', 'Hydration read failed', e);
            return null;
        }
    }

    async readNutrition(startDate: Date, endDate: Date): Promise<{
        calories?: number;
        carbsG?: number;
        proteinG?: number;
        fatG?: number;
    } | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('Nutrition')) return null;

        try {
            const result = await this.sdk.readRecords('Nutrition', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;

            let calories = 0;
            let carbs = 0;
            let protein = 0;
            let fat = 0;

            for (const record of result.records) {
                calories += this.convertEnergyToKcal(record.energy) ?? 0;
                carbs += this.convertMassToGrams(record.totalCarbohydrate) ?? 0;
                protein += this.convertMassToGrams(record.protein) ?? 0;
                fat += this.convertMassToGrams(record.totalFat) ?? 0;
            }

            if (calories <= 0 && carbs <= 0 && protein <= 0 && fat <= 0) return null;
            return {
                calories: calories > 0 ? Math.round(calories) : undefined,
                carbsG: carbs > 0 ? Math.round(carbs) : undefined,
                proteinG: protein > 0 ? Math.round(protein) : undefined,
                fatG: fat > 0 ? Math.round(fat) : undefined,
            };
        } catch (e) {
            this.handleReadError('Nutrition', 'Nutrition read failed', e);
            return null;
        }
    }

    async readExerciseSessions(startDate: Date, endDate: Date): Promise<{ minutes: number; lastType?: number } | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('ExerciseSession')) return null;

        try {
            const result = await this.sdk.readRecords('ExerciseSession', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;

            let totalMinutes = 0;
            let lastType: number | undefined;
            for (const record of result.records) {
                const start = new Date(record.startTime).getTime();
                const end = new Date(record.endTime).getTime();
                if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                    totalMinutes += (end - start) / 60000;
                }
                lastType = record.exerciseType ?? lastType;
            }
            return {
                minutes: Math.round(totalMinutes),
                lastType,
            };
        } catch (e) {
            this.handleReadError('ExerciseSession', 'Exercise session read failed', e);
            return null;
        }
    }

    async readMenstruationFlow(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('MenstruationFlow')) return null;

        try {
            const result = await this.sdk.readRecords('MenstruationFlow', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            return latest.flow ?? null;
        } catch (e) {
            this.handleReadError('MenstruationFlow', 'Menstruation flow read failed', e);
            return null;
        }
    }

    async readMenstruationPeriod(startDate: Date, endDate: Date): Promise<boolean> {
        if (!this.available || !this.sdk) return false;

        if (!await this.ensureCanRead('MenstruationPeriod')) return false;

        try {
            const result = await this.sdk.readRecords('MenstruationPeriod', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            return !!result?.records?.length;
        } catch (e) {
            this.handleReadError('MenstruationPeriod', 'Menstruation period read failed', e);
            return false;
        }
    }

    async readSteps(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('Steps')) return null;

        try {
            const result = await this.sdk.readRecords('Steps', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;
            const total = result.records.reduce((sum: number, record: any) => sum + (record.count ?? 0), 0);
            return total > 0 ? Math.round(total) : null;
        } catch (e) {
            this.handleReadError('Steps', 'Steps read failed', e);
            return null;
        }
    }

    async readDistance(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('Distance')) return null;

        try {
            const result = await this.sdk.readRecords('Distance', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;
            const total = result.records.reduce((sum: number, record: any) => {
                const meters = this.convertLengthToMeters(record.distance);
                return sum + (meters ?? 0);
            }, 0);
            return total > 0 ? Math.round(total) : null;
        } catch (e) {
            this.handleReadError('Distance', 'Distance read failed', e);
            return null;
        }
    }

    async readActiveCalories(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('ActiveCaloriesBurned')) return null;

        try {
            const result = await this.sdk.readRecords('ActiveCaloriesBurned', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });
            if (!result?.records?.length) return null;
            const total = result.records.reduce((sum: number, record: any) => {
                const kcal = this.convertEnergyToKcal(record.energy);
                return sum + (kcal ?? 0);
            }, 0);
            return total > 0 ? Math.round(total) : null;
        } catch (e) {
            this.handleReadError('ActiveCaloriesBurned', 'Active calories read failed', e);
            return null;
        }
    }

    async readHeartRate(startDate: Date, endDate: Date): Promise<number | null> {
        if (!this.available || !this.sdk) return null;

        if (!await this.ensureCanRead('HeartRate')) return null;

        try {
            const result = await this.sdk.readRecords('HeartRate', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (!result?.records?.length) return null;
            const latest = result.records[result.records.length - 1];
            const samples = latest.samples;
            if (!samples?.length) return null;
            return samples[samples.length - 1].beatsPerMinute ?? null;
        } catch (e) {
            this.handleReadError('HeartRate', 'Heart rate read failed', e);
            return null;
        }
    }

    async readSleepStages(startDate: Date, endDate: Date): Promise<{
        stage: string;
        startTime: number;
        endTime: number;
    }[]> {
        if (!this.available || !this.sdk) return [];

        if (!await this.ensureReadyForRead()) return [];
        if (!await this.ensureCanRead('SleepSession')) return [];

        try {
            const result = await this.sdk.readRecords('SleepSession', {
                timeRangeFilter: {
                    operator: 'between',
                    startTime: startDate.toISOString(),
                    endTime: endDate.toISOString(),
                },
            });

            if (!result?.records?.length) return [];

            const stages: { stage: string; startTime: number; endTime: number }[] = [];
            for (const session of result.records) {
                if (session.stages) {
                    for (const stage of session.stages) {
                        stages.push({
                            stage: this.mapSleepStage(stage.stage),
                            startTime: new Date(stage.startTime).getTime(),
                            endTime: new Date(stage.endTime).getTime(),
                        });
                    }
                }
            }
            return stages;
        } catch (e) {
            this.handleReadError('SleepSession', 'Sleep stages read failed', e);
            return [];
        }
    }

    private mapSleepStage(stageCode: number): string {
        switch (stageCode) {
            case 1: return 'Awake';
            case 2: return 'Light';
            case 3: return 'Deep';
            case 4: return 'REM';
            case 5: return 'Out of Bed';
            default: return 'Unknown';
        }
    }

    async readAllBioMetrics(): Promise<Partial<BioSnapshot>> {
        if (!this.available) return {};

        if (!await this.ensureReadyForRead(true)) return {};


        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [
            hrv,
            restingHR,
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
            nutrition,
            exercise,
            menstruationFlow,
            menstruationActive,
            steps,
            distanceMeters,
            activeCalories,
            currentHR,
        ] = await Promise.all([
            this.readHRV(dayAgo, now),
            this.readRestingHR(dayAgo, now),
            this.readSpO2(dayAgo, now),
            this.readBodyTemperature(dayAgo, now),
            this.readBasalBodyTemperature(dayAgo, now),
            this.readRespiratoryRate(dayAgo, now),
            this.readVo2Max(weekAgo, now),
            this.readBloodGlucose(dayAgo, now),
            this.readBasalMetabolicRate(dayAgo, now),
            this.readWeight(weekAgo, now),
            this.readBodyFat(weekAgo, now),
            this.readHydration(dayAgo, now),
            this.readNutrition(dayAgo, now),
            this.readExerciseSessions(dayAgo, now),
            this.readMenstruationFlow(weekAgo, now),
            this.readMenstruationPeriod(weekAgo, now),
            this.readSteps(dayAgo, now),
            this.readDistance(dayAgo, now),
            this.readActiveCalories(dayAgo, now),
            this.readHeartRate(dayAgo, now),
        ]);

        return {
            hrv: hrv ?? undefined,
            restingHR: restingHR ?? undefined,
            spo2: spo2 ?? undefined,
            bodyTemp: bodyTemp ?? undefined,
            basalBodyTemp: basalBodyTemp ?? undefined,
            respiratoryRate: respiratoryRate ?? undefined,
            vo2Max: vo2Max ?? undefined,
            bloodGlucoseMgDl: bloodGlucoseMgDl ?? undefined,
            basalMetabolicRateKcal: basalMetabolicRateKcal ?? undefined,
            bodyWeightKg: bodyWeightKg ?? undefined,
            bodyFatPct: bodyFatPct ?? undefined,
            hydrationMl: hydrationMl ?? undefined,
            nutritionKcal: nutrition?.calories,
            nutritionCarbsG: nutrition?.carbsG,
            nutritionProteinG: nutrition?.proteinG,
            nutritionFatG: nutrition?.fatG,
            exerciseMinutes24h: exercise?.minutes,
            lastExerciseType: exercise?.lastType,
            menstruationFlow: menstruationFlow ?? undefined,
            menstruationActive: menstruationActive,
            steps: steps ?? undefined,
            distanceMeters: distanceMeters ?? undefined,
            activeCalories: activeCalories ?? undefined,
            currentHR: currentHR ?? undefined,
        };
    }

    isAvailable(): boolean {
        return this.available;
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    getCachedSdkStatus(): number | null {
        return this.sdkStatus;
    }

    async readDailySummary(startDate: Date, endDate: Date): Promise<{ steps: number; distance: number; calories: number } | null> {
        if (!this.available || !this.sdk) return null;
        try {
            if (!await this.ensureReadyForRead(true)) return null;
            const [steps, distance, calories] = await Promise.all([
                this.readSteps(startDate, endDate),
                this.readDistance(startDate, endDate),
                this.readActiveCalories(startDate, endDate),
            ]);
            if (steps == null && distance == null && calories == null) return null;
            return {
                steps: steps ?? 0,
                distance: distance ?? 0,
                calories: calories ?? 0,
            };
        } catch (e) {
            console.warn('[HealthConnect] Daily summary read failed:', e);
            return null;
        }
    }

    private convertMassToKg(mass: { value: number; unit: string } | undefined): number | undefined {
        if (!mass || !Number.isFinite(mass.value)) return undefined;
        switch (mass.unit) {
            case 'kilograms': return mass.value;
            case 'grams': return mass.value / 1000;
            case 'milligrams': return mass.value / 1_000_000;
            case 'micrograms': return mass.value / 1_000_000_000;
            case 'pounds': return mass.value * HealthConnectServiceImpl.KG_PER_LB;
            case 'ounces': return mass.value * HealthConnectServiceImpl.GRAMS_PER_OUNCE / 1000;
            default: return mass.value;
        }
    }

    private convertMassToGrams(mass: { value: number; unit: string } | undefined): number | undefined {
        if (!mass || !Number.isFinite(mass.value)) return undefined;
        switch (mass.unit) {
            case 'grams': return mass.value;
            case 'kilograms': return mass.value * 1000;
            case 'milligrams': return mass.value / 1000;
            case 'micrograms': return mass.value / 1_000_000;
            case 'pounds': return mass.value * HealthConnectServiceImpl.KG_PER_LB * 1000;
            case 'ounces': return mass.value * HealthConnectServiceImpl.GRAMS_PER_OUNCE;
            default: return mass.value;
        }
    }

    private convertVolumeToMl(volume: { value: number; unit: string } | undefined): number | undefined {
        if (!volume || !Number.isFinite(volume.value)) return undefined;
        switch (volume.unit) {
            case 'milliliters': return volume.value;
            case 'liters': return volume.value * 1000;
            case 'fluidOuncesUs': return volume.value * HealthConnectServiceImpl.ML_PER_FL_OZ;
            default: return volume.value;
        }
    }

    private convertEnergyToKcal(energy: { value: number; unit: string } | undefined): number | undefined {
        if (!energy || !Number.isFinite(energy.value)) return undefined;
        switch (energy.unit) {
            case 'kilocalories': return energy.value;
            case 'calories': return energy.value / 1000;
            case 'joules': return energy.value / 4184;
            case 'kilojoules': return energy.value / 4.184;
            default: return energy.value;
        }
    }

    private convertPowerToKcalPerDay(power: { value: number; unit: string } | undefined): number | undefined {
        if (!power || !Number.isFinite(power.value)) return undefined;
        switch (power.unit) {
            case 'kilocaloriesPerDay': return power.value;
            case 'watts': return power.value * 20.7;
            default: return power.value;
        }
    }

    private convertTemperatureToC(temp: { value: number; unit: string } | undefined): number | undefined {
        if (!temp || !Number.isFinite(temp.value)) return undefined;
        if (temp.unit === 'celsius') return temp.value;
        if (temp.unit === 'fahrenheit') return (temp.value - 32) * (5 / 9);
        return temp.value;
    }

    private convertGlucoseToMgDl(glucose: { value: number; unit: string } | undefined): number | undefined {
        if (!glucose || !Number.isFinite(glucose.value)) return undefined;
        if (glucose.unit === 'milligramsPerDeciliter') return glucose.value;
        if (glucose.unit === 'millimolesPerLiter') return glucose.value * 18.0;
        return glucose.value;
    }

    private convertLengthToMeters(length: { value: number; unit: string } | undefined): number | undefined {
        if (!length || !Number.isFinite(length.value)) return undefined;
        switch (length.unit) {
            case 'meters': return length.value;
            case 'kilometers': return length.value * 1000;
            case 'miles': return length.value * 1609.34;
            case 'feet': return length.value * 0.3048;
            case 'inches': return length.value * 0.0254;
            default: return length.value;
        }
    }

    private isPermissionCooldownActive(): boolean {
        return Date.now() < this.permissionErrorCooldownUntil;
    }

    private isRecordCooldownActive(recordType: string): boolean {
        const until = this.recordCooldowns.get(recordType) ?? 0;
        if (until <= Date.now()) {
            this.recordCooldowns.delete(recordType);
            return false;
        }
        return true;
    }

    private markRecordCooldown(recordType: string): void {
        this.recordCooldowns.set(recordType, Date.now() + HealthConnectServiceImpl.RECORD_COOLDOWN_MS);
    }
}

export const healthConnectService = new HealthConnectServiceImpl();
