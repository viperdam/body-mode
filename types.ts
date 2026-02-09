// Body Mode - Web App Types
// Self-contained type definitions for the web demo version

export interface UserProfile {
    name: string;
    avatarId: string;
    age: number;
    gender: 'male' | 'female';
    weight: number;
    height: number;
    culinaryIdentity: {
        origin: string;
        residence: string;
    };
    maritalStatus: 'single' | 'married' | 'partner';
    childrenCount: number;
    medicalProfile: {
        conditions: string[];
        medications: string[];
        injuries: string[];
        currentStatus: 'healthy' | 'sick_flu' | 'recovering';
    };
    dietaryPreferences?: {
        restrictions: string[];
        allergies: string[];
        dislikedFoods: string[];
    };
    fitnessProfile?: {
        experienceLevel: 'beginner' | 'intermediate' | 'advanced';
        preferredActivities: string[];
        equipmentAccess: 'none' | 'basic_home' | 'full_gym';
        availableMinutesPerDay?: number;
    };
    mealPattern?: {
        mealsPerDay?: number;
        mealTimes?: string[];
        typicalMeals?: string[];
        lateNightEating?: boolean;
    };
    habits?: {
        smoking?: string;
        alcohol?: string;
        vaping?: string;
        sugarCravings?: string;
        caffeine?: string;
        otherHabits?: string[];
    };
    goal: 'lose' | 'maintain' | 'gain';
    goalWeight?: number;
    targetDate?: string;
    planIntensity: 'slow' | 'normal' | 'aggressive';
    dailyCalorieTarget: number;
    dailyProteinTarget?: number;
    dailyWaterTargetMl?: number;
    calculatedIdealWeight: number;
    projectedWeeks: number;
    weeklyGoalSummary?: string;
    monthlyGoalSummary?: string;
    activityLevel: 'sedentary' | 'light' | 'moderate' | 'active';
    historySummary?: string;
    lastSummaryDate?: number;
    lastWeightCheck?: number;
    workProfile: {
        type: 'fixed_9_5' | 'night_shift' | 'rotating' | 'flexible' | 'unemployed';
        intensity: 'desk' | 'standing' | 'heavy_labor';
        role?: string;
        industry?: string;
        commuteType?: string;
        hours?: { start?: string; end?: string };
        durationHours?: number;
    };
    sleepRoutine: {
        isConsistent: boolean;
        targetWakeTime?: string;
        targetBedTime?: string;
        targetDurationHours?: number;
        wakeWindowMinutes: number;
        lastUpdatedAt?: number;
        qualityRating?: 1 | 2 | 3 | 4 | 5;
        sleepIssues?: string[];
    };
}

export interface MacroNutrients {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    vitamins?: string[];
}

export interface FoodAnalysisResult {
    foodName: string;
    description: string;
    ingredients: string[];
    macros: MacroNutrients;
    estimatedWeightGrams?: number;
    confidence: string;
    healthGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    advice: string;
}

export interface FoodLogEntry {
    id: string;
    timestamp: number;
    planItemId?: string;
    source?: string;
    food: FoodAnalysisResult;
}

export interface ActivityLogEntry {
    id: string;
    timestamp: number;
    planItemId?: string;
    name: string;
    durationMinutes: number;
    caloriesBurned: number;
    intensity: 'low' | 'moderate' | 'high';
    notes?: string;
}

export interface WeightLogEntry {
    id: string;
    timestamp: number;
    weight: number;
}

export type ViewState = 'welcome' | 'onboarding' | 'dashboard' | 'camera' | 'coach' | 'profile' | 'settings' | 'sleep' | 'smart-fridge';

export type MoodType = 'happy' | 'energetic' | 'neutral' | 'stressed' | 'sad';

export interface MoodLog {
    id: string;
    timestamp: number;
    mood: MoodType;
    score: number;
}

export interface PlanItem {
    id: string;
    time: string;
    type: 'meal' | 'workout' | 'hydration' | 'sleep' | 'work_break';
    title: string;
    description: string;
    completed: boolean;
    skipped?: boolean;
    scheduledAt?: number;
    completedAt?: number;
    skippedAt?: number;
    missed?: boolean;
    missedAt?: number;
    snoozedUntil?: number;
    linkedAction?: 'log_food' | 'start_sleep' | 'log_water';
    reactionTimeSeconds?: number;
    priority?: 'high' | 'medium' | 'low';
}

export interface DailyPlan {
    date: string;
    summary: string;
    items: PlanItem[];
    bioLoadSnapshot?: {
        neuralBattery: number;
        hormonalStress: 'low' | 'moderate' | 'high';
        physicalRecovery: number;
    };
    createdAt?: number;
    updatedAt?: number;
    generatedAt?: number;
    source?: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: number;
}

export interface DailyWrapUp {
    date: string;
    aiScore: number;
    summary: string;
    comparison: {
        category: string;
        planned: string;
        actual: string;
        status: 'hit' | 'miss' | 'partial';
    }[];
    tomorrowFocus: string;
    userRating?: number;
}

export interface AppContext {
    weather: {
        temp: number;
        condition: string;
        code: number;
    };
    currentLocation: string;
    healthData?: HealthContextData;
}

export interface HealthContextData {
    steps: number;
    distance: number;
    calories: number;
    sleepMinutes?: number;
    sleepQuality?: string;
    latestWeight?: number;
    heartRateBpm?: number;
    source?: 'google_fit' | 'apple_health' | 'health_connect' | 'unknown';
    updatedAt?: number;
}

export interface SleepSession {
    id: string;
    startTime: number;
    endTime: number;
    durationMinutes: number;
    movementLog: { timestamp: number; intensity: number }[];
    audioLog: { timestamp: number; level: number }[];
    efficiencyScore: number;
    stages: {
        stage: 'Deep' | 'Light' | 'REM' | 'Awake';
        startTime: string;
        endTime: string;
        duration: number;
    }[];
    aiAnalysis: string;
}

export interface Recipe {
    name: string;
    calories: number;
    protein: number;
    prepTime: string;
    ingredientsUsed: string[];
    missingIngredients: string[];
    instructions: string[];
    chefNote?: string;
}

export interface FridgeIngredientsResult {
    detectedIngredients: string[];
}

export type CookingMood = 'quick' | 'balanced' | 'gourmet';

export interface SavedMeal {
    id: string;
    name: string;
    macros: MacroNutrients;
    healthGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export type Language = 'en' | 'ar' | 'fr' | 'es' | 'hi' | 'de' | 'nl' | 'zh' | 'ja' | 'ko' | 'tr' | 'sw' | 'pt';

export type UserContextState = 'idle' | 'walking' | 'running' | 'driving' | 'sleeping' | 'working' | 'unknown';

export interface BioLoadAnalysis {
    neuralBattery: number;
    hormonalLoad: number;
    physicalFatigue: number;
    vitaminStatus: string[];
    socialDrain: number;
}

// --- ENERGY / MONETIZATION SYSTEM ---
export const ENERGY_COSTS = {
    DAILY_PLAN: 50,
    FOOD_SCAN: 25,
    FRIDGE_SCAN: 30,
    COACH_CHAT: 10,
    SLEEP_ANALYSIS: 20
};

export const MAX_ENERGY = 100;
