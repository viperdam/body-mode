// Meal Replacement Service - Handles meal logging and plan replacement
// Provides thread-safe operations for logging meals and replacing plan items

import storage from './storageService';
import { DailyPlan, FoodAnalysisResult, FoodLogEntry, MacroNutrients } from '../types';
import { safeModifyPlanItem, cancelAllRemindersForItem } from './actionSyncService';
import { notifyFoodLogged } from './planEventService';
import { getLocalDateKey } from '../utils/dateUtils';
import i18n from '../i18n';

const getFoodSourceLabel = (source: string) => {
    const key = `food.log.source.${source}`;
    const translated = i18n.t(key);
    return translated === key ? source : translated;
};

const buildDescriptionWithSource = (description: string, source: string) =>
    i18n.t('food.log.description_with_source', {
        description,
        source: getFoodSourceLabel(source),
    });

const buildDescriptionWithMacros = (description: string, calories: number, protein: number) =>
    i18n.t('food.log.description_with_macros', {
        description,
        calories: Math.round(calories),
        protein: Math.round(protein),
    });

/**
 * Log a meal to food history only (does NOT modify the daily plan)
 * 
 * @param food - The analyzed food result
 * @param source - Where the food came from (e.g., 'camera', 'manual_alt', 'favorite')
 * @returns The created food log entry
 */
export const logMealOnly = async (
    food: FoodAnalysisResult,
    source: string
): Promise<FoodLogEntry> => {
    const baseDescription = food.description || food.foodName || '';
    const entry: FoodLogEntry = {
        id: `food-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        source,
        food: {
            ...food,
            description: buildDescriptionWithSource(baseDescription, source),
        },
    };

    try {
        const existingLogs = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
        await storage.set(storage.keys.FOOD, [...existingLogs, entry]);

        // Emit event for dashboard refresh
        await notifyFoodLogged(entry);

        console.log(`[MealReplacement] Logged meal only: ${food.foodName}`);
        return entry;
    } catch (error) {
        console.error('[MealReplacement] Failed to log meal:', error);
        throw error;
    }
};

/**
 * Replace a plan item with a new meal AND log it to food history
 * Uses mutex for thread-safe plan modification
 * 
 * @param food - The analyzed food result
 * @param planItemId - The ID of the plan item to replace
 * @param planDateKey - The date key of the plan (YYYY-MM-DD)
 * @param source - Where the food came from
 * @returns Object with both the food log entry and success status
 */
export const replaceAndLogMeal = async (
    food: FoodAnalysisResult,
    planItemId: string,
    planDateKey: string,
    source: string
): Promise<{ entry: FoodLogEntry; planUpdated: boolean }> => {
    // First, log the meal
    const entry = await logMealOnly(food, source);

    // Cancel any pending reminders for this plan item
    await cancelAllRemindersForItem(planItemId);

    // Update the plan item with the new meal
    const planUpdated = await safeModifyPlanItem(
        planDateKey,
        planItemId,
        (item) => ({
            ...item,
            title: food.foodName,
            description: buildDescriptionWithMacros(
                food.description || food.foodName || '',
                food.macros?.calories ?? 0,
                food.macros?.protein ?? 0
            ),
            completed: true,
            completedAt: Date.now(),
            skipped: false,
            skippedAt: undefined,
            snoozedUntil: undefined,
            // Store the macros in the plan item for reference
            // Note: TypeScript allows extra properties on objects
            ...(food.macros && { macros: food.macros as MacroNutrients }),
        })
    );

    // Also update the legacy key if this is today's plan
    const todayKey = getLocalDateKey(new Date());
    if (planDateKey === todayKey) {
        try {
            const planKey = `${storage.keys.DAILY_PLAN}_${planDateKey}`;
            const updatedPlan = await storage.get<DailyPlan>(planKey);
            if (updatedPlan) {
                await storage.set(storage.keys.DAILY_PLAN, updatedPlan);
            }
        } catch (error) {
            console.warn('[MealReplacement] Failed to sync legacy plan key:', error);
        }
    }

    console.log(`[MealReplacement] Replaced plan item "${planItemId}" with "${food.foodName}"`);

    return { entry, planUpdated };
};

/**
 * Build a FoodAnalysisResult from saved meal data
 * Helper for when logging a favorite meal
 */
export const buildFoodFromFavorite = (meal: {
    name: string;
    macros?: MacroNutrients;
    healthGrade?: string;
    ingredients?: string[];
}): FoodAnalysisResult => ({
    foodName: meal.name,
    description: i18n.t('dashboard.saved_meal_description', { name: meal.name }),
    ingredients: meal.ingredients || [],
    macros: meal.macros || { calories: 0, protein: 0, carbs: 0, fat: 0 },
    healthGrade: (meal.healthGrade as 'A' | 'B' | 'C' | 'D' | 'F') || 'B',
    confidence: i18n.t('dashboard.meal_confidence_high'),
    advice: i18n.t('dashboard.meal_advice_from_favorites'),
});

export default {
    logMealOnly,
    replaceAndLogMeal,
    buildFoodFromFavorite,
};
