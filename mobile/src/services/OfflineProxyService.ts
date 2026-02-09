import { DailyPlan, UserProfile, FoodLogEntry, ActivityLogEntry, MoodLog, WeightLogEntry, Language, AppContext } from '../types';
import { checkNetworkConnection } from './offlineService';
import { llmQueueService } from './llmQueueService';
import { getLocalDateKey } from '../utils/dateUtils';
import { getActiveDayKey } from './dayBoundaryService';
import i18n from '../i18n';

type History = {
    food: FoodLogEntry[];
    activity: ActivityLogEntry[];
    mood: MoodLog[];
    weight: WeightLogEntry[];
    water: { date: string; amount: number };
    sleep: { date: string; hours: number }[];
};

type AppCtx = AppContext;

export type PlanResult = {
    immediate: DailyPlan;
    upgraded?: DailyPlan;
    retryQueued?: boolean;
};

export type PlanErrorCode = 'OFFLINE' | 'LOW_ENERGY' | 'RATE_LIMITED' | 'LLM_ERROR';

export class PlanGenerationError extends Error {
    constructor(
        public code: PlanErrorCode,
        message: string,
        public retryAfterMs?: number
    ) {
        super(message);
        this.name = 'PlanGenerationError';
    }
}

type PlanHybridOptions = {
    /**
     * When false, disallow cloud generation and return an error.
     */
    allowCloud?: boolean;
};

export const OfflineProxyService = {
    /**
     * Cloud-only plan generation via queue (no offline/local fallback).
     */
    async getPlanHybrid(
        profile: UserProfile,
        history: History,
        appContext: AppCtx,
        language: Language,
        currentPlan: DailyPlan | null,
        historySummary?: string,
        options?: PlanHybridOptions
    ): Promise<PlanResult> {
        const activeDayKey = await getActiveDayKey();
        const dateKey = currentPlan?.date || activeDayKey || getLocalDateKey(new Date());

        const allowCloud = options?.allowCloud ?? true;
        if (!allowCloud) {
            console.log('[OfflineProxyService] Cloud generation disabled - returning error');
            throw new PlanGenerationError('LOW_ENERGY', i18n.t('errors.plan.low_energy'));
        }

        const isOnline = await checkNetworkConnection();
        if (!isOnline) {
            console.log('[OfflineProxyService] Offline - cannot generate plan');
            throw new PlanGenerationError('OFFLINE', i18n.t('errors.plan.offline'));
        }

        if (llmQueueService.isRateLimited()) {
            const waitMs = llmQueueService.getRateLimitRemainingMs();
            console.log(`[OfflineProxyService] Rate limited for ${Math.round(waitMs / 1000)}s - returning error`);
            throw new PlanGenerationError(
                'RATE_LIMITED',
                i18n.t('errors.plan.rate_limited', { seconds: Math.round(waitMs / 1000) }),
                waitMs
            );
        }

        try {
            const cloud = await llmQueueService.addJobAndWait<DailyPlan>('GENERATE_PLAN', {
                dateKey,
                userProfile: profile,
                foodHistory: history.food,
                activityHistory: history.activity,
                moodHistory: history.mood,
                weightHistory: history.weight,
                waterLog: history.water,
                sleepHistory: history.sleep,
                appContext,
                language,
                currentPlan,
                historySummary
            }, 'critical');

            return { immediate: { ...cloud, source: 'cloud' } as DailyPlan };
        } catch (error) {
            console.warn('[OfflineProxyService] Cloud plan via queue failed:', error);
            throw new PlanGenerationError('LLM_ERROR', i18n.t('errors.plan.generation_failed'));
        }
    }
};
