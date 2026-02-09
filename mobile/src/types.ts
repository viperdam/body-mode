// Types for BioSync AI - React Native Mobile App

// Dietary restriction types
export type DietaryRestriction =
    | 'vegetarian'
    | 'vegan'
    | 'pescatarian'
    | 'keto'
    | 'paleo'
    | 'gluten_free'
    | 'dairy_free'
    | 'halal'
    | 'kosher'
    | 'none';

// Sleep issue types
export type SleepIssue = 'insomnia' | 'apnea' | 'restless' | 'snoring' | 'none';

// Fitness activity types
export type FitnessActivity =
    | 'walking'
    | 'running'
    | 'weights'
    | 'yoga'
    | 'swimming'
    | 'cycling'
    | 'hiit'
    | 'sports'
    | 'dancing'
    | 'martial_arts';

// Equipment access types
export type EquipmentAccess = 'none' | 'basic_home' | 'full_gym';

// Experience level types
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

// Lifestyle habit types
export type HabitFrequency = 'none' | 'occasional' | 'weekly' | 'daily';
export type SugarCravingLevel = 'low' | 'moderate' | 'high';
export type CaffeineIntake = 'none' | '1_2' | '3_4' | '5_plus';
export type CommuteType = 'none' | 'car' | 'public_transit' | 'walking' | 'cycling' | 'mixed';

// Dietary preferences interface
export interface DietaryPreferences {
    restrictions: DietaryRestriction[];
    allergies: string[];
    dislikedFoods: string[];
}

// Fitness profile interface
export interface FitnessProfile {
    experienceLevel: ExperienceLevel;
    preferredActivities: FitnessActivity[];
    equipmentAccess: EquipmentAccess;
    availableMinutesPerDay?: number;
}

export interface MealPattern {
    mealsPerDay?: number;
    mealTimes?: string[];
    typicalMeals?: string[];
    lateNightEating?: boolean;
    lastUpdatedAt?: number;
}

export interface LifestyleHabits {
    smoking?: HabitFrequency;
    alcohol?: HabitFrequency;
    vaping?: HabitFrequency;
    sugarCravings?: SugarCravingLevel;
    caffeine?: CaffeineIntake;
    otherHabits?: string[];
    lastUpdatedAt?: number;
}

export interface UserProfile {
    schemaVersion?: number;
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

    // NEW: Dietary preferences
    dietaryPreferences?: DietaryPreferences;

    // NEW: Fitness profile
    fitnessProfile?: FitnessProfile;

    // NEW: Meal patterns & habits
    mealPattern?: MealPattern;
    habits?: LifestyleHabits;

    goal: 'lose' | 'maintain' | 'gain';
    goalWeight?: number;
    targetDate?: string;
    planIntensity: 'slow' | 'normal' | 'aggressive';

    dailyCalorieTarget: number;
    dailyProteinTarget?: number;
    dailyWaterTargetMl?: number;
    targetsUpdatedAt?: number;
    targetsDateKey?: string;
    targetsWeightKg?: number;
    targetsMethod?: 'formula' | 'ai' | 'manual';
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
        commuteType?: CommuteType;
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
        lastUpdateSource?: 'manual' | 'auto' | 'suggested';
        // NEW: Sleep quality tracking
        qualityRating?: 1 | 2 | 3 | 4 | 5;
        sleepIssues?: SleepIssue[];
    };
}

export interface MacroNutrients {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    vitamins?: string[];
}

export type NutrientKey =
    | 'vitaminA'
    | 'vitaminB1'
    | 'vitaminB2'
    | 'vitaminB3'
    | 'vitaminB5'
    | 'vitaminB6'
    | 'vitaminB7'
    | 'vitaminB9'
    | 'vitaminB12'
    | 'vitaminC'
    | 'vitaminD'
    | 'vitaminE'
    | 'vitaminK'
    | 'calcium'
    | 'chloride'
    | 'iron'
    | 'fluoride'
    | 'magnesium'
    | 'molybdenum'
    | 'phosphorus'
    | 'potassium'
    | 'sodium'
    | 'zinc'
    | 'copper'
    | 'manganese'
    | 'selenium'
    | 'iodine'
    | 'chromium'
    | 'omega3'
    | 'omega6'
    | 'fiber'
    | 'choline'
    | 'water';

export interface NutrientProfile {
    vitaminA: number;
    vitaminB1: number;
    vitaminB2: number;
    vitaminB3: number;
    vitaminB5: number;
    vitaminB6: number;
    vitaminB7: number;
    vitaminB9: number;
    vitaminB12: number;
    vitaminC: number;
    vitaminD: number;
    vitaminE: number;
    vitaminK: number;
    calcium: number;
    chloride: number;
    iron: number;
    fluoride: number;
    magnesium: number;
    molybdenum: number;
    phosphorus: number;
    potassium: number;
    sodium: number;
    zinc: number;
    copper: number;
    manganese: number;
    selenium: number;
    iodine: number;
    chromium: number;
    omega3: number;
    omega6: number;
    fiber: number;
    choline: number;
    water: number;
}

export type NutrientSeverity = 'critical' | 'low' | 'adequate' | 'good' | 'excess' | 'unknown';

export interface NutrientGap {
    nutrient: NutrientKey;
    displayName: string;
    current: number;
    target: number;
    unit: string;
    percentage: number;
    severity: NutrientSeverity;
    daysDeficientInRow?: number;
}

export interface NutritionInsight {
    summary: string;
    eatMore: { nutrient: string; foods: string[]; reason?: string }[];
    eatLess: { nutrient: string; foods: string[]; reason?: string }[];
    focusNutrients: string[];
    caution?: string;
}

export interface NutrientBalanceSnapshot {
    date: string;
    totals: Partial<NutrientProfile>;
    targets: NutrientProfile;
    gaps: NutrientGap[];
    overallScore: number;
    coverage: number;
    foodLogCount: number;
    lastLogTimestamp?: number;
    updatedAt: number;
    insights?: NutritionInsight;
}

export interface FoodIngredientDetail {
    name: string;
    estimatedGrams?: number;
    quantity?: string;
    unit?: string;
    notes?: string;
}

export interface FoodAnalysisResult {
    foodName: string;
    description: string;
    ingredients: string[];
    ingredientsDetailed?: FoodIngredientDetail[];
    macros: MacroNutrients;
    micronutrients?: Partial<NutrientProfile>;
    micronutrientsConfidence?: 'high' | 'medium' | 'low';
    nutritionSource?: 'llm' | 'db' | 'mixed' | 'estimated';
    estimatedWeightGrams?: number;
    confidence: string;
    healthGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    advice: string;
}

export interface FoodLogEntry {
    id: string;
    timestamp: number;
    planItemId?: string; // Links to plan item for reliable unlogging
    source?: string;
    food: FoodAnalysisResult;
}

export interface ActivityLogEntry {
    id: string;
    timestamp: number;
    planItemId?: string; // Links to plan item for reliable unlogging
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

export type BodyScanStatus = 'queued' | 'processing' | 'analyzed' | 'failed';

export interface BodyScanAnalysis {
    bodyComposition: string;
    skinCondition: string;
    postureAnalysis: string;
    visibleChanges: string;
    muscleGroups: string;
    estimatedBodyFat: string;
    overallAssessment: string;
    recommendations: string;
    motivationalFeedback: string;
    comparisonWithPrevious?: string;
    comparisonWithBaseline?: string;
    progressScore?: number;
    biggestImprovements?: string[];
    areasNeedingFocus?: string[];
}

export interface BodyScanEntry {
    id: string;
    imageUri: string;
    capturedAt: number;
    weekNumber: number;
    status: BodyScanStatus;
    analysis?: BodyScanAnalysis;
    comparisonWithPrevious?: string;
    comparisonWithBaseline?: string;
    progressScore?: number;
    baselineId?: string;
    previousId?: string;
    lastError?: string;
    retryCount?: number;
    updatedAt?: number;
}

export interface BodyProgressSummary {
    summary: string;
    scanCount: number;
    updatedAt: number;
}

export interface BodyProgressSettings {
    reminderEnabled: boolean;
    lastScanAt?: number;
    nextScanDue?: number;
    reminderNotificationId?: string | null;
    lastSummaryAt?: number;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: number;
}

export type ViewState = 'welcome' | 'onboarding' | 'dashboard' | 'camera' | 'coach' | 'profile' | 'settings' | 'sleep' | 'smart-fridge';

export type MoodType = 'happy' | 'energetic' | 'neutral' | 'stressed' | 'sad';

export interface MoodLog {
    id: string;
    timestamp: number;
    mood: MoodType;
    score: number;
}

export interface DailyWaterLog {
    date: string;
    amount: number;
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
    schemaVersion?: number;
    summary: string;
    items: PlanItem[];
    bioLoadSnapshot?: {
        neuralBattery: number;
        hormonalStress: 'low' | 'moderate' | 'high';
        physicalRecovery: number;
    }
    createdAt?: number;
    updatedAt?: number;
    generatedAt?: number;
    timezoneOffsetMinutes?: number;
    source?: 'cloud' | 'cloud_retry';
    isTemporary?: boolean;
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
    bioSummary?: {
        avgStress: number;
        avgReadiness: number;
        hrvTrend: 'improving' | 'declining' | 'stable';
        sleepScoreAvg: number;
    };
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
    bioSnapshot?: BioSnapshot;
}

export interface BioDailyRollup {
    date: string;
    updatedAt: number;
    sampleCount: number;
    averages: Partial<BioSnapshot>;
    totals?: Partial<BioSnapshot>;
    mins?: Partial<BioSnapshot>;
    maxs?: Partial<BioSnapshot>;
}

export interface AppContext {
    weather?: {
        temp: number;
        condition: string;
        code: number;
    };
    currentLocation?: string;
    wrapUpSummary?: string;
    userContextState?: UserContextState;
    userFeedback?: string;
    // Plan refinement context
    source?: string;
    refinementReason?: string;
    deviationContext?: string;
    // Comprehensive context (nutrition, location, incomplete items)
    nutritionContext?: string;
    locationContext?: string;
    carriedOverContext?: string;
    adaptationContext?: string;
    healthData?: HealthContextData;
    bioSnapshot?: BioSnapshot;
    bioTrends?: BioTrend[];
    bioHistorySummary?: string;
    bodyProgressSummary?: string;
    contextSummary?: string;
    contextDetails?: {
        environment?: string;
        confidence?: number;
        pollTier?: string;
        movementType?: string;
        locationType?: string;
        conflicts?: string[];
        lastUpdatedAt?: number;
    };
    contextTransitions?: string;
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

export type SleepEventType =
    | 'SLEEP_DETECTED'
    | 'SLEEP_STARTED'
    | 'WAKE_DETECTED'
    | 'WAKE_CONFIRMED'
    | 'SLEEP_DECLINED';

export interface SleepEventPayload {
    sleepStartTime?: number;
    wakeTime?: number;
    durationMs?: number;
    durationHours?: number;
    confirmed?: boolean;
    autoAssumed?: boolean;
    sleepContext?: Record<string, any>;
    tags?: string[];
    schemaVersion?: number;
}

export interface SleepEvent {
    type: SleepEventType;
    timestamp: number;
    data?: SleepEventPayload;
}

export interface PendingOverlayAction {
    id: string;
    action: 'COMPLETE' | 'SNOOZE' | 'SKIP';
    type?: string; // 'meal' | 'hydration' | 'activity' | 'sleep' | 'wakeup'
    planDate?: string;
    planItemId?: string;
    snoozedUntil?: number;
    timestamp: number;
    source?: 'native' | 'js';
}

export interface SleepScheduleSuggestion {
    bedTime: string;
    wakeTime: string;
    sampleSize: number;
    varianceMinutes: number;
    confidence: 'low' | 'medium' | 'high';
    computedAt: number;
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

export interface MealRecipe {
    name: string;
    ingredients: string[];
    steps: string[];
    tips?: string;
    macros?: Partial<MacroNutrients>;
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

export type NotificationPlanMode = 'low' | 'medium' | 'high';

export type UserContextState =
    | 'idle'
    | 'resting'
    | 'home_active'
    | 'walking'
    | 'running'
    | 'commuting'
    | 'driving'
    | 'gym_workout'
    | 'sleeping'
    | 'working'
    | 'unknown';

export interface BioLoadAnalysis {
    neuralBattery: number;
    hormonalLoad: number;
    physicalFatigue: number;
    vitaminStatus: string[];
    socialDrain: number;
}

// ===== BIO-CONTEXT PIPELINE TYPES =====

export interface BioSnapshot {
    hrv?: number;                    // Heart Rate Variability in ms (SDNN)
    restingHR?: number;              // Resting heart rate bpm
    currentHR?: number;              // Current heart rate bpm (latest sample)
    spo2?: number;                   // Blood oxygen %
    bodyTemp?: number;               // Body temperature °C
    basalBodyTemp?: number;          // Basal body temperature °C
    respiratoryRate?: number;        // Breaths per minute
    vo2Max?: number;                 // ml/min/kg
    bloodGlucoseMgDl?: number;       // Blood glucose (mg/dL)
    basalMetabolicRateKcal?: number; // kcal/day
    bodyWeightKg?: number;           // Weight in kg
    bodyFatPct?: number;             // Body fat %
    hydrationMl?: number;            // Hydration volume ml (recent)
    nutritionKcal?: number;          // Nutrition energy kcal (recent)
    nutritionCarbsG?: number;        // Nutrition carbs grams (recent)
    nutritionProteinG?: number;      // Nutrition protein grams (recent)
    nutritionFatG?: number;          // Nutrition fat grams (recent)
    exerciseMinutes24h?: number;     // Total exercise minutes last 24h
    lastExerciseType?: number;       // Health Connect exercise type code
    menstruationFlow?: number;       // Menstruation flow level (HC code)
    menstruationActive?: boolean;    // Menstruation period flag
    steps?: number;                  // Steps last 24h
    distanceMeters?: number;         // Distance last 24h (meters)
    activeCalories?: number;         // Active calories last 24h (kcal)
    sleepScore?: number;             // 0-100 from sleep data
    stressIndex?: number;            // 0-100 computed from HRV + HR + mood
    readinessScore?: number;         // 0-100 composite readiness
    timestamp: number;
    source: 'health_connect' | 'apple_health' | 'google_fit' | 'manual' | 'fallback';
    freshness: 'live' | 'cached' | 'stale';
}

export interface BioContextConfig {
    enableHRV: boolean;
    enableRestingHR: boolean;
    enableSpO2: boolean;
    enableBodyTemp: boolean;
    enableBasalBodyTemp: boolean;
    enableRespiratoryRate: boolean;
    enableVo2Max: boolean;
    enableBloodGlucose: boolean;
    enableBasalMetabolicRate: boolean;
    enableBodyWeight: boolean;
    enableBodyFat: boolean;
    enableHydration: boolean;
    enableNutrition: boolean;
    enableExerciseSessions: boolean;
    enableMenstruation: boolean;
    enableSteps: boolean;
    enableDistance: boolean;
    enableActiveCalories: boolean;
    enableCurrentHR: boolean;
    enableSleepStages: boolean;
    dataRetentionDays: number;
    shareWithAI: boolean;
}

export const DEFAULT_BIO_CONTEXT_CONFIG: BioContextConfig = {
    enableHRV: true,
    enableRestingHR: true,
    enableSpO2: true,
    enableBodyTemp: true,
    enableBasalBodyTemp: true,
    enableRespiratoryRate: true,
    enableVo2Max: true,
    enableBloodGlucose: true,
    enableBasalMetabolicRate: true,
    enableBodyWeight: true,
    enableBodyFat: true,
    enableHydration: true,
    enableNutrition: true,
    enableExerciseSessions: true,
    enableMenstruation: true,
    enableSteps: true,
    enableDistance: true,
    enableActiveCalories: true,
    enableCurrentHR: true,
    enableSleepStages: true,
    dataRetentionDays: 30,
    shareWithAI: true,
};

export interface BioTrend {
    metric: 'hrv' | 'restingHR' | 'spo2' | 'stressIndex' | 'readinessScore' | 'sleepScore' | 'vo2Max' | 'respiratoryRate';
    direction: 'improving' | 'declining' | 'stable';
    values7d: number[];
    average7d: number;
    average7dPrior?: number;
}

// Overlay Reminder System Types
export interface OverlayReminderTypes {
    meal: boolean;
    hydration: boolean;
    workout: boolean;
    sleep: boolean;
    workBreak: boolean;
    wrapUp: boolean;
    weightCheck: boolean;
}

export interface OverlaySettings {
    enabled: boolean;                          // Master toggle for overlay display
    permissionGranted: boolean;                // Tracks if SYSTEM_ALERT_WINDOW granted
    mode: NotificationPlanMode;                // 'low' | 'medium' | 'high'
    types: OverlayReminderTypes;               // Individual type toggles
}

// Default overlay settings
export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
    enabled: true,
    permissionGranted: false,
    mode: 'high',
    types: {
        meal: true,
        hydration: true,
        workout: true,
        sleep: true,
        workBreak: true,
        wrapUp: true,
        weightCheck: true,
    },
};

// Mode presets for quick configuration
export const OVERLAY_MODE_PRESETS: Record<NotificationPlanMode, OverlayReminderTypes> = {
    low: {
        meal: true,
        hydration: false,
        workout: false,
        sleep: false,
        workBreak: false,
        wrapUp: false,
        weightCheck: false,
    },
    medium: {
        meal: true,
        hydration: true,
        workout: true,
        sleep: false,
        workBreak: false,
        wrapUp: false,
        weightCheck: false,
    },
    high: {
        meal: true,
        hydration: true,
        workout: true,
        sleep: true,
        workBreak: true,
        wrapUp: true,
        weightCheck: true,
    },
};

export const ENERGY_COSTS = {
    FOOD_ANALYSIS: 10,
    PLAN_GENERATION: 15,
    CHAT_MESSAGE: 5,
    SLEEP_ANALYSIS: 10,
    FRIDGE_SCAN: 12,
    RECIPE_GENERATION: 10,
    FOOD_REFINEMENT: 8,
    WRAP_UP: 8,
    BODY_SCAN_ANALYSIS: 20,
};

export const MAX_ENERGY = 100;

// Auto Sleep Tracking Settings
export interface AutoSleepSettings {
    enabled: boolean;
    anytimeMode: boolean; // When true, ignores night hours and charging - pure stillness detection
    sensitivityLevel: 'low' | 'medium' | 'high';
    sleepProbeSnoozeMinutes: number;
    wakeSnoozeMinutes: number;
    nightStartHour: number;  // 24h format, only used when anytimeMode is false
    nightEndHour: number;    // 24h format, only used when anytimeMode is false
    requireCharging: boolean; // Only used when anytimeMode is false
    stillnessThresholdMinutes: number; // Time of stillness before probe
    maxTrackingHours: number; // Safety limit to auto-stop
    useActivityRecognition?: boolean; // Use Google Play Activity Recognition API
}

export const DEFAULT_AUTO_SLEEP_SETTINGS: AutoSleepSettings = {
    enabled: true,
    anytimeMode: true, // Default to anytime detection
    sensitivityLevel: 'medium',
    sleepProbeSnoozeMinutes: 90,
    wakeSnoozeMinutes: 30,
    nightStartHour: 21,
    nightEndHour: 7,
    requireCharging: false, // Default: don't require charging
    stillnessThresholdMinutes: 10,
    maxTrackingHours: 14,
};

export const AUTO_SLEEP_SENSITIVITY_PRESETS = {
    low: {
        stillnessThresholdMinutes: 15,
        sleepProbeSnoozeMinutes: 120,
    },
    medium: {
        stillnessThresholdMinutes: 10,
        sleepProbeSnoozeMinutes: 90,
    },
    high: {
        stillnessThresholdMinutes: 5,
        sleepProbeSnoozeMinutes: 60,
    },
};

// ===================================
// NEW: ROBUST ARCHITECTURE TYPES
// ===================================

// Error Recovery Service Types
export interface ErrorContext {
    service: string;
    operation: string;
    error: Error;
    timestamp: number;
    recoveryAttempts: number;
    metadata?: Record<string, any>;
}

export interface CircuitBreakerState {
    isOpen: boolean;
    failureCount: number;
    lastFailureTime: number;
    cooldownUntil: number;
    successCount: number;
}

export type RecoveryStrategy =
    | 'retry'
    | 'fallback'
    | 'circuit_breaker'
    | 'degraded_mode'
    | 'reset_state'
    | 'restore_backup';

// Migration Service Types
export interface Migration {
    version: number;
    description: string;
    up: () => Promise<void>;
    down: () => Promise<void>;
}

export interface MigrationBackup {
    version: number;
    timestamp: number;
    data: Record<string, string>;
}

export const CURRENT_SCHEMA_VERSION = 6;

// Health Monitor Service Types
export interface SystemHealth {
    llmQueue: {
        pending: number;
        failed: number;
        processing: number;
        lastProcessedAt: number;
        circuitBreakerOpen: boolean;
        averageResponseTimeMs: number;
    };
    storage: {
        usedMB: number;
        quotaMB: number;
        usagePercent: number;
        integrityOK: boolean;
        lastCleanupAt: number;
    };
    nativeBridges: {
        overlay: BridgeStatus;
        sleep: BridgeStatus;
        txStore: BridgeStatus;
        location: BridgeStatus;
    };
    permissions: {
        notifications: boolean;
        location: boolean;
        activityRecognition: boolean;
        overlay: boolean;
        camera: boolean;
        batteryOptimization: boolean;
    };
    backgroundTasks: {
        sleepDetection: TaskStatus;
        overlayScheduler: {
            status: TaskStatus;
            activeAlarms: number;
        };
        foregroundService: TaskStatus;
    };
    lastHealthCheck: number;
}

export type BridgeStatus = 'connected' | 'disconnected' | 'error' | 'timeout';
export type TaskStatus = 'running' | 'stopped' | 'error' | 'degraded';

export interface DiagnosticReport {
    timestamp: number;
    issues: DiagnosticIssue[];
    recommendations: string[];
    overallHealth: 'excellent' | 'good' | 'degraded' | 'critical';
}

export interface DiagnosticIssue {
    severity: 'critical' | 'warning' | 'info';
    category: 'storage' | 'permissions' | 'network' | 'llm' | 'native' | 'background';
    message: string;
    autoFixable: boolean;
    fixAction?: () => Promise<void>;
}

// Offline Service Types
export interface NetworkState {
    isOnline: boolean;
    type: 'wifi' | 'cellular' | 'none' | 'unknown';
    lastOnlineAt: number;
    lastOfflineAt: number;
}

export interface PendingOperation {
    id: string;
    type: 'llm_job' | 'storage_sync' | 'native_bridge_call';
    operation: string;
    data: any;
    queuedAt: number;
    retryCount: number;
    maxRetries: number;
}

// Plan Generation Engine Types
export interface RuleBasedPlanConfig {
    useFavorites: boolean;
    respectMacros: boolean;
    includeWorkSchedule: boolean;
    hydrationFrequencyHours: number;
    minMealsPerDay: number;
    maxMealsPerDay: number;
}

export interface MealSelectionCriteria {
    targetCalories: number;
    preferredMacroRatio: {
        proteinPercent: number;
        carbsPercent: number;
        fatPercent: number;
    };
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    avoidIngredients?: string[];
}

export interface WorkoutSelectionCriteria {
    fitnessLevel: 'beginner' | 'intermediate' | 'advanced';
    availableMinutes: number;
    recoveryState: number; // 0-100
    lastWorkoutType?: string;
    preferredIntensity?: 'low' | 'moderate' | 'high';
}

// Plan Generation Tier
export type PlanGenerationTier =
    | 'full_llm'        // 15 energy, full context, best quality
    | 'degraded_llm'    // 5 energy, simplified prompts, cheaper model
    | 'rule_based'      // 0 energy, generated from user data
    | 'manual';         // 0 energy, user creates own plan

export interface PlanGenerationResult {
    plan: DailyPlan;
    tier: PlanGenerationTier;
    energyCost: number;
    generationTimeMs: number;
    fallbackReason?: string;
}

// LLM Queue Enhanced Types
export interface LLMJobRetryConfig {
    maxRetries: number;
    initialBackoffMs: number;
    maxBackoffMs: number;
    backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: LLMJobRetryConfig = {
    maxRetries: 5,
    initialBackoffMs: 1000,
    maxBackoffMs: 32000,
    backoffMultiplier: 2,
};

export interface QueueMetrics {
    totalProcessed: number;
    totalFailed: number;
    averageProcessingTimeMs: number;
    longestQueueLength: number;
    currentQueueLength: number;
}

// Storage Cleanup Types
export interface CleanupResult {
    deletedKeys: string[];
    freedMB: number;
    duration: number;
}

export interface StorageQuota {
    total: number;
    used: number;
    available: number;
    percentUsed: number;
}

// Permission Degradation Map
export type PermissionDegradationMap = {
    [key: string]: {
        features: string[];
        fallback: string;
        userMessage: string;
    };
};
