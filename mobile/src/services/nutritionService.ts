/**
 * Nutrition Service - Comprehensive vitamin and mineral tracking
 * 
 * Tracks all essential nutrients:
 * - Vitamins: A, B1-B12, C, D, E, K
 * - Minerals: Calcium, Iron, Magnesium, Zinc, Potassium, etc.
 * - Omega fatty acids, fiber, hydration
 * 
 * Analyzes food history to identify deficiencies and patterns
 */

import storage, { getWaterAmountForDate } from './storageService';
import { FoodLogEntry, UserProfile, NutrientProfile, NutrientGap, NutrientKey, NutrientBalanceSnapshot } from '../types';
import { getLocalDateKey } from '../utils/dateUtils';
import nutritionDbService, { NutritionDb, NutritionDbEntry } from './nutritionDbService';

// ==================== TYPES ====================

export interface NutritionAnalysis {
    date: string;
    dailyIntake: Partial<NutrientProfile>;
    gaps: NutrientGap[];
    deficiencyPatterns: { nutrient: string; daysLow: number }[];
    suggestedFoods: { nutrient: string; foods: string[] }[];
    overallScore: number; // 0-100
    coverage?: number;
    foodLogCount?: number;
}

// ==================== DAILY RECOMMENDED VALUES ====================

// These are general adult values - should be personalized based on age, gender, activity
const getDefaultDailyTargets = (): NutrientProfile => ({
    // Vitamins
    vitaminA: 900,        // mcg RAE (men), 700 for women
    vitaminB1: 1.2,       // mg
    vitaminB2: 1.3,       // mg
    vitaminB3: 16,        // mg
    vitaminB5: 5,         // mg
    vitaminB6: 1.7,       // mg
    vitaminB7: 30,        // mcg
    vitaminB9: 400,       // mcg (Folate)
    vitaminB12: 2.4,      // mcg
    vitaminC: 90,         // mg (men), 75 for women
    vitaminD: 20,         // mcg (800 IU)
    vitaminE: 15,         // mg
    vitaminK: 120,        // mcg (men), 90 for women

    // Minerals
    calcium: 1000,        // mg
    chloride: 2300,       // mg
    iron: 8,              // mg (men), 18 for premenopausal women
    fluoride: 4,          // mg (men), 3 for women
    magnesium: 420,       // mg (men), 320 for women
    molybdenum: 45,       // mcg
    phosphorus: 700,      // mg
    potassium: 4700,      // mg
    sodium: 2300,         // mg (max, not target)
    zinc: 11,             // mg (men), 8 for women
    copper: 0.9,          // mg
    manganese: 2.3,       // mg
    selenium: 55,         // mcg
    iodine: 150,          // mcg
    chromium: 35,         // mcg

    // Fatty Acids
    omega3: 1.6,          // g (ALA)
    omega6: 17,           // g

    // Other
    fiber: 38,            // g (men), 25 for women
    choline: 550,         // mg (men), 425 for women
    water: 3700,          // ml (men), 2700 for women
});

export const NUTRIENT_DISPLAY_NAMES: Record<NutrientKey, string> = {
    vitaminA: 'Vitamin A',
    vitaminB1: 'Vitamin B1 (Thiamine)',
    vitaminB2: 'Vitamin B2 (Riboflavin)',
    vitaminB3: 'Vitamin B3 (Niacin)',
    vitaminB5: 'Vitamin B5',
    vitaminB6: 'Vitamin B6',
    vitaminB7: 'Biotin',
    vitaminB9: 'Folate',
    vitaminB12: 'Vitamin B12',
    vitaminC: 'Vitamin C',
    vitaminD: 'Vitamin D',
    vitaminE: 'Vitamin E',
    vitaminK: 'Vitamin K',
    calcium: 'Calcium',
    chloride: 'Chloride',
    iron: 'Iron',
    fluoride: 'Fluoride',
    magnesium: 'Magnesium',
    molybdenum: 'Molybdenum',
    phosphorus: 'Phosphorus',
    potassium: 'Potassium',
    sodium: 'Sodium',
    zinc: 'Zinc',
    copper: 'Copper',
    manganese: 'Manganese',
    selenium: 'Selenium',
    iodine: 'Iodine',
    chromium: 'Chromium',
    omega3: 'Omega-3',
    omega6: 'Omega-6',
    fiber: 'Fiber',
    choline: 'Choline',
    water: 'Water',
};

export const NUTRIENT_UNITS: Record<NutrientKey, string> = {
    vitaminA: 'mcg',
    vitaminB1: 'mg',
    vitaminB2: 'mg',
    vitaminB3: 'mg',
    vitaminB5: 'mg',
    vitaminB6: 'mg',
    vitaminB7: 'mcg',
    vitaminB9: 'mcg',
    vitaminB12: 'mcg',
    vitaminC: 'mg',
    vitaminD: 'mcg',
    vitaminE: 'mg',
    vitaminK: 'mcg',
    calcium: 'mg',
    chloride: 'mg',
    iron: 'mg',
    fluoride: 'mg',
    magnesium: 'mg',
    molybdenum: 'mcg',
    phosphorus: 'mg',
    potassium: 'mg',
    sodium: 'mg',
    zinc: 'mg',
    copper: 'mg',
    manganese: 'mg',
    selenium: 'mcg',
    iodine: 'mcg',
    chromium: 'mcg',
    omega3: 'g',
    omega6: 'g',
    fiber: 'g',
    choline: 'mg',
    water: 'ml',
};

const NUTRIENT_KEYS = Object.keys(getDefaultDailyTargets()) as NutrientKey[];

const createEmptyProfile = (): NutrientProfile => ({
    vitaminA: 0,
    vitaminB1: 0,
    vitaminB2: 0,
    vitaminB3: 0,
    vitaminB5: 0,
    vitaminB6: 0,
    vitaminB7: 0,
    vitaminB9: 0,
    vitaminB12: 0,
    vitaminC: 0,
    vitaminD: 0,
    vitaminE: 0,
    vitaminK: 0,
    calcium: 0,
    chloride: 0,
    iron: 0,
    fluoride: 0,
    magnesium: 0,
    molybdenum: 0,
    phosphorus: 0,
    potassium: 0,
    sodium: 0,
    zinc: 0,
    copper: 0,
    manganese: 0,
    selenium: 0,
    iodine: 0,
    chromium: 0,
    omega3: 0,
    omega6: 0,
    fiber: 0,
    choline: 0,
    water: 0,
});

const addNutrients = (target: Partial<NutrientProfile>, source?: Partial<NutrientProfile>): void => {
    if (!source) return;
    for (const key of NUTRIENT_KEYS) {
        const value = source[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            target[key] = (target[key] || 0) + value;
        }
    }
};

/**
 * Get personalized daily targets based on user profile
 */
export const getDailyTargets = (profile: UserProfile): NutrientProfile => {
    const defaults = getDefaultDailyTargets();
    const isFemale = profile.gender?.toLowerCase() === 'female';
    const age = profile.age || 30;
    const isPregnant = profile.medicalProfile?.conditions?.includes('Pregnant');
    const isAthlete = (profile as any).fitnessLevel === 'advanced';

    // Adjust for gender
    if (isFemale) {
        defaults.vitaminA = 700;
        defaults.vitaminC = 75;
        defaults.vitaminK = 90;
        defaults.iron = 18; // Higher for premenopausal women
        defaults.fluoride = 3;
        defaults.magnesium = 320;
        defaults.zinc = 8;
        defaults.fiber = 25;
        defaults.choline = 425;
        defaults.water = 2700;
    }

    // Adjust for age
    if (age > 50) {
        defaults.vitaminB12 = 2.8; // Absorption decreases with age
        defaults.vitaminD = 25;    // Higher need
        defaults.calcium = 1200;
    }

    // Adjust for pregnancy
    if (isPregnant) {
        defaults.vitaminB9 = 600;  // Folate critical for fetal development
        defaults.iron = 27;
        defaults.calcium = 1300;
        defaults.choline = 450;
    }

    // Adjust for athletes
    if (isAthlete) {
        defaults.iron *= 1.3;
        defaults.magnesium *= 1.2;
        defaults.potassium *= 1.2;
        defaults.water *= 1.3;
    }

    return defaults;
};

// ==================== FOOD NUTRIENT ESTIMATION ====================

/**
 * Estimate nutrients from food description using keyword matching
 * This is a simplified heuristic - real implementation would use a nutrition database
 */
export const estimateNutrientsFromFood = (food: FoodLogEntry['food']): Partial<NutrientProfile> => {
    const nutrients: Partial<NutrientProfile> = {};
    const desc = (food.description + ' ' + food.foodName).toLowerCase();

    // ===== VITAMIN A (found in orange/yellow/green vegetables, liver, dairy) =====
    if (desc.includes('carrot') || desc.includes('sweet potato')) nutrients.vitaminA = 500;
    else if (desc.includes('spinach') || desc.includes('kale')) nutrients.vitaminA = 300;
    else if (desc.includes('liver')) nutrients.vitaminA = 5000;
    else if (desc.includes('egg')) nutrients.vitaminA = 80;
    else if (desc.includes('milk') || desc.includes('cheese')) nutrients.vitaminA = 50;

    // ===== B VITAMINS (found in whole grains, meat, legumes) =====
    if (desc.includes('pork') || desc.includes('sunflower')) nutrients.vitaminB1 = 0.5;
    else if (desc.includes('whole grain') || desc.includes('brown rice') || desc.includes('oat')) nutrients.vitaminB1 = 0.3;
    if (desc.includes('milk') || desc.includes('yogurt') || desc.includes('egg')) nutrients.vitaminB2 = 0.4;
    else if (desc.includes('almond') || desc.includes('mushroom')) nutrients.vitaminB2 = 0.3;
    if (desc.includes('beef') || desc.includes('chicken') || desc.includes('tuna')) nutrients.vitaminB3 = 5;
    else if (desc.includes('peanut') || desc.includes('mushroom')) nutrients.vitaminB3 = 3;
    if (desc.includes('chicken') || desc.includes('mushroom')) nutrients.vitaminB5 = 1.5;
    else if (desc.includes('avocado') || desc.includes('sunflower')) nutrients.vitaminB5 = 1;
    if (desc.includes('salmon') || desc.includes('chicken') || desc.includes('chickpea')) nutrients.vitaminB6 = 0.5;
    else if (desc.includes('banana') || desc.includes('potato')) nutrients.vitaminB6 = 0.3;
    if (desc.includes('egg')) nutrients.vitaminB7 = 10;
    else if (desc.includes('almond') || desc.includes('sweet potato')) nutrients.vitaminB7 = 6;
    else if (desc.includes('salmon')) nutrients.vitaminB7 = 5;
    if (desc.includes('lentil') || desc.includes('spinach') || desc.includes('asparagus')) nutrients.vitaminB9 = 100;
    if (desc.includes('fish') || desc.includes('meat') || desc.includes('egg')) nutrients.vitaminB12 = 1;
    if (desc.includes('liver') || desc.includes('clam')) nutrients.vitaminB12 = 10;

    // ===== VITAMIN C (citrus, berries, peppers, tomatoes) =====
    if (desc.includes('orange') || desc.includes('citrus') || desc.includes('lemon')) nutrients.vitaminC = 50;
    else if (desc.includes('pepper') || desc.includes('bell')) nutrients.vitaminC = 80;
    else if (desc.includes('strawberr') || desc.includes('kiwi')) nutrients.vitaminC = 60;
    else if (desc.includes('tomato')) nutrients.vitaminC = 15;
    else if (desc.includes('broccoli')) nutrients.vitaminC = 40;

    // ===== VITAMIN D (fatty fish, fortified foods, eggs) =====
    if (desc.includes('salmon') || desc.includes('mackerel') || desc.includes('sardine')) nutrients.vitaminD = 10;
    else if (desc.includes('egg')) nutrients.vitaminD = 1;
    else if (desc.includes('fortified') || desc.includes('milk')) nutrients.vitaminD = 3;
    else if (desc.includes('mushroom')) nutrients.vitaminD = 2;

    // ===== VITAMIN E (nuts, seeds, vegetable oils) =====
    if (desc.includes('almond') || desc.includes('sunflower')) nutrients.vitaminE = 7;
    else if (desc.includes('peanut') || desc.includes('hazelnut')) nutrients.vitaminE = 3;
    else if (desc.includes('spinach') || desc.includes('avocado')) nutrients.vitaminE = 2;

    // ===== VITAMIN K (leafy greens, cruciferous vegetables) =====
    if (desc.includes('kale') || desc.includes('spinach') || desc.includes('collard')) nutrients.vitaminK = 400;
    else if (desc.includes('broccoli') || desc.includes('brussels')) nutrients.vitaminK = 100;
    else if (desc.includes('lettuce') || desc.includes('cabbage')) nutrients.vitaminK = 50;

    // ===== CALCIUM (dairy, fortified foods, leafy greens) =====
    if (desc.includes('milk') || desc.includes('yogurt')) nutrients.calcium = 300;
    else if (desc.includes('cheese')) nutrients.calcium = 200;
    else if (desc.includes('sardine') || desc.includes('salmon')) nutrients.calcium = 150;
    else if (desc.includes('tofu') || desc.includes('kale')) nutrients.calcium = 100;

    // ===== PHOSPHORUS (meat, dairy, legumes, nuts) =====
    if (desc.includes('chicken') || desc.includes('turkey') || desc.includes('pork')) nutrients.phosphorus = 200;
    else if (desc.includes('milk') || desc.includes('yogurt') || desc.includes('cheese')) nutrients.phosphorus = 200;
    else if (desc.includes('bean') || desc.includes('lentil') || desc.includes('nut')) nutrients.phosphorus = 150;
    else if (desc.includes('fish')) nutrients.phosphorus = 180;

    // ===== IRON (red meat, legumes, fortified cereals) =====
    if (desc.includes('beef') || desc.includes('steak')) nutrients.iron = 3;
    else if (desc.includes('liver')) nutrients.iron = 6;
    else if (desc.includes('lentil') || desc.includes('bean') || desc.includes('chickpea')) nutrients.iron = 3;
    else if (desc.includes('spinach')) nutrients.iron = 2;
    else if (desc.includes('fortified') || desc.includes('cereal')) nutrients.iron = 4;

    // ===== MAGNESIUM (nuts, seeds, whole grains, dark chocolate) =====
    if (desc.includes('almond') || desc.includes('cashew')) nutrients.magnesium = 80;
    else if (desc.includes('spinach') || desc.includes('dark chocolate')) nutrients.magnesium = 60;
    else if (desc.includes('avocado') || desc.includes('banana')) nutrients.magnesium = 30;
    else if (desc.includes('whole grain') || desc.includes('brown rice')) nutrients.magnesium = 40;

    // ===== MOLYBDENUM (legumes, grains, nuts) =====
    if (desc.includes('lentil') || desc.includes('bean') || desc.includes('chickpea')) nutrients.molybdenum = 45;
    else if (desc.includes('whole grain') || desc.includes('oat')) nutrients.molybdenum = 30;
    else if (desc.includes('nut')) nutrients.molybdenum = 25;

    // ===== POTASSIUM (bananas, potatoes, beans, yogurt) =====
    if (desc.includes('banana')) nutrients.potassium = 400;
    else if (desc.includes('potato') || desc.includes('sweet potato')) nutrients.potassium = 600;
    else if (desc.includes('bean') || desc.includes('lentil')) nutrients.potassium = 350;
    else if (desc.includes('yogurt') || desc.includes('salmon')) nutrients.potassium = 300;
    else if (desc.includes('spinach') || desc.includes('avocado')) nutrients.potassium = 400;

    // ===== SODIUM (salted foods, soups, cheese) =====
    if (desc.includes('soy sauce') || desc.includes('broth') || desc.includes('soup')) nutrients.sodium = 500;
    else if (desc.includes('pickle') || desc.includes('olives')) nutrients.sodium = 300;
    else if (desc.includes('cheese')) nutrients.sodium = 200;
    else if (desc.includes('salt')) nutrients.sodium = 400;

    // ===== CHLORIDE (salted foods, tomatoes, celery) =====
    if (desc.includes('salt') || desc.includes('soy sauce')) nutrients.chloride = 600;
    else if (desc.includes('tomato') || desc.includes('celery')) nutrients.chloride = 150;
    else if (desc.includes('olive') || desc.includes('pickle')) nutrients.chloride = 250;

    // ===== FLUORIDE (tea, fluoridated water, seafood) =====
    if (desc.includes('tea')) nutrients.fluoride = 0.4;
    else if (desc.includes('tap water') || desc.includes('fluoridated')) nutrients.fluoride = 0.7;
    else if (desc.includes('shrimp') || desc.includes('salmon')) nutrients.fluoride = 0.1;

    // ===== ZINC (oysters, beef, crab, beans) =====
    if (desc.includes('oyster')) nutrients.zinc = 30;
    else if (desc.includes('beef') || desc.includes('crab')) nutrients.zinc = 5;
    else if (desc.includes('chicken') || desc.includes('pork')) nutrients.zinc = 2;
    else if (desc.includes('bean') || desc.includes('nut')) nutrients.zinc = 1;

    // ===== COPPER (nuts, shellfish, liver, cocoa) =====
    if (desc.includes('liver')) nutrients.copper = 4;
    else if (desc.includes('oyster') || desc.includes('shellfish')) nutrients.copper = 1;
    else if (desc.includes('cashew') || desc.includes('sunflower') || desc.includes('sesame')) nutrients.copper = 0.6;
    else if (desc.includes('dark chocolate')) nutrients.copper = 0.5;

    // ===== MANGANESE (whole grains, nuts, tea, leafy greens) =====
    if (desc.includes('whole grain') || desc.includes('oat')) nutrients.manganese = 1.5;
    else if (desc.includes('nut') || desc.includes('spinach')) nutrients.manganese = 1;
    else if (desc.includes('tea')) nutrients.manganese = 0.5;

    // ===== SELENIUM (brazil nuts, fish, eggs) =====
    if (desc.includes('brazil')) nutrients.selenium = 70;
    else if (desc.includes('tuna') || desc.includes('salmon')) nutrients.selenium = 40;
    else if (desc.includes('egg')) nutrients.selenium = 15;
    else if (desc.includes('whole grain')) nutrients.selenium = 15;

    // ===== IODINE (seaweed, iodized salt, dairy, fish) =====
    if (desc.includes('seaweed') || desc.includes('kelp')) nutrients.iodine = 150;
    else if (desc.includes('iodized salt')) nutrients.iodine = 70;
    else if (desc.includes('milk') || desc.includes('yogurt')) nutrients.iodine = 40;
    else if (desc.includes('fish')) nutrients.iodine = 35;

    // ===== CHROMIUM (whole grains, broccoli, meats) =====
    if (desc.includes('broccoli')) nutrients.chromium = 15;
    else if (desc.includes('whole grain') || desc.includes('oat')) nutrients.chromium = 10;
    else if (desc.includes('beef') || desc.includes('turkey')) nutrients.chromium = 5;
    else if (desc.includes('grape') || desc.includes('apple')) nutrients.chromium = 4;

    // ===== OMEGA-3 (fatty fish, walnuts, flaxseed) =====
    if (desc.includes('salmon') || desc.includes('mackerel') || desc.includes('sardine')) nutrients.omega3 = 2;
    else if (desc.includes('walnut')) nutrients.omega3 = 2.5;
    else if (desc.includes('flax') || desc.includes('chia')) nutrients.omega3 = 2;
    else if (desc.includes('fish')) nutrients.omega3 = 0.5;

    // ===== OMEGA-6 (vegetable oils, nuts, seeds) =====
    if (desc.includes('sunflower') || desc.includes('safflower') || desc.includes('corn oil')) nutrients.omega6 = 5;
    else if (desc.includes('peanut') || desc.includes('walnut') || desc.includes('almond')) nutrients.omega6 = 3;
    else if (desc.includes('sesame') || desc.includes('pumpkin seed')) nutrients.omega6 = 4;
    else if (desc.includes('olive oil')) nutrients.omega6 = 1;

    // ===== FIBER (whole grains, beans, vegetables, fruits) =====
    if (desc.includes('bean') || desc.includes('lentil')) nutrients.fiber = 8;
    else if (desc.includes('oat') || desc.includes('bran')) nutrients.fiber = 4;
    else if (desc.includes('avocado') || desc.includes('pear') || desc.includes('apple')) nutrients.fiber = 5;
    else if (desc.includes('broccoli') || desc.includes('carrot')) nutrients.fiber = 3;
    else if (desc.includes('whole grain') || desc.includes('whole wheat')) nutrients.fiber = 3;

    // ===== CHOLINE (eggs, liver, soy, poultry) =====
    if (desc.includes('egg')) nutrients.choline = 150;
    else if (desc.includes('liver')) nutrients.choline = 300;
    else if (desc.includes('soy') || desc.includes('tofu')) nutrients.choline = 80;
    else if (desc.includes('chicken') || desc.includes('turkey')) nutrients.choline = 70;
    else if (desc.includes('fish')) nutrients.choline = 60;

    // ===== WATER (water-rich foods and beverages) =====
    if (desc.includes('water')) nutrients.water = 250;
    else if (desc.includes('tea') || desc.includes('coffee')) nutrients.water = 200;
    else if (desc.includes('soup') || desc.includes('broth')) nutrients.water = 250;
    else if (desc.includes('cucumber') || desc.includes('watermelon')) nutrients.water = 150;

    return nutrients;
};

const scaleProfile = (profile: Partial<NutrientProfile>, factor: number): Partial<NutrientProfile> => {
    if (!Number.isFinite(factor) || factor <= 0) return profile;
    const scaled: Partial<NutrientProfile> = {};
    for (const key of NUTRIENT_KEYS) {
        const value = profile[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            scaled[key] = Math.max(0, value * factor);
        }
    }
    return scaled;
};

const scaleDbEntry = (dbEntry: NutritionDbEntry, entry: FoodLogEntry): Partial<NutrientProfile> => {
    if (!dbEntry.basis || !dbEntry.profile) return dbEntry.profile;
    const weightGrams = entry.food?.estimatedWeightGrams;
    const hasWeightGrams = typeof weightGrams === 'number' && Number.isFinite(weightGrams) && weightGrams > 0;

    if (dbEntry.basis === 'per_100g') {
        const grams = hasWeightGrams
            ? weightGrams
            : (dbEntry.servingGrams || 100);
        return scaleProfile(dbEntry.profile, grams / 100);
    }

    if (dbEntry.basis === 'per_serving') {
        if (hasWeightGrams && dbEntry.servingGrams && dbEntry.servingGrams > 0) {
            return scaleProfile(dbEntry.profile, weightGrams / dbEntry.servingGrams);
        }
    }

    return dbEntry.profile;
};

const resolveFoodNutrients = (entry: FoodLogEntry, db: NutritionDb): { nutrients: Partial<NutrientProfile>; hasMicros: boolean } => {
    const direct = entry.food?.micronutrients;
    const confidence = entry.food?.micronutrientsConfidence;
    const cached = nutritionDbService.findEntry(db, entry.food?.foodName || '', entry.food?.ingredients || []);
    if (cached && cached.profile) {
        const hasWeight = Number.isFinite(entry.food?.estimatedWeightGrams) && (entry.food?.estimatedWeightGrams || 0) > 0;
        const directHasMicros = !!direct && Object.keys(direct).length > 0;
        const preferDb =
            !directHasMicros ||
            confidence === 'low' ||
            (cached.source === 'db' && cached.confidence !== 'low' && hasWeight);

        if (preferDb) {
            return { nutrients: scaleDbEntry(cached, entry), hasMicros: true };
        }
    }

    if (direct && Object.keys(direct).length > 0) {
        return { nutrients: direct, hasMicros: true };
    }

    return { nutrients: estimateNutrientsFromFood(entry.food), hasMicros: false };
};

const calculateGaps = (current: Partial<NutrientProfile>, targets: NutrientProfile): NutrientGap[] => {
    const gaps: NutrientGap[] = [];

    for (const key of NUTRIENT_KEYS) {
        const currentValue = current[key] || 0;
        const target = targets[key] || 0;
        const percentage = target > 0 ? Math.round((currentValue / target) * 100) : 0;

        let severity: NutrientGap['severity'];
        if (key === 'sodium') {
            severity = percentage > 100 ? 'excess' : 'good';
        } else if (target <= 0) {
            severity = 'unknown';
        } else if (percentage < 33) {
            severity = 'critical';
        } else if (percentage < 66) {
            severity = 'low';
        } else if (percentage < 90) {
            severity = 'adequate';
        } else if (percentage <= 150) {
            severity = 'good';
        } else {
            severity = 'excess';
        }

        gaps.push({
            nutrient: key,
            displayName: NUTRIENT_DISPLAY_NAMES[key] || key,
            current: Math.round(currentValue * 10) / 10,
            target,
            unit: NUTRIENT_UNITS[key] || '',
            percentage,
            severity,
        });
    }

    return gaps;
};

const calculateOverallScore = (gaps: NutrientGap[]): number => {
    if (gaps.length === 0) return 0;
    const adequateCount = gaps.filter(g => g.severity === 'good' || g.severity === 'adequate').length;
    return Math.round((adequateCount / gaps.length) * 100);
};

// ==================== NUTRITION SERVICE ====================

export const nutritionService = {
    /**
     * Analyze nutrition for a date range
     */
    async analyzeNutrition(
        foodHistory: FoodLogEntry[],
        profile: UserProfile,
        days: number = 7
    ): Promise<NutritionAnalysis> {
        const today = new Date();
        const cutoffDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
        const db = await nutritionDbService.getDb();

        // Filter to date range
        const recentFood = foodHistory.filter(f => new Date(f.timestamp) >= cutoffDate);

        // Calculate daily intakes
        const dailyIntakes: Map<string, Partial<NutrientProfile>> = new Map();
        let foodLogCount = 0;
        let logsWithMicros = 0;

        for (const entry of recentFood) {
            foodLogCount += 1;
            const dateKey = getLocalDateKey(new Date(entry.timestamp));
            const dayNutrients = dailyIntakes.get(dateKey) || {};
            const resolved = resolveFoodNutrients(entry, db);
            if (resolved.hasMicros) logsWithMicros += 1;

            // Add to daily total
            addNutrients(dayNutrients, resolved.nutrients);

            dailyIntakes.set(dateKey, dayNutrients);
        }

        // Hydration per day (from water log)
        const dateKeys = Array.from(dailyIntakes.keys());
        if (dateKeys.length > 0) {
            const waterAmounts = await Promise.all(dateKeys.map((dateKey) => getWaterAmountForDate(dateKey)));
            dateKeys.forEach((dateKey, idx) => {
                const dayNutrients = dailyIntakes.get(dateKey) || {};
                const waterAmount = waterAmounts[idx];
                if (typeof waterAmount === 'number') {
                    dayNutrients.water = waterAmount;
                }
                dailyIntakes.set(dateKey, dayNutrients);
            });
        }

        // Calculate average daily intake
        const targets = getDailyTargets(profile);
        const avgIntake: Partial<NutrientProfile> = {};
        for (const key of NUTRIENT_KEYS) {
            let total = 0;
            for (const dayIntake of dailyIntakes.values()) {
                total += (dayIntake as any)[key] || 0;
            }
            (avgIntake as any)[key] = dailyIntakes.size > 0 ? total / dailyIntakes.size : 0;
        }

        // Calculate gaps
        const gaps = calculateGaps(avgIntake, targets);

        // Calculate deficiency patterns (consecutive days low)
        const deficiencyPatterns: { nutrient: string; daysLow: number }[] = [];
        // (Simplified - would track day by day in real implementation)
        for (const gap of gaps) {
            if (gap.severity === 'critical' || gap.severity === 'low') {
                deficiencyPatterns.push({ nutrient: gap.displayName, daysLow: days });
            }
        }

        // Suggest foods
        const suggestedFoods: { nutrient: string; foods: string[] }[] = [];
        const foodSuggestions: Record<string, string[]> = {
            vitaminA: ['carrots', 'sweet potatoes', 'spinach', 'liver'],
            vitaminB1: ['pork', 'sunflower seeds', 'whole grains', 'beans'],
            vitaminB2: ['milk', 'yogurt', 'eggs', 'almonds'],
            vitaminB3: ['poultry', 'tuna', 'peanuts', 'mushrooms'],
            vitaminB5: ['chicken', 'eggs', 'avocado', 'mushrooms'],
            vitaminB6: ['salmon', 'bananas', 'chickpeas', 'potatoes'],
            vitaminB7: ['eggs', 'almonds', 'sweet potatoes', 'spinach'],
            vitaminB9: ['leafy greens', 'lentils', 'asparagus', 'fortified grains'],
            vitaminB12: ['eggs', 'fish', 'meat', 'fortified cereals'],
            vitaminC: ['oranges', 'peppers', 'strawberries', 'broccoli'],
            vitaminD: ['salmon', 'fortified milk', 'mushrooms', 'sun exposure'],
            vitaminE: ['almonds', 'sunflower seeds', 'spinach', 'avocado'],
            vitaminK: ['kale', 'spinach', 'broccoli', 'cabbage'],
            calcium: ['milk', 'yogurt', 'cheese', 'tofu'],
            chloride: ['tomatoes', 'olives', 'celery', 'sea salt'],
            iron: ['spinach', 'red meat', 'lentils', 'fortified cereals'],
            fluoride: ['fluoridated water', 'tea', 'salmon', 'shrimp'],
            magnesium: ['almonds', 'spinach', 'dark chocolate', 'avocado'],
            molybdenum: ['lentils', 'beans', 'whole grains', 'nuts'],
            phosphorus: ['chicken', 'dairy', 'legumes', 'nuts'],
            potassium: ['bananas', 'potatoes', 'beans', 'yogurt'],
            sodium: ['broth', 'olives', 'cheese', 'salted nuts'],
            zinc: ['oysters', 'beef', 'pumpkin seeds', 'chickpeas'],
            copper: ['cashews', 'sunflower seeds', 'lentils', 'dark chocolate'],
            manganese: ['whole grains', 'nuts', 'spinach', 'tea'],
            selenium: ['brazil nuts', 'tuna', 'eggs', 'whole grains'],
            iodine: ['iodized salt', 'seaweed', 'dairy', 'fish'],
            chromium: ['broccoli', 'whole grains', 'meats', 'grapes'],
            omega3: ['salmon', 'walnuts', 'flaxseed', 'sardines'],
            omega6: ['sunflower oil', 'nuts', 'seeds', 'corn oil'],
            fiber: ['beans', 'oats', 'apples', 'broccoli'],
            choline: ['eggs', 'liver', 'soybeans', 'chicken'],
            water: ['water', 'herbal tea', 'watermelon', 'cucumber'],
        };

        for (const gap of gaps) {
            if ((gap.severity === 'critical' || gap.severity === 'low') && foodSuggestions[gap.nutrient]) {
                suggestedFoods.push({
                    nutrient: gap.displayName,
                    foods: foodSuggestions[gap.nutrient],
                });
            }
        }

        // Calculate overall score
        const adequateCount = gaps.filter(g => g.severity === 'good' || g.severity === 'adequate').length;
        const overallScore = calculateOverallScore(gaps);
        const coverage = foodLogCount > 0 ? Math.round((logsWithMicros / foodLogCount) * 100) : 0;

        return {
            date: getLocalDateKey(today),
            dailyIntake: avgIntake,
            gaps,
            deficiencyPatterns,
            suggestedFoods,
            overallScore,
            coverage,
            foodLogCount,
        };
    },

    /**
     * Build nutrition context string for LLM
     */
    async buildContextForLLM(
        foodHistory: FoodLogEntry[],
        profile: UserProfile,
        days: number = 7
    ): Promise<string> {
        const analysis = await this.analyzeNutrition(foodHistory, profile, days);

        let str = `\n=== NUTRITION ANALYSIS (LAST ${days} DAYS) ===\n`;
        str += `Overall Nutrition Score: ${analysis.overallScore}/100\n\n`;
        if (typeof analysis.coverage === 'number') {
            const logCount = analysis.foodLogCount || 0;
            str += `Micronutrient Coverage: ${analysis.coverage}% (from ${logCount} food logs)\n`;
            if (analysis.coverage < 60) {
                str += `Note: Coverage is low; some gaps may be estimated.\n`;
            }
            str += '\n';
        }

        // Show critical and low nutrients
        const problems = analysis.gaps.filter(g => g.severity === 'critical' || g.severity === 'low');
        if (problems.length > 0) {
            str += 'DEFICIENCIES:\n';
            for (const gap of problems.slice(0, 8)) {
                const icon = gap.severity === 'critical' ? '❌' : '⚠️';
                str += `${icon} ${gap.displayName}: ${gap.current}/${gap.target} ${gap.unit} (${gap.percentage}%)\n`;
            }
            str += '\n';
        }

        // Show adequate nutrients
        const good = analysis.gaps.filter(g => g.severity === 'good');
        if (good.length > 0) {
            str += `ADEQUATE (${good.length}): `;
            str += good.slice(0, 5).map(g => g.displayName).join(', ');
            str += '\n\n';
        }

        // Show patterns
        if (analysis.deficiencyPatterns.length > 0) {
            str += 'CHRONIC DEFICIENCIES:\n';
            for (const p of analysis.deficiencyPatterns.slice(0, 4)) {
                str += `• ${p.nutrient}: Low for ${p.daysLow}+ days\n`;
            }
            str += '\n';
        }

        // Show food suggestions
        if (analysis.suggestedFoods.length > 0) {
            str += 'SUGGESTED FOODS TO ADD:\n';
            for (const s of analysis.suggestedFoods.slice(0, 4)) {
                str += `• For ${s.nutrient}: ${s.foods.slice(0, 3).join(', ')}\n`;
            }
        }

        return str;
    },

    snapshotKey(dateKey: string): string {
        return `ls_nutrient_snapshot_${dateKey}`;
    },

    async getSnapshotForDate(dateKey: string): Promise<NutrientBalanceSnapshot | null> {
        return storage.get<NutrientBalanceSnapshot>(this.snapshotKey(dateKey));
    },

    async buildSnapshotForDate(
        foodHistory: FoodLogEntry[],
        profile: UserProfile,
        dateKey: string
    ): Promise<NutrientBalanceSnapshot> {
        const targets = getDailyTargets(profile);
        const totals: Partial<NutrientProfile> = {};
        const db = await nutritionDbService.getDb();

        let logsWithMicros = 0;
        let lastLogTimestamp = 0;

        for (const entry of foodHistory) {
            const resolved = resolveFoodNutrients(entry, db);
            if (resolved.hasMicros) logsWithMicros += 1;
            addNutrients(totals, resolved.nutrients);
            if (entry.timestamp > lastLogTimestamp) lastLogTimestamp = entry.timestamp;
        }

        const waterAmount = await getWaterAmountForDate(dateKey);
        if (typeof waterAmount === 'number') {
            totals.water = waterAmount;
        }

        const gaps = calculateGaps(totals, targets);
        const overallScore = calculateOverallScore(gaps);
        const coverage = foodHistory.length > 0
            ? Math.round((logsWithMicros / foodHistory.length) * 100)
            : 0;

        return {
            date: dateKey,
            totals,
            targets,
            gaps,
            overallScore,
            coverage,
            foodLogCount: foodHistory.length,
            lastLogTimestamp: foodHistory.length > 0 ? lastLogTimestamp : undefined,
            updatedAt: Date.now(),
        };
    },

    async refreshSnapshotForDate(
        dateKey: string,
        options?: {
            foodHistory?: FoodLogEntry[];
            profile?: UserProfile;
            force?: boolean;
            queueInsights?: boolean;
        }
    ): Promise<NutrientBalanceSnapshot | null> {
        const { foodHistory, profile, force, queueInsights } = options || {};
        const resolvedProfile = profile || await storage.get<UserProfile>(storage.keys.USER);
        if (!resolvedProfile) return null;

        const allFood = foodHistory || await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
        const dayFood = allFood.filter(f => getLocalDateKey(new Date(f.timestamp)) === dateKey);

        const snapshot = await this.buildSnapshotForDate(dayFood, resolvedProfile, dateKey);
        const existing = await this.getSnapshotForDate(dateKey);

        const waterMatch = existing && Math.round(existing.totals?.water || 0) === Math.round(snapshot.totals?.water || 0);
        const isSame =
            !force &&
            existing &&
            existing.foodLogCount === snapshot.foodLogCount &&
            existing.lastLogTimestamp === snapshot.lastLogTimestamp &&
            waterMatch;

        if (isSame && existing) return existing;

        const keepInsights =
            existing &&
            existing.foodLogCount === snapshot.foodLogCount &&
            existing.lastLogTimestamp === snapshot.lastLogTimestamp;

        const updated: NutrientBalanceSnapshot = {
            ...snapshot,
            insights: keepInsights ? existing?.insights : undefined,
        };

        await storage.set(this.snapshotKey(dateKey), updated);

        if (queueInsights !== false) {
            if (!updated.insights && updated.foodLogCount > 0 && updated.coverage >= 30) {
                void this.queueNutritionInsights(dateKey, updated);
            }
        }

        return updated;
    },

    async queueNutritionInsights(dateKey: string, snapshot?: NutrientBalanceSnapshot): Promise<void> {
        try {
            const currentSnapshot = snapshot || await this.getSnapshotForDate(dateKey);
            if (!currentSnapshot) return;
            const { llmQueueService } = await import('./llmQueueService');
            await llmQueueService.addJob('GENERATE_NUTRITION_INSIGHTS', { dateKey, snapshot: currentSnapshot }, 'low');
        } catch (error) {
            console.warn('[NutritionService] Failed to queue nutrition insights:', error);
        }
    },
};

export default nutritionService;
