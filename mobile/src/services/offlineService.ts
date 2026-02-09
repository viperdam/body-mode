// Offline Service - Network detection and offline fallback infrastructure
// Prevents crashes and errors when user has no internet connection
// ENHANCED: Event-driven network monitoring with pending operation queue

import * as Network from 'expo-network';
import { Alert, AppState, AppStateStatus } from 'react-native';
import storage from './storageService';
import { analytics } from './analyticsService';
import { NetworkState, PendingOperation } from '../types';
import { getNetlifyFunctionUrl } from './netlifyGeminiService';
import i18n from '../i18n';

// Simple EventEmitter for React Native (avoids Node.js 'events' dependency)
class SimpleEventEmitter {
    private events: Map<string, Array<(...args: any[]) => void>> = new Map();

    on(event: string, callback: (...args: any[]) => void): void {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event)!.push(callback);
    }

    off(event: string, callback: (...args: any[]) => void): void {
        const callbacks = this.events.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    emit(event: string, ...args: any[]): void {
        const callbacks = this.events.get(event);
        if (callbacks) {
            callbacks.forEach(callback => callback(...args));
        }
    }

    removeAllListeners(): void {
        this.events.clear();
    }
}

// Storage keys for offline caching
const CACHE_KEYS = {
    LAST_PLAN: 'offline_cache_last_plan',
    LAST_FOOD_ANALYSIS: 'offline_cache_food',
    NETWORK_STATUS: 'offline_last_network_status',
    PENDING_OPERATIONS: '@pending_offline_operations_v2',
};

// Network status type (legacy)
export type NetworkStatus = {
    isConnected: boolean;
    isInternetReachable: boolean | null;
    type: string;
    lastChecked: number;
};

// Cached network status to avoid frequent checks
let cachedNetworkStatus: NetworkStatus | null = null;
let lastNetworkCheck = 0;
const NETWORK_CHECK_INTERVAL = 5000; // 5 seconds

// Event emitter for network state changes
class NetworkEventEmitter extends SimpleEventEmitter {}
const networkEvents = new NetworkEventEmitter();

let monitoringEnabled = true;
let monitoringStarted = false;
let networkCheckTimer: ReturnType<typeof setInterval> | null = null;

// Enhanced network state
let enhancedNetworkState: NetworkState = {
    isOnline: true,
    type: 'unknown',
    lastOnlineAt: Date.now(),
    lastOfflineAt: 0,
};

// Pending operations queue
let pendingOperations: PendingOperation[] = [];

// App state subscription
let appStateSubscription: any = null;

/**
 * Check if device has network connectivity
 * Uses caching to avoid constant network checks
 */
export const checkNetworkConnection = async (): Promise<boolean> => {
    const now = Date.now();

    // Use cached result if recent
    if (cachedNetworkStatus && (now - lastNetworkCheck) < NETWORK_CHECK_INTERVAL) {
        // `isInternetReachable` can be false/unknown transiently; only treat as offline when `isConnected === false`.
        return cachedNetworkStatus.isConnected;
    }

    try {
        const networkState = await Network.getNetworkStateAsync();

        cachedNetworkStatus = {
            // expo-network sometimes reports `null` briefly; treat `null` as "unknown" (assume connected) to avoid false offline UX.
            isConnected: networkState.isConnected !== false,
            isInternetReachable: networkState.isInternetReachable ?? null,
            type: networkState.type ?? 'unknown',
            lastChecked: now,
        };
        lastNetworkCheck = now;

        // Log network status changes
        if (__DEV__) {
            console.log('[OfflineService] Network status:', cachedNetworkStatus);
        }

        const status = cachedNetworkStatus;
        return status.isConnected;
    } catch (error) {
        console.warn('[OfflineService] Failed to check network:', error);
        // Assume connected if we can't check
        return true;
    }
};

/**
 * Get current network status (sync, uses cached value)
 */
export const getNetworkStatus = (): NetworkStatus | null => {
    return cachedNetworkStatus;
};

/**
 * Check if AI endpoint is configured (API key or proxy)
 */
export const isApiKeyConfigured = (): boolean => {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!!apiKey && apiKey.length > 10) return true;
    return !!getNetlifyFunctionUrl();
};

/**
 * Show user-friendly offline message
 */
export const showOfflineAlert = (feature: string = 'this feature'): void => {
    Alert.alert(
        i18n.t('offline.alert.title'),
        i18n.t('offline.alert.body', { feature }),
        [{ text: i18n.t('alert.ok'), style: 'default' }]
    );
};

/**
 * Show user-friendly message when using cached/fallback data
 */
export const showUsingCachedDataAlert = (dataType: string = 'data'): void => {
    // Use a toast-like approach - just log for now, don't interrupt user
    if (__DEV__) {
        console.log(`[OfflineService] Using cached ${dataType} - offline mode`);
    }
};

/**
 * Generic wrapper for async operations with offline fallback
 * - Checks network before calling
 * - Returns cached data if offline
 * - Caches successful results for future offline use
 */
export async function withOfflineFallback<T>(
    operation: () => Promise<T>,
    options: {
        cacheKey?: string;
        fallbackData?: T;
        featureName?: string;
        showAlertOnOffline?: boolean;
        maxCacheAgeMs?: number;
    } = {}
): Promise<{ data: T; fromCache: boolean; isOffline: boolean }> {
    const {
        cacheKey,
        fallbackData,
        featureName = 'This feature',
        showAlertOnOffline = true,
        maxCacheAgeMs = 24 * 60 * 60 * 1000, // 24 hours default
    } = options;

    const isOnline = await checkNetworkConnection();

    // If online, try the operation
    if (isOnline) {
        try {
            const result = await operation();

            // Cache successful result
            if (cacheKey) {
                await storage.set(cacheKey, {
                    data: result,
                    timestamp: Date.now(),
                });
            }

            return { data: result, fromCache: false, isOffline: false };
        } catch (error) {
            // Log error
            analytics.logError(error, 'OfflineService.withOfflineFallback', { featureName });

            // Try cache as fallback on error
            if (cacheKey) {
                const cached = await getCachedData<T>(cacheKey, maxCacheAgeMs);
                if (cached) {
                    return { data: cached, fromCache: true, isOffline: false };
                }
            }

            // Use fallback data if provided
            if (fallbackData !== undefined) {
                return { data: fallbackData, fromCache: false, isOffline: false };
            }

            throw error;
        }
    }

    // Offline path
    if (__DEV__) {
        console.log(`[OfflineService] Offline - attempting fallback for: ${featureName}`);
    }

    // Try to get cached data
    if (cacheKey) {
        const cached = await getCachedData<T>(cacheKey, maxCacheAgeMs);
        if (cached) {
            return { data: cached, fromCache: true, isOffline: true };
        }
    }

    // Use fallback data if provided
    if (fallbackData !== undefined) {
        if (showAlertOnOffline) {
            showOfflineAlert(featureName);
        }
        return { data: fallbackData, fromCache: false, isOffline: true };
    }

    // No fallback available - throw error
    if (showAlertOnOffline) {
        showOfflineAlert(featureName);
    }

    throw new Error(i18n.t('errors.offline.unavailable', { feature: featureName }));
}

/**
 * Get cached data if it exists and isn't expired
 */
async function getCachedData<T>(cacheKey: string, maxAgeMs: number): Promise<T | null> {
    try {
        const cached = await storage.get<{ data: T; timestamp: number }>(cacheKey);

        if (cached && cached.data) {
            const age = Date.now() - cached.timestamp;
            if (age < maxAgeMs) {
                return cached.data;
            } else if (__DEV__) {
                console.log(`[OfflineService] Cache expired for ${cacheKey} (age: ${age}ms)`);
            }
        }
    } catch (error) {
        console.warn('[OfflineService] Failed to read cache:', error);
    }

    return null;
}

/**
 * Manually cache data for offline use
 */
export async function cacheForOffline<T>(key: string, data: T): Promise<void> {
    try {
        await storage.set(key, {
            data,
            timestamp: Date.now(),
        });
    } catch (error) {
        console.warn('[OfflineService] Failed to cache data:', error);
    }
}

/**
 * Clear all offline caches
 */
export const clearOfflineCache = async (): Promise<void> => {
    try {
        await Promise.all([
            storage.remove(CACHE_KEYS.LAST_PLAN),
            storage.remove(CACHE_KEYS.LAST_FOOD_ANALYSIS),
        ]);
    } catch (error) {
        console.warn('[OfflineService] Failed to clear cache:', error);
    }
};

/**
 * Check if we can perform AI operations (online + API key configured)
 */
export const canPerformAIOperations = async (): Promise<{ canProceed: boolean; reason?: string }> => {
    if (!isApiKeyConfigured()) {
        return { canProceed: false, reason: 'API key not configured' };
    }

    const isOnline = await checkNetworkConnection();
    if (!isOnline) {
        return { canProceed: false, reason: 'No internet connection' };
    }

    return { canProceed: true };
};

// ===================================
// ENHANCED: EVENT-DRIVEN NETWORK MONITORING
// ===================================

/**
 * Initialize enhanced network monitoring with event emitter
 */
export async function initializeNetworkMonitoring(): Promise<void> {
    if (!monitoringEnabled) {
        return;
    }
    if (monitoringStarted) {
        return;
    }
    monitoringStarted = true;
    console.log('[OfflineService] Initializing enhanced network monitoring');

    // Load pending operations from storage
    await loadPendingOperations();

    // Set up periodic network check
    setupPeriodicNetworkCheck();

    // Monitor app state changes
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    console.log('[OfflineService] Enhanced monitoring initialized');
}

/**
 * Set up periodic network check to detect changes
 */
function setupPeriodicNetworkCheck(): void {
    if (networkCheckTimer) {
        return;
    }
    networkCheckTimer = setInterval(async () => {
        const wasOnline = enhancedNetworkState.isOnline;
        const isNowOnline = await checkNetworkConnection();

        // Update enhanced state
        enhancedNetworkState = {
            isOnline: isNowOnline,
            type: cachedNetworkStatus?.type === 'wifi' ? 'wifi' :
                  cachedNetworkStatus?.type === 'cellular' ? 'cellular' : 'unknown',
            lastOnlineAt: isNowOnline ? Date.now() : enhancedNetworkState.lastOnlineAt,
            lastOfflineAt: !isNowOnline ? Date.now() : enhancedNetworkState.lastOfflineAt,
        };

        // Detect transitions
        if (!wasOnline && isNowOnline) {
            if (__DEV__) {
                console.log('[OfflineService] Network RESTORED');
            }
            networkEvents.emit('networkRestored', enhancedNetworkState);
            await retryPendingOperations();
        } else if (wasOnline && !isNowOnline) {
            if (__DEV__) {
                console.log('[OfflineService] Network LOST');
            }
            networkEvents.emit('networkLost', enhancedNetworkState);
        }
        networkEvents.emit('statusChanged', enhancedNetworkState);
    }, 15000); // Check every 15 seconds
}

/**
 * Handle app state changes (check network when app comes to foreground)
 */
async function handleAppStateChange(nextAppState: AppStateStatus): Promise<void> {
    if (nextAppState === 'active') {
        console.log('[OfflineService] App foregrounded, checking network');
        const isOnline = await checkNetworkConnection();

        if (isOnline && !enhancedNetworkState.isOnline) {
            // Network restored while app was in background
            enhancedNetworkState.isOnline = true;
            enhancedNetworkState.lastOnlineAt = Date.now();
            networkEvents.emit('networkRestored', enhancedNetworkState);
            await retryPendingOperations();
        }
        networkEvents.emit('statusChanged', enhancedNetworkState);
    }
}

/**
 * Subscribe to network events
 */
export function onNetworkEvent(
    event: 'networkRestored' | 'networkLost' | 'statusChanged',
    callback: (state: NetworkState) => void
): () => void {
    networkEvents.on(event, callback);

    // Return unsubscribe function
    return () => {
        networkEvents.off(event, callback);
    };
}

/**
 * Get enhanced network state
 */
export function getEnhancedNetworkState(): NetworkState {
    return { ...enhancedNetworkState };
}

/**
 * Queue operation for retry when network is restored
 */
export async function queueForRetry(operation: Omit<PendingOperation, 'id' | 'queuedAt' | 'retryCount'>): Promise<void> {
    const pendingOp: PendingOperation = {
        ...operation,
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        queuedAt: Date.now(),
        retryCount: 0,
    };

    pendingOperations.push(pendingOp);
    await savePendingOperations();

    console.log(`[OfflineService] Queued operation for retry: ${operation.operation} (${operation.type})`);
}

/**
 * Retry all pending operations
 */
async function retryPendingOperations(): Promise<void> {
    if (pendingOperations.length === 0) {
        return;
    }

    console.log(`[OfflineService] Retrying ${pendingOperations.length} pending operations`);

    const operations = [...pendingOperations];
    pendingOperations = [];

    for (const op of operations) {
        try {
            // Increment retry count
            op.retryCount++;

            // Check if max retries exceeded
            if (op.retryCount > op.maxRetries) {
                console.warn(`[OfflineService] Operation ${op.id} exceeded max retries, dropping`);
                networkEvents.emit('operationFailed', op);
                continue;
            }

            // Emit event for specific operation type
            networkEvents.emit('retryOperation', op);
            console.log(`[OfflineService] Retrying operation: ${op.operation} (attempt ${op.retryCount}/${op.maxRetries})`);

        } catch (error) {
            console.error(`[OfflineService] Error retrying operation ${op.id}:`, error);
            // Re-queue if retries remaining
            if (op.retryCount < op.maxRetries) {
                pendingOperations.push(op);
            }
        }
    }

    await savePendingOperations();
}

/**
 * Remove operation from queue (called when successfully processed)
 */
export async function removeOperation(operationId: string): Promise<void> {
    const initialCount = pendingOperations.length;
    pendingOperations = pendingOperations.filter(op => op.id !== operationId);

    if (pendingOperations.length < initialCount) {
        await savePendingOperations();
        console.log(`[OfflineService] Removed operation ${operationId} from queue`);
    }
}

/**
 * Get pending operations
 */
export function getPendingOperations(): PendingOperation[] {
    return [...pendingOperations];
}

/**
 * Clear all pending operations
 */
export async function clearPendingOperations(): Promise<void> {
    pendingOperations = [];
    await storage.remove(CACHE_KEYS.PENDING_OPERATIONS);
    console.log('[OfflineService] Cleared all pending operations');
}

/**
 * Load pending operations from storage
 */
async function loadPendingOperations(): Promise<void> {
    try {
        const data = await storage.get<PendingOperation[]>(CACHE_KEYS.PENDING_OPERATIONS);
        if (data && Array.isArray(data)) {
            pendingOperations = data;
            console.log(`[OfflineService] Loaded ${pendingOperations.length} pending operations`);
        }
    } catch (error) {
        console.error('[OfflineService] Error loading pending operations:', error);
        pendingOperations = [];
    }
}

/**
 * Save pending operations to storage
 */
async function savePendingOperations(): Promise<void> {
    try {
        await storage.set(CACHE_KEYS.PENDING_OPERATIONS, pendingOperations);
    } catch (error) {
        console.error('[OfflineService] Error saving pending operations:', error);
    }
}

/**
 * Cleanup network monitoring
 */
function stopNetworkMonitoring(): void {
    if (appStateSubscription) {
        appStateSubscription.remove();
        appStateSubscription = null;
    }

    if (networkCheckTimer) {
        clearInterval(networkCheckTimer);
        networkCheckTimer = null;
    }
    monitoringStarted = false;
    console.log('[OfflineService] Network monitoring stopped');
}

export function cleanupNetworkMonitoring(): void {
    stopNetworkMonitoring();
    networkEvents.removeAllListeners();
    console.log('[OfflineService] Network monitoring cleaned up');
}

export async function setNetworkMonitoringEnabled(enabled: boolean): Promise<void> {
    monitoringEnabled = enabled;
    if (!enabled) {
        stopNetworkMonitoring();
        return;
    }
    await initializeNetworkMonitoring();
}

export function isNetworkMonitoringEnabled(): boolean {
    return monitoringEnabled;
}

// Export cache keys for external use
export const OFFLINE_CACHE_KEYS = CACHE_KEYS;

// Export event emitter for advanced use cases
export { networkEvents };

// Default export for backward compatibility
export default {
    checkConnection: checkNetworkConnection,
    getNetworkStatus,
    getEnhancedNetworkState,
    isApiConfigured: isApiKeyConfigured,
    showOfflineAlert,
    showUsingCachedDataAlert,
    withOfflineFallback,
    cacheForOffline,
    clearOfflineCache,
    canPerformAIOperations,
    initializeNetworkMonitoring,
    onNetworkEvent,
    setNetworkMonitoringEnabled,
    isNetworkMonitoringEnabled,
    queueForRetry,
    removeOperation,
    getPendingOperations,
    clearPendingOperations,
    cleanupNetworkMonitoring,
    CACHE_KEYS,
};
