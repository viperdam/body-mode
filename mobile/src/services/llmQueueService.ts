// LLM Queue Service - Centralized, robust queue for ALL AI interactions
// Provides: Job persistence, rate limit handling, priority ordering, retry with backoff
// ENHANCED: Queue size limits, error recovery integration, offline support

import storage from './storageService';
import {
    analyzeTextFood, analyzeActivity, analyzeSleepSession, analyzeMedia,
    generateDailyPlan, calculateUserProfile, generateDailyWrapUp,
    detectFridgeIngredients, generateFridgeRecipes, generateRecipeForMeal,
    refineFoodAnalysis, summarizeHistory, generateNutritionInsights,
    analyzeBodyScan,
    isRateLimited, getRateLimitRemainingMs
} from './geminiService';
import {
    FoodLogEntry, ActivityLogEntry, FoodAnalysisResult, UserProfile, Language,
    DailyPlan, MoodLog, WeightLogEntry, AppContext, CookingMood, DEFAULT_RETRY_CONFIG,
    NutrientBalanceSnapshot
} from '../types';
import * as FileSystem from 'expo-file-system/legacy';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import { AppState } from 'react-native';
import { getLocalDateKey } from '../utils/dateUtils';
import { getActiveDayKey, getDayStartMinutes } from './dayBoundaryService';
import { energyService, JOB_ENERGY_COSTS, InsufficientEnergyError } from './energyService';
import { subscriptionService } from './subscriptionService';
import { emit } from './planEventService';
import { mergePlanPreservingCompletedAndPast } from './planMerge';
import { normalizePlan } from './planNormalization';
import { errorRecoveryService } from './errorRecoveryService';
import { bodyProgressService } from './bodyProgressService';
import { checkNetworkConnection, isApiKeyConfigured, onNetworkEvent } from './offlineService';
import { isDirectUploadAvailable } from './geminiUploadService';
import { resolveLanguage } from './languageService';
import { getWeatherSnapshot, WEATHER_SNAPSHOT_TTL_MS } from './weatherService';
import { buildLLMContextSnapshot } from './llmContextService';
import i18n from '../i18n';

// ============ TYPES ============

export type JobType =
    // Background enrichment (fire-and-forget)
    | 'ENRICH_FOOD'
    | 'ENRICH_ACTIVITY'
    | 'ANALYZE_SLEEP'
    | 'ANALYZE_FOOD_MEDIA'
    | 'ANALYZE_FOOD_VIDEO' // Video food analysis - higher energy cost (35)
    | 'ANALYZE_BODY_SCAN'
    // Critical user-facing operations
    | 'GENERATE_PLAN'
    | 'REFINE_PLAN'
    | 'CALCULATE_PROFILE'
    | 'GENERATE_WRAPUP'
    // Recipe/Fridge
    | 'DETECT_INGREDIENTS'
    | 'DETECT_INGREDIENTS_VIDEO' // Video fridge scan - higher energy cost (35)
    | 'GENERATE_RECIPE'
    | 'GENERATE_FRIDGE_RECIPES'
    // Food Analysis
    | 'ANALYZE_TEXT_FOOD'
    | 'REFINE_FOOD_ANALYSIS'
    // History
    | 'SUMMARIZE_HISTORY'
    // Nutrition insights
    | 'GENERATE_NUTRITION_INSIGHTS';

export type JobPriority = 'critical' | 'high' | 'normal' | 'low';

const PRIORITY_ORDER: Record<JobPriority, number> = {
    critical: 0,  // Profile calculation, plan generation - user is waiting
    high: 1,      // User-initiated actions (food analysis, recipes)
    normal: 2,    // Background enrichment
    low: 3        // History summarization, non-urgent tasks
};

export interface LLMJob {
    id: string;
    type: JobType;
    payload: any;
    priority: JobPriority;
    status: 'pending' | 'processing' | 'failed' | 'completed';
    createdAt: number;
    retryCount: number;
    lastError?: string;
    nextRetryAt?: number;
    result?: any; // Stored result for completion callbacks
}

export interface QueueStatus {
    pending: number;
    processing: boolean;
    currentJobType?: JobType;
    rateLimited: boolean;
    rateLimitEndsAt?: number;
}

type QueueStatusListener = (status: QueueStatus) => void;
type JobCompletionCallback = (error: Error | null, result?: any) => void;

const STORAGE_KEY_QUEUE = 'llm_job_queue_v2';
const MAX_RETRIES = DEFAULT_RETRY_CONFIG.maxRetries; // 5
const BASE_DELAY_MS = DEFAULT_RETRY_CONFIG.initialBackoffMs; // 1000
const MAX_QUEUE_SIZE = 50; // Maximum pending jobs before dropping low-priority ones
const MAX_VIDEO_UPLOAD_BYTES = 1000 * 1024 * 1024; // 1000MB cap for video uploads.

// ============ SERVICE ============

class LLMQueueService {
    private isProcessing = false;
    private queue: LLMJob[] = [];
    private initPromise: Promise<void> | null = null;
    private statusListeners: Set<QueueStatusListener> = new Set();
    private jobCallbacks: Map<string, JobCompletionCallback> = new Map();
    private energyBypassTokens = 0;

    constructor() {
        this.init();

        // Wake up queue when app comes to foreground
        AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                console.log('[LLMQueue] App resumed, waking queue processors...');
                this.processQueue();
            }
        });

        // ENHANCED: Resume queue when network is restored
        onNetworkEvent('networkRestored', (networkState) => {
            console.log('[LLMQueue] Network restored, resuming queue processing');
            this.processQueue();
        });
    }

    // ============ INITIALIZATION ============

    async init() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                const stored = await storage.get<LLMJob[]>(STORAGE_KEY_QUEUE);
                if (stored && Array.isArray(stored)) {
                    // Filter out completed jobs and reset any stuck 'processing' jobs
                    this.queue = stored
                        .filter(j => j.status !== 'completed')
                        .map(j => j.status === 'processing' ? { ...j, status: 'pending' as const } : j);
                    console.log(`[LLMQueue] Loaded ${this.queue.length} pending jobs`);
                    this.notifyStatusChange();
                    this.processQueue();
                }
            } catch (e) {
                console.error('[LLMQueue] Failed to load queue:', e);
            }
        })();
        return this.initPromise;
    }

    // ============ PUBLIC API ============

    grantEnergyBypass(tokens: number = 1) {
        const next = this.energyBypassTokens + Math.max(1, tokens);
        this.energyBypassTokens = Math.min(next, 3);
        console.log(`[LLMQueue] Granted energy bypass token (available: ${this.energyBypassTokens})`);
    }

    hasEnergyBypass(): boolean {
        return this.energyBypassTokens > 0;
    }

    private async consumeEnergyForJob(type: JobType): Promise<number> {
        const cost = JOB_ENERGY_COSTS[type] || 0;
        if (cost <= 0) return 0;

        let premiumActive = false;
        try {
            await subscriptionService.init();
            premiumActive = subscriptionService.isPremiumActive();
        } catch (error) {
            console.warn('[LLMQueue] Subscription init failed:', error);
        }

        if (premiumActive) {
            const currentEnergy = await energyService.getEnergy();
            await emit('ENERGY_BYPASS_USED', { jobType: type, currentEnergy, source: 'premium' });
            return 0;
        }

        const currentEnergy = await energyService.getEnergy();
        if (currentEnergy < cost && this.energyBypassTokens > 0) {
            this.energyBypassTokens -= 1;
            console.log(`[LLMQueue] Bypassing energy for ${type} (remaining tokens: ${this.energyBypassTokens})`);
            await emit('ENERGY_BYPASS_USED', { jobType: type, currentEnergy });
            return 0;
        }

        const consumed = await energyService.consume(cost);
        if (!consumed) {
            const latestEnergy = await energyService.getEnergy();
            console.log(`[LLMQueue] Insufficient energy for ${type}: need ${cost}, have ${latestEnergy}`);
            await emit('ENERGY_LOW', { requiredCost: cost, jobType: type, currentEnergy: latestEnergy });
            throw new InsufficientEnergyError(cost, latestEnergy, type);
        }

        const remainingEnergy = await energyService.getEnergy();
        await emit('ENERGY_CONSUMED', { consumedCost: cost, jobType: type, currentEnergy: remainingEnergy });
        console.log(`[LLMQueue] Consumed ${cost} energy for ${type} (remaining: ${remainingEnergy})`);
        return cost;
    }

    /**
     * Add a job to the queue (fire-and-forget style)
     * ENHANCED: Queue size limits, error recovery integration
     */
    async addJob(type: JobType, payload: any, priority: JobPriority = 'normal'): Promise<string> {
        await this.init();

        if (!isApiKeyConfigured()) {
            const error = new Error(i18n.t('dashboard.alert.recipe_api_key'));
            await errorRecoveryService.handleError({
                service: 'llmQueue',
                operation: `addJob_${type}`,
                error,
                metadata: { jobType: type },
            });
            throw error;
        }

        // === ENHANCED: CHECK QUEUE SIZE ===
        const pendingCount = this.queue.filter(j => j.status === 'pending').length;
        if (pendingCount >= MAX_QUEUE_SIZE) {
            console.warn(`[LLMQueue] Queue size limit reached (${MAX_QUEUE_SIZE})`);

            // Try to drop oldest low-priority job
            const lowPriorityIdx = this.queue.findIndex(j => j.status === 'pending' && j.priority === 'low');
            if (lowPriorityIdx !== -1) {
                const dropped = this.queue.splice(lowPriorityIdx, 1)[0];
                console.warn(`[LLMQueue] Dropped low-priority job ${dropped.id} (${dropped.type}) to make room`);
                await this.persist();
            } else {
                // No low-priority jobs to drop
                const error = new Error(i18n.t('errors.queue.full', { count: pendingCount }));
                await errorRecoveryService.handleError({
                    service: 'llmQueue',
                    operation: 'addJob',
                    error,
                    metadata: { jobType: type, queueSize: pendingCount },
                });
                throw error;
            }
        }

        // === ENHANCED: CHECK CIRCUIT BREAKER ===
        if (errorRecoveryService.isCircuitOpen('geminiAPI')) {
            console.warn('[LLMQueue] Circuit breaker is open, queuing job for later retry');
            // Still queue the job, but it will wait until circuit closes
        }

        // === ENERGY GATING ===
        await this.consumeEnergyForJob(type);

        const job: LLMJob = {
            id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            type,
            payload,
            priority,
            status: 'pending',
            createdAt: Date.now(),
            retryCount: 0
        };

        this.queue.push(job);
        this.sortQueueByPriority();
        await this.persist();
        console.log(`[LLMQueue] Added job ${job.id} (${job.type}, priority: ${priority})`);
        this.notifyStatusChange();
        this.processQueue();

        return job.id;
    }

    /**
     * Add a job and wait for its completion (for synchronous UI flows)
     * Returns the job result or throws on error
     */
    async addJobAndWait<T = any>(type: JobType, payload: any, priority: JobPriority = 'high'): Promise<T> {
        await this.init();

        if (!isApiKeyConfigured()) {
            const error = new Error(i18n.t('dashboard.alert.recipe_api_key'));
            await errorRecoveryService.handleError({
                service: 'llmQueue',
                operation: `addJobAndWait_${type}`,
                error,
                metadata: { jobType: type },
            });
            throw error;
        }

        // === ENERGY GATING ===
        await this.consumeEnergyForJob(type);

        return new Promise<T>((resolve, reject) => {
            const job: LLMJob = {
                id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                type,
                payload,
                priority,
                status: 'pending',
                createdAt: Date.now(),
                retryCount: 0
            };

            // Register callback before adding to queue
            this.jobCallbacks.set(job.id, (error, result) => {
                this.jobCallbacks.delete(job.id);
                if (error) {
                    reject(error);
                } else {
                    resolve(result as T);
                }
            });

            this.queue.push(job);
            this.sortQueueByPriority();
            this.persist().catch(console.error);
            console.log(`[LLMQueue] Added awaitable job ${job.id} (${job.type}, priority: ${priority})`);
            this.notifyStatusChange();
            this.processQueue();
        });
    }

    /**
     * Run a food media analysis immediately (no queue). Intended for direct video uploads.
     * Still consumes energy and uses deep context via the existing worker.
     */
    async analyzeFoodMediaNow(payload: { jobId: string; imageUri: string; mimeType: string; language: Language }): Promise<FoodAnalysisResult> {
        await this.init();
        if (!isApiKeyConfigured()) {
            throw new Error(i18n.t('dashboard.alert.recipe_api_key'));
        }
        const jobType: JobType = payload.mimeType.startsWith('video/')
            ? 'ANALYZE_FOOD_VIDEO'
            : 'ANALYZE_FOOD_MEDIA';
        await this.consumeEnergyForJob(jobType);

        const userProfile = await storage.get<UserProfile>(storage.keys.USER);
        return this.workerAnalyzeFoodMedia(payload, userProfile ?? undefined);
    }

    /**
     * Run ingredient detection immediately (no queue). Intended for direct video uploads.
     * Still consumes energy and uses the existing worker.
     */
    async detectIngredientsNow(payload: { imageUri: string; mimeType: string }): Promise<string[]> {
        await this.init();
        if (!isApiKeyConfigured()) {
            throw new Error(i18n.t('dashboard.alert.recipe_api_key'));
        }
        const jobType: JobType = payload.mimeType.startsWith('video/')
            ? 'DETECT_INGREDIENTS_VIDEO'
            : 'DETECT_INGREDIENTS';
        await this.consumeEnergyForJob(jobType);
        return this.workerDetectIngredients({ imageUri: payload.imageUri, mimeType: payload.mimeType }, undefined);
    }

    /**
     * Get current queue status
     */
    getStatus(): QueueStatus {
        const pendingJobs = this.queue.filter(j => j.status === 'pending');
        const processingJob = this.queue.find(j => j.status === 'processing');

        return {
            pending: pendingJobs.length,
            processing: this.isProcessing,
            currentJobType: processingJob?.type,
            rateLimited: isRateLimited(),
            rateLimitEndsAt: isRateLimited() ? Date.now() + getRateLimitRemainingMs() : undefined
        };
    }

    /**
     * Subscribe to queue status changes
     */
    addStatusListener(listener: QueueStatusListener): () => void {
        this.statusListeners.add(listener);
        // Immediately notify with current status
        listener(this.getStatus());
        return () => this.statusListeners.delete(listener);
    }

    /**
     * Check if we're currently rate limited (for UI guards)
     */
    isRateLimited(): boolean {
        return isRateLimited();
    }

    /**
     * Get remaining rate limit cooldown in ms
     */
    getRateLimitRemainingMs(): number {
        return getRateLimitRemainingMs();
    }

    // ============ INTERNAL PROCESSING ============

    private sortQueueByPriority() {
        this.queue.sort((a, b) => {
            // First by priority
            const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            // Then by creation time (FIFO within same priority)
            return a.createdAt - b.createdAt;
        });
    }

    private notifyStatusChange() {
        const status = this.getStatus();
        this.statusListeners.forEach(listener => {
            try {
                listener(status);
            } catch (e) {
                console.error('[LLMQueue] Status listener error:', e);
            }
        });
    }

    private async persist() {
        try {
            // === PHASE 3 FIX: Strip large payloads before persistence ===
            // Never persist base64 image/video data to AsyncStorage
            // This prevents OOM crashes from large media jobs
            const toSave = this.queue
                .filter(j => j.status !== 'completed')
                .map(job => this.stripLargePayloads(job));
            await storage.set(STORAGE_KEY_QUEUE, toSave);
        } catch (e) {
            console.error('[LLMQueue] Persist failed:', e);
        }
    }

    /**
     * Strip large base64 payloads from jobs before persistence.
     * The actual base64 data will be read from file at execution time.
     */
    private stripLargePayloads(job: LLMJob): LLMJob {
        // These job types may contain large base64 payloads
        if (job.type === 'DETECT_INGREDIENTS' || job.type === 'ANALYZE_FOOD_MEDIA') {
            const { imageBase64, ...rest } = job.payload || {};
            // Store a flag indicating image was present, but not the actual data
            const strippedPayload = {
                ...rest,
                imageStripped: !!imageBase64,
                // If imageUri exists, we can reload from it
                canReloadFromFile: !!rest.imageUri
            };
            return { ...job, payload: strippedPayload };
        }
        return job;
    }

    private async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.notifyStatusChange();

        try {
            while (true) {
                // 1. ENHANCED: Check Circuit Breaker
                if (errorRecoveryService.isCircuitOpen('geminiAPI')) {
                    const state = errorRecoveryService.getCircuitBreakerState('geminiAPI');
                    const waitTime = state ? Math.max(0, state.cooldownUntil - Date.now()) : 60000;
                    console.log(`[LLMQueue] Circuit Breaker OPEN. Pausing queue for ${Math.round(waitTime / 1000)}s`);
                    this.notifyStatusChange();

                    // Release lock and retry when circuit might close
                    this.isProcessing = false;
                    setTimeout(() => this.processQueue(), waitTime + 2000);
                    return;
                }

                // 2. Check Offline
                const isOnline = await checkNetworkConnection();
                if (!isOnline) {
                    console.log('[LLMQueue] Offline. Pausing queue until network is restored.');
                    this.notifyStatusChange();
                    this.isProcessing = false;
                    // Retry in case event listener misses a transition
                    setTimeout(() => this.processQueue(), 15000);
                    return;
                }

                // 3. Check Rate Limits
                if (isRateLimited()) {
                    const waitTime = getRateLimitRemainingMs();
                    console.log(`[LLMQueue] Global Rate Limit Active. Pausing queue for ${Math.round(waitTime / 1000)}s`);
                    this.notifyStatusChange();

                    // Release lock so we can re-enter later
                    this.isProcessing = false;
                    setTimeout(() => this.processQueue(), waitTime + 2000); // 2s buffer
                    return; // Break loop
                }

                // 4. Find next eligible job (sorted by priority)
                const now = Date.now();
                const job = this.queue.find(j =>
                    j.status === 'pending' &&
                    (!j.nextRetryAt || j.nextRetryAt <= now)
                );

                if (!job) {
                    // No ready jobs. Check if there are future jobs waiting to retry
                    const futureJob = this.queue.find(j => j.status === 'pending' && j.nextRetryAt && j.nextRetryAt > now);
                    if (futureJob && futureJob.nextRetryAt) {
                        const wait = futureJob.nextRetryAt - now;
                        console.log(`[LLMQueue] Next job retrying in ${Math.round(wait / 1000)}s`);
                        // Set a timer to wake up for it
                        setTimeout(() => this.processQueue(), wait + 500);
                    }
                    break;
                }

                if (!isApiKeyConfigured()) {
                    await this.handleJobError(job, new Error(i18n.t('dashboard.alert.recipe_api_key')));
                    continue;
                }

                // 3. Process Job
                job.status = 'processing';
                console.log(`[LLMQueue] Processing ${job.id} (${job.type}, priority: ${job.priority})...`);
                this.notifyStatusChange();
                await this.persist();

                try {
                    const result = await this.executeJob(job);

                    // Success
                    job.status = 'completed';
                    job.result = result;
                    console.log(`[LLMQueue] Job ${job.id} COMPLETED`);

                    // ENHANCED: Record success in circuit breaker
                    await errorRecoveryService.recordSuccess('geminiAPI');

                    // Call completion callback if registered
                    const callback = this.jobCallbacks.get(job.id);
                    if (!callback) {
                        try {
                            await this.autoPersistGeneratedPlan(job, result);
                            await this.autoPersistBodyScan(job, result);
                        } catch (e) {
                            console.warn('[LLMQueue] Failed to auto-persist job result:', e);
                        }
                    }
                    if (callback) {
                        callback(null, result);
                        this.jobCallbacks.delete(job.id);
                    }

                    // Remove from queue
                    this.queue = this.queue.filter(j => j.id !== job.id);
                    await this.persist();
                    this.notifyStatusChange();

                } catch (error: any) {
                    await this.handleJobError(job, error);
                }
            }
        } catch (e) {
            console.error('[LLMQueue] Queue Loop Error:', e);
        } finally {
            this.isProcessing = false;
            this.notifyStatusChange();
        }
    }

    private async handleJobError(job: LLMJob, error: any) {
        job.lastError = error?.message || 'Unknown error';

        const errMsg = String(error?.message || '').toLowerCase();
        const isUnrecoverablePayloadError =
            errMsg.includes('missing image data') ||
            errMsg.includes('no such file') ||
            errMsg.includes('enoent') ||
            errMsg.includes('file does not exist') ||
            errMsg.includes('video file not found') ||
            errMsg.includes('recording may have been deleted') ||
            errMsg.includes('missing image');

        if (
            errMsg.includes('api key') ||
            errMsg.includes('not configured') ||
            errMsg.includes('missing/invalid')
        ) {
            console.error(`[LLMQueue] Job ${job.id} FAILED (API not configured): ${job.lastError}`);
            job.status = 'failed';
            if (job.type === 'ANALYZE_BODY_SCAN') {
                const scanId = (job.payload as any)?.scanId;
                if (scanId) {
                    await bodyProgressService.markScanFailed(
                        scanId,
                        job.lastError ?? 'Unknown error',
                        job.retryCount
                    );
                }
            }
            const callback = this.jobCallbacks.get(job.id);
            if (callback) {
                callback(new Error(job.lastError));
                this.jobCallbacks.delete(job.id);
            }
            await this.persist();
            this.notifyStatusChange();
            return;
        }

        const notifyWaiterAndDetach = (err: Error) => {
            const callback = this.jobCallbacks.get(job.id);
            if (callback) {
                // Final failure only
                console.log(`[LLMQueue] Detaching waiter for ${job.id} (FINAL FAILURE)`);
                callback(err);
                this.jobCallbacks.delete(job.id);
            }
        };

        // Local payload errors should fail fast and must NOT trip Gemini API circuit breaker.
        if (isUnrecoverablePayloadError) {
            console.error(`[LLMQueue] Job ${job.id} FAILED (unrecoverable payload): ${job.lastError}`);
            job.status = 'failed';
            if (job.type === 'ANALYZE_BODY_SCAN') {
                const scanId = (job.payload as any)?.scanId;
                if (scanId) {
                    await bodyProgressService.markScanFailed(
                        scanId,
                        job.lastError ?? 'Unknown error',
                        job.retryCount
                    );
                }
            }
            notifyWaiterAndDetach(new Error(job.lastError));
            await this.persist();
            this.notifyStatusChange();
            return;
        }

        // ENHANCED: Record failure in circuit breaker
        const circuitOpened = await errorRecoveryService.recordFailure('geminiAPI');
        if (circuitOpened) {
            console.warn('[LLMQueue] Circuit breaker opened due to repeated failures');
        }

        // ENHANCED: Handle error via error recovery service
        await errorRecoveryService.handleError({
            service: 'llmQueue',
            operation: `processJob_${job.type}`,
            error: error as Error,
            metadata: {
                jobId: job.id,
                jobType: job.type,
                retryCount: job.retryCount,
                priority: job.priority,
            },
        });

        if (this.isRateLimitError(error)) {
            // Rate Limit Logic: Infinite Retries
            // note: We do NOT increment retryCount so it doesn't count towards the limit
            console.warn(`[LLMQueue] Job ${job.id} hit Rate Limit. PAUSING.`);
            job.status = 'pending';

            const waitTime = getRateLimitRemainingMs();
            const delay = waitTime > 0 ? waitTime : 60000; // Default 60s if not specified
            job.nextRetryAt = Date.now() + delay;

            // DO NOT DETACH WAITER - Keep UI waiting
            console.log(`[LLMQueue] Job ${job.id} sleeping for ${Math.ceil(delay / 1000)}s (Rate Limit)`);

            await this.persist();
            this.notifyStatusChange();
            // processing loop will handle the timeout waiter via processQueue re-trigger from main loop or timer
            return;

        } else {
            // Normal Error Logic
            job.retryCount++;

            if (job.retryCount >= MAX_RETRIES) {
                console.error(`[LLMQueue] Job ${job.id} FAILED after ${MAX_RETRIES} attempts`);
                job.status = 'failed';
                if (job.type === 'ANALYZE_BODY_SCAN') {
                    const scanId = (job.payload as any)?.scanId;
                    if (scanId) {
                        await bodyProgressService.markScanFailed(
                            scanId,
                            job.lastError ?? 'Unknown error',
                            job.retryCount
                        );
                    }
                }

                // Call completion callback with error - FINALLY Give up
                notifyWaiterAndDetach(new Error(job.lastError || i18n.t('errors.queue.max_retries')));

                await this.persist();
                this.notifyStatusChange();
                return;
            }

            const backoff = BASE_DELAY_MS * Math.pow(2, job.retryCount);
            console.warn(`[LLMQueue] Job ${job.id} failed (Attempt ${job.retryCount}). Retry in ${backoff}ms`);
            job.status = 'pending';
            job.nextRetryAt = Date.now() + backoff;

            // DO NOT DETACH WAITER - Keep UI waiting
            console.log(`[LLMQueue] Job ${job.id} sleeping for ${Math.ceil(backoff / 1000)}s (Retry)`);

            await this.persist();
            this.notifyStatusChange();
            // processing loop will handle the timeout
            return;
        }
    }

    private isValidDateKey(value: unknown): value is string {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    }

    private async autoPersistGeneratedPlan(job: LLMJob, result: any): Promise<void> {
        if (job.type !== 'GENERATE_PLAN' && job.type !== 'REFINE_PLAN') return;
        if (!result || typeof result !== 'object') return;

        const payloadDateKey = (job.payload as any)?.dateKey;
        const resultDateKey = (result as any)?.date;
        const currentPlanDateKey = (job.payload as any)?.currentPlan?.date;

        const dateKey =
            (this.isValidDateKey(payloadDateKey) && payloadDateKey) ||
            (this.isValidDateKey(resultDateKey) && resultDateKey) ||
            (this.isValidDateKey(currentPlanDateKey) && currentPlanDateKey) ||
            getLocalDateKey(new Date());

        const incoming: DailyPlan = { ...(result as DailyPlan), date: dateKey };
        if (!incoming.source) {
            incoming.source = 'cloud';
        }
        incoming.isTemporary = false;

        const planKey = `${storage.keys.DAILY_PLAN}_${dateKey}`;
        const [datedExisting, legacyExisting] = await Promise.all([
            storage.get<DailyPlan>(planKey),
            storage.get<DailyPlan>(storage.keys.DAILY_PLAN),
        ]);

        const previous =
            (datedExisting && datedExisting.date === dateKey ? datedExisting : null) ||
            (legacyExisting && legacyExisting.date === dateKey ? legacyExisting : null) ||
            null;

        const [activeDayKey, dayStartMinutes] = await Promise.all([
            getActiveDayKey(),
            getDayStartMinutes(),
        ]);
        const effectiveDayStartMinutes = dateKey === activeDayKey ? dayStartMinutes : 0;
        const normalizedIncoming =
            normalizePlan(incoming, dateKey, {
                forceDateKey: true,
                dayStartMinutes: effectiveDayStartMinutes,
            }) || incoming;
        const merged = mergePlanPreservingCompletedAndPast(
            normalizedIncoming,
            previous,
            new Date(),
            { activeDayKey, dayStartMinutes: effectiveDayStartMinutes }
        );
        const finalPlan =
            normalizePlan(merged, dateKey, {
                forceDateKey: true,
                dayStartMinutes: effectiveDayStartMinutes,
            }) || merged;

        await storage.set(planKey, finalPlan);
        if (dateKey === activeDayKey) {
            await storage.set(storage.keys.DAILY_PLAN, finalPlan);
        }

        // If nobody is actively awaiting this job (fire-and-forget), notify UI to refresh.
        // Dashboards/listeners already handle PLAN_UPGRADED/PLAN_GENERATED events by reloading.
        if (job.type === 'REFINE_PLAN') {
            await emit('PLAN_UPDATED', { date: dateKey, source: 'llm_queue', reason: 'refine' });
        } else {
            await emit('PLAN_UPGRADED', { fromOffline: false, source: 'llm_queue' });
        }
    }

    private async autoPersistBodyScan(job: LLMJob, result: any): Promise<void> {
        if (job.type !== 'ANALYZE_BODY_SCAN') return;
        const scanId = (job.payload as any)?.scanId;
        if (!scanId || !result || typeof result !== 'object') return;
        try {
            await bodyProgressService.applyAnalysisResult(scanId, result);
        } catch (error) {
            console.warn('[LLMQueue] Failed to persist body scan result:', error);
        }
    }

    private isRateLimitError(error: any): boolean {
        const msg = error?.message?.toLowerCase() || '';
        return msg.includes('rate limit') || msg.includes('xz') || msg.includes('429') || msg.includes('quota') || msg.includes('capacity');
    }

    // ============ JOB WORKERS ============

    private async executeJob(job: LLMJob): Promise<any> {
        const userProfile = await storage.get<UserProfile>(storage.keys.USER);

        switch (job.type) {
            // === EXISTING WORKERS ===
            case 'ENRICH_FOOD':
                return this.workerEnrichFood(job.payload, userProfile ?? undefined);
            case 'ENRICH_ACTIVITY':
                return this.workerEnrichActivity(job.payload, userProfile ?? undefined);
            case 'ANALYZE_SLEEP':
                return this.workerAnalyzeSleep(job.payload, userProfile ?? undefined);
            case 'ANALYZE_FOOD_MEDIA':
            case 'ANALYZE_FOOD_VIDEO': // Same worker, different energy cost
                return this.workerAnalyzeFoodMedia(job.payload, userProfile ?? undefined);
            case 'ANALYZE_BODY_SCAN':
                return this.workerAnalyzeBodyScan(job.payload, userProfile ?? undefined);

            // === NEW WORKERS ===
            case 'GENERATE_PLAN':
                return this.workerGeneratePlan(job.payload);
            case 'REFINE_PLAN':
                return this.workerRefinePlan(job.payload);
            case 'CALCULATE_PROFILE':
                return this.workerCalculateProfile(job.payload);
            case 'GENERATE_WRAPUP':
                return this.workerGenerateWrapup(job.payload);
            case 'ANALYZE_TEXT_FOOD':
                return this.workerAnalyzeTextFood(job.payload, userProfile ?? undefined);
            case 'REFINE_FOOD_ANALYSIS':
                return this.workerRefineFoodAnalysis(job.payload, userProfile ?? undefined);
            case 'DETECT_INGREDIENTS':
            case 'DETECT_INGREDIENTS_VIDEO': // Same worker, different energy cost
                return this.workerDetectIngredients(job.payload, userProfile ?? undefined);
            case 'GENERATE_RECIPE':
                return this.workerGenerateRecipe(job.payload, userProfile ?? undefined);
            case 'GENERATE_FRIDGE_RECIPES':
                return this.workerGenerateFridgeRecipes(job.payload, userProfile ?? undefined);
            case 'SUMMARIZE_HISTORY':
                return this.workerSummarizeHistory(job.payload);
            case 'GENERATE_NUTRITION_INSIGHTS':
                return this.workerGenerateNutritionInsights(job.payload);

            default:
                throw new Error(i18n.t('errors.queue.unknown_job', { type: job.type }));
        }
    }

    // --- Existing Workers ---

    private async workerEnrichFood(payload: { logId: string, itemName: string, itemDesc: string, language?: Language }, userProfile?: UserProfile) {
        const { logId, itemName, itemDesc } = payload;
        const language = await resolveLanguage(payload.language);
        const analysis = await analyzeTextFood(`${itemName} ${itemDesc || ''}`, userProfile, language);

        const allFood = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
        const index = allFood.findIndex(f => f.id === logId);

        if (index >= 0) {
            allFood[index].food = analysis;
            await storage.set(storage.keys.FOOD, allFood);
            const { emit, notifyFoodLogged } = require('./planEventService');
            if (typeof notifyFoodLogged === 'function') {
                void notifyFoodLogged(allFood[index]);
            } else {
                emit('FOOD_LOGGED', { foodName: analysis.foodName, calories: analysis.macros.calories });
            }
        }
        return analysis;
    }

    private async workerEnrichActivity(payload: { logId: string, itemName: string, duration: number, language?: Language }, userProfile?: UserProfile) {
        const { logId, itemName, duration } = payload;
        const language = await resolveLanguage(payload.language);
        const analysis = await analyzeActivity(itemName, duration, userProfile, language);

        const allActivity = await storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY) || [];
        const index = allActivity.findIndex(a => a.id === logId);

        if (index >= 0) {
            allActivity[index].caloriesBurned = analysis.caloriesBurned;
            allActivity[index].intensity = analysis.intensity;
            allActivity[index].notes = analysis.notes;
            await storage.set(storage.keys.ACTIVITY, allActivity);
            const { emit } = require('./planEventService');
            emit('ACTIVITY_LOGGED', { name: itemName, duration, caloriesBurned: analysis.caloriesBurned });
        }
        return analysis;
    }

    private async workerAnalyzeSleep(payload: { sessionId: string, movementLog: any[], language?: Language }, userProfile?: UserProfile) {
        const { sessionId, movementLog, language } = payload;
        const result = await analyzeSleepSession(movementLog, language);

        const history = await storage.get<any[]>(storage.keys.SLEEP_HISTORY) || [];
        const index = history.findIndex(s => s.id === sessionId);

        if (index >= 0) {
            history[index] = {
                ...history[index],
                sleepScore: result.sleepScore,
                aiAnalysis: result.analysis,
                deepSleepPercentage: result.stages?.find((s: any) => s.stage === 'Deep')?.percentage || history[index].deepSleepPercentage,
            };
            await storage.set(storage.keys.SLEEP_HISTORY, history);
            const { emit } = require('./planEventService');
            emit('SLEEP_ANALYZED', { sessionId, sleepScore: result.sleepScore });
        }
        return result;
    }

    private async workerAnalyzeFoodMedia(payload: { jobId: string, imageUri: string, mimeType: string, language: Language }, userProfile?: UserProfile) {
        const { jobId, imageUri, mimeType, language } = payload;
        const isVideo = mimeType.startsWith('video/');

        console.log(`[LLMQueue] workerAnalyzeFoodMedia started:`, {
            jobId,
            isVideo,
            mimeType,
            imageUri: imageUri?.substring(0, 60),
            directUploadAvailable: isDirectUploadAvailable()
        });

        const deepContext = await this.loadDeepContext();
        let mediaBase64: string | undefined;
        let effectiveMimeType = mimeType;
        let fileName = `food-media-${jobId}`;
        let canRetryWithBase64 = false;

        if (isVideo) {
            console.log('[LLMQueue] Processing video file...');
            const info = await FileSystem.getInfoAsync(imageUri);
            if (!info.exists) {
                throw new Error(i18n.t('errors.video.not_found'));
            }
            const fileSize = typeof info.size === 'number' ? info.size : 0;
            console.log('[LLMQueue] Video file info:', {
                exists: info.exists,
                size: `${(fileSize / 1024 / 1024).toFixed(2)}MB`,
            });

            if (fileSize > MAX_VIDEO_UPLOAD_BYTES) {
                throw new Error(i18n.t('errors.video.too_large'));
            }
            fileName = `food-video-${jobId}`;

            // If direct upload API is not available, convert video to base64 as fallback
            if (!isDirectUploadAvailable()) {
                console.log('[LLMQueue] Direct upload NOT available - using base64 fallback');
                const MAX_BASE64_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB max for base64 conversion
                canRetryWithBase64 = fileSize <= MAX_BASE64_VIDEO_BYTES;
                if (!canRetryWithBase64) {
                    throw new Error(i18n.t('errors.video.too_large_processing'));
                }
                console.log('[LLMQueue] Converting video to base64...');
                mediaBase64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });
                console.log('[LLMQueue] Video converted to base64, length:', mediaBase64?.length);
            } else {
                console.log('[LLMQueue] Direct upload IS available - will upload directly to Gemini');
                const MAX_BASE64_VIDEO_BYTES = 50 * 1024 * 1024;
                canRetryWithBase64 = fileSize <= MAX_BASE64_VIDEO_BYTES;
            }
        } else {
            console.log('[LLMQueue] Processing image file...');
            mediaBase64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });
            fileName = `food-image-${jobId}.jpg`;
        }

        if (!isVideo && !mediaBase64) {
            throw new Error(i18n.t('errors.video.media_empty'));
        }

        console.log('[LLMQueue] Calling analyzeMedia:', {
            hasBase64: !!mediaBase64,
            hasFileUri: !!imageUri,
            mimeType: effectiveMimeType,
            fileName
        });

        try {
            const result = await analyzeMedia(
                { data: mediaBase64, fileUri: imageUri, mimeType: effectiveMimeType, fileName },
                userProfile,
                language,
                deepContext
            );

            console.log('[LLMQueue] analyzeMedia completed successfully:', {
                foodName: result?.foodName,
                confidence: result?.confidence
            });

            const { emit } = require('./planEventService');
            emit('FOOD_ANALYZED', { jobId, result });
            return result;
        } catch (error) {
            if (isVideo && !mediaBase64 && imageUri && isDirectUploadAvailable() && canRetryWithBase64) {
                console.warn('[LLMQueue] analyzeMedia direct upload failed, retrying with base64 fallback');
                mediaBase64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });
                const retryResult = await analyzeMedia(
                    { data: mediaBase64, fileUri: undefined, mimeType: effectiveMimeType, fileName },
                    userProfile,
                    language,
                    deepContext
                );
                console.log('[LLMQueue] analyzeMedia fallback completed successfully:', {
                    foodName: retryResult?.foodName,
                    confidence: retryResult?.confidence,
                });
                const { emit } = require('./planEventService');
                emit('FOOD_ANALYZED', { jobId, result: retryResult });
                return retryResult;
            }
            console.error('[LLMQueue] analyzeMedia failed:', error);
            throw error;
        }
    }

    // --- NEW Workers ---

    private async workerGeneratePlan(payload: {
        userProfile: UserProfile,
        foodHistory: FoodLogEntry[],
        activityHistory: ActivityLogEntry[],
        moodHistory: MoodLog[],
        weightHistory: WeightLogEntry[],
        waterLog: { date: string, amount: number },
        sleepHistory: { date: string, hours: number }[],
        sleepContextString?: string,
        appContext: AppContext,
        language: Language,
        currentPlan: DailyPlan | null,
        historySummary?: string
    }): Promise<DailyPlan> {
        const {
            userProfile, foodHistory, activityHistory, moodHistory,
            weightHistory, waterLog, sleepHistory, appContext,
            language, currentPlan, historySummary, sleepContextString
        } = payload;

        const deepContext = await this.loadDeepContext();
        const mergedAppContext: AppContext = {
            ...(deepContext.appContext || {}),
            ...(appContext || {}),
        };
        if (!appContext?.contextSummary && deepContext.appContext?.contextSummary) {
            mergedAppContext.contextSummary = deepContext.appContext.contextSummary;
        }

        return generateDailyPlan(
            userProfile, foodHistory, activityHistory, moodHistory,
            weightHistory, waterLog, sleepHistory, mergedAppContext,
            language, currentPlan, historySummary, sleepContextString
        );
    }

    private async workerRefinePlan(payload: {
        // Simplified payload from planRefinementService
        dateKey?: string,
        currentPlan?: DailyPlan | null,
        reason?: string,
        deviations?: Array<{
            originalItem?: { title?: string; description?: string };
            actualMeal?: { name: string; calories?: number; protein?: number };
            actualActivity?: { name: string; duration: number; calories?: number };
            caloriesDiff?: number;
            proteinDiff?: number;
            activityTypeDiff?: string;
        }>;
        contextChanges?: Array<{
            from: string;
            to: string;
            location?: string;
            locationContext?: string;
            timestamp: number;
        }>;
        // Full payload from legacy calls
        userProfile?: UserProfile,
        foodHistory?: FoodLogEntry[],
        activityHistory?: ActivityLogEntry[],
        moodHistory?: MoodLog[],
        weightHistory?: WeightLogEntry[],
        waterLog?: { date: string, amount: number },
        sleepHistory?: { date: string, hours: number }[],
        appContext?: AppContext,
        language?: Language,
        historySummary?: string
    }): Promise<DailyPlan> {
        // Build deviation context string for LLM
        let deviationContext = '';
        if (payload.deviations && payload.deviations.length > 0) {
            deviationContext = '\n\nUSER MADE THESE CHANGES TO THEIR PLAN - ADJUST REMAINING ITEMS:\n';
            for (const d of payload.deviations) {
                if (d.actualMeal) {
                    const calStr = d.caloriesDiff
                        ? ` (${d.caloriesDiff > 0 ? '+' : ''}${d.caloriesDiff} cal)`
                        : '';
                    deviationContext += `• Ate ${d.actualMeal.name}${calStr} instead of "${d.originalItem?.title || 'planned meal'}"\n`;
                }
                if (d.actualActivity) {
                    const typeStr = d.activityTypeDiff ? ` - ${d.activityTypeDiff}` : '';
                    deviationContext += `• Did ${d.actualActivity.name} (${d.actualActivity.duration}min, ${d.actualActivity.calories || 'unknown'} cal)${typeStr}\n`;
                }
            }
            deviationContext += '\nPlease adjust remaining items to compensate (reduce calories if eaten more, add activity if skipped workout, etc.)\n';
        }

        // Build context change string for LLM
        if (payload.contextChanges && payload.contextChanges.length > 0) {
            deviationContext += '\n\nUSER ACTIVITY CONTEXT CHANGES:\n';
            for (const c of payload.contextChanges) {
                const time = new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const location = c.location ? ` (${c.location})` : '';
                const locationContext = c.locationContext ? ` - ${c.locationContext}` : '';
                deviationContext += `\u0007 ${time}: ${c.from} -> ${c.to}${location}${locationContext}\n`;
            }
            deviationContext += '\nAdjust plan based on current activity (e.g., if now home, suggest home-friendly activities; if driving, delay reminders).\n';
        }

        // If we have simplified payload, load full context
        if (!payload.userProfile) {
            const deepContext = await this.loadDeepContext();
            const userProfile = deepContext.userProfile || await storage.get<UserProfile>(storage.keys.USER);
            if (!userProfile) throw new Error(i18n.t('errors.profile.required_refine'));

            // Create enhanced app context with deviations
            const appContext: AppContext = {
                ...deepContext.appContext,
                source: 'plan_refinement',
                refinementReason: payload.reason || 'auto_refine',
                deviationContext,
            };

            const resolvedLanguage = await resolveLanguage(payload.language || (userProfile as any).language);

            return this.workerGeneratePlan({
                userProfile,
                foodHistory: deepContext.foodHistory || [],
                activityHistory: deepContext.activityHistory || [],
                moodHistory: deepContext.moodHistory || [],
                weightHistory: deepContext.weightHistory || [],
                waterLog: deepContext.waterLog || { date: payload.dateKey || '', amount: 0 },
                sleepHistory: deepContext.sleepHistory || [],
                appContext,
                language: resolvedLanguage,
                currentPlan: payload.currentPlan ?? null,
                historySummary: deepContext.historySummary,
            });
        }

        const resolvedLanguage = await resolveLanguage(payload.language || (payload.userProfile as any)?.language);

        // Legacy full payload handling
        return this.workerGeneratePlan({
            ...payload,
            userProfile: payload.userProfile,
            foodHistory: payload.foodHistory || [],
            activityHistory: payload.activityHistory || [],
            moodHistory: payload.moodHistory || [],
            weightHistory: payload.weightHistory || [],
            waterLog: payload.waterLog || { date: '', amount: 0 },
            sleepHistory: payload.sleepHistory || [],
            appContext: payload.appContext ? {
                ...payload.appContext,
                deviationContext, // Add deviation text even for legacy calls
            } : { deviationContext },
            language: resolvedLanguage,
            currentPlan: payload.currentPlan ?? null,
        });
    }

    private async workerCalculateProfile(payload: { formData: Partial<UserProfile> }): Promise<Partial<UserProfile>> {
        return calculateUserProfile(payload.formData);
    }

    private async workerGenerateWrapup(payload: {
        dailyPlan: DailyPlan,
        foodLogs: FoodLogEntry[],
        activityLogs: ActivityLogEntry[],
        waterAmount: number,
        sleepHours: number,
        language: Language
    }): Promise<any> {
        const { dailyPlan, foodLogs, activityLogs, waterAmount, sleepHours, language } = payload;
        return generateDailyWrapUp(dailyPlan, foodLogs, activityLogs, waterAmount, sleepHours, language);
    }

    private async workerAnalyzeTextFood(payload: { text: string, language?: Language }, userProfile?: UserProfile): Promise<FoodAnalysisResult> {
        const { text, language } = payload;
        const deepContext = await this.loadDeepContext();
        return analyzeTextFood(text, userProfile, language || 'en', deepContext);
    }

    private async workerRefineFoodAnalysis(payload: {
        originalAnalysis: FoodAnalysisResult,
        correction: string,
        originalImage?: string,
        language?: Language
    }, userProfile?: UserProfile): Promise<FoodAnalysisResult> {
        const { originalAnalysis, correction, originalImage, language } = payload;
        const deepContext = await this.loadDeepContext();
        return refineFoodAnalysis(originalAnalysis, correction, userProfile, originalImage, language as Language || 'en', deepContext);
    }

    private async workerAnalyzeBodyScan(payload: {
        scanId: string;
        imageUri: string;
        baselineSummary?: string;
        previousSummary?: string;
        language?: Language;
    }, userProfile?: UserProfile) {
        let { imageUri } = payload;
        const { scanId, baselineSummary, previousSummary, language } = payload;
        let imageInfo = await FileSystem.getInfoAsync(imageUri);

        // Recover if queued payload URI is stale but the scan still has a valid persisted URI.
        if (!imageInfo.exists && scanId) {
            const latestScan = await bodyProgressService.getScanById(scanId);
            const fallbackUri = latestScan?.imageUri;
            if (fallbackUri && fallbackUri !== imageUri) {
                const fallbackInfo = await FileSystem.getInfoAsync(fallbackUri);
                if (fallbackInfo.exists) {
                    console.warn('[LLMQueue] Body scan URI recovered from latest scan entry');
                    imageUri = fallbackUri;
                    payload.imageUri = fallbackUri;
                    imageInfo = fallbackInfo;
                }
            }
        }

        if (!imageInfo.exists) {
            throw new Error(i18n.t('errors.video.not_found'));
        }
        const deepContext = await this.loadDeepContext();
        const resolvedLanguage = await resolveLanguage(language || (userProfile as any)?.language);
        const profile = userProfile || deepContext.userProfile;
        if (!profile) {
            throw new Error(i18n.t('errors.profile.required_body_scan'));
        }
        return analyzeBodyScan({
            imageUri,
            baselineSummary,
            previousSummary,
            targetLanguage: resolvedLanguage,
            userProfile: profile,
            deepContext,
        });
    }

    private async workerDetectIngredients(
        payload: { imageBase64?: string, imageUri?: string, mimeType: string },
        _userProfile?: UserProfile
    ): Promise<string[]> {
        const { mimeType, imageUri } = payload;
        const isVideo = mimeType.startsWith('video/');
        let base64 = payload.imageBase64;
        let canRetryWithBase64 = false;

        console.log('[LLMQueue] workerDetectIngredients started:', {
            isVideo,
            mimeType,
            hasImageUri: !!imageUri,
            hasBase64: !!base64,
            directUploadAvailable: isDirectUploadAvailable()
        });

        if (isVideo) {
            console.log('[LLMQueue] Processing fridge video...');
            if (!imageUri) {
                throw new Error(i18n.t('errors.video.not_found'));
            }
            const info = await FileSystem.getInfoAsync(imageUri);
            if (!info.exists) {
                throw new Error(i18n.t('errors.video.not_found'));
            }
            const fileSize = typeof info.size === 'number' ? info.size : 0;
            console.log('[LLMQueue] Fridge video file info:', {
                exists: info.exists,
                size: `${(fileSize / 1024 / 1024).toFixed(2)}MB`,
            });

            if (fileSize > MAX_VIDEO_UPLOAD_BYTES) {
                throw new Error(i18n.t('errors.video.too_large'));
            }
            // If direct upload API is not available, convert video to base64 as fallback
            if (!isDirectUploadAvailable()) {
                console.log('[LLMQueue] Direct upload NOT available for fridge video - using base64 fallback');
                const MAX_BASE64_VIDEO_BYTES = 25 * 1024 * 1024; // 25MB max for Smart Fridge video
                canRetryWithBase64 = fileSize <= MAX_BASE64_VIDEO_BYTES;
                if (!canRetryWithBase64) {
                    throw new Error(i18n.t('errors.video.too_large_processing'));
                }
                console.log('[LLMQueue] Converting fridge video to base64...');
                base64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });
                console.log('[LLMQueue] Fridge video converted to base64, length:', base64?.length);
            } else {
                console.log('[LLMQueue] Direct upload IS available for fridge video - will upload directly to Gemini');
                const MAX_BASE64_VIDEO_BYTES = 25 * 1024 * 1024;
                canRetryWithBase64 = fileSize <= MAX_BASE64_VIDEO_BYTES;
            }
        } else if (!base64 && imageUri) {
            console.log('[LLMQueue] Processing fridge image...');
            base64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });
        }

        if (!base64 && !imageUri) {
            throw new Error(i18n.t('errors.food.missing_image'));
        }

        const fileName = imageUri ? imageUri.split('?')[0].split('/').pop() : undefined;
        console.log('[LLMQueue] Calling detectFridgeIngredients:', {
            hasBase64: !!base64,
            hasFileUri: !!imageUri,
            mimeType,
            fileName
        });

        try {
            const result = await detectFridgeIngredients({ data: base64, fileUri: imageUri, mimeType, fileName });
            console.log('[LLMQueue] detectFridgeIngredients completed, found:', result?.length, 'ingredients');
            return result;
        } catch (error) {
            if (isVideo && !base64 && imageUri && isDirectUploadAvailable() && canRetryWithBase64) {
                console.warn('[LLMQueue] detectFridgeIngredients direct upload failed, retrying with base64 fallback');
                base64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });
                const retryResult = await detectFridgeIngredients({ data: base64, fileUri: undefined, mimeType, fileName });
                console.log('[LLMQueue] detectFridgeIngredients fallback completed, found:', retryResult?.length, 'ingredients');
                return retryResult;
            }
            console.error('[LLMQueue] detectFridgeIngredients failed:', error);
            throw error;
        }
    }

    private async workerGenerateRecipe(payload: { mealTitle: string, mealDescription?: string, language?: Language }, _userProfile?: UserProfile): Promise<any> {
        const { mealTitle, mealDescription } = payload;
        const language = await resolveLanguage(payload.language);
        return generateRecipeForMeal(mealTitle, mealDescription, language);
    }

    private async workerGenerateFridgeRecipes(payload: {
        ingredients: string[],
        mood?: CookingMood,
        language?: Language
    }, userProfile?: UserProfile): Promise<any> {
        const { ingredients, mood, language } = payload;
        if (!userProfile) throw new Error(i18n.t('errors.profile.required_fridge'));
        return generateFridgeRecipes(ingredients, mood || 'quick', userProfile, language || 'en');
    }

    private async workerGenerateNutritionInsights(payload: {
        dateKey: string;
        snapshot: NutrientBalanceSnapshot;
        language?: Language;
    }): Promise<any> {
        const { dateKey, snapshot, language } = payload;
        const userProfile = await storage.get<UserProfile>(storage.keys.USER);
        if (!userProfile) throw new Error(i18n.t('errors.profile.required_insights'));

        const foodHistory = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
        const foodsForDay = foodHistory.filter(f => getLocalDateKey(new Date(f.timestamp)) === dateKey);
        const foodsLogged = foodsForDay.map(f => f.food.foodName).filter(Boolean);

        const lastContextSnapshot = await storage.get<any>(storage.keys.LAST_CONTEXT_SNAPSHOT);
        let weatherSnapshot = null;
        try {
            const { default: locationService } = await import('./locationService');
            const coords = await locationService.getLastKnownLocation();
            weatherSnapshot = await getWeatherSnapshot({
                coords: coords || undefined,
                maxAgeMs: WEATHER_SNAPSHOT_TTL_MS,
            });
        } catch (error) {
            console.warn('[LLMQueue] Failed to load weather snapshot:', error);
        }
        const appContext: AppContext = {
            weather: weatherSnapshot?.weather || { temp: 20, condition: 'Unknown', code: 0 },
            currentLocation: lastContextSnapshot?.locationLabel || weatherSnapshot?.locationName || 'Unknown',
        };

        const insights = await generateNutritionInsights(
            snapshot,
            userProfile,
            language || 'en',
            { foodsLogged, appContext }
        );

        const snapshotKey = `ls_nutrient_snapshot_${dateKey}`;
        await storage.set(snapshotKey, { ...snapshot, insights, updatedAt: Date.now() });

        const { emit } = require('./planEventService');
        emit('NUTRITION_INSIGHTS_UPDATED', { date: dateKey });

        return insights;
    }

    private async workerSummarizeHistory(payload: {
        existingSummary: string,
        oldFoodLogs: FoodLogEntry[],
        oldMoodLogs: MoodLog[],
        oldWeightLogs: WeightLogEntry[],
        language?: Language
    }): Promise<string> {
        const { existingSummary, oldFoodLogs, oldMoodLogs, oldWeightLogs } = payload;
        const language = await resolveLanguage(payload.language);
        return summarizeHistory(existingSummary, oldFoodLogs, oldMoodLogs, oldWeightLogs, language);
    }

    // --- Helper ---

    private async loadDeepContext() {
        const snapshot = await buildLLMContextSnapshot();
        return {
            foodHistory: snapshot.foodHistory || [],
            activityHistory: snapshot.activityHistory || [],
            moodHistory: snapshot.moodHistory || [],
            weightHistory: snapshot.weightHistory || [],
            waterLog: snapshot.waterLog,
            sleepHistory: snapshot.sleepHistory || [],
            appContext: snapshot.appContext,
            currentPlan: snapshot.currentPlan,
            historySummary: snapshot.historySummary || undefined,
            userProfile: snapshot.userProfile,
        };
    }
}

export const llmQueueService = new LLMQueueService();
