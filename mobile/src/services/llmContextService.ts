import storage, { getWaterAmountForDate } from './storageService';
import sleepHoursService from './sleepHoursService';
import { getActiveDayKey } from './dayBoundaryService';
import type {
    ActivityLogEntry,
    AppContext,
    BioSnapshot,
    BioTrend,
    DailyPlan,
    FoodLogEntry,
    MoodLog,
    UserProfile,
    WeightLogEntry,
    BodyProgressSummary,
} from '../types';
import { getWeatherSnapshot, WEATHER_SNAPSHOT_TTL_MS } from './weatherService';
import { getHealthContextData, getBioContextForAppContext } from './healthContextService';
import { buildContextSummary, getHistorySummary as getContextHistorySummary, getRecentTransitions } from './contextHistoryService';

export type LLMContextSnapshot = {
    createdAt: number;
    activeDayKey: string;
    userProfile?: UserProfile;
    foodHistory: FoodLogEntry[];
    activityHistory: ActivityLogEntry[];
    moodHistory: MoodLog[];
    weightHistory: WeightLogEntry[];
    waterLog: { date: string; amount: number };
    sleepHistory: { date: string; hours: number }[];
    appContext: AppContext;
    currentPlan: DailyPlan | null;
    historySummary?: string;
    healthData?: {
        steps: number;
        distance: number;
        calories: number;
        sleepMinutes?: number;
        sleepQuality?: string;
        latestWeight?: number;
        heartRateBpm?: number;
    };
    bioSnapshot?: BioSnapshot;
    bioTrends?: BioTrend[];
};

const CACHE_TTL_MS = 30_000;
let cachedSnapshot: LLMContextSnapshot | null = null;
let cachedAt = 0;
let inFlight: Promise<LLMContextSnapshot> | null = null;

const normalizePlanForKey = (plan: DailyPlan | null, key: string): DailyPlan | null => {
    if (!plan) return null;
    if (!plan.date || plan.date === key) return plan;
    return null;
};

export const buildLLMContextSnapshot = async (options: { force?: boolean } = {}): Promise<LLMContextSnapshot> => {
    const now = Date.now();
    if (!options.force && cachedSnapshot && now - cachedAt < CACHE_TTL_MS) {
        return cachedSnapshot;
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
        const activeDayKey = await getActiveDayKey();
        const planStorageKey = `${storage.keys.DAILY_PLAN}_${activeDayKey}`;

        const [
            foodHistory,
            activityHistory,
            moodHistory,
            weightHistory,
            waterAmount,
            sleepHistory,
            datedPlan,
            legacyPlan,
            historySummary,
            lastContextSnapshot,
            userProfile,
            bodyProgressSummary,
            contextHistorySummary,
            contextTransitions,
        ] = await Promise.all([
            storage.get<FoodLogEntry[]>(storage.keys.FOOD),
            storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY),
            storage.get<MoodLog[]>(storage.keys.MOOD),
            storage.get<WeightLogEntry[]>(storage.keys.WEIGHT),
            getWaterAmountForDate(activeDayKey),
            sleepHoursService.getHistory(),
            storage.get<DailyPlan>(planStorageKey),
            storage.get<DailyPlan>(storage.keys.DAILY_PLAN),
            storage.get<string>('history_summary'),
            storage.get<any>(storage.keys.LAST_CONTEXT_SNAPSHOT),
            storage.get<UserProfile>(storage.keys.USER),
            storage.get<BodyProgressSummary>(storage.keys.BODY_PROGRESS_SUMMARY),
            getContextHistorySummary(),
            getRecentTransitions(5),
        ]);

        const currentPlan =
            normalizePlanForKey(datedPlan || null, activeDayKey) ||
            normalizePlanForKey(legacyPlan || null, activeDayKey) ||
            null;

        let locationServiceRef: any = null;
        const locationContextDetail = await (async () => {
            try {
                const { default: locationService } = await import('./locationService');
                locationServiceRef = locationService;
                return await locationService.buildContextForLLM();
            } catch (error) {
                console.warn('[LLMContext] Failed to build location context:', error);
                return undefined;
            }
        })();

        const nutritionContext = await (async () => {
            if (!userProfile) return undefined;
            try {
                const { nutritionService } = await import('./nutritionService');
                return await nutritionService.buildContextForLLM(foodHistory || [], userProfile);
            } catch (error) {
                console.warn('[LLMContext] Failed to build nutrition context:', error);
                return undefined;
            }
        })();

        const carriedOverContext = await (async () => {
            try {
                const { planRefinementService } = await import('./planRefinementService');
                return await planRefinementService.buildFullContextForLLM();
            } catch (error) {
                console.warn('[LLMContext] Failed to build carried-over context:', error);
                return undefined;
            }
        })();

        const mergedLocationContext = [lastContextSnapshot?.locationContext, locationContextDetail]
            .filter(Boolean)
            .join('\n') || undefined;

        let weatherSnapshot = null;
        try {
            const coords = locationServiceRef ? await locationServiceRef.getLastKnownLocation() : null;
            weatherSnapshot = await getWeatherSnapshot({
                coords: coords || undefined,
                maxAgeMs: WEATHER_SNAPSHOT_TTL_MS,
            });
        } catch (error) {
            console.warn('[LLMContext] Failed to load weather snapshot:', error);
        }

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

        const appContext: AppContext = {
            weather: weatherSnapshot?.weather || { temp: 20, condition: 'Unknown', code: 0 },
            currentLocation: lastContextSnapshot?.locationLabel || weatherSnapshot?.locationName || 'Unknown',
            userContextState: lastContextSnapshot?.state || 'unknown',
            locationContext: mergedLocationContext,
            nutritionContext,
            carriedOverContext,
            bodyProgressSummary: bodyProgressSummary?.summary,
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

        let healthData: LLMContextSnapshot['healthData'];
        let bioSnapshot: BioSnapshot | undefined;
        let bioTrends: BioTrend[] | undefined;
        try {
            const health = await getHealthContextData();
            if (health) {
                healthData = {
                    steps: health.steps,
                    distance: health.distance,
                    calories: health.calories,
                    sleepMinutes: health.sleepMinutes,
                    sleepQuality: health.sleepQuality,
                    latestWeight: health.latestWeight,
                    heartRateBpm: health.heartRateBpm,
                };
                appContext.healthData = health;
            }
            const bioContext = await getBioContextForAppContext();
            if (bioContext.bioSnapshot) {
                bioSnapshot = bioContext.bioSnapshot;
                appContext.bioSnapshot = bioSnapshot;
            }
            if (bioContext.bioTrends) {
                bioTrends = bioContext.bioTrends;
                appContext.bioTrends = bioTrends;
            }
            if (bioContext.bioHistorySummary) {
                appContext.bioHistorySummary = bioContext.bioHistorySummary;
            }
        } catch (error) {
            console.warn('[LLMContext] Failed to load health/bio context:', error);
        }

        const snapshot: LLMContextSnapshot = {
            createdAt: now,
            activeDayKey,
            userProfile: userProfile || undefined,
            foodHistory: foodHistory || [],
            activityHistory: activityHistory || [],
            moodHistory: moodHistory || [],
            weightHistory: weightHistory || [],
            waterLog: { date: activeDayKey, amount: waterAmount || 0 },
            sleepHistory: sleepHistory || [],
            appContext,
            currentPlan,
            historySummary: historySummary || undefined,
            healthData,
            bioSnapshot,
            bioTrends,
        };

        // Store a lightweight snapshot for debugging/offline use.
        try {
            await storage.set(storage.keys.LLM_CONTEXT_SNAPSHOT, {
                createdAt: snapshot.createdAt,
                activeDayKey: snapshot.activeDayKey,
                appContext: snapshot.appContext,
                hasHealth: !!snapshot.healthData,
                hasBio: !!snapshot.bioSnapshot,
            });
        } catch (error) {
            console.warn('[LLMContext] Failed to persist context snapshot:', error);
        }

        cachedSnapshot = snapshot;
        cachedAt = now;
        return snapshot;
    })();

    try {
        return await inFlight;
    } finally {
        inFlight = null;
    }
};

export const getCachedLLMContextSnapshot = (): LLMContextSnapshot | null => cachedSnapshot;
export const invalidateLLMContextCache = (): void => {
    cachedSnapshot = null;
    cachedAt = 0;
    inFlight = null;
};

export default {
    buildLLMContextSnapshot,
    getCachedLLMContextSnapshot,
    invalidateLLMContextCache,
};
