// Plan Event Service - Handles auto-generation and smart plan updates
// Provides: Event bus, auto-generation on new day, triggers after food/activity/weight

import { AppState, AppStateStatus } from 'react-native';
import storage from './storageService';
import i18n from '../i18n';
import { DailyPlan, FoodLogEntry, ActivityLogEntry, WeightLogEntry, UserProfile, AppContext, MoodLog } from '../types';
import { getLocalDateKey } from '../utils/dateUtils';
import { getActiveDayKey, maybeAdvanceActiveDay } from './dayBoundaryService';
import { getHistorySummaryForLLM } from './historyService';

// ============ EVENT BUS ============

export type PlanEventType =
    | 'FOOD_LOGGED'
    | 'ACTIVITY_LOGGED'
    | 'WATER_LOGGED'
    | 'WEIGHT_UPDATED'
    | 'PLAN_ITEM_COMPLETED'
    | 'PLAN_ITEM_SKIPPED'
    | 'NEW_DAY_DETECTED'
    | 'PLAN_GENERATED'
    | 'PLAN_UPDATED'
    | 'SLEEP_ANALYZED'
    | 'FOOD_ANALYZED'
    | 'ENERGY_LOW'              // Triggered when LLM job fails due to insufficient energy
    | 'ENERGY_CONSUMED'         // Triggered when energy is consumed for an LLM job
    | 'ENERGY_BYPASS_USED'      // Triggered when energy check is bypassed (premium)
    | 'PENDING_PLAN_FAILURE'    // Background generation failed, needs user action
    | 'PLAN_GENERATION_RECOVERED' // Pending generation succeeded on retry
    | 'PLAN_UPGRADED'           // Offline plan upgraded to LLM plan
    | 'PLAN_GENERATION_REQUESTED' // Native layer requests plan generation
    | 'NUTRITION_INSIGHTS_UPDATED' // Nutrition insights refreshed
    | 'BODY_PROGRESS_UPDATED'; // Body progress scans updated

type PlanEventHandler = (data?: any) => void | Promise<void>;

const eventHandlers: Map<PlanEventType, Set<PlanEventHandler>> = new Map();

// Debounce tracking to prevent infinite loops
const lastEventEmitTime: Map<PlanEventType, number> = new Map();
const EVENT_DEBOUNCE_MS: Record<PlanEventType, number> = {
    'NEW_DAY_DETECTED': 60000,     // Only emit once per minute max
    'FOOD_LOGGED': 5000,           // 5 second debounce
    'ACTIVITY_LOGGED': 5000,
    'WATER_LOGGED': 2000,          // 2 second debounce for water
    'WEIGHT_UPDATED': 10000,
    'PLAN_ITEM_COMPLETED': 2000,
    'PLAN_ITEM_SKIPPED': 2000,
    'PLAN_GENERATED': 30000,       // 30 second debounce
    'PLAN_UPDATED': 2000,
    'SLEEP_ANALYZED': 5000,
    'FOOD_ANALYZED': 5000,
    'ENERGY_LOW': 5000,            // 5 second debounce to prevent spam
    'ENERGY_CONSUMED': 1000,       // 1 second debounce
    'ENERGY_BYPASS_USED': 1000,
    'PENDING_PLAN_FAILURE': 30000, // 30 second debounce
    'PLAN_GENERATION_RECOVERED': 30000,
    'PLAN_UPGRADED': 30000,
    'PLAN_GENERATION_REQUESTED': 10000,
    'NUTRITION_INSIGHTS_UPDATED': 5000,
    'BODY_PROGRESS_UPDATED': 1000,
};

// Track if NEW_DAY_DETECTED was already handled this session
let newDayHandledThisSession = false;
let sessionStartDate = getLocalDateKey(new Date());

/**
 * Subscribe to plan events
 */
export const subscribe = (event: PlanEventType, handler: PlanEventHandler): (() => void) => {
    if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set());
    }
    eventHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
        eventHandlers.get(event)?.delete(handler);
    };
};

/**
 * Emit a plan event (with debouncing to prevent loops)
 */
export const emit = async (event: PlanEventType, data?: any): Promise<void> => {
    const now = Date.now();
    const lastEmit = lastEventEmitTime.get(event) || 0;
    const debounceMs = EVENT_DEBOUNCE_MS[event] || 1000;

    // Check if event was emitted too recently
    if (now - lastEmit < debounceMs) {
        console.log(`[PlanEvent] Debounced: ${event} (${Math.round((debounceMs - (now - lastEmit)) / 1000)}s remaining)`);
        return;
    }

    // Special handling for NEW_DAY_DETECTED - only once per session per day
    if (event === 'NEW_DAY_DETECTED') {
        const today = await getActiveDayKey();
        if (today === sessionStartDate && newDayHandledThisSession) {
            console.log(`[PlanEvent] Skipped: NEW_DAY_DETECTED already handled this session`);
            return;
        }
        if (today !== sessionStartDate) {
            // It's actually a new day - reset the flag
            sessionStartDate = today;
            newDayHandledThisSession = false;
        }
        newDayHandledThisSession = true;
    }

    // Record emit time
    lastEventEmitTime.set(event, now);

    console.log(`[PlanEvent] Emitting: ${event}`, data ? JSON.stringify(data).slice(0, 100) : '');

    const handlers = eventHandlers.get(event);
    if (handlers) {
        for (const handler of handlers) {
            try {
                await handler(data);
            } catch (error) {
                console.error(`[PlanEvent] Handler error for ${event}:`, error);
            }
        }
    }
};

// ============ AUTO-GENERATION LOGIC ============

const LAST_PLAN_DATE_KEY = 'last_plan_generation_date';
const PLAN_GENERATION_PENDING_KEY = 'plan_generation_pending';
const MIN_UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes between auto-updates

let isAutoGenerating = false;
let appStateSubscription: { remove: () => void } | null = null;
let lastUpdateCheck = 0;
let lastNewDayCheck = 0;
const NEW_DAY_CHECK_DEBOUNCE_MS = 5000; // Only check for new day every 5 seconds

/**
 * Check if we need to generate a new plan for today
 */
export const checkAndAutoGenerate = async (options?: {
    allowWhenSleeping?: boolean;
    reason?: string;
}): Promise<{
    needsGeneration: boolean;
    reason?: string;
}> => {
    try {
        await maybeAdvanceActiveDay({
            reason: options?.reason ?? 'plan_check',
            allowWhenSleeping: options?.allowWhenSleeping,
        });
        const today = await getActiveDayKey();

        // Check if we have a plan for today
        const planKey = `${storage.keys.DAILY_PLAN}_${today}`;
        const existingPlan = await storage.get<DailyPlan>(planKey);

        if (!existingPlan) {
            // Also check legacy key
            const legacyPlan = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
            if (!legacyPlan || legacyPlan.date !== today) {
                return { needsGeneration: true, reason: 'No plan for today' };
            }
        }

        // Check if plan date matches today
        if (existingPlan && existingPlan.date !== today) {
            return { needsGeneration: true, reason: 'Plan is from a different day' };
        }

        // Check last generation date
        const lastGenDate = await storage.get<string>(LAST_PLAN_DATE_KEY);
        if (lastGenDate !== today) {
            return { needsGeneration: true, reason: 'New day detected' };
        }

        return { needsGeneration: false };
    } catch (error) {
        console.error('[PlanEvent] Check failed:', error);
        return { needsGeneration: false };
    }
};

/**
 * Mark that plan generation is needed (for background processing)
 */
export const markPlanGenerationPending = async (): Promise<void> => {
    await storage.set(PLAN_GENERATION_PENDING_KEY, true);
};

/**
 * Check if plan generation is pending
 */
export const isPlanGenerationPending = async (): Promise<boolean> => {
    return await storage.get<boolean>(PLAN_GENERATION_PENDING_KEY) || false;
};

/**
 * Clear pending flag after generation
 */
export const clearPlanGenerationPending = async (): Promise<void> => {
    await storage.set(PLAN_GENERATION_PENDING_KEY, false);
};

/**
 * Record that plan was generated today
 */
export const recordPlanGeneration = async (): Promise<void> => {
    const today = await getActiveDayKey();
    await storage.set(LAST_PLAN_DATE_KEY, today);
    await clearPlanGenerationPending();
};

// ============ SMART UPDATE TRIGGERS ============

/**
 * Determine if plan should be updated based on recent changes
 */
export const shouldUpdatePlan = async (trigger: PlanEventType): Promise<{
    shouldUpdate: boolean;
    reason?: string;
    priority: 'high' | 'medium' | 'low';
}> => {
    const now = Date.now();

    // Prevent too frequent updates
    if (now - lastUpdateCheck < MIN_UPDATE_INTERVAL_MS) {
        return { shouldUpdate: false, reason: 'Too soon since last update', priority: 'low' };
    }

    switch (trigger) {
        case 'FOOD_LOGGED':
            // Check if significant calories were consumed
            return {
                shouldUpdate: true,
                reason: 'Food logged - recalculating remaining day',
                priority: 'medium'
            };

        case 'ACTIVITY_LOGGED':
            return {
                shouldUpdate: true,
                reason: 'Activity logged - adjusting calorie targets',
                priority: 'medium'
            };

        case 'WEIGHT_UPDATED':
            return {
                shouldUpdate: true,
                reason: 'Weight updated - recalculating targets',
                priority: 'high'
            };

        case 'NEW_DAY_DETECTED':
            return {
                shouldUpdate: true,
                reason: 'New day - fresh plan needed',
                priority: 'high'
            };

        case 'PLAN_ITEM_COMPLETED':
        case 'PLAN_ITEM_SKIPPED':
            return {
                shouldUpdate: false, // Don't regenerate plan just for checking off items (unless we want to re-optimize)
                priority: 'low'
            };

        default:
            return { shouldUpdate: false, priority: 'low' };
    }
};

/**
 * Record that an update check was performed
 */
export const recordUpdateCheck = (): void => {
    lastUpdateCheck = Date.now();
};

// ============ APP STATE MONITORING ============

/**
 * Initialize app state monitoring for auto-generation
 */
export const initPlanEventService = (): (() => void) => {
    void getActiveDayKey().then(key => {
        sessionStartDate = key;
    });
    // Check on initial mount
    checkForNewDay();

    // HEARTBEAT: Check for new day every 60 seconds
    // This handles the "Midnight Blind Spot" where app stays active across date boundaries
    const heartbeatInterval = setInterval(() => {
        checkForNewDay();
    }, 60000);

    // Monitor app state changes
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
        clearInterval(heartbeatInterval);
        if (appStateSubscription) {
            appStateSubscription.remove();
            appStateSubscription = null;
        }
    };
};

/**
 * Handle app state changes
 */
const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
        // Delay to avoid race with other initialization
        setTimeout(() => {
            checkForNewDay();
        }, 2000);
    }
};

/**
 * Check if it's a new day and emit event (with debounce)
 */
const checkForNewDay = async (): Promise<void> => {
    const now = Date.now();

    // Debounce: don't check more than once every 5 seconds
    if (now - lastNewDayCheck < NEW_DAY_CHECK_DEBOUNCE_MS) {
        console.log('[PlanEvent] checkForNewDay debounced');
        return;
    }
    lastNewDayCheck = now;

    const result = await checkAndAutoGenerate({
        allowWhenSleeping: true,
        reason: 'new_day_heartbeat',
    });

    if (result.needsGeneration) {
        console.log(`[PlanEvent] New day detected: ${result.reason}`);
        await emit('NEW_DAY_DETECTED', { reason: result.reason });
    }
};

// ============ CONVENIENCE FUNCTIONS FOR LOGGING ============

/**
 * Call after logging food - emits event and checks if plan needs update
 */
export const notifyFoodLogged = async (entry: FoodLogEntry): Promise<void> => {
    await emit('FOOD_LOGGED', {
        calories: entry.food.macros.calories,
        protein: entry.food.macros.protein,
        foodName: entry.food.foodName,
    });

    const dateKey = getLocalDateKey(new Date(entry.timestamp));
    void (async () => {
        try {
            const { default: nutritionDbService } = await import('./nutritionDbService');
            await nutritionDbService.upsertFromFood(entry.food);

            await nutritionDbService.enrichFromRemote(entry.food);
        } catch (error) {
            console.warn('[PlanEvent] Failed to update nutrition DB:', error);
        }

        try {
            const { nutritionService } = await import('./nutritionService');
            await nutritionService.refreshSnapshotForDate(dateKey, { force: true });
        } catch (error) {
            console.warn('[PlanEvent] Failed to refresh nutrition snapshot:', error);
        }
    })();
};

/**
 * Call after logging activity - emits event
 */
export const notifyActivityLogged = async (entry: ActivityLogEntry): Promise<void> => {
    await emit('ACTIVITY_LOGGED', {
        name: entry.name,
        duration: entry.durationMinutes,
        caloriesBurned: entry.caloriesBurned,
    });
};

/**
 * Call after updating weight - emits event
 */
export const notifyWeightUpdated = async (entry: WeightLogEntry): Promise<void> => {
    await emit('WEIGHT_UPDATED', {
        weight: entry.weight,
        timestamp: entry.timestamp,
    });
};

/**
 * Call after plan is generated
 */
export const notifyPlanGenerated = async (plan: DailyPlan): Promise<void> => {
    await recordPlanGeneration();
    await emit('PLAN_GENERATED', {
        date: plan.date,
        itemCount: plan.items.length,
    });
};

// ============ ERROR HANDLING HELPERS ============

export interface LLMError {
    type: 'rate_limit' | 'network' | 'auth' | 'server' | 'unknown';
    message: string;
    retryAfterMs?: number;
    canRetry: boolean;
}

/**
 * Parse LLM error and return user-friendly info
 */
export const parseLLMError = (error: any): LLMError => {
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    const status = error?.status || error?.code;

    // Rate limit / Quota
    if (status === 429 || message.includes('quota') || message.includes('rate')) {
        const retryMatch = message.match(/retry in\s+(\d+)/i);
        const retryAfterMs = retryMatch ? parseInt(retryMatch[1]) * 1000 : 60000;

        return {
            type: 'rate_limit',
            message: i18n.t('errors.llm.rate_limit'),
            retryAfterMs,
            canRetry: true,
        };
    }

    // Network errors
    if (message.includes('network') || message.includes('timeout') ||
        message.includes('fetch failed') || error?.name === 'AbortError') {
        return {
            type: 'network',
            message: i18n.t('errors.llm.network'),
            canRetry: true,
        };
    }

    // Auth errors
    if (status === 401 || status === 403 || message.includes('unauthorized')) {
        return {
            type: 'auth',
            message: i18n.t('errors.llm.auth'),
            canRetry: false,
        };
    }

    // Server errors
    if (status >= 500) {
        return {
            type: 'server',
            message: i18n.t('errors.llm.server'),
            canRetry: true,
        };
    }

    // Unknown
    return {
        type: 'unknown',
        message: i18n.t('errors.llm.unknown'),
        canRetry: true,
    };
};

/**
 * Get retry delay with exponential backoff
 */
export const getRetryDelay = (attempt: number): number => {
    const baseDelay = 2000; // 2 seconds
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    return delay + Math.random() * 1000; // Add jitter
};

export default {
    // Event bus
    subscribe,
    emit,

    // Auto-generation
    checkAndAutoGenerate,
    markPlanGenerationPending,
    isPlanGenerationPending,
    clearPlanGenerationPending,
    recordPlanGeneration,

    // Smart triggers
    shouldUpdatePlan,
    recordUpdateCheck,

    // Initialization
    initPlanEventService,

    // Convenience
    notifyFoodLogged,
    notifyActivityLogged,
    notifyWeightUpdated,
    notifyPlanGenerated,

    // Error handling
    parseLLMError,
    getRetryDelay,
};
