// Comprehensive History Service
// Captures ALL user data categories and creates rolling summaries for LLM context
// Categories: Food, Mood, Weight, Activity, Sleep, Plan Adherence

import storage from './storageService';
import {
    FoodLogEntry, MoodLog, WeightLogEntry, ActivityLogEntry,
    DailyPlan, SleepSession
} from '../types';
import { getLocalDateKey } from '../utils/dateUtils';

// Storage keys for history
const HISTORY_KEYS = {
    COMPREHENSIVE_SUMMARY: 'comprehensive_history_summary',
    LAST_SUMMARY_DATE: 'last_summary_date',
    ACTIVITY_HISTORY: 'activity_history_archive',
    SLEEP_HISTORY: 'sleep_history_archive',
    PLAN_ADHERENCE_HISTORY: 'plan_adherence_archive',
    WEIGHT_TREND: 'weight_trend_archive',
};

// ============ DATA COLLECTION INTERFACES ============

export interface DailySnapshot {
    date: string;

    // Food
    totalCalories: number;
    totalProtein: number;
    mealsLogged: number;
    foodNames: string[];

    // Mood
    dominantMood: string | null;
    averageMoodScore: number | null;

    // Weight
    weight: number | null;
    weightChange: number | null; // vs previous day

    // Activity
    totalActivityMinutes: number;
    totalCaloriesBurned: number;
    activitiesLogged: string[];

    // Sleep
    hoursSlept: number | null;
    sleepEfficiency: number | null;

    // Plan Adherence
    totalPlanItems: number;
    completedItems: number;
    skippedItems: number;
    adherenceRate: number; // 0-100
}

export interface ComprehensiveSummary {
    // Meta
    lastUpdated: number;
    daysTracked: number;

    // Rolling Text Summary
    narrativeSummary: string;

    // Structured Insights
    weightTrend: {
        direction: 'losing' | 'gaining' | 'stable' | 'unknown';
        weeklyAvgChange: number; // kg per week
        currentWeight: number | null;
        startWeight: number | null;
        lowestWeight: number | null;
        highestWeight: number | null;
    };

    adherencePatterns: {
        overallRate: number; // 0-100
        weekdayRate: number;
        weekendRate: number;
        commonSkipTimes: string[]; // e.g., ["evening workout", "morning hydration"]
        strongestCategory: string | null; // e.g., "meals"
        weakestCategory: string | null; // e.g., "workouts"
    };

    activityPatterns: {
        weeklyAvgMinutes: number;
        preferredActivities: string[];
        averageIntensity: 'low' | 'moderate' | 'high' | 'unknown';
    };

    sleepPatterns: {
        averageHours: number;
        consistency: 'consistent' | 'variable' | 'unknown';
        bestDays: string[]; // e.g., ["Sunday", "Monday"]
        worstDays: string[];
    };

    moodPatterns: {
        dominantMood: string | null;
        moodFoodCorrelation: string | null; // e.g., "better mood after high-protein meals"
        moodSleepCorrelation: string | null;
    };

    foodPatterns: {
        averageDailyCalories: number;
        frequentFoods: string[];
        mealTimingPattern: string | null; // e.g., "tends to eat late dinners"
    };
}

// ============ SNAPSHOT CREATION ============

/**
 * Create a daily snapshot from all available data
 */
export const createDailySnapshot = async (date: string): Promise<DailySnapshot> => {
    const planKey = `${storage.keys.DAILY_PLAN}_${date}`;

    // Get plan
    const plan = await storage.get<DailyPlan>(planKey);

    // Get food logs
    const allFoodLogs = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
    const dayFoodLogs = allFoodLogs.filter(f =>
        getLocalDateKey(new Date(f.timestamp)) === date
    );

    // Get mood logs
    const allMoodLogs = await storage.get<MoodLog[]>(storage.keys.MOOD) || [];
    const dayMoodLogs = allMoodLogs.filter(m =>
        getLocalDateKey(new Date(m.timestamp)) === date
    );

    // Get weight logs
    const allWeightLogs = await storage.get<WeightLogEntry[]>(storage.keys.WEIGHT) || [];
    const dayWeightLogs = allWeightLogs.filter(w =>
        getLocalDateKey(new Date(w.timestamp)) === date
    );
    const prevDayWeightLogs = allWeightLogs
        .filter(w => getLocalDateKey(new Date(w.timestamp)) < date)
        .sort((a, b) => b.timestamp - a.timestamp);

    // Get activity logs
    const allActivityLogs = await storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY) || [];
    const dayActivityLogs = allActivityLogs.filter(a =>
        getLocalDateKey(new Date(a.timestamp)) === date
    );

    // Get sleep sessions
    const allSleepSessions = await storage.get<SleepSession[]>(storage.keys.SLEEP_HISTORY) || [];
    const daySleep = allSleepSessions.find(s =>
        getLocalDateKey(new Date(s.endTime)) === date
    );

    // Calculate food totals
    const totalCalories = dayFoodLogs.reduce((sum, f) => sum + f.food.macros.calories, 0);
    const totalProtein = dayFoodLogs.reduce((sum, f) => sum + f.food.macros.protein, 0);

    // Calculate mood
    const avgMoodScore = dayMoodLogs.length > 0
        ? dayMoodLogs.reduce((sum, m) => sum + m.score, 0) / dayMoodLogs.length
        : null;
    const lastMood = dayMoodLogs.sort((a, b) => b.timestamp - a.timestamp)[0];

    // Calculate weight
    const latestWeight = dayWeightLogs.sort((a, b) => b.timestamp - a.timestamp)[0];
    const prevWeight = prevDayWeightLogs[0];
    const weightChange = latestWeight && prevWeight
        ? latestWeight.weight - prevWeight.weight
        : null;

    // Calculate activity
    const totalActivityMinutes = dayActivityLogs.reduce((sum, a) => sum + a.durationMinutes, 0);
    const totalCaloriesBurned = dayActivityLogs.reduce((sum, a) => sum + (a.caloriesBurned || 0), 0);

    // Calculate plan adherence
    const totalPlanItems = plan?.items?.length || 0;
    const completedItems = plan?.items?.filter(i => i.completed).length || 0;
    const skippedItems = plan?.items?.filter(i => i.skipped).length || 0;
    const adherenceRate = totalPlanItems > 0
        ? Math.round((completedItems / totalPlanItems) * 100)
        : 0;

    return {
        date,

        // Food
        totalCalories: Math.round(totalCalories),
        totalProtein: Math.round(totalProtein),
        mealsLogged: dayFoodLogs.length,
        foodNames: dayFoodLogs.map(f => f.food.foodName).slice(0, 10),

        // Mood
        dominantMood: lastMood?.mood || null,
        averageMoodScore: avgMoodScore ? Math.round(avgMoodScore) : null,

        // Weight
        weight: latestWeight?.weight || null,
        weightChange: weightChange ? Math.round(weightChange * 10) / 10 : null,

        // Activity
        totalActivityMinutes,
        totalCaloriesBurned: Math.round(totalCaloriesBurned),
        activitiesLogged: dayActivityLogs.map(a => a.name).slice(0, 5),

        // Sleep
        hoursSlept: daySleep ? Math.round(daySleep.durationMinutes / 60 * 10) / 10 : null,
        sleepEfficiency: daySleep?.efficiencyScore || null,

        // Plan Adherence
        totalPlanItems,
        completedItems,
        skippedItems,
        adherenceRate,
    };
};

// ============ ARCHIVE MANAGEMENT ============

/**
 * Archive a daily snapshot for long-term storage
 */
export const archiveDailySnapshot = async (snapshot: DailySnapshot): Promise<void> => {
    // Get existing archive (last 90 days max)
    const archiveKey = 'daily_snapshots_archive';
    const archive = await storage.get<DailySnapshot[]>(archiveKey) || [];

    // Remove if already exists
    const filtered = archive.filter(s => s.date !== snapshot.date);

    // Add new snapshot
    filtered.push(snapshot);

    // Keep only last 90 days
    const sorted = filtered.sort((a, b) => b.date.localeCompare(a.date));
    const trimmed = sorted.slice(0, 90);

    await storage.set(archiveKey, trimmed);
};

/**
 * Get archived snapshots
 */
export const getArchivedSnapshots = async (days: number = 30): Promise<DailySnapshot[]> => {
    const archiveKey = 'daily_snapshots_archive';
    const archive = await storage.get<DailySnapshot[]>(archiveKey) || [];
    return archive.slice(0, days);
};

// ============ COMPREHENSIVE SUMMARY GENERATION ============

/**
 * Generate comprehensive summary from archived snapshots
 */
export const generateComprehensiveSummary = async (): Promise<ComprehensiveSummary> => {
    const snapshots = await getArchivedSnapshots(30);

    if (snapshots.length === 0) {
        return getEmptySummary();
    }

    // Weight analysis
    const weightsWithData = snapshots.filter(s => s.weight !== null);
    const weights = weightsWithData.map(s => s.weight as number);
    const currentWeight = weights[0] || null;
    const startWeight = weights[weights.length - 1] || null;
    const lowestWeight = weights.length > 0 ? Math.min(...weights) : null;
    const highestWeight = weights.length > 0 ? Math.max(...weights) : null;

    let weightDirection: 'losing' | 'gaining' | 'stable' | 'unknown' = 'unknown';
    let weeklyAvgChange = 0;
    if (startWeight && currentWeight) {
        const totalChange = currentWeight - startWeight;
        const weeks = snapshots.length / 7;
        weeklyAvgChange = weeks > 0 ? totalChange / weeks : 0;
        if (Math.abs(weeklyAvgChange) < 0.2) weightDirection = 'stable';
        else if (weeklyAvgChange < 0) weightDirection = 'losing';
        else weightDirection = 'gaining';
    }

    // Adherence analysis
    const adherenceRates = snapshots.filter(s => s.totalPlanItems > 0).map(s => s.adherenceRate);
    const overallRate = adherenceRates.length > 0
        ? Math.round(adherenceRates.reduce((a, b) => a + b, 0) / adherenceRates.length)
        : 0;

    // Weekend vs weekday
    const weekdaySnapshots = snapshots.filter(s => {
        const day = new Date(s.date).getDay();
        return day > 0 && day < 6;
    });
    const weekendSnapshots = snapshots.filter(s => {
        const day = new Date(s.date).getDay();
        return day === 0 || day === 6;
    });

    const weekdayRates = weekdaySnapshots.filter(s => s.totalPlanItems > 0).map(s => s.adherenceRate);
    const weekendRates = weekendSnapshots.filter(s => s.totalPlanItems > 0).map(s => s.adherenceRate);
    const weekdayRate = weekdayRates.length > 0
        ? Math.round(weekdayRates.reduce((a, b) => a + b, 0) / weekdayRates.length) : 0;
    const weekendRate = weekendRates.length > 0
        ? Math.round(weekendRates.reduce((a, b) => a + b, 0) / weekendRates.length) : 0;

    // Activity analysis
    const activityMinutes = snapshots.map(s => s.totalActivityMinutes).filter(m => m > 0);
    const weeklyAvgMinutes = activityMinutes.length > 0
        ? Math.round(activityMinutes.reduce((a, b) => a + b, 0) / (snapshots.length / 7))
        : 0;
    const allActivities = snapshots.flatMap(s => s.activitiesLogged);
    const activityCounts: Record<string, number> = {};
    allActivities.forEach(a => { activityCounts[a] = (activityCounts[a] || 0) + 1; });
    const preferredActivities = Object.entries(activityCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

    // Sleep analysis
    const sleepHours = snapshots.map(s => s.hoursSlept).filter(h => h !== null) as number[];
    const averageHours = sleepHours.length > 0
        ? Math.round(sleepHours.reduce((a, b) => a + b, 0) / sleepHours.length * 10) / 10
        : 0;
    const sleepVariance = sleepHours.length > 1
        ? Math.sqrt(sleepHours.reduce((sum, h) => sum + Math.pow(h - averageHours, 2), 0) / sleepHours.length)
        : 0;
    const sleepConsistency = sleepVariance < 1 ? 'consistent' : sleepVariance < 2 ? 'variable' : 'unknown';

    // Mood analysis
    const moods = snapshots.filter(s => s.dominantMood).map(s => s.dominantMood as string);
    const moodCounts: Record<string, number> = {};
    moods.forEach(m => { moodCounts[m] = (moodCounts[m] || 0) + 1; });
    const dominantMood = Object.entries(moodCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Food analysis
    const calorieData = snapshots.filter(s => s.totalCalories > 0).map(s => s.totalCalories);
    const averageDailyCalories = calorieData.length > 0
        ? Math.round(calorieData.reduce((a, b) => a + b, 0) / calorieData.length)
        : 0;
    const allFoods = snapshots.flatMap(s => s.foodNames);
    const foodCounts: Record<string, number> = {};
    allFoods.forEach(f => { foodCounts[f] = (foodCounts[f] || 0) + 1; });
    const frequentFoods = Object.entries(foodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);

    // Generate narrative summary
    const narrativeSummary = generateNarrativeSummary({
        daysTracked: snapshots.length,
        weightDirection,
        weeklyAvgChange,
        overallRate,
        weekdayRate,
        weekendRate,
        averageHours,
        dominantMood,
        averageDailyCalories,
        frequentFoods,
        preferredActivities,
    });

    return {
        lastUpdated: Date.now(),
        daysTracked: snapshots.length,
        narrativeSummary,

        weightTrend: {
            direction: weightDirection,
            weeklyAvgChange: Math.round(weeklyAvgChange * 100) / 100,
            currentWeight,
            startWeight,
            lowestWeight,
            highestWeight,
        },

        adherencePatterns: {
            overallRate,
            weekdayRate,
            weekendRate,
            commonSkipTimes: [], // Would need more detailed tracking
            strongestCategory: null,
            weakestCategory: null,
        },

        activityPatterns: {
            weeklyAvgMinutes,
            preferredActivities,
            averageIntensity: 'moderate',
        },

        sleepPatterns: {
            averageHours,
            consistency: sleepConsistency,
            bestDays: [],
            worstDays: [],
        },

        moodPatterns: {
            dominantMood,
            moodFoodCorrelation: null,
            moodSleepCorrelation: null,
        },

        foodPatterns: {
            averageDailyCalories,
            frequentFoods,
            mealTimingPattern: null,
        },
    };
};

/**
 * Generate narrative summary for LLM
 */
const generateNarrativeSummary = (data: {
    daysTracked: number;
    weightDirection: string;
    weeklyAvgChange: number;
    overallRate: number;
    weekdayRate: number;
    weekendRate: number;
    averageHours: number;
    dominantMood: string | null;
    averageDailyCalories: number;
    frequentFoods: string[];
    preferredActivities: string[];
}): string => {
    const parts: string[] = [];

    parts.push(`Tracking ${data.daysTracked} days.`);

    // Weight
    if (data.weightDirection !== 'unknown') {
        const changeText = data.weeklyAvgChange > 0 ? `+${data.weeklyAvgChange.toFixed(1)}` : data.weeklyAvgChange.toFixed(1);
        parts.push(`Weight ${data.weightDirection} (${changeText}kg/week avg).`);
    }

    // Adherence
    if (data.overallRate > 0) {
        let adherenceDesc = data.overallRate >= 80 ? 'excellent' : data.overallRate >= 60 ? 'good' : data.overallRate >= 40 ? 'moderate' : 'needs improvement';
        parts.push(`Plan adherence ${adherenceDesc} (${data.overallRate}% overall).`);
        if (Math.abs(data.weekdayRate - data.weekendRate) > 15) {
            parts.push(data.weekdayRate > data.weekendRate
                ? `Better on weekdays (${data.weekdayRate}%) than weekends (${data.weekendRate}%).`
                : `Better on weekends (${data.weekendRate}%) than weekdays (${data.weekdayRate}%).`);
        }
    }

    // Sleep
    if (data.averageHours > 0) {
        const sleepDesc = data.averageHours >= 7 ? 'adequate' : data.averageHours >= 6 ? 'slightly low' : 'insufficient';
        parts.push(`Sleep ${sleepDesc} (${data.averageHours}h avg).`);
    }

    // Mood
    if (data.dominantMood) {
        parts.push(`Dominant mood: ${data.dominantMood}.`);
    }

    // Food
    if (data.averageDailyCalories > 0) {
        parts.push(`Avg ${data.averageDailyCalories} kcal/day.`);
    }
    if (data.frequentFoods.length > 0) {
        parts.push(`Common foods: ${data.frequentFoods.slice(0, 3).join(', ')}.`);
    }

    // Activity
    if (data.preferredActivities.length > 0) {
        parts.push(`Preferred activities: ${data.preferredActivities.join(', ')}.`);
    }

    return parts.join(' ');
};

/**
 * Get empty summary structure
 */
const getEmptySummary = (): ComprehensiveSummary => ({
    lastUpdated: Date.now(),
    daysTracked: 0,
    narrativeSummary: "No historical data available yet. Start tracking to build your health profile.",
    weightTrend: { direction: 'unknown', weeklyAvgChange: 0, currentWeight: null, startWeight: null, lowestWeight: null, highestWeight: null },
    adherencePatterns: { overallRate: 0, weekdayRate: 0, weekendRate: 0, commonSkipTimes: [], strongestCategory: null, weakestCategory: null },
    activityPatterns: { weeklyAvgMinutes: 0, preferredActivities: [], averageIntensity: 'unknown' },
    sleepPatterns: { averageHours: 0, consistency: 'unknown', bestDays: [], worstDays: [] },
    moodPatterns: { dominantMood: null, moodFoodCorrelation: null, moodSleepCorrelation: null },
    foodPatterns: { averageDailyCalories: 0, frequentFoods: [], mealTimingPattern: null },
});

// ============ DAILY ARCHIVAL TRIGGER ============

/**
 * Archive yesterday's data (call this daily)
 */
export const archiveYesterdaysData = async (): Promise<void> => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getLocalDateKey(yesterday);

    // Check if already archived
    const lastArchiveDate = await storage.get<string>(HISTORY_KEYS.LAST_SUMMARY_DATE);
    if (lastArchiveDate === yesterdayKey) {
        console.log('[HistoryService] Yesterday already archived');
        return;
    }

    try {
        // Create and archive snapshot
        const snapshot = await createDailySnapshot(yesterdayKey);
        await archiveDailySnapshot(snapshot);

        // Update comprehensive summary
        const summary = await generateComprehensiveSummary();
        await storage.set(HISTORY_KEYS.COMPREHENSIVE_SUMMARY, summary);

        // Mark as done
        await storage.set(HISTORY_KEYS.LAST_SUMMARY_DATE, yesterdayKey);

        console.log(`[HistoryService] Archived ${yesterdayKey}:`, {
            calories: snapshot.totalCalories,
            adherence: snapshot.adherenceRate,
            sleep: snapshot.hoursSlept,
        });
    } catch (error) {
        console.error('[HistoryService] Failed to archive:', error);
    }
};

/**
 * Get stored comprehensive summary
 */
export const getComprehensiveSummary = async (): Promise<ComprehensiveSummary> => {
    const stored = await storage.get<ComprehensiveSummary>(HISTORY_KEYS.COMPREHENSIVE_SUMMARY);
    return stored || getEmptySummary();
};

/**
 * Get narrative summary for LLM context
 */
export const getHistorySummaryForLLM = async (): Promise<string> => {
    const summary = await getComprehensiveSummary();

    if (summary.daysTracked === 0) {
        return "No historical data available. This is likely a new user.";
    }

    // Build comprehensive LLM context
    const parts: string[] = [summary.narrativeSummary];

    // Add weight details if available
    if (summary.weightTrend.currentWeight) {
        parts.push(`Current weight: ${summary.weightTrend.currentWeight}kg.`);
        if (summary.weightTrend.lowestWeight && summary.weightTrend.highestWeight) {
            parts.push(`Range: ${summary.weightTrend.lowestWeight}-${summary.weightTrend.highestWeight}kg.`);
        }
    }

    return parts.join(' ');
};

export default {
    createDailySnapshot,
    archiveDailySnapshot,
    getArchivedSnapshots,
    generateComprehensiveSummary,
    getComprehensiveSummary,
    archiveYesterdaysData,
    getHistorySummaryForLLM,
};
