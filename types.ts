
export interface UserProfile {
  name: string;
  avatarId: string;
  age: number;
  gender: 'male' | 'female';
  weight: number; // Current weight
  height: number; // cm
  
  // New: Culinary Identity (Heritage vs Location)
  culinaryIdentity: {
      origin: string; // e.g. "Lebanese", "Mexican", "Japanese"
      residence: string; // e.g. "Berlin", "Dubai", "New York"
  };

  // New Demographics
  maritalStatus: 'single' | 'married' | 'partner';
  childrenCount: number;
  
  // Health & Medical Context (AI Powered)
  medicalProfile: {
      conditions: string[]; // e.g. "Diabetes Type 2", "Fibromyalgia"
      medications: string[]; // e.g. "Insulin", "Antidepressants"
      injuries: string[]; // e.g. "Bad knee"
      currentStatus: 'healthy' | 'sick_flu' | 'recovering';
  };

  // Goal Specifics
  goal: 'lose' | 'maintain' | 'gain';
  goalWeight?: number; // New: User defined target weight
  targetDate?: string; // New: User defined target date (YYYY-MM-DD)
  planIntensity: 'slow' | 'normal' | 'aggressive';
  
  // AI Calculated Metrics (Not hardcoded anymore)
  dailyCalorieTarget: number;
  calculatedIdealWeight: number;
  projectedWeeks: number;
  
  // AI Generated Goals
  weeklyGoalSummary?: string; // e.g. "Lose 0.5kg, Walk 40k steps"
  monthlyGoalSummary?: string; // e.g. "Stabilize insulin levels, Drop 2% Body Fat"

  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active';
  
  // Infinity Memory Fields
  historySummary?: string;
  lastSummaryDate?: number;
  lastWeightCheck?: number;

  workProfile: {
    type: 'fixed_9_5' | 'night_shift' | 'rotating' | 'flexible' | 'unemployed';
    intensity: 'desk' | 'standing' | 'heavy_labor';
    hours?: { start: string; end: string }; 
    durationHours?: number; 
  };
  sleepRoutine: {
    isConsistent: boolean;
    targetWakeTime?: string;
    targetBedTime?: string;
    targetDurationHours?: number; 
    wakeWindowMinutes: number;
  };
}

export interface MacroNutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  // Added Micros for AI analysis
  vitamins?: string[]; // e.g. ["Vitamin C: High", "Iron: Low"]
}

export interface FoodAnalysisResult {
  foodName: string;
  description: string; // New field
  ingredients: string[]; // New field
  macros: MacroNutrients;
  estimatedWeightGrams?: number;
  confidence: string; // High, Medium, Low
  healthGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  advice: string;
}

export interface FoodLogEntry {
  id: string;
  timestamp: number;
  food: FoodAnalysisResult;
}

// NEW: Activity Log
export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  name: string; // e.g. "Running", "Gym", "Yoga"
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
  score: number; // 1-5 for visualization
}

export interface DailyWaterLog {
  date: string; // ISO Date string YYYY-MM-DD
  amount: number; // ml
}

export interface PlanItem {
  id: string;
  time: string; // "14:00"
  type: 'meal' | 'workout' | 'hydration' | 'sleep' | 'work_break';
  title: string;
  description: string;
  completed: boolean;
  skipped?: boolean;
  snoozedUntil?: number; // Timestamp if snoozed
  linkedAction?: 'log_food' | 'start_sleep' | 'log_water'; // Action to trigger when clicked
  reactionTimeSeconds?: number; // Time taken to respond to notification
  priority?: 'high' | 'medium' | 'low'; // NEW: For Context Gatekeeper
}

export interface DailyPlan {
  date: string; // YYYY-MM-DD
  summary: string; // Short motivational summary for the day
  items: PlanItem[];
  // NEW: Daily Bio-Context Snapshot
  bioLoadSnapshot?: {
      neuralBattery: number; // 0-100 (Mental Energy)
      hormonalStress: 'low' | 'moderate' | 'high'; // Cortisol indicator
      physicalRecovery: number; // 0-100
  }
}

export interface DailyWrapUp {
    date: string; // YYYY-MM-DD
    aiScore: number; // 1-10 score based on adherence
    summary: string; // Text summary
    comparison: {
        category: string; // e.g. "Calories", "Workout", "Sleep"
        planned: string;
        actual: string;
        status: 'hit' | 'miss' | 'partial';
    }[];
    tomorrowFocus: string;
    userRating?: number; // 1-5 Star rating from user
}

export interface AppContext {
  weather: {
    temp: number;
    condition: string; // 'Clear', 'Rain', etc.
    code: number; // WMO code
  };
  currentLocation: string;
}

export interface SleepSession {
    id: string;
    startTime: number;
    endTime: number;
    durationMinutes: number;
    movementLog: { timestamp: number; intensity: number }[]; // Sampled every minute
    audioLog: { timestamp: number; level: number }[]; // New: Audio levels
    efficiencyScore: number; // 0-100
    stages: {
        stage: 'Deep' | 'Light' | 'REM' | 'Awake';
        startTime: string; // HH:MM
        endTime: string; // HH:MM
        duration: number; // minutes
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
    chefNote?: string; // Reason why this fits the user's heritage/location
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

// --- NEW: CONTEXT ENGINE TYPES ---
export type UserContextState = 'idle' | 'walking' | 'running' | 'driving' | 'sleeping' | 'working' | 'unknown';

export interface BioLoadAnalysis {
    neuralBattery: number; // 0-100 (100 = Fresh, 0 = Burnout)
    hormonalLoad: number; // 0-100 (Cortisol Proxy)
    physicalFatigue: number; // 0-100
    vitaminStatus: string[]; // e.g. ["Possible Magnesium Deficiency", "Low Vitamin D risk"]
    socialDrain: number; // 0-100 (Impact of family/work)
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
