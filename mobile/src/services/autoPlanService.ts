/**
 * AutoPlanService - Central orchestrator for all plan generation scenarios
 * 
 * Handles:
 * - Wake confirmation (primary trigger)
 * - Midnight auto-generation
 * - Boot recovery (device restart)
 * - App foreground (app dormant)
 * - Network restored
 * 
 * With:
 * - Energy gating
 * - Pending generation queue
 * - Retry logic with exponential backoff
 */

import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import storage, { getWaterAmountForDate } from './storageService';
import { energyService, InsufficientEnergyError } from './energyService';
import { llmQueueService } from './llmQueueService';
import { emit, recordPlanGeneration } from './planEventService';
import { getLocalDateKey } from '../utils/dateUtils';
import { getActiveDayKey, getDayStartMinutes, getLastWakeTime, getPlanItemTimestamp } from './dayBoundaryService';
import {
    ActivityLogEntry,
    AppContext,
    DailyPlan,
    PlanItem,
    FoodLogEntry,
    Language,
    MoodLog,
    UserProfile,
    WeightLogEntry,
    ENERGY_COSTS,
    PlanGenerationTier,
} from '../types';
import { checkNetworkConnection } from './offlineService';
import sleepHoursService from './sleepHoursService';
import { getHistorySummaryForLLM } from './historyService';
import { sleepSessionService, SleepContext } from './sleepSessionService';
import { normalizePlan } from './planNormalization';
import { errorRecoveryService } from './errorRecoveryService';
import { getWeatherSnapshot, WEATHER_SNAPSHOT_TTL_MS } from './weatherService';
import { userAdaptiveService } from './userAdaptiveService';
import { mergePlanPreservingCompletedAndPast } from './planMerge';
import i18n from '../i18n';
import userProfileService from './userProfileService';
import { refreshTargetsForProfile } from './targetService';
import { buildContextSummary, getHistorySummary as getContextHistorySummary, getRecentTransitions } from './contextHistoryService';

// ============ TYPES ============

export type PlanTrigger =
    | 'WAKE'           // User confirmed wake
    | 'MIDNIGHT'       // Midnight alarm
    | 'BOOT'           // Device boot
    | 'APP_FOREGROUND' // App came to foreground
    | 'NETWORK_RESTORED' // Network connectivity restored
    | 'MANUAL';        // User tapped "Generate Plan"

export type FailureReason =
    | 'LOW_ENERGY'
    | 'OFFLINE'
    | 'NO_PROFILE'
    | 'LLM_ERROR'
    | 'RATE_LIMITED';

export interface GenerationResult {
    status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'SKIPPED';
    plan?: DailyPlan;
    reason?: FailureReason;
    message?: string;
    isOffline?: boolean;
}

export interface PendingGeneration {
    trigger: PlanTrigger;
    reason: FailureReason;
    dateKey: string;
    timestamp: number;
    retryCount: number;
}

// ============ CONSTANTS ============

const STORAGE_KEYS = {
    PENDING_GENERATION: '@pending_plan_generation',
    GENERATION_HISTORY: '@plan_generation_history',
    LAST_WAKE_PLAN_GENERATED_AT: '@last_wake_plan_generated_at',
};

const MAX_RETRY_COUNT = 3;
const RETRY_BACKOFF_MS = [5000, 30000, 120000]; // 5s, 30s, 2min

const planStorageKey = (dateKey: string) => `${storage.keys.DAILY_PLAN}_${dateKey}`;
const legacyAutoPlanKey = (dateKey: string) => `ls_plan_${dateKey}`;

// ============ SERVICE ============

class AutoPlanService {
    private initialized = false;
    private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

    private isFallbackPlan(plan: DailyPlan | null): boolean {
        return !!plan?.isTemporary;
    }

    private async ensurePendingGeneration(
        trigger: PlanTrigger,
        reason: FailureReason,
        dateKey: string
    ): Promise<void> {
        const existing = await this.getPendingGeneration({ requireActiveDay: false });
        if (!existing || existing.dateKey !== dateKey || existing.reason !== reason) {
            await this.storePendingGeneration(trigger, reason, dateKey);
        }
    }

    private async ensureFallbackPlan(
        trigger: PlanTrigger,
        reason: FailureReason,
        dateKey: string
    ): Promise<DailyPlan> {
        const existing = await this.getTodaysPlan();
        if (existing && existing.items?.length) {
            return existing;
        }

        const fallback = await this.buildFallbackPlan(dateKey);
        await this.savePlan(fallback);
        await this.storePendingGeneration(trigger, reason, dateKey);
        emit('PLAN_GENERATED', { dateKey, fallback: true, reason });
        return fallback;
    }

    private async buildFallbackPlan(dateKey: string): Promise<DailyPlan> {
        const now = Date.now();
        const makeId = (suffix: string) =>
            `fallback-${suffix}-${now}-${Math.random().toString(36).slice(2, 6)}`;

        const baseItems: PlanItem[] = [
            {
                id: makeId('breakfast'),
                time: '08:00',
                type: 'meal',
                title: i18n.t('plan.fallback.items.breakfast.title'),
                description: i18n.t('plan.fallback.items.breakfast.description'),
                completed: false,
            },
            {
                id: makeId('hydration_morning'),
                time: '10:30',
                type: 'hydration',
                title: i18n.t('plan.fallback.items.hydration.title'),
                description: i18n.t('plan.fallback.items.hydration.description'),
                completed: false,
            },
            {
                id: makeId('lunch'),
                time: '12:30',
                type: 'meal',
                title: i18n.t('plan.fallback.items.lunch.title'),
                description: i18n.t('plan.fallback.items.lunch.description'),
                completed: false,
            },
            {
                id: makeId('workout'),
                time: '17:00',
                type: 'workout',
                title: i18n.t('plan.fallback.items.workout.title'),
                description: i18n.t('plan.fallback.items.workout.description'),
                completed: false,
            },
            {
                id: makeId('dinner'),
                time: '18:30',
                type: 'meal',
                title: i18n.t('plan.fallback.items.dinner.title'),
                description: i18n.t('plan.fallback.items.dinner.description'),
                completed: false,
            },
            {
                id: makeId('sleep'),
                time: '22:30',
                type: 'sleep',
                title: i18n.t('plan.fallback.items.sleep.title'),
                description: i18n.t('plan.fallback.items.sleep.description'),
                completed: false,
                linkedAction: 'start_sleep',
            },
        ];

        const items: PlanItem[] = await Promise.all(
            baseItems.map(async (item) => ({
                ...item,
                scheduledAt: (await getPlanItemTimestamp(dateKey, item.time)) ?? undefined,
            }))
        );

        return {
            date: dateKey,
            summary: i18n.t('plan.fallback.summary'),
            items,
            createdAt: now,
            updatedAt: now,
            generatedAt: now,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            isTemporary: true,
            source: 'cloud_retry',
        };
    }

    /**
     * Initialize the service - called once on app start
     */
    async init(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        console.log('[AutoPlan] Initializing...');

        // Process any pending generation from background
        await this.processPendingOnStartup();

        // Subscribe to app state changes for network recovery
        // When app comes to foreground, check for pending generation
        this.appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
            if (state === 'active') {
                this.handleAppResumed();
            }
        });

        console.log('[AutoPlan] Initialized');
    }

    /**
     * Main entry point: Generate today's plan based on trigger
     */
    async generateTodayPlan(trigger: PlanTrigger): Promise<GenerationResult> {
        const today = await getActiveDayKey();
        console.log(`[AutoPlan] generateTodayPlan called with trigger: ${trigger}`);

        try {
            // 1. Check if plan already exists
            const shouldForceWake = trigger === 'WAKE' && await this.shouldRegenerateAfterWake(today);
            if (trigger !== 'MANUAL' && !shouldForceWake) {
                const existingPlan = await this.getTodaysPlan();
                if (existingPlan && existingPlan.items?.length > 0) {
                    const shouldUpgrade = this.isFallbackPlan(existingPlan);
                    if (!shouldUpgrade) {
                        console.log('[AutoPlan] Plan already exists for today');
                        return { status: 'SKIPPED', plan: existingPlan, message: i18n.t('plan_generation.already_exists') };
                    }
                    console.log('[AutoPlan] Existing plan is fallback, attempting upgrade');
                }
            }

            // 2. Check profile
            const profileRaw = await storage.get<UserProfile>(storage.keys.USER);
            if (!profileRaw) {
                console.log('[AutoPlan] No user profile found');
                const fallbackPlan = await this.ensureFallbackPlan(trigger, 'NO_PROFILE', today);
                return {
                    status: 'SUCCESS',
                    plan: fallbackPlan,
                    reason: 'NO_PROFILE',
                    message: i18n.t('plan.fallback.generated_message'),
                };
            }

            const weightHistory = await storage.get<WeightLogEntry[]>(storage.keys.WEIGHT) || [];
            const { profile, updated: targetsUpdated } = refreshTargetsForProfile(profileRaw, {
                dateKey: today,
                weightHistory,
            });
            if (targetsUpdated) {
                await userProfileService.saveUserProfile(profile, { source: 'auto_target_refresh' });
            }

            // 3. Check energy
            const cost = ENERGY_COSTS.PLAN_GENERATION;
            const currentEnergy = await energyService.getEnergy();
            const bypassAvailable = llmQueueService.hasEnergyBypass();
            if (currentEnergy < cost && !bypassAvailable) {
                console.log(`[AutoPlan] Insufficient energy (need ${cost}, have ${currentEnergy})`);
                return this.handleLowEnergy(trigger, today, cost, currentEnergy);
            }
            if (currentEnergy < cost && bypassAvailable) {
                console.log('[AutoPlan] Energy low, using bypass token for plan generation');
            }

            // 4. Check network
            const isOnline = await checkNetworkConnection();
            if (!isOnline) {
                console.log('[AutoPlan] Offline - skipping plan generation');
                return this.handleOffline(trigger, today);
            }

            // 5. Generate via LLM
            const result = await this.generateLLMPlan(trigger, today, profile);
            if (trigger === 'WAKE' && result.status === 'SUCCESS') {
                await storage.set(STORAGE_KEYS.LAST_WAKE_PLAN_GENERATED_AT, Date.now());
            }
            return result;

        } catch (error) {
            console.error('[AutoPlan] Generation failed:', error);

            if (error instanceof InsufficientEnergyError) {
                return this.handleLowEnergy(
                    trigger,
                    today,
                    error.requiredEnergy,
                    error.currentEnergy
                );
            }

            return this.handleLLMError(trigger, today, error);
        }
    }

    /**
     * Check if today's plan exists
     */
    async hasTodaysPlan(): Promise<boolean> {
        const plan = await this.getTodaysPlan();
        return plan !== null && (plan.items?.length ?? 0) > 0;
    }

    /**
     * Get today's plan from storage
     */
    async getTodaysPlan(): Promise<DailyPlan | null> {
        const today = await getActiveDayKey();

        const [datedPlan, legacyPlan, legacyAutoPlan] = await Promise.all([
            storage.get<DailyPlan>(planStorageKey(today)),
            storage.get<DailyPlan>(storage.keys.DAILY_PLAN),
            storage.get<DailyPlan>(legacyAutoPlanKey(today)),
        ]);

        if (datedPlan && datedPlan.date === today) return datedPlan;
        if (legacyPlan && legacyPlan.date === today) return legacyPlan;

        // Migration path for older AutoPlanService versions that wrote `ls_plan_YYYY-MM-DD`
        if (legacyAutoPlan && legacyAutoPlan.date === today) {
            await Promise.all([
                storage.set(planStorageKey(today), legacyAutoPlan),
                storage.set(storage.keys.DAILY_PLAN, legacyAutoPlan),
                storage.remove(legacyAutoPlanKey(today)),
            ]);
            return legacyAutoPlan;
        }

        return null;
    }

    /**
     * Get pending generation request
     */
    async getPendingGeneration(options: { requireActiveDay?: boolean } = {}): Promise<PendingGeneration | null> {
        const pending = await storage.get<PendingGeneration>(STORAGE_KEYS.PENDING_GENERATION);
        if (!pending) return null;

        // Clear stale pending (calendar date already passed)
        const todayCalendar = getLocalDateKey(new Date());
        if (pending.dateKey < todayCalendar) {
            await this.clearPendingGeneration();
            return null;
        }

        const requireActiveDay = options.requireActiveDay !== false;
        if (requireActiveDay) {
            const activeDay = await getActiveDayKey();
            if (pending.dateKey !== activeDay) {
                return null;
            }
        }

        return pending;
    }

    /**
     * Store pending generation for later retry
     */
    private async storePendingGeneration(
        trigger: PlanTrigger,
        reason: FailureReason,
        dateKey: string
    ): Promise<void> {
        const existing = await this.getPendingGeneration({ requireActiveDay: false });
        const pending: PendingGeneration = {
            trigger,
            reason,
            dateKey,
            timestamp: Date.now(),
            retryCount: existing ? existing.retryCount + 1 : 0,
        };
        await storage.set(STORAGE_KEYS.PENDING_GENERATION, pending);
        console.log(`[AutoPlan] Stored pending generation: ${reason}`);
    }

    /**
     * Clear pending generation
     */
    private async clearPendingGeneration(): Promise<void> {
        await storage.remove(STORAGE_KEYS.PENDING_GENERATION);
    }

    /**
     * Process pending generation on app startup
     */
    private async processPendingOnStartup(): Promise<void> {
        const pending = await this.getPendingGeneration();
        if (!pending) return;

        console.log(`[AutoPlan] Found pending generation: ${pending.reason}`);

        // Don't auto-retry LOW_ENERGY - wait for user interaction
        if (pending.reason === 'LOW_ENERGY') {
            // Will be handled by DashboardScreen on mount
            emit('PENDING_PLAN_FAILURE', { reason: pending.reason });
            return;
        }

        // Retry OFFLINE/LLM_ERROR
        if (pending.retryCount < MAX_RETRY_COUNT) {
            await this.retryPendingGeneration();
        }
    }

    /**
     * Retry pending generation
     */
    async retryPendingGeneration(): Promise<GenerationResult> {
        const pending = await this.getPendingGeneration();
        if (!pending) {
            return { status: 'SKIPPED', message: i18n.t('plan_generation.no_pending') };
        }

        console.log(`[AutoPlan] Retrying pending generation (attempt ${pending.retryCount + 1})`);

        const result = await this.generateTodayPlan('NETWORK_RESTORED');

        if (result.status === 'SUCCESS') {
            await this.clearPendingGeneration();
            emit('PLAN_GENERATION_RECOVERED', { trigger: pending.trigger });
        }

        return result;
    }

    /**
     * Handle network restored event
     */
    private async handleNetworkRestored(): Promise<void> {
        const pending = await this.getPendingGeneration();
        if (!pending) return;

        if (pending.reason === 'OFFLINE' || pending.reason === 'LLM_ERROR') {
            console.log('[AutoPlan] Network restored - retrying pending generation');

            // Add small delay to ensure stable connection
            setTimeout(async () => {
                const result = await this.retryPendingGeneration();
                if (result.status === 'SUCCESS') {
                    emit('PLAN_UPGRADED', { fromOffline: true });
                }
            }, 3000);
        }
    }

    /**
     * Handle app resumed from background - check network and retry pending
     */
    private async handleAppResumed(): Promise<void> {
        const pending = await this.getPendingGeneration();
        if (!pending) return;

        // Check if network is now available
        const isOnline = await checkNetworkConnection();
        if (isOnline && (pending.reason === 'OFFLINE' || pending.reason === 'LLM_ERROR')) {
            console.log('[AutoPlan] App resumed online - retrying pending generation');
            const result = await this.retryPendingGeneration();
            if (result.status === 'SUCCESS') {
                emit('PLAN_UPGRADED', { fromOffline: true });
            }
        }
    }

    // ============ HANDLERS ============

    /**
     * Handle low energy scenario
     */
    private async handleLowEnergy(
        trigger: PlanTrigger,
        dateKey: string,
        required?: number,
        current?: number
    ): Promise<GenerationResult> {
        await this.storePendingGeneration(trigger, 'LOW_ENERGY', dateKey);
        const fallbackPlan = await this.ensureFallbackPlan(trigger, 'LOW_ENERGY', dateKey);

        if (this.isBackgroundTrigger(trigger)) {
            // Silent fail for background - will notify on wake
            console.log('[AutoPlan] Low energy (background) - stored for later');
            return { status: 'PENDING', reason: 'LOW_ENERGY', plan: fallbackPlan };
        } else {
            // Foreground - emit event for UI to show ad prompt
            emit('ENERGY_LOW', {
                trigger,
                forPlanGeneration: true,
                required: required ?? 15,
                current: current ?? 0,
                operation: i18n.t('plan_generation.operation'),
            });
            return {
                status: 'SUCCESS',
                plan: fallbackPlan,
                reason: 'LOW_ENERGY',
                message: i18n.t('plan_generation.low_energy')
            };
        }
    }

    /**
     * Handle offline scenario
     */
    private async handleOffline(
        trigger: PlanTrigger,
        dateKey: string
    ): Promise<GenerationResult> {
        await this.storePendingGeneration(trigger, 'OFFLINE', dateKey);
        const fallbackPlan = await this.ensureFallbackPlan(trigger, 'OFFLINE', dateKey);

        const isBackground = this.isBackgroundTrigger(trigger);
        return {
            status: isBackground ? 'PENDING' : 'SUCCESS',
            plan: fallbackPlan,
            reason: 'OFFLINE',
            message: i18n.t('errors.plan.offline')
        };
    }

    /**
     * Handle LLM error
     */
    private async handleLLMError(
        trigger: PlanTrigger,
        dateKey: string,
        error: unknown
    ): Promise<GenerationResult> {
        const pending = await this.getPendingGeneration();

        if (pending && pending.retryCount >= MAX_RETRY_COUNT) {
            console.log('[AutoPlan] Max retries exceeded');
            await this.clearPendingGeneration();
            return {
                status: 'FAILED',
                reason: 'LLM_ERROR',
                message: i18n.t('errors.plan.generation_failed')
            };
        }

        await this.storePendingGeneration(trigger, 'LLM_ERROR', dateKey);
        const fallbackPlan = await this.ensureFallbackPlan(trigger, 'LLM_ERROR', dateKey);

        const isBackground = this.isBackgroundTrigger(trigger);
        return {
            status: isBackground ? 'PENDING' : 'SUCCESS',
            plan: fallbackPlan,
            reason: 'LLM_ERROR',
            message: isBackground ? i18n.t('errors.plan.retrying') : i18n.t('errors.plan.generation_failed')
        };
    }

    // ============ GENERATORS ============

    /**
     * Generate plan via LLM (no offline or rule-based fallback).
     */
    private async generateLLMPlan(
        trigger: PlanTrigger,
        dateKey: string,
        profile: UserProfile
    ): Promise<GenerationResult> {
        console.log(`[AutoPlan] Generating plan for ${dateKey}`);

        try {
            // Check circuit breaker first
            if (errorRecoveryService.isCircuitOpen('geminiAPI')) {
                const circuitState = errorRecoveryService.getCircuitBreakerState('geminiAPI');
                const cooldownRemaining = circuitState
                    ? Math.max(0, Math.round((circuitState.cooldownUntil - Date.now()) / 1000))
                    : 0;

                console.log(`[AutoPlan] Circuit breaker OPEN (cooldown: ${cooldownRemaining}s) - skipping generation`);

                await this.ensurePendingGeneration(trigger, 'LLM_ERROR', dateKey);
                const isBackground = this.isBackgroundTrigger(trigger);
                return {
                    status: isBackground ? 'PENDING' : 'FAILED',
                    reason: 'LLM_ERROR',
                    message: i18n.t('errors.plan.service_unavailable', { seconds: cooldownRemaining })
                };
            }

            // Determine tier based on current energy
            const currentEnergy = await energyService.getEnergy();
            const bypassAvailable = llmQueueService.hasEnergyBypass();
            let tier: PlanGenerationTier;

            if (bypassAvailable) {
                tier = 'full_llm';
            } else if (currentEnergy >= 15) {
                tier = 'full_llm';
            } else if (currentEnergy >= 5) {
                tier = 'degraded_llm';
            } else {
                tier = 'rule_based';
            }

            console.log(`[AutoPlan] Selected tier: ${tier} (energy: ${currentEnergy})`);

            // Prevent rule-based fallback (no offline or local plans)
            if (tier === 'rule_based') {
                return this.handleLowEnergy(trigger, dateKey, ENERGY_COSTS.PLAN_GENERATION, currentEnergy);
            }

            // Tier 1 or Tier 2: LLM generation
            try {
                const payload = await this.buildGeneratePlanPayload(dateKey, profile);

                // Add tier info to payload for potential future use
                (payload as any).tier = tier;

                // Use llmQueueService which handles energy consumption + retry/backoff
                const plan = await llmQueueService.addJobAndWait<DailyPlan>('GENERATE_PLAN', payload, 'critical');

                if (plan) {
                    await this.savePlan({ ...plan, date: dateKey, source: 'cloud', isTemporary: false });
                    await this.clearPendingGeneration();

                    // Record success with error recovery service
                    await errorRecoveryService.recordSuccess('geminiAPI');

                    emit('PLAN_GENERATED', { trigger, dateKey, tier });

                    return { status: 'SUCCESS', plan };
                }

                throw new Error(i18n.t('errors.plan.empty_response'));

            } catch (llmError) {
                // Record failure with error recovery service
                await errorRecoveryService.recordFailure('geminiAPI');

                if (llmError instanceof InsufficientEnergyError) {
                    return this.handleLowEnergy(
                        trigger,
                        dateKey,
                        llmError.requiredEnergy,
                        llmError.currentEnergy
                    );
                }

                console.log('[AutoPlan] LLM generation failed');
                return this.handleLLMError(trigger, dateKey, llmError);
            }

        } catch (error) {
            console.error('[AutoPlan] Plan generation error:', error);

            if (error instanceof InsufficientEnergyError) {
                return this.handleLowEnergy(
                    trigger,
                    dateKey,
                    error.requiredEnergy,
                    error.currentEnergy
                );
            }

            throw error;
        }
    }

    private async buildGeneratePlanPayload(dateKey: string, userProfile: UserProfile): Promise<{
        dateKey: string;
        userProfile: UserProfile;
        foodHistory: FoodLogEntry[];
        activityHistory: ActivityLogEntry[];
        moodHistory: MoodLog[];
        weightHistory: WeightLogEntry[];
        waterLog: { date: string; amount: number };
        sleepHistory: { date: string; hours: number }[];
        sleepContext?: SleepContext;
        sleepContextString?: string;
        appContext: AppContext;
        language: Language;
        currentPlan: DailyPlan | null;
        historySummary?: string;
    }> {
        const [
            foodHistory,
            activityHistory,
            moodHistory,
            weightHistory,
            waterAmount,
            sleepHistory,
            sleepContext,
            lastContextSnapshot,
            contextHistorySummary,
            contextTransitions,
        ] = await Promise.all([
            storage.get<FoodLogEntry[]>(storage.keys.FOOD),
            storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY),
            storage.get<MoodLog[]>(storage.keys.MOOD),
            storage.get<WeightLogEntry[]>(storage.keys.WEIGHT),
            getWaterAmountForDate(dateKey),
            sleepHoursService.getHistory(),
            sleepSessionService.getSleepContextForLLM(),
            storage.get<any>(storage.keys.LAST_CONTEXT_SNAPSHOT),
            getContextHistorySummary(),
            getRecentTransitions(5),
        ]);

        const sleepContextString = sleepContext
            ? sleepSessionService.formatContextForPrompt(sleepContext)
            : undefined;

        const [datedPlan, legacyPlan, languageRaw, historySummary] = await Promise.all([
            storage.get<DailyPlan>(planStorageKey(dateKey)),
            storage.get<DailyPlan>(storage.keys.DAILY_PLAN),
            AsyncStorage.getItem('@biosync_language'),
            (async () => {
                try {
                    return await getHistorySummaryForLLM();
                } catch (e) {
                    console.warn('[AutoPlan] Failed to load history summary:', e);
                    return undefined;
                }
            })(),
        ]);

        const currentPlan =
            (datedPlan && datedPlan.date === dateKey ? datedPlan : null) ||
            (legacyPlan && legacyPlan.date === dateKey ? legacyPlan : null) ||
            null;

        const language = (languageRaw as Language) || 'en';

        let locationServiceRef: any = null;
        const locationContextDetail = await (async () => {
            try {
                const { default: locationService } = await import('./locationService');
                locationServiceRef = locationService;
                return await locationService.buildContextForLLM();
            } catch (error) {
                console.warn('[AutoPlan] Failed to build location context:', error);
                return undefined;
            }
        })();

        const nutritionContext = await (async () => {
            try {
                const { nutritionService } = await import('./nutritionService');
                return await nutritionService.buildContextForLLM(foodHistory || [], userProfile);
            } catch (error) {
                console.warn('[AutoPlan] Failed to build nutrition context:', error);
                return undefined;
            }
        })();

        const carriedOverContext = await (async () => {
            try {
                const { planRefinementService } = await import('./planRefinementService');
                return await planRefinementService.buildFullContextForLLM();
            } catch (error) {
                console.warn('[AutoPlan] Failed to build carried-over context:', error);
                return undefined;
            }
        })();

        const mergedLocationContext = [lastContextSnapshot?.locationContext, locationContextDetail]
            .filter(Boolean)
            .join('\n') || undefined;

        const contextSummary = buildContextSummary({
            lastSnapshot: lastContextSnapshot,
            summary: contextHistorySummary,
            transitions: contextTransitions,
        });

        const contextTransitionsText = contextTransitions && contextTransitions.length > 0
            ? contextTransitions
                .map((transition) => {
                    const at = new Date(transition.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const location = transition.location ? ` @ ${transition.location}` : '';
                    return `${at}: ${transition.from} → ${transition.to}${location}`;
                })
                .join('\n')
            : undefined;

        let weatherSnapshot = null;
        try {
            const coords = locationServiceRef ? await locationServiceRef.getLastKnownLocation() : null;
            weatherSnapshot = await getWeatherSnapshot({
                coords: coords || undefined,
                maxAgeMs: WEATHER_SNAPSHOT_TTL_MS,
            });
        } catch (error) {
            console.warn('[AutoPlan] Failed to load weather snapshot:', error);
        }

        const appContext: AppContext = {
            weather: weatherSnapshot?.weather || { temp: 20, condition: 'Unknown', code: 0 },
            currentLocation: lastContextSnapshot?.locationLabel || weatherSnapshot?.locationName || 'Unknown',
            userContextState: lastContextSnapshot?.state || 'unknown',
            locationContext: mergedLocationContext,
            nutritionContext,
            carriedOverContext,
            contextSummary,
            contextDetails: lastContextSnapshot
                ? {
                    environment: lastContextSnapshot.environment,
                    confidence: lastContextSnapshot.confidence,
                    pollTier: lastContextSnapshot.pollTier,
                    movementType: lastContextSnapshot.movementType,
                    locationType: lastContextSnapshot.locationType,
                    conflicts: lastContextSnapshot.conflicts,
                    lastUpdatedAt: lastContextSnapshot.updatedAt,
                }
                : undefined,
            contextTransitions: contextTransitionsText,
        };

        try {
            const adaptationSummary = await userAdaptiveService.getAdaptationSummary();
            if (adaptationSummary) {
                appContext.adaptationContext = adaptationSummary;
            }
        } catch (error) {
            console.warn('[AutoPlan] Failed to load adaptation summary:', error);
        }

        try {
            const { getHealthContextData, getBioContextForAppContext } = await import('./healthContextService');
            const healthData = await getHealthContextData();
            if (healthData) {
                appContext.healthData = healthData;
            }
            const bioContext = await getBioContextForAppContext();
            if (bioContext.bioSnapshot) appContext.bioSnapshot = bioContext.bioSnapshot;
            if (bioContext.bioTrends) appContext.bioTrends = bioContext.bioTrends;
            if (bioContext.bioHistorySummary) appContext.bioHistorySummary = bioContext.bioHistorySummary;
        } catch (error) {
            console.warn('[AutoPlan] Failed to load health context:', error);
        }

        return {
            dateKey,
            userProfile,
            foodHistory: foodHistory || [],
            activityHistory: activityHistory || [],
            moodHistory: moodHistory || [],
            weightHistory: weightHistory || [],
            waterLog: { date: dateKey, amount: waterAmount || 0 },
            sleepHistory: sleepHistory || [],
            sleepContext,
            sleepContextString,
            appContext,
            language,
            currentPlan,
            historySummary,
        };
    }

    /**
     * Save plan to storage and sync to native
     */
    private async savePlan(plan: DailyPlan): Promise<void> {
        const dayStartMinutes = await getDayStartMinutes(plan.date);
        const normalized =
            normalizePlan(plan, plan.date, { forceDateKey: true, dayStartMinutes }) || plan;

        const [existingPlan, legacyPlan] = await Promise.all([
            storage.get<DailyPlan>(planStorageKey(normalized.date)),
            storage.get<DailyPlan>(storage.keys.DAILY_PLAN),
        ]);
        const previousPlan = existingPlan || legacyPlan || null;
        const activeDayKey = await getActiveDayKey();
        const merged = mergePlanPreservingCompletedAndPast(
            normalized,
            previousPlan,
            new Date(),
            { dayStartMinutes, activeDayKey }
        );

        await storage.set(planStorageKey(merged.date), merged);
        await storage.set(storage.keys.DAILY_PLAN, merged);
        // Clean up older AutoPlanService storage key if present.
        await storage.remove(legacyAutoPlanKey(normalized.date));
        await recordPlanGeneration();
    }

    // ============ HELPERS ============

    private isBackgroundTrigger(trigger: PlanTrigger): boolean {
        return trigger === 'MIDNIGHT' || trigger === 'BOOT' || trigger === 'NETWORK_RESTORED';
    }

    private async shouldRegenerateAfterWake(dateKey: string): Promise<boolean> {
        const wakeTime = await getLastWakeTime();
        if (!wakeTime || !Number.isFinite(wakeTime)) return true;

        const wakeDateKey = getLocalDateKey(new Date(wakeTime));
        if (wakeDateKey !== dateKey) return true;

        const lastGenerated = await storage.get<number>(STORAGE_KEYS.LAST_WAKE_PLAN_GENERATED_AT);
        if (!lastGenerated || !Number.isFinite(lastGenerated)) return true;

        return lastGenerated < wakeTime;
    }

    /**
     * Cleanup on unmount
     */
    destroy(): void {
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }
    }
}

// ============ SINGLETON ============

export const autoPlanService = new AutoPlanService();
export default autoPlanService;
