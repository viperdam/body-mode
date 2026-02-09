/**
 * Plan Retry Service - Background retry for failed plan generation
 * 
 * When Gemini API fails due to rate limiting:
 * 1. Queue retry with exponential backoff (1min → 3min → 5min → 10min → 15min)
 * 2. On success: Save plan, emit event to update UI
 * 3. On final failure: Trigger overlay notification
 */

import { Platform } from 'react-native';
import storage from './storageService';
import { DailyPlan, UserProfile, Language } from '../types';
import { generateDailyPlan, isRateLimited, getRateLimitRemainingMs } from './geminiService';
import { emit, subscribe } from './planEventService';
import { getLocalDateKey } from '../utils/dateUtils';
import { schedulePlanRetryFailureNotification } from './notificationService';

// Android: Standard retry schedule (1min → 3min → 5min → 10min → 15min)
const ANDROID_RETRY_DELAYS_MS = [
    1 * 60 * 1000,   // 1 minute
    3 * 60 * 1000,   // 3 minutes
    5 * 60 * 1000,   // 5 minutes
    10 * 60 * 1000,  // 10 minutes
    15 * 60 * 1000,  // 15 minutes
];

// iOS: Shorter retry schedule (iOS aggressively kills background tasks)
const IOS_RETRY_DELAYS_MS = [
    30 * 1000,       // 30 seconds
    60 * 1000,       // 1 minute
    2 * 60 * 1000,   // 2 minutes
];

// Use platform-specific delays
const RETRY_DELAYS_MS = Platform.OS === 'ios' ? IOS_RETRY_DELAYS_MS : ANDROID_RETRY_DELAYS_MS;

const MAX_RETRIES = RETRY_DELAYS_MS.length;
const RETRY_STATE_KEY = 'plan_retry_state';

// Maximum age for retries (24 hours) - prevents stale retries from piling up
const MAX_RETRY_AGE_MS = 24 * 60 * 60 * 1000;

interface RetryState {
    queued: boolean;
    attempt: number;
    nextRetryTime: number;
    dateKey: string;
    language: Language;
    context: {
        profile: UserProfile;
        history: any;
        appContext: any;
        currentPlan: DailyPlan | null;
        historySummary?: string;
    } | null;
}

const DEFAULT_STATE: RetryState = {
    queued: false,
    attempt: 0,
    nextRetryTime: 0,
    dateKey: '',
    language: 'en',
    context: null,
};

let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
let isProcessing = false;

/**
 * Get current retry state from storage
 */
const getRetryState = async (): Promise<RetryState> => {
    const state = await storage.get<RetryState>(RETRY_STATE_KEY);
    return state || { ...DEFAULT_STATE };
};

/**
 * Save retry state to storage
 */
const saveRetryState = async (state: RetryState): Promise<void> => {
    await storage.set(RETRY_STATE_KEY, state);
};

/**
 * Clear retry state
 */
const clearRetryState = async (): Promise<void> => {
    await storage.remove(RETRY_STATE_KEY);
    if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
    }
    isProcessing = false;
};

/**
 * Queue a plan generation for background retry
 */
export const queuePlanRetry = async (
    profile: UserProfile,
    history: any,
    appContext: any,
    language: Language,
    currentPlan: DailyPlan | null,
    historySummary?: string
): Promise<void> => {
    const dateKey = getLocalDateKey(new Date());

    const state: RetryState = {
        queued: true,
        attempt: 0,
        nextRetryTime: Date.now() + RETRY_DELAYS_MS[0],
        dateKey,
        language,
        context: {
            profile,
            history,
            appContext,
            currentPlan,
            historySummary,
        },
    };

    await saveRetryState(state);
    console.log(`[PlanRetry] Queued retry, first attempt in ${RETRY_DELAYS_MS[0] / 1000}s`);

    // Schedule the first retry
    scheduleNextRetry(state);
};

/**
 * Schedule the next retry attempt
 */
const scheduleNextRetry = (state: RetryState): void => {
    if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
    }

    const delay = state.nextRetryTime - Date.now();
    if (delay <= 0) {
        // Execute immediately
        processRetry();
        return;
    }

    console.log(`[PlanRetry] Scheduling retry ${state.attempt + 1}/${MAX_RETRIES} in ${Math.round(delay / 1000)}s`);

    retryTimeoutId = setTimeout(() => {
        processRetry();
    }, delay);
};

/**
 * Process a retry attempt
 */
const processRetry = async (): Promise<void> => {
    if (isProcessing) {
        console.log('[PlanRetry] Already processing, skipping');
        return;
    }

    isProcessing = true;

    try {
        const state = await getRetryState();

        if (!state.queued || !state.context) {
            console.log('[PlanRetry] No pending retry');
            isProcessing = false;
            return;
        }

        // Check if retry is for today
        const todayKey = getLocalDateKey(new Date());
        if (state.dateKey !== todayKey) {
            console.log('[PlanRetry] Retry was for a different day, clearing');
            await clearRetryState();
            isProcessing = false;
            return;
        }

        // Check if still rate limited
        if (isRateLimited()) {
            const remainingMs = getRateLimitRemainingMs();
            console.log(`[PlanRetry] Still rate limited, waiting ${Math.round(remainingMs / 1000)}s more`);

            // Re-schedule after rate limit expires
            state.nextRetryTime = Date.now() + remainingMs + 1000; // +1s buffer
            await saveRetryState(state);
            scheduleNextRetry(state);
            isProcessing = false;
            return;
        }

        const { profile, history, appContext, currentPlan, historySummary } = state.context;
        let appContextWithHealth = appContext;
        try {
            const { getHealthContextData, getBioContextForAppContext } = await import('./healthContextService');
            const healthData = await getHealthContextData();
            const bioContext = await getBioContextForAppContext();
            if (healthData) {
                appContextWithHealth = { ...appContextWithHealth, healthData };
            }
            if (bioContext.bioSnapshot) {
                appContextWithHealth = { ...appContextWithHealth, bioSnapshot: bioContext.bioSnapshot };
            }
            if (bioContext.bioTrends) {
                appContextWithHealth = { ...appContextWithHealth, bioTrends: bioContext.bioTrends };
            }
            if (bioContext.bioHistorySummary) {
                appContextWithHealth = { ...appContextWithHealth, bioHistorySummary: bioContext.bioHistorySummary };
            }
        } catch (error) {
            console.warn('[PlanRetry] Failed to load health context:', error);
        }

        console.log(`[PlanRetry] Attempting retry ${state.attempt + 1}/${MAX_RETRIES}`);

        try {
            const plan = await generateDailyPlan(
                profile,
                history.food || [],
                history.activity || [],
                history.mood || [],
                history.weight || [],
                history.water || { date: todayKey, amount: 0 },
                history.sleep || [],
                appContextWithHealth,
                state.language,
                currentPlan,
                historySummary,
                undefined
            );

            // Success! Save plan and notify
            console.log('[PlanRetry] Success! Plan generated');

            const planKey = `${storage.keys.DAILY_PLAN}_${todayKey}`;
            await storage.set(planKey, { ...plan, source: 'cloud_retry' });

            // Emit success event
            await emit('PLAN_GENERATED', { plan, source: 'background_retry' });

            // Clear retry state
            await clearRetryState();

        } catch (error: any) {
            console.warn(`[PlanRetry] Attempt ${state.attempt + 1} failed:`, error?.message || error);

            state.attempt += 1;

            if (state.attempt >= MAX_RETRIES) {
                // All retries exhausted - notify user
                console.warn('[PlanRetry] All retries exhausted, notifying user');
                await schedulePlanRetryFailureNotification(state.language);
                await clearRetryState();
            } else {
                // Schedule next retry
                state.nextRetryTime = Date.now() + RETRY_DELAYS_MS[state.attempt];
                await saveRetryState(state);
                scheduleNextRetry(state);
            }
        }
    } catch (error) {
        console.error('[PlanRetry] Error processing retry:', error);
    } finally {
        isProcessing = false;
    }
};

/**
 * Initialize retry service - check for pending retries on app start
 */
export const initPlanRetryService = async (): Promise<void> => {
    const state = await getRetryState();

    if (state.queued) {
        const now = Date.now();
        const todayKey = getLocalDateKey(new Date());

        // Check for stale retries (older than 24 hours)
        if (now - state.nextRetryTime > MAX_RETRY_AGE_MS) {
            console.log('[PlanRetry] Clearing stale retry (>24h old)');
            await clearRetryState();
            return;
        }

        if (state.dateKey !== todayKey) {
            // Retry was for a different day - clear it
            console.log('[PlanRetry] Clearing stale retry from previous day');
            await clearRetryState();
            return;
        }

        // Resume pending retry
        if (state.nextRetryTime <= now) {
            // Retry time passed while app was closed - process now
            console.log('[PlanRetry] Processing overdue retry');
            processRetry();
        } else {
            // Schedule for the remaining time
            console.log('[PlanRetry] Resuming pending retry');
            scheduleNextRetry(state);
        }
    }
};

/**
 * Cancel any pending retries
 */
export const cancelPlanRetries = async (): Promise<void> => {
    console.log('[PlanRetry] Cancelling all pending retries');
    await clearRetryState();
};

/**
 * Get current retry status
 */
export const getRetryStatus = async (): Promise<{
    pending: boolean;
    attempt: number;
    maxRetries: number;
    nextRetryIn: number;
}> => {
    const state = await getRetryState();

    return {
        pending: state.queued,
        attempt: state.attempt,
        maxRetries: MAX_RETRIES,
        nextRetryIn: state.queued ? Math.max(0, state.nextRetryTime - Date.now()) : 0,
    };
};

/**
 * Check if a retry is currently pending
 */
export const hasRetryPending = async (): Promise<boolean> => {
    const state = await getRetryState();
    return state.queued;
};
