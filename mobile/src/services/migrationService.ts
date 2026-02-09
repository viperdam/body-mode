/**
 * Migration Service - Schema Versioning & Data Migration
 *
 * Handles schema versioning for AsyncStorage data structures.
 * Automatically runs migrations on app startup to keep data format current.
 *
 * Features:
 * - Automatic backup before migration
 * - Rollback on failure
 * - Migration history tracking
 * - Safe, idempotent migrations
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Migration, MigrationBackup, CURRENT_SCHEMA_VERSION } from '../types';
import storage from './storageService';
import { analytics } from './analyticsService';
import i18n from '../i18n';

const MIGRATION_VERSION_KEY = '@schema_version';
const MIGRATION_BACKUP_KEY = '@migration_backup';
const MIGRATION_HISTORY_KEY = '@migration_history';

// Define all migrations in order
const migrations: Migration[] = [
    {
        version: 2,
        description: 'Add location context to plan items',
        up: async () => {
            console.log('[Migration] v2: Adding location context to plans');

            const keys = await AsyncStorage.getAllKeys();
            const planKeys = keys.filter(k => k.startsWith('ls_daily_plan_'));

            for (const key of planKeys) {
                try {
                    const data = await AsyncStorage.getItem(key);
                    if (data) {
                        const plan = JSON.parse(data);

                        // Add locationContext field if missing
                        if (plan && !plan.locationContext) {
                            plan.locationContext = null;
                            await AsyncStorage.setItem(key, JSON.stringify(plan));
                        }
                    }
                } catch (error) {
                    console.warn(`[Migration] Failed to migrate ${key}:`, error);
                }
            }

            console.log(`[Migration] v2: Migrated ${planKeys.length} plans`);
        },
        down: async () => {
            // Remove locationContext field
            const keys = await AsyncStorage.getAllKeys();
            const planKeys = keys.filter(k => k.startsWith('ls_daily_plan_'));

            for (const key of planKeys) {
                try {
                    const data = await AsyncStorage.getItem(key);
                    if (data) {
                        const plan = JSON.parse(data);

                        if (plan && plan.locationContext !== undefined) {
                            delete plan.locationContext;
                            await AsyncStorage.setItem(key, JSON.stringify(plan));
                        }
                    }
                } catch (error) {
                    console.warn(`[Migration] Rollback failed for ${key}:`, error);
                }
            }
        },
    },

    {
        version: 3,
        description: 'Restructure sleep sessions with stages and efficiency score',
        up: async () => {
            console.log('[Migration] v3: Restructuring sleep sessions');

            try {
                const sessions = await storage.get<any[]>('ls_sleep_history');

                if (sessions && Array.isArray(sessions)) {
                    const migratedSessions = sessions.map(session => {
                        // Add new fields if missing
                        if (!session.stages) {
                            session.stages = [];
                        }
                        if (session.efficiencyScore === undefined) {
                            session.efficiencyScore = 85; // Default estimate
                        }

                        return session;
                    });

                    await storage.set('ls_sleep_history', migratedSessions);
                    console.log(`[Migration] v3: Migrated ${migratedSessions.length} sleep sessions`);
                }
            } catch (error) {
                console.warn('[Migration] Failed to migrate sleep sessions:', error);
            }
        },
        down: async () => {
            // Revert to flat structure
            const sessions = await storage.get<any[]>('ls_sleep_history');

            if (sessions && Array.isArray(sessions)) {
                const revertedSessions = sessions.map(session => {
                    delete session.stages;
                    delete session.efficiencyScore;
                    return session;
                });

                await storage.set('ls_sleep_history', revertedSessions);
            }
        },
    },

    {
        version: 4,
        description: 'Backfill schemaVersion for user profile, plans, and sleep events',
        up: async () => {
            console.log('[Migration] v4: Backfilling schemaVersion fields');

            try {
                const user = await storage.get<any>(storage.keys.USER);
                if (user && typeof user === 'object') {
                    const sleepRoutine = user.sleepRoutine && typeof user.sleepRoutine === 'object'
                        ? user.sleepRoutine
                        : { isConsistent: true, wakeWindowMinutes: 30 };
                    if (typeof sleepRoutine.wakeWindowMinutes !== 'number') {
                        sleepRoutine.wakeWindowMinutes = 30;
                    }
                    const nextUser = {
                        ...user,
                        schemaVersion: user.schemaVersion ?? CURRENT_SCHEMA_VERSION,
                        sleepRoutine,
                    };
                    await storage.set(storage.keys.USER, nextUser);
                }
            } catch (error) {
                console.warn('[Migration] v4: Failed to migrate user profile:', error);
            }

            try {
                const keys = await AsyncStorage.getAllKeys();
                const planKeys = keys.filter(k => k === storage.keys.DAILY_PLAN || k.startsWith('ls_daily_plan_'));

                for (const key of planKeys) {
                    const data = await AsyncStorage.getItem(key);
                    if (!data) continue;
                    try {
                        const plan = JSON.parse(data);
                        if (plan && typeof plan === 'object') {
                            plan.schemaVersion = plan.schemaVersion ?? CURRENT_SCHEMA_VERSION;
                            await AsyncStorage.setItem(key, JSON.stringify(plan));
                        }
                    } catch (error) {
                        console.warn(`[Migration] v4: Failed to migrate plan ${key}:`, error);
                    }
                }
            } catch (error) {
                console.warn('[Migration] v4: Failed to migrate plans:', error);
            }

            try {
                const events = await storage.get<any[]>(storage.keys.PENDING_SLEEP_EVENTS_LOCAL);
                if (Array.isArray(events)) {
                    const nextEvents = events.map(event => {
                        const data = event?.data && typeof event.data === 'object' ? event.data : {};
                        return {
                            ...event,
                            data: {
                                ...data,
                                schemaVersion: data.schemaVersion ?? CURRENT_SCHEMA_VERSION,
                            },
                        };
                    });
                    await storage.set(storage.keys.PENDING_SLEEP_EVENTS_LOCAL, nextEvents);
                }
            } catch (error) {
                console.warn('[Migration] v4: Failed to migrate pending sleep events:', error);
            }
        },
        down: async () => {
            try {
                const user = await storage.get<any>(storage.keys.USER);
                if (user && typeof user === 'object' && 'schemaVersion' in user) {
                    const { schemaVersion, ...rest } = user;
                    await storage.set(storage.keys.USER, rest);
                }
            } catch (error) {
                console.warn('[Migration] v4: Rollback user profile failed:', error);
            }

            try {
                const keys = await AsyncStorage.getAllKeys();
                const planKeys = keys.filter(k => k === storage.keys.DAILY_PLAN || k.startsWith('ls_daily_plan_'));
                for (const key of planKeys) {
                    const data = await AsyncStorage.getItem(key);
                    if (!data) continue;
                    try {
                        const plan = JSON.parse(data);
                        if (plan && typeof plan === 'object' && 'schemaVersion' in plan) {
                            delete plan.schemaVersion;
                            await AsyncStorage.setItem(key, JSON.stringify(plan));
                        }
                    } catch (error) {
                        console.warn(`[Migration] v4: Rollback failed for plan ${key}:`, error);
                    }
                }
            } catch (error) {
                console.warn('[Migration] v4: Rollback plans failed:', error);
            }

            try {
                const events = await storage.get<any[]>(storage.keys.PENDING_SLEEP_EVENTS_LOCAL);
                if (Array.isArray(events)) {
                    const nextEvents = events.map(event => {
                        const data = event?.data && typeof event.data === 'object' ? { ...event.data } : {};
                        delete data.schemaVersion;
                        return { ...event, data };
                    });
                    await storage.set(storage.keys.PENDING_SLEEP_EVENTS_LOCAL, nextEvents);
                }
            } catch (error) {
                console.warn('[Migration] v4: Rollback pending sleep events failed:', error);
            }
        },
    },

    {
        version: 5,
        description: 'Migrate onboarding draft to canonical storage key',
        up: async () => {
            console.log('[Migration] v5: Migrating onboarding draft key');
            const targetKey = storage.keys.ONBOARDING_DRAFT;
            const legacyKeys = ['@onboarding_draft', 'onboarding_draft', 'ls_onboarding_draft_v0'];

            try {
                const existing = await AsyncStorage.getItem(targetKey);
                if (existing) {
                    return;
                }

                for (const key of legacyKeys) {
                    const legacy = await AsyncStorage.getItem(key);
                    if (legacy) {
                        await AsyncStorage.setItem(targetKey, legacy);
                        await AsyncStorage.removeItem(key);
                        console.log(`[Migration] v5: Migrated onboarding draft from ${key}`);
                        break;
                    }
                }
            } catch (error) {
                console.warn('[Migration] v5: Failed to migrate onboarding draft:', error);
            }
        },
        down: async () => {
            // No-op: keep canonical draft if present
        },
    },

    {
        version: 6,
        description: 'Add BioSnapshot storage and BioContextConfig defaults',
        up: async () => {
            console.log('[Migration] v6: Initializing bio context storage');
            await AsyncStorage.setItem('@bio_config', JSON.stringify({
                enableHRV: true,
                enableRestingHR: true,
                enableSpO2: true,
                enableBodyTemp: true,
                enableBasalBodyTemp: true,
                enableRespiratoryRate: true,
                enableVo2Max: true,
                enableBloodGlucose: true,
                enableBasalMetabolicRate: true,
                enableBodyWeight: true,
                enableBodyFat: true,
                enableHydration: true,
                enableNutrition: true,
                enableExerciseSessions: true,
                enableMenstruation: true,
                enableSteps: true,
                enableDistance: true,
                enableActiveCalories: true,
                enableCurrentHR: true,
                enableSleepStages: true,
                dataRetentionDays: 30,
                shareWithAI: true,
            }));
            console.log('[Migration] v6: Bio context initialized');
        },
        down: async () => {
            await AsyncStorage.removeItem('@bio_config');
            await AsyncStorage.removeItem('@bio_snapshot');
        },
    },

    // Add more migrations here as schema evolves
];

class MigrationService {
    private isRunning = false;

    /**
     * Run pending migrations
     */
    async runMigrations(): Promise<void> {
        if (this.isRunning) {
            console.warn('[Migration] Migration already in progress');
            return;
        }

        this.isRunning = true;

        try {
            console.log('[Migration] Starting migration check');

            const currentVersion = await this.getCurrentVersion();
            console.log(`[Migration] Current schema version: ${currentVersion}, Target: ${CURRENT_SCHEMA_VERSION}`);

            if (currentVersion === CURRENT_SCHEMA_VERSION) {
                console.log('[Migration] Schema up to date');
                return;
            }

            // Check if downgrade (not supported)
            if (currentVersion > CURRENT_SCHEMA_VERSION) {
                console.error('[Migration] Schema downgrade not supported!');
                analytics.logEvent('migration_downgrade_attempted', {
                    currentVersion,
                    targetVersion: CURRENT_SCHEMA_VERSION,
                });
                return;
            }

            // Create backup before migration
            console.log('[Migration] Creating backup');
            await this.createBackup(currentVersion);

            // Run pending migrations in order
            const pendingMigrations = migrations.filter(m => m.version > currentVersion);
            console.log(`[Migration] Running ${pendingMigrations.length} pending migrations`);

            for (const migration of pendingMigrations) {
                try {
                    console.log(`[Migration] Running v${migration.version}: ${migration.description}`);

                    await migration.up();
                    await this.setCurrentVersion(migration.version);
                    await this.recordMigrationHistory(migration.version, migration.description);

                    console.log(`[Migration] ✓ Completed v${migration.version}`);

                    analytics.logEvent('migration_success', {
                        version: migration.version,
                        description: migration.description,
                    });

                } catch (error) {
                    console.error(`[Migration] ✗ Failed v${migration.version}:`, error);

                    analytics.logError(error as Error, 'migration_failed', {
                        version: migration.version,
                        description: migration.description,
                    });

                    // Restore from backup
                    console.log('[Migration] Rolling back to backup');
                    await this.restoreFromBackup();

                    throw new Error(i18n.t('errors.migration.failed', { version: migration.version, error }));
                }
            }

            console.log('[Migration] All migrations completed successfully');

        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get current schema version
     */
    private async getCurrentVersion(): Promise<number> {
        try {
            const version = await AsyncStorage.getItem(MIGRATION_VERSION_KEY);
            return version ? parseInt(version, 10) : 1; // Default to version 1
        } catch (error) {
            console.error('[Migration] Error getting version:', error);
            return 1;
        }
    }

    /**
     * Set current schema version
     */
    private async setCurrentVersion(version: number): Promise<void> {
        try {
            await AsyncStorage.setItem(MIGRATION_VERSION_KEY, version.toString());
        } catch (error) {
            console.error('[Migration] Error setting version:', error);
            throw error;
        }
    }

    /**
     * Create full backup before migration
     */
    private async createBackup(version: number): Promise<void> {
        try {
            const allKeys = await AsyncStorage.getAllKeys();
            const backup: Record<string, string> = {};

            // Backup all data
            const items = await AsyncStorage.multiGet(allKeys);
            items.forEach(([key, value]) => {
                if (value) {
                    backup[key] = value;
                }
            });

            const migrationBackup: MigrationBackup = {
                version,
                timestamp: Date.now(),
                data: backup,
            };

            await AsyncStorage.setItem(MIGRATION_BACKUP_KEY, JSON.stringify(migrationBackup));
            console.log(`[Migration] Backed up ${allKeys.length} keys`);

        } catch (error) {
            console.error('[Migration] Backup failed:', error);
            throw new Error(i18n.t('errors.migration.backup_failed'));
        }
    }

    /**
     * Restore from backup (called on migration failure)
     */
    private async restoreFromBackup(): Promise<void> {
        try {
            const backupData = await AsyncStorage.getItem(MIGRATION_BACKUP_KEY);

            if (!backupData) {
                console.error('[Migration] No backup found for restore');
                return;
            }

            const backup: MigrationBackup = JSON.parse(backupData);

            console.log(`[Migration] Restoring backup from v${backup.version}`);

            // Clear current data
            await AsyncStorage.clear();

            // Restore backup
            const entries = Object.entries(backup.data);
            await AsyncStorage.multiSet(entries);

            // Restore version
            await this.setCurrentVersion(backup.version);

            console.log(`[Migration] Restored ${entries.length} keys from backup`);

            analytics.logEvent('migration_backup_restored', {
                version: backup.version,
                keysRestored: entries.length,
            });

        } catch (error) {
            console.error('[Migration] Restore from backup failed:', error);
            throw new Error(i18n.t('errors.migration.backup_restore_failed'));
        }
    }

    /**
     * Record migration in history log
     */
    private async recordMigrationHistory(version: number, description: string): Promise<void> {
        try {
            const history = await storage.get<any[]>(MIGRATION_HISTORY_KEY) || [];

            history.push({
                version,
                description,
                timestamp: Date.now(),
            });

            await storage.set(MIGRATION_HISTORY_KEY, history);

        } catch (error) {
            console.warn('[Migration] Failed to record history:', error);
        }
    }

    /**
     * Get migration history
     */
    async getMigrationHistory(): Promise<any[]> {
        try {
            return await storage.get<any[]>(MIGRATION_HISTORY_KEY) || [];
        } catch (error) {
            console.error('[Migration] Error getting history:', error);
            return [];
        }
    }

    /**
     * Check if backup exists
     */
    async hasBackup(): Promise<boolean> {
        try {
            const backup = await AsyncStorage.getItem(MIGRATION_BACKUP_KEY);
            return !!backup;
        } catch (error) {
            return false;
        }
    }

    /**
     * Manually trigger backup (for testing/debugging)
     */
    async manualBackup(): Promise<void> {
        const currentVersion = await this.getCurrentVersion();
        await this.createBackup(currentVersion);
        console.log('[Migration] Manual backup created');
    }

    /**
     * Manually restore backup (for testing/debugging)
     */
    async manualRestore(): Promise<void> {
        await this.restoreFromBackup();
        console.log('[Migration] Manual restore completed');
    }
}

// Export singleton instance
export const migrationService = new MigrationService();
