import storage from './storageService';
import { PlanItem } from '../types';

type ActionType = 'complete' | 'skip' | 'snooze';

type StatBucket = {
    completed: number;
    skipped: number;
    snoozed: number;
    total: number;
};

type AdaptiveStats = {
    updatedAt: number;
    resetAt: number;
    typeStats: Record<string, StatBucket>;
    hourStats: Record<string, StatBucket>;
};

type OverlayPolicy = {
    suppressedTypes: string[];
    suppressedHours: number[];
    preferredHours: number[];
};

type RuleConfig = {
    hydrationFrequencyHours?: number;
    minMealsPerDay?: number;
    maxMealsPerDay?: number;
};

const EMPTY_STATS: AdaptiveStats = {
    updatedAt: 0,
    resetAt: 0,
    typeStats: {},
    hourStats: {},
};

const RESET_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_SAMPLE_COUNT = 6;

const normalizeType = (type?: string | null): string => {
    const raw = (type || '').toLowerCase();
    if (raw.includes('meal')) return 'meal';
    if (raw.includes('hydration') || raw.includes('water')) return 'hydration';
    if (raw.includes('workout') || raw.includes('activity') || raw.includes('work_break')) return 'activity';
    if (raw.includes('sleep') || raw.includes('wakeup')) return 'sleep';
    return raw || 'other';
};

const ensureBucket = (map: Record<string, StatBucket>, key: string): StatBucket => {
    if (!map[key]) {
        map[key] = { completed: 0, skipped: 0, snoozed: 0, total: 0 };
    }
    return map[key];
};

const applyAction = (bucket: StatBucket, action: ActionType): void => {
    bucket.total += 1;
    if (action === 'complete') bucket.completed += 1;
    if (action === 'skip') bucket.skipped += 1;
    if (action === 'snooze') bucket.snoozed += 1;
};

const calcRates = (bucket: StatBucket): { completion: number; skip: number; snooze: number } => {
    if (!bucket.total) {
        return { completion: 0, skip: 0, snooze: 0 };
    }
    return {
        completion: bucket.completed / bucket.total,
        skip: bucket.skipped / bucket.total,
        snooze: bucket.snoozed / bucket.total,
    };
};

const parseHour = (timestamp: number): number => {
    const date = new Date(timestamp);
    return date.getHours();
};

const parseItemTimeToHour = (time?: string | null): number | null => {
    if (!time) return null;
    const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    if (Number.isNaN(hour) || hour < 0 || hour > 23) return null;
    return hour;
};

const buildSummary = (policy: OverlayPolicy, typeStats: Record<string, StatBucket>): string => {
    const parts: string[] = [];

    if (policy.preferredHours.length > 0) {
        const hours = policy.preferredHours.map(h => `${String(h).padStart(2, '0')}:00`).join(', ');
        parts.push(`Best completion hours: ${hours}.`);
    }

    if (policy.suppressedHours.length > 0) {
        const hours = policy.suppressedHours.map(h => `${String(h).padStart(2, '0')}:00`).join(', ');
        parts.push(`Often ignored hours: ${hours}.`);
    }

    if (policy.suppressedTypes.length > 0) {
        parts.push(`Frequently skipped types: ${policy.suppressedTypes.join(', ')}.`);
    }

    const strongTypes = Object.entries(typeStats)
        .filter(([_, stats]) => stats.total >= MIN_SAMPLE_COUNT)
        .filter(([_, stats]) => calcRates(stats).completion >= 0.7)
        .map(([type]) => type);

    if (strongTypes.length > 0) {
        parts.push(`High adherence types: ${strongTypes.join(', ')}.`);
    }

    return parts.join(' ');
};

const computeOverlayPolicy = (stats: AdaptiveStats): OverlayPolicy => {
    const suppressedTypes: string[] = [];
    const suppressedHours: number[] = [];
    const preferredHours: number[] = [];

    for (const [type, bucket] of Object.entries(stats.typeStats)) {
        if (bucket.total < MIN_SAMPLE_COUNT) continue;
        const rates = calcRates(bucket);
        if (rates.skip >= 0.6 || rates.snooze >= 0.6) {
            if (type !== 'sleep') suppressedTypes.push(type);
        }
    }

    for (const [hourStr, bucket] of Object.entries(stats.hourStats)) {
        if (bucket.total < 3) continue;
        const hour = Number(hourStr);
        if (!Number.isFinite(hour)) continue;
        const rates = calcRates(bucket);
        if (rates.skip >= 0.7) suppressedHours.push(hour);
        if (rates.completion >= 0.7) preferredHours.push(hour);
    }

    return { suppressedTypes, suppressedHours, preferredHours };
};

const computeRuleConfig = (stats: AdaptiveStats): RuleConfig => {
    const hydration = stats.typeStats['hydration'];
    const meals = stats.typeStats['meal'];

    const config: RuleConfig = {};

    if (hydration && hydration.total >= MIN_SAMPLE_COUNT) {
        const rates = calcRates(hydration);
        if (rates.skip >= 0.6) config.hydrationFrequencyHours = 3;
        if (rates.completion >= 0.7) config.hydrationFrequencyHours = 2;
    }

    if (meals && meals.total >= MIN_SAMPLE_COUNT) {
        const rates = calcRates(meals);
        if (rates.skip >= 0.6) {
            config.minMealsPerDay = 2;
            config.maxMealsPerDay = 3;
        }
    }

    return config;
};

const createDefaultStats = (): AdaptiveStats => ({
    ...EMPTY_STATS,
    resetAt: Date.now(),
});

const loadStats = async (): Promise<AdaptiveStats> => {
    const existing = await storage.get<AdaptiveStats>(storage.keys.USER_ADAPTIVE_STATS);
    if (!existing) return createDefaultStats();

    const now = Date.now();
    const resetAt = typeof existing.resetAt === 'number' && existing.resetAt > 0 ? existing.resetAt : now;
    if (now - resetAt > RESET_WINDOW_MS) {
        const fresh = createDefaultStats();
        await saveStats(fresh);
        return fresh;
    }

    return {
        ...EMPTY_STATS,
        ...existing,
        resetAt,
        typeStats: existing.typeStats || {},
        hourStats: existing.hourStats || {},
    };
};

const saveStats = async (stats: AdaptiveStats): Promise<void> => {
    await storage.set(storage.keys.USER_ADAPTIVE_STATS, stats);
};

export const userAdaptiveService = {
    async recordPlanItemAction(
        action: ActionType,
        item: Pick<PlanItem, 'type' | 'time'>,
        timestamp?: number
    ): Promise<void> {
        try {
            const stats = await loadStats();
            const now = typeof timestamp === 'number' ? timestamp : Date.now();
            const typeKey = normalizeType(item.type);

            const typeBucket = ensureBucket(stats.typeStats, typeKey);
            applyAction(typeBucket, action);

            const hour = parseItemTimeToHour(item.time) ?? parseHour(now);
            const hourBucket = ensureBucket(stats.hourStats, String(hour));
            applyAction(hourBucket, action);

            stats.updatedAt = now;
            await saveStats(stats);
        } catch (error) {
            console.warn('[UserAdaptive] Failed to record plan action:', error);
        }
    },

    async getOverlayPolicy(): Promise<OverlayPolicy> {
        const stats = await loadStats();
        return computeOverlayPolicy(stats);
    },

    async getRuleBasedConfig(): Promise<RuleConfig> {
        const stats = await loadStats();
        return computeRuleConfig(stats);
    },

    async getAdaptationSummary(): Promise<string> {
        const stats = await loadStats();
        const policy = computeOverlayPolicy(stats);
        return buildSummary(policy, stats.typeStats);
    },

    async resetAdaptation(): Promise<void> {
        try {
            const fresh = createDefaultStats();
            await saveStats(fresh);
        } catch (error) {
            console.warn('[UserAdaptive] Failed to reset adaptation:', error);
        }
    },
};

export default userAdaptiveService;
