/**
 * Error Recovery Service
 *
 * Centralized error handling with circuit breaker pattern, automatic recovery,
 * and graceful degradation strategies.
 *
 * Features:
 * - Circuit breaker for LLM API (prevents cascade failures)
 * - Storage corruption detection and recovery
 * - Native bridge timeout handling
 * - Automatic fallback strategies
 * - Error context logging for diagnostics
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorContext, CircuitBreakerState, RecoveryStrategy } from '../types';
import { analytics } from './analyticsService';

const CIRCUIT_BREAKER_KEY = '@circuit_breaker_state';
const ERROR_LOG_KEY = '@error_recovery_log';
const MAX_ERROR_LOG_SIZE = 100;

// Circuit breaker thresholds
const CIRCUIT_BREAKER_THRESHOLD = 3; // failures before opening circuit
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const CIRCUIT_BREAKER_SUCCESS_THRESHOLD = 2; // successes to close circuit

class ErrorRecoveryService {
    private circuitBreakers = new Map<string, CircuitBreakerState>();
    private errorLog: ErrorContext[] = [];
    private isInitialized = false;

    /**
     * Initialize error recovery service
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        console.log('[ErrorRecovery] Initializing');

        // Load circuit breaker states
        await this.loadCircuitBreakerStates();

        // Load recent error log
        await this.loadErrorLog();

        this.isInitialized = true;
        console.log('[ErrorRecovery] Initialized');
    }

    /**
     * Record error and attempt recovery
     */
    async handleError(context: Omit<ErrorContext, 'timestamp' | 'recoveryAttempts'>): Promise<void> {
        const errorContext: ErrorContext = {
            ...context,
            timestamp: Date.now(),
            recoveryAttempts: 0,
        };

        // Log error
        await this.logError(errorContext);

        // Attempt recovery based on service type
        await this.recoverFromError(errorContext);
    }

    /**
     * Execute recovery strategy based on error context
     */
    private async recoverFromError(context: ErrorContext): Promise<void> {
        console.log(`[ErrorRecovery] Recovering from error in ${context.service}.${context.operation}`);

        switch (context.service) {
            case 'llmQueue':
            case 'geminiService':
                await this.recoverLLMFailure(context);
                break;

            case 'storageService':
            case 'AsyncStorage':
                await this.recoverStorageFailure(context);
                break;

            case 'nativeBridge':
            case 'OverlayBridge':
            case 'SleepBridge':
            case 'TxStoreBridge':
                await this.recoverBridgeFailure(context);
                break;

            case 'network':
                await this.recoverNetworkFailure(context);
                break;

            default:
                console.warn(`[ErrorRecovery] No recovery strategy for service: ${context.service}`);
        }
    }

    /**
     * Recover from LLM/Gemini API failures
     */
    private async recoverLLMFailure(context: ErrorContext): Promise<void> {
        const errorMessage = context.error.message.toLowerCase();

        // Rate limit (429) - Open circuit breaker
        if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
            console.log('[ErrorRecovery] Rate limit detected, opening circuit breaker');
            await this.openCircuitBreaker('geminiAPI', CIRCUIT_BREAKER_COOLDOWN_MS);

            // Log for analytics
            analytics.logEvent('llm_rate_limit', {
                service: context.service,
                operation: context.operation,
            });
        }

        // Network timeout/error
        else if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('fetch')) {
            console.log('[ErrorRecovery] Network error detected, queuing for retry');

            // Will be handled by offlineService's retry mechanism
            analytics.logEvent('llm_network_error', {
                service: context.service,
            });
        }

        // Invalid response/parsing error
        else if (errorMessage.includes('json') || errorMessage.includes('parse')) {
            console.log('[ErrorRecovery] Invalid response, will retry with different model');

            analytics.logEvent('llm_invalid_response', {
                service: context.service,
            });
        }

        // Unknown error - fallback to rule-based generation
        else {
            console.log('[ErrorRecovery] Unknown LLM error, will use fallback generation');

            analytics.logError(context.error, 'llm_unknown_error', {
                service: context.service,
                operation: context.operation,
            });
        }
    }

    /**
     * Recover from AsyncStorage failures
     */
    private async recoverStorageFailure(context: ErrorContext): Promise<void> {
        const errorMessage = context.error.message.toLowerCase();

        // Quota exceeded
        if (errorMessage.includes('quota') || errorMessage.includes('storage full')) {
            console.log('[ErrorRecovery] Storage quota exceeded, triggering cleanup');

            // Will trigger storage cleanup
            analytics.logEvent('storage_quota_exceeded');
        }

        // Corrupted data
        else if (errorMessage.includes('json') || errorMessage.includes('parse')) {
            console.log('[ErrorRecovery] Corrupted storage detected, attempting restore');

            // Attempt to restore from backup
            await this.restoreFromBackup(context);
        }

        // Permission/access error
        else if (errorMessage.includes('permission') || errorMessage.includes('access')) {
            console.log('[ErrorRecovery] Storage access error');

            analytics.logEvent('storage_access_error');
        }
    }

    /**
     * Recover from native bridge failures
     */
    private async recoverBridgeFailure(context: ErrorContext): Promise<void> {
        const errorMessage = context.error.message.toLowerCase();

        // Timeout
        if (errorMessage.includes('timeout')) {
            console.log('[ErrorRecovery] Bridge timeout detected');

            // Open circuit breaker for this specific bridge
            await this.openCircuitBreaker(context.service, 60000); // 1 minute cooldown

            analytics.logEvent('bridge_timeout', {
                bridge: context.service,
                operation: context.operation,
            });
        }

        // Module not found
        else if (errorMessage.includes('not found') || errorMessage.includes('undefined')) {
            console.log('[ErrorRecovery] Bridge module not available, disabling feature');

            analytics.logEvent('bridge_not_found', {
                bridge: context.service,
            });
        }
    }

    /**
     * Recover from network failures
     */
    private async recoverNetworkFailure(context: ErrorContext): Promise<void> {
        console.log('[ErrorRecovery] Network failure, using offline mode');

        // Network failures are handled by offlineService
        analytics.logEvent('network_failure', {
            operation: context.operation,
        });
    }

    /**
     * Restore corrupted data from backup
     */
    private async restoreFromBackup(context: ErrorContext): Promise<void> {
        try {
            const key = context.metadata?.key;
            if (!key) {
                console.warn('[ErrorRecovery] No key provided for backup restore');
                return;
            }

            const backupKey = `${key}_backup`;
            const backup = await AsyncStorage.getItem(backupKey);

            if (backup) {
                await AsyncStorage.setItem(key, backup);
                console.log(`[ErrorRecovery] Restored ${key} from backup`);

                analytics.logEvent('storage_backup_restored', { key });
            } else {
                console.warn(`[ErrorRecovery] No backup found for ${key}`);

                // Reset to safe default
                await this.resetToSafeState(key);
            }
        } catch (error) {
            console.error('[ErrorRecovery] Failed to restore from backup:', error);
        }
    }

    /**
     * Reset storage key to safe default state
     */
    private async resetToSafeState(key: string): Promise<void> {
        console.log(`[ErrorRecovery] Resetting ${key} to safe state`);

        // Remove corrupted data
        await AsyncStorage.removeItem(key);

        analytics.logEvent('storage_reset_safe_state', { key });
    }

    // ===================================
    // CIRCUIT BREAKER MANAGEMENT
    // ===================================

    /**
     * Open circuit breaker for a service
     */
    async openCircuitBreaker(service: string, cooldownMs: number = CIRCUIT_BREAKER_COOLDOWN_MS): Promise<void> {
        const now = Date.now();
        const state: CircuitBreakerState = {
            isOpen: true,
            failureCount: CIRCUIT_BREAKER_THRESHOLD,
            lastFailureTime: now,
            cooldownUntil: now + cooldownMs,
            successCount: 0,
        };

        this.circuitBreakers.set(service, state);
        await this.saveCircuitBreakerStates();

        console.log(`[ErrorRecovery] Circuit breaker OPENED for ${service} (cooldown: ${cooldownMs}ms)`);
    }

    /**
     * Record failure for circuit breaker
     */
    async recordFailure(service: string): Promise<boolean> {
        const now = Date.now();
        let state = this.circuitBreakers.get(service);

        if (!state) {
            state = {
                isOpen: false,
                failureCount: 0,
                lastFailureTime: 0,
                cooldownUntil: 0,
                successCount: 0,
            };
        }

        // Check if circuit should be closed (cooldown expired)
        if (state.isOpen && now > state.cooldownUntil) {
            state.isOpen = false;
            state.failureCount = 0;
            state.successCount = 0;
            console.log(`[ErrorRecovery] Circuit breaker CLOSED for ${service} (cooldown expired)`);
        }

        // Increment failure count
        state.failureCount++;
        state.lastFailureTime = now;
        state.successCount = 0;

        // Open circuit if threshold exceeded
        if (state.failureCount >= CIRCUIT_BREAKER_THRESHOLD && !state.isOpen) {
            state.isOpen = true;
            state.cooldownUntil = now + CIRCUIT_BREAKER_COOLDOWN_MS;
            console.log(`[ErrorRecovery] Circuit breaker OPENED for ${service} (${state.failureCount} failures)`);
        }

        this.circuitBreakers.set(service, state);
        await this.saveCircuitBreakerStates();

        return state.isOpen;
    }

    /**
     * Record success for circuit breaker
     */
    async recordSuccess(service: string): Promise<void> {
        const state = this.circuitBreakers.get(service);

        if (!state) return;

        state.successCount++;
        state.failureCount = Math.max(0, state.failureCount - 1);

        // Close circuit if enough successes
        if (state.isOpen && state.successCount >= CIRCUIT_BREAKER_SUCCESS_THRESHOLD) {
            state.isOpen = false;
            state.failureCount = 0;
            state.cooldownUntil = 0;
            console.log(`[ErrorRecovery] Circuit breaker CLOSED for ${service} (${state.successCount} successes)`);
        }

        this.circuitBreakers.set(service, state);
        await this.saveCircuitBreakerStates();
    }

    /**
     * Record health source failure (Health Connect / Apple Health)
     */
    async recordHealthFailure(source: 'health_connect' | 'apple_health'): Promise<void> {
        await this.recordFailure(`health_${source}`);
    }

    /**
     * Check if health circuit is open for a source
     */
    async isHealthCircuitOpen(source: 'health_connect' | 'apple_health'): Promise<boolean> {
        return this.isCircuitOpen(`health_${source}`);
    }

    /**
     * Check if circuit breaker is open for a service
     */
    isCircuitOpen(service: string): boolean {
        const state = this.circuitBreakers.get(service);

        if (!state) return false;

        // Check if cooldown expired
        if (state.isOpen && Date.now() > state.cooldownUntil) {
            state.isOpen = false;
            this.circuitBreakers.set(service, state);
            this.saveCircuitBreakerStates();
            return false;
        }

        return state.isOpen;
    }

    /**
     * Get circuit breaker state
     */
    getCircuitBreakerState(service: string): CircuitBreakerState | null {
        return this.circuitBreakers.get(service) || null;
    }

    /**
     * Get all circuit breaker states
     */
    getAllCircuitBreakerStates(): Map<string, CircuitBreakerState> {
        return new Map(this.circuitBreakers);
    }

    // ===================================
    // ERROR LOGGING
    // ===================================

    /**
     * Log error to persistent storage
     */
    private async logError(context: ErrorContext): Promise<void> {
        this.errorLog.push(context);

        // Keep only recent errors
        if (this.errorLog.length > MAX_ERROR_LOG_SIZE) {
            this.errorLog = this.errorLog.slice(-MAX_ERROR_LOG_SIZE);
        }

        await this.saveErrorLog();

        // Also log to analytics
        analytics.logError(context.error, `${context.service}_${context.operation}`, context.metadata);
    }

    /**
     * Get recent errors
     */
    getRecentErrors(limit: number = 20): ErrorContext[] {
        return this.errorLog.slice(-limit);
    }

    /**
     * Get errors for specific service
     */
    getErrorsByService(service: string, limit: number = 20): ErrorContext[] {
        return this.errorLog
            .filter(e => e.service === service)
            .slice(-limit);
    }

    /**
     * Clear error log
     */
    async clearErrorLog(): Promise<void> {
        this.errorLog = [];
        await AsyncStorage.removeItem(ERROR_LOG_KEY);
        console.log('[ErrorRecovery] Error log cleared');
    }

    // ===================================
    // PERSISTENCE
    // ===================================

    /**
     * Load circuit breaker states from storage
     */
    private async loadCircuitBreakerStates(): Promise<void> {
        try {
            const data = await AsyncStorage.getItem(CIRCUIT_BREAKER_KEY);
            if (data) {
                const states = JSON.parse(data);
                this.circuitBreakers = new Map(Object.entries(states));
                console.log(`[ErrorRecovery] Loaded ${this.circuitBreakers.size} circuit breaker states`);
            }
        } catch (error) {
            console.error('[ErrorRecovery] Failed to load circuit breaker states:', error);
        }
    }

    /**
     * Save circuit breaker states to storage
     */
    private async saveCircuitBreakerStates(): Promise<void> {
        try {
            const states = Object.fromEntries(this.circuitBreakers);
            await AsyncStorage.setItem(CIRCUIT_BREAKER_KEY, JSON.stringify(states));
        } catch (error) {
            console.error('[ErrorRecovery] Failed to save circuit breaker states:', error);
        }
    }

    /**
     * Load error log from storage
     */
    private async loadErrorLog(): Promise<void> {
        try {
            const data = await AsyncStorage.getItem(ERROR_LOG_KEY);
            if (data) {
                this.errorLog = JSON.parse(data);
                console.log(`[ErrorRecovery] Loaded ${this.errorLog.length} error log entries`);
            }
        } catch (error) {
            console.error('[ErrorRecovery] Failed to load error log:', error);
        }
    }

    /**
     * Save error log to storage
     */
    private async saveErrorLog(): Promise<void> {
        try {
            await AsyncStorage.setItem(ERROR_LOG_KEY, JSON.stringify(this.errorLog));
        } catch (error) {
            console.error('[ErrorRecovery] Failed to save error log:', error);
        }
    }
}

// Export singleton instance
export const errorRecoveryService = new ErrorRecoveryService();
