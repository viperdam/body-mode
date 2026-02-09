import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { analytics } from './analyticsService';
import type { AutoSleepSettings, DailyPlan, OverlaySettings, StorageQuota, CleanupResult } from '../types';
import { getLocalDateKey } from '../utils/dateUtils';

const STORAGE_KEYS = {
    USER: 'ls_user',
    FOOD: 'ls_food',
    ACTIVITY: 'ls_activity',
    SAVED_MEALS: 'ls_saved_meals',
    MOOD: 'ls_mood',
    WEIGHT: 'ls_weight',
    WATER: 'ls_water',
    SLEEP_HISTORY: 'ls_sleep_history',
    SLEEP_HOURS: 'ls_sleep_hours',
    SLEEP_DRAFTS: 'ls_sleep_drafts_v1',
    PENDING_SLEEP_EVENTS_LOCAL: 'ls_pending_sleep_events_v1',
    DAILY_PLAN: 'ls_daily_plan',
    DAILY_WRAPUPS: 'ls_daily_wrapups',
    SAVED_RECIPES: 'ls_saved_recipes',
    CHAT_HISTORY: 'ls_chat_history',
    LAST_WAKE_TIME: 'ls_last_wake_time',
    ACTIVE_DAY_KEY: 'ls_active_day_key',
    HOME_LOCATION: 'ls_home_location',
    LAST_CONTEXT_SNAPSHOT: 'ls_last_context_snapshot',
    LAST_WEATHER: 'ls_last_weather',
    PENDING_WAKE_CONFIRMED: 'ls_pending_wake_confirmed',
    APP_PREFERENCES: 'ls_app_preferences',
    SCHEDULED_NOTIFICATIONS: 'ls_notifications',
    OVERLAY_SETTINGS: 'ls_overlay_settings',
    AUTO_SLEEP_SETTINGS: 'ls_auto_sleep_settings',
    FIRST_INSTALL_TIME: 'ls_first_install_time', // Tracks first app install
    DEFAULTS_INITIALIZED: 'ls_defaults_initialized_v1', // One-time settings bootstrap
    ALARM_CLEANUP_DONE: 'ls_alarm_cleanup_done_v1', // One-time alarm cleanup/migration
    USER_ADAPTIVE_STATS: 'ls_user_adaptive_stats_v1', // Adaptive behavior stats
    LEGAL_ACCEPTED: 'ls_legal_accepted_v1', // Terms + privacy acceptance
    APP_INSTANCE_ID: 'ls_app_instance_id_v1', // Stable device/app instance identifier
    NUTRITION_DB: 'ls_nutrition_db_v1', // Cached nutrient profiles (LLM + local DB)
    NUTRITION_DB_SEEDED: 'ls_nutrition_db_seeded_v1', // One-time nutrition DB seed
    NUTRITION_DB_PENDING: 'ls_nutrition_db_pending_v1', // Pending nutrition lookups (offline)
    CLOUD_SYNC_STATUS: 'ls_cloud_sync_status_v1', // Cloud sync metadata
    LAST_AUTH_UID: 'ls_last_auth_uid_v1', // Last authenticated UID for account switch detection
    PENDING_AUTH_DELETE: 'ls_pending_auth_delete_v1', // Account delete pending re-auth
    LAST_NOTIFICATION_RESPONSE_ID: 'ls_last_notification_response_id_v1', // Last handled notification action response
    ONBOARDING_DRAFT: 'ls_onboarding_draft', // Partial save during onboarding for resume
    LLM_CONTEXT_SNAPSHOT: 'ls_llm_context_snapshot_v1', // Lightweight LLM context cache
    BODY_PROGRESS_SCANS: 'ls_body_progress_scans_v1',
    BODY_PROGRESS_SUMMARY: 'ls_body_progress_summary_v1',
    BODY_PROGRESS_SETTINGS: 'ls_body_progress_settings_v1',
    BODY_PHOTO_CONSENT: 'ls_body_photo_consent_v1',
    CONTEXT_HISTORY: 'ls_context_history_v1',
    CONTEXT_SIGNAL_HISTORY: 'ls_context_signal_history_v1',
    CONTEXT_SENSOR_HEALTH: 'ls_context_sensor_health_v1',
    CONTEXT_GEOFENCE: 'ls_context_geofence_v1',
    CONTEXT_WIFI_DB: 'ls_context_wifi_db_v1',
    CONTEXT_WIFI_SESSION: 'ls_context_wifi_session_v1',
} as const;

/**
 * Get storage key for water log for a specific date
 * Enables per-day water tracking instead of single global value
 */
export const getWaterKey = (dateKey: string): string => `ls_water_${dateKey}`;

/**
 * Get storage key for daily plan for a specific date
 */
export const getPlanKey = (dateKey: string): string => `ls_daily_plan_${dateKey}`;

export type WaterLog = { date: string; amount: number };

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const isDateKey = (value: string | null | undefined): value is string =>
    typeof value === 'string' && DATE_KEY_REGEX.test(value);

/**
 * Sync a DailyPlan to native TxStore for background workers
 * This is called automatically when plans are saved
 */
const syncPlanToTxStore = async (plan: DailyPlan | null): Promise<void> => {
    if (!plan) return;

    try {
        const { txStoreService } = await import('./txStoreService');
        if (!txStoreService.available()) return;
        await txStoreService.syncPlan(plan);
    } catch (error) {
        // Non-critical - log but don't throw
        console.warn('[Storage] TxStore sync failed:', error);
    }
};

/**
 * Sync overlay settings to native TxStore config (Android only).
 */
const syncOverlaySettingsToTxStore = async (settings: OverlaySettings | null): Promise<void> => {
    if (!settings) return;

    try {
        const { txStoreService } = await import('./txStoreService');
        if (!txStoreService.available()) return;
        await txStoreService.updateConfig({
            overlaysEnabled: !!settings.enabled && !!settings.permissionGranted,
            overlayMealEnabled: !!settings.types?.meal,
            overlayHydrationEnabled: !!settings.types?.hydration,
            overlayActivityEnabled: !!settings.types?.workout || !!settings.types?.workBreak,
            overlaySleepEnabled: !!settings.types?.sleep,
        });
    } catch (error) {
        console.warn('[Storage] Overlay settings TxStore sync failed:', error);
    }
};

/**
 * Sync auto-sleep settings to native TxStore config (Android only).
 */
const syncAutoSleepSettingsToTxStore = async (settings: AutoSleepSettings | null): Promise<void> => {
    if (!settings) return;

    try {
        const { txStoreService } = await import('./txStoreService');
        if (!txStoreService.available()) return;
        await txStoreService.updateConfig({
            sleepDetectionEnabled: !!settings.enabled,
            anytimeSleepMode: !!settings.anytimeMode,
            requireChargingForSleep: !!settings.requireCharging,
        });
    } catch (error) {
        console.warn('[Storage] Auto-sleep TxStore sync failed:', error);
    }
};

/**
 * Sync notification preferences to native TxStore config (Android only).
 */
const syncNotificationPrefsToTxStore = async (prefs: any): Promise<void> => {
    if (!prefs) return;

    try {
        const { txStoreService } = await import('./txStoreService');
        if (!txStoreService.available()) return;
        if (typeof prefs.notificationsEnabled === 'boolean') {
            await txStoreService.updateConfig({
                notificationsEnabled: !!prefs.notificationsEnabled,
            });
        }
    } catch (error) {
        console.warn('[Storage] Notification prefs TxStore sync failed:', error);
    }
};

/**
 * Sync ad recharge overlay preferences to native TxStore config (Android only).
 */
const syncAdRechargePrefsToTxStore = async (prefs: any): Promise<void> => {
    if (!prefs) return;

    try {
        const { txStoreService } = await import('./txStoreService');
        if (!txStoreService.available()) return;
        const adRechargeOnWake = prefs.adRechargeOnWake === true;
        const adRechargeOnBackground = prefs.adRechargeOnBackground === true;
        await txStoreService.updateConfig({
            adRechargeOnWake,
            adRechargeOnBackground,
        });
    } catch (error) {
        console.warn('[Storage] Ad recharge prefs TxStore sync failed:', error);
    }
};


// Storage operation result type for better error handling
export interface StorageResult<T> {
    success: boolean;
    data: T | null;
    error?: string;
}

// Callback type for storage error notifications
type StorageErrorCallback = (key: string, operation: string, error: Error) => void;
type StorageAction = 'set' | 'remove' | 'clear';
type StorageListener = (key: string, value: unknown | null, action: StorageAction) => void;
type SetOptions = {
    skipPlanSync?: boolean;
};

let onStorageError: StorageErrorCallback | null = null;
const storageListeners = new Set<StorageListener>();

const notifyStorageListeners = (key: string, value: unknown | null, action: StorageAction): void => {
    storageListeners.forEach((listener) => {
        try {
            listener(key, value, action);
        } catch (error) {
            console.warn('[Storage] Listener error:', error);
        }
    });
};

export const subscribeStorage = (listener: StorageListener): (() => void) => {
    storageListeners.add(listener);
    return () => {
        storageListeners.delete(listener);
    };
};

/**
 * Set a callback to be notified of storage errors
 */
export const setStorageErrorHandler = (callback: StorageErrorCallback | null) => {
    onStorageError = callback;
};

/**
 * Helper to handle and log storage errors consistently
 */
const handleStorageError = (key: string, operation: string, error: unknown): void => {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    analytics.logError(errorObj, 'StorageService', {
        key,
        operation,
        message: errorObj.message,
    });

    if (onStorageError) {
        onStorageError(key, operation, errorObj);
    }
};

// ============ IN-MEMORY CACHE ============
// Provides faster reads by caching frequently accessed data

interface CacheEntry<T> {
    value: T;
    timestamp: number;
    ttl: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SHORT_CACHE_TTL_MS = 30 * 1000; // 30 seconds for frequently changing data

const SHORT_TTL_KEYS = new Set<string>([
    STORAGE_KEYS.WATER,
    STORAGE_KEYS.DAILY_PLAN,
]);

const getTtlForKey = (key: string): number => {
    // Date-keyed hydration values can change frequently; keep TTL short.
    if (key.startsWith('ls_water_')) {
        return SHORT_CACHE_TTL_MS;
    }
    if (SHORT_TTL_KEYS.has(key)) {
        return SHORT_CACHE_TTL_MS;
    }
    return DEFAULT_CACHE_TTL_MS;
};

const isCacheValid = <T>(entry: CacheEntry<T>): boolean => {
    return Date.now() - entry.timestamp < entry.ttl;
};

const getFromCache = <T>(key: string): T | undefined => {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (entry && isCacheValid(entry)) {
        return entry.value;
    }
    if (entry) {
        cache.delete(key);
    }
    return undefined;
};

const setCache = <T>(key: string, value: T): void => {
    cache.set(key, {
        value,
        timestamp: Date.now(),
        ttl: getTtlForKey(key),
    });
};

const invalidateCache = (key: string): void => {
    cache.delete(key);
};

const clearCacheAll = (): void => {
    cache.clear();
};

export const storage = {
    /**
     * Get a value from storage (with cache)
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            // Check cache first (except for secure storage)
            if (key !== STORAGE_KEYS.USER) {
                const cached = getFromCache<T>(key);
                if (cached !== undefined) {
                    return cached;
                }
            }

            let value: string | null = null;
            if (key === STORAGE_KEYS.USER) {
                value = await SecureStore.getItemAsync(key);
            } else {
                value = await AsyncStorage.getItem(key);
            }

            const parsed = value ? JSON.parse(value) : null;

            // Update cache
            if (key !== STORAGE_KEYS.USER && parsed !== null) {
                setCache(key, parsed);
            }

            return parsed;
        } catch (error) {
            handleStorageError(key, 'get', error);
            return null;
        }
    },

    /**
     * Get a value with detailed result including success status
     */
    async getSafe<T>(key: string): Promise<StorageResult<T>> {
        try {
            let value: string | null = null;

            if (key === STORAGE_KEYS.USER) {
                value = await SecureStore.getItemAsync(key);
            } else {
                value = await AsyncStorage.getItem(key);
            }

            if (value === null) {
                return { success: true, data: null };
            }

            return { success: true, data: JSON.parse(value) };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            handleStorageError(key, 'getSafe', error);
            return { success: false, data: null, error: errorMsg };
        }
    },

    /**
     * Set a value in storage (with cache update)
     * Automatically syncs plans to native TxStore for background workers
     */
    async set<T>(key: string, value: T, options?: SetOptions): Promise<boolean> {
        try {
            const jsonValue = JSON.stringify(value);
            if (key === STORAGE_KEYS.USER) {
                await SecureStore.setItemAsync(key, jsonValue);
            } else {
                await AsyncStorage.setItem(key, jsonValue);
                // Update cache on successful write
                setCache(key, value);

                // AUTO-SYNC: If saving a daily plan, sync to native TxStore
                // This enables native background workers to read the plan
                if (!options?.skipPlanSync && key.startsWith(STORAGE_KEYS.DAILY_PLAN)) {
                    syncPlanToTxStore(value as any).catch(err => {
                        console.warn('[Storage] Failed to sync plan to TxStore:', err);
                    });
                }

                if (key === STORAGE_KEYS.OVERLAY_SETTINGS) {
                    syncOverlaySettingsToTxStore(value as any).catch(err => {
                        console.warn('[Storage] Failed to sync overlay settings to TxStore:', err);
                    });
                }

                if (key === STORAGE_KEYS.AUTO_SLEEP_SETTINGS) {
                    syncAutoSleepSettingsToTxStore(value as any).catch(err => {
                        console.warn('[Storage] Failed to sync auto-sleep settings to TxStore:', err);
                    });
                }

                if (key === STORAGE_KEYS.APP_PREFERENCES) {
                    syncNotificationPrefsToTxStore(value as any).catch(err => {
                        console.warn('[Storage] Failed to sync notification prefs to TxStore:', err);
                    });
                    syncAdRechargePrefsToTxStore(value as any).catch(err => {
                        console.warn('[Storage] Failed to sync ad recharge prefs to TxStore:', err);
                    });
                }
            }
            notifyStorageListeners(key, value, 'set');
            return true;
        } catch (error) {
            handleStorageError(key, 'set', error);
            invalidateCache(key);
            return false;
        }
    },

    /**
     * Set a value with detailed result
     */
    async setSafe<T>(key: string, value: T, options?: SetOptions): Promise<StorageResult<T>> {
        try {
            const jsonValue = JSON.stringify(value);
            if (key === STORAGE_KEYS.USER) {
                await SecureStore.setItemAsync(key, jsonValue);
            } else {
                await AsyncStorage.setItem(key, jsonValue);
                setCache(key, value);

                if (!options?.skipPlanSync && key.startsWith(STORAGE_KEYS.DAILY_PLAN)) {
                    syncPlanToTxStore(value as any).catch(err => {
                        console.warn('[Storage] Failed to sync plan to TxStore:', err);
                    });
                }

                if (key === STORAGE_KEYS.OVERLAY_SETTINGS) {
                    syncOverlaySettingsToTxStore(value as any).catch(err => {
                        console.warn('[Storage] Failed to sync overlay settings to TxStore:', err);
                    });
                }

                if (key === STORAGE_KEYS.AUTO_SLEEP_SETTINGS) {
                    syncAutoSleepSettingsToTxStore(value as any).catch(err => {
                        console.warn('[Storage] Failed to sync auto-sleep settings to TxStore:', err);
                    });
                }

                if (key === STORAGE_KEYS.APP_PREFERENCES) {
                    syncNotificationPrefsToTxStore(value as any).catch(err => {
                        console.warn('[Storage] Failed to sync notification prefs to TxStore:', err);
                    });
                    syncAdRechargePrefsToTxStore(value as any).catch(err => {
                        console.warn('[Storage] Failed to sync ad recharge prefs to TxStore:', err);
                    });
                }
            }
            notifyStorageListeners(key, value, 'set');
            return { success: true, data: value };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            handleStorageError(key, 'setSafe', error);
            invalidateCache(key);
            return { success: false, data: null, error: errorMsg };
        }
    },

    /**
     * Remove a value from storage
     */
    async remove(key: string): Promise<boolean> {
        try {
            if (key === STORAGE_KEYS.USER) {
                await SecureStore.deleteItemAsync(key);
            } else {
                await AsyncStorage.removeItem(key);
            }
            invalidateCache(key);
            notifyStorageListeners(key, null, 'remove');
            return true;
        } catch (error) {
            handleStorageError(key, 'remove', error);
            return false;
        }
    },

    /**
     * Clear all AsyncStorage data
     */
    async clear(): Promise<boolean> {
        try {
            await AsyncStorage.clear();
            clearCacheAll();
            notifyStorageListeners('ALL', null, 'clear');
            return true;
        } catch (error) {
            handleStorageError('ALL', 'clear', error);
            return false;
        }
    },

    /**
     * Get multiple keys at once
     */
    async getMultiple<T>(keys: string[]): Promise<Record<string, T | null>> {
        const result: Record<string, T | null> = {};

        for (const key of keys) {
            result[key] = await storage.get<T>(key);
        }

        return result;
    },

    /**
     * Set multiple key-value pairs at once
     */
    async setMultiple<T>(items: Array<{ key: string; value: T }>): Promise<boolean> {
        const results: boolean[] = [];
        for (const { key, value } of items) {
            results.push(await storage.set(key, value));
        }
        return results.every(Boolean);
    },

    /**
     * Check if a key exists in storage
     */
    async exists(key: string): Promise<boolean> {
        try {
            if (key === STORAGE_KEYS.USER) {
                const value = await SecureStore.getItemAsync(key);
                return value !== null;
            }
            const value = await AsyncStorage.getItem(key);
            return value !== null;
        } catch (error) {
            handleStorageError(key, 'exists', error);
            return false;
        }
    },

    /**
     * Get storage quota information
     * Returns total, used, available, and percentUsed
     */
    async getQuota(): Promise<StorageQuota> {
        try {
            const startTime = Date.now();

            // Get all keys from AsyncStorage
            const allKeys = await AsyncStorage.getAllKeys();

            // Get all items to calculate size
            const allItems = await AsyncStorage.multiGet(allKeys);

            let totalBytes = 0;
            allItems.forEach(([key, value]) => {
                if (value) {
                    // Calculate byte size (approximate)
                    totalBytes += new Blob([value]).size;
                }
            });

            // Convert to MB
            const usedMB = totalBytes / (1024 * 1024);

            // AsyncStorage on Android typically has ~6MB limit
            // On iOS it's larger but we use 6MB as conservative estimate
            const totalMB = 6;
            const availableMB = Math.max(0, totalMB - usedMB);
            const percentUsed = (usedMB / totalMB) * 100;

            const duration = Date.now() - startTime;

            console.log(`[Storage] Quota check: ${usedMB.toFixed(2)}MB / ${totalMB}MB (${percentUsed.toFixed(1)}%) - ${allKeys.length} keys - ${duration}ms`);

            return {
                total: totalMB,
                used: parseFloat(usedMB.toFixed(2)),
                available: parseFloat(availableMB.toFixed(2)),
                percentUsed: parseFloat(percentUsed.toFixed(1)),
            };

        } catch (error) {
            handleStorageError('QUOTA', 'getQuota', error);

            // Return conservative estimate on error
            return {
                total: 6,
                used: 3,
                available: 3,
                percentUsed: 50,
            };
        }
    },

    /**
     * Cleanup old dated storage keys
     * Deletes keys older than specified number of days
     * @param olderThanDays - Delete keys older than this many days (default: 90)
     * @returns CleanupResult with deleted keys, freed space, and duration
     */
    async cleanup(olderThanDays: number = 90): Promise<CleanupResult> {
        const startTime = Date.now();
        let deletedKeys: string[] = [];
        let freedBytes = 0;

        try {
            console.log(`[Storage] Starting cleanup (older than ${olderThanDays} days)`);

            // Get all keys
            const allKeys = await AsyncStorage.getAllKeys();

            // Calculate cutoff date
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
            const cutoffDateKey = getLocalDateKey(cutoffDate);

            console.log(`[Storage] Cutoff date: ${cutoffDateKey}`);

            // Identify dated keys to delete
            const keysToDelete: string[] = [];

            for (const key of allKeys) {
                // Extract date from keys like:
                // ls_daily_plan_2024-01-15
                // ls_water_2024-01-15
                // @pending_plan_2024-01-15
                const dateMatch = key.match(/(\d{4}-\d{2}-\d{2})/);

                if (dateMatch) {
                    const dateKey = dateMatch[1];

                    // Check if date is older than cutoff
                    if (dateKey < cutoffDateKey) {
                        keysToDelete.push(key);
                    }
                }
            }

            console.log(`[Storage] Found ${keysToDelete.length} keys to delete`);

            // Calculate freed space before deletion
            if (keysToDelete.length > 0) {
                const itemsToDelete = await AsyncStorage.multiGet(keysToDelete);
                itemsToDelete.forEach(([key, value]) => {
                    if (value) {
                        freedBytes += new Blob([value]).size;
                    }
                });

                // Delete keys
                await AsyncStorage.multiRemove(keysToDelete);
                deletedKeys = keysToDelete;

                // Invalidate cache for deleted keys
                keysToDelete.forEach(key => invalidateCache(key));
            }

            const freedMB = freedBytes / (1024 * 1024);
            const duration = Date.now() - startTime;

            console.log(`[Storage] Cleanup complete: deleted ${deletedKeys.length} keys, freed ${freedMB.toFixed(2)}MB in ${duration}ms`);

            analytics.logEvent('storage_cleanup', {
                deletedCount: deletedKeys.length,
                freedMB: parseFloat(freedMB.toFixed(2)),
                olderThanDays,
                duration,
            });

            return {
                deletedKeys,
                freedMB: parseFloat(freedMB.toFixed(2)),
                duration,
            };

        } catch (error) {
            handleStorageError('CLEANUP', 'cleanup', error);

            const duration = Date.now() - startTime;

            return {
                deletedKeys,
                freedMB: parseFloat((freedBytes / (1024 * 1024)).toFixed(2)),
                duration,
            };
        }
    },

    /**
     * Invalidate cache for a specific key
     */
    invalidateCache,

    /**
     * Clear the entire cache
     */
    clearCache: clearCacheAll,
    subscribe: subscribeStorage,

    keys: STORAGE_KEYS,
};

/**
 * Read water amount for a specific date.
 * - Prefers date-keyed storage (`ls_water_<YYYY-MM-DD>`)
 * - Falls back to legacy single-key storage (`ls_water`) when it matches the requested date
 * - Optionally migrates legacy -> date-keyed for consistency
 */
export const getWaterAmountForDate = async (
    dateKey: string,
    options: { migrateLegacy?: boolean } = { migrateLegacy: true }
): Promise<number> => {
    const normalizedKey = isDateKey(dateKey) ? dateKey : getLocalDateKey(new Date(dateKey));

    const perDate = await storage.get<number>(getWaterKey(normalizedKey));
    if (typeof perDate === 'number') return perDate;

    const legacy = await storage.get<WaterLog>(STORAGE_KEYS.WATER);
    const legacyAmount =
        legacy && isDateKey(legacy.date) && legacy.date === normalizedKey && typeof legacy.amount === 'number'
            ? legacy.amount
            : 0;

    if (options.migrateLegacy && legacyAmount > 0) {
        // Best-effort migration; ignore result (read path must not throw)
        void storage.set(getWaterKey(normalizedKey), legacyAmount);
    }

    return legacyAmount;
};

/**
 * Set water amount for a specific date.
 * Keeps legacy `ls_water` in sync for *today* only, so older code paths stay correct.
 */
export const setWaterAmountForDate = async (dateKey: string, amount: number): Promise<boolean> => {
    const normalizedKey = isDateKey(dateKey) ? dateKey : getLocalDateKey(new Date(dateKey));
    const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;

    const results: boolean[] = [];
    results.push(await storage.set(getWaterKey(normalizedKey), safeAmount));

    const todayKeyNow = getLocalDateKey(new Date());
    if (normalizedKey === todayKeyNow) {
        results.push(await storage.set<WaterLog>(STORAGE_KEYS.WATER, { date: todayKeyNow, amount: safeAmount }));
    }

    return results.every(Boolean);
};

/**
 * Increment water amount for a specific date and return the new total.
 */
export const addWaterForDate = async (dateKey: string, delta: number): Promise<number> => {
    const normalizedKey = isDateKey(dateKey) ? dateKey : getLocalDateKey(new Date(dateKey));
    const current = await getWaterAmountForDate(normalizedKey);
    const next = Math.max(0, Math.round(current + delta));
    await setWaterAmountForDate(normalizedKey, next);
    return next;
};

export default storage;
