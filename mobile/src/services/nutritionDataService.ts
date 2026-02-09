import { NutrientKey, NutrientProfile } from '../types';
import { checkNetworkConnection } from './offlineService';

export type ExternalNutritionResult = {
    name: string;
    profile: Partial<NutrientProfile>;
    basis: 'per_100g';
    servingGrams: number;
    confidence: 'high' | 'medium' | 'low';
    sourceDetail: 'usda' | 'openfoodfacts';
};

const NUTRIENT_UNITS: Record<NutrientKey, string> = {
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

const normalizeUnit = (unit?: string): string => (unit || '').toLowerCase().replace(/\s/g, '');

const convertToTargetUnit = (value: number, fromUnit: string, targetUnit: string): number | null => {
    if (!Number.isFinite(value)) return null;
    const from = normalizeUnit(fromUnit) || normalizeUnit(targetUnit);
    const to = normalizeUnit(targetUnit);

    const toGrams = (): number | null => {
        if (from === 'g' || from === 'gram' || from === 'grams') return value;
        if (from === 'kg') return value * 1000;
        if (from === 'mg') return value / 1000;
        if (from === 'ug' || from === 'mcg') return value / 1000000;
        if (from === 'ml') return value; // assume water density
        return null;
    };

    const grams = toGrams();
    if (grams === null) return null;

    if (to === 'g') return grams;
    if (to === 'mg') return grams * 1000;
    if (to === 'mcg' || to === 'ug') return grams * 1000000;
    if (to === 'ml') return grams;

    return null;
};

const addValue = (profile: Partial<NutrientProfile>, key: NutrientKey, value: number | null) => {
    if (value === null || !Number.isFinite(value)) return;
    profile[key] = (profile[key] || 0) + value;
};

const normalizeName = (value?: string): string =>
    (value || '').toLowerCase().replace(/\s+/g, ' ').trim();

const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY;
const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

const USDA_NAME_MAP: Record<string, NutrientKey> = {
    'vitamin a, rae': 'vitaminA',
    'thiamin': 'vitaminB1',
    'riboflavin': 'vitaminB2',
    'niacin': 'vitaminB3',
    'pantothenic acid': 'vitaminB5',
    'vitamin b-6': 'vitaminB6',
    'biotin': 'vitaminB7',
    'folate, total': 'vitaminB9',
    'folate, dfe': 'vitaminB9',
    'folate, food': 'vitaminB9',
    'vitamin b-12': 'vitaminB12',
    'vitamin c, total ascorbic acid': 'vitaminC',
    'vitamin d (d2 + d3)': 'vitaminD',
    'vitamin d': 'vitaminD',
    'vitamin e (alpha-tocopherol)': 'vitaminE',
    'vitamin k (phylloquinone)': 'vitaminK',
    'calcium, ca': 'calcium',
    'chloride, cl': 'chloride',
    'iron, fe': 'iron',
    'fluoride, f': 'fluoride',
    'magnesium, mg': 'magnesium',
    'molybdenum, mo': 'molybdenum',
    'phosphorus, p': 'phosphorus',
    'potassium, k': 'potassium',
    'sodium, na': 'sodium',
    'zinc, zn': 'zinc',
    'copper, cu': 'copper',
    'manganese, mn': 'manganese',
    'selenium, se': 'selenium',
    'iodine, i': 'iodine',
    'chromium, cr': 'chromium',
    'fiber, total dietary': 'fiber',
    'choline, total': 'choline',
    'water': 'water',
    'fatty acids, total omega-3': 'omega3',
    'fatty acids, total omega-6': 'omega6',
};

const isOmega3Name = (name: string): boolean => name.includes('omega-3') || name.includes('n-3');
const isOmega6Name = (name: string): boolean => name.includes('omega-6') || name.includes('n-6');

const buildUsdaProfile = (foodNutrients: any[]): Partial<NutrientProfile> => {
    const profile: Partial<NutrientProfile> = {};

    for (const nutrientEntry of foodNutrients || []) {
        const nutrient = nutrientEntry.nutrient || nutrientEntry;
        const name = normalizeName(nutrient.name || nutrientEntry.name);
        const unit = nutrient.unitName || nutrientEntry.unitName || '';
        const amount = nutrientEntry.amount ?? nutrient.amount;
        if (!Number.isFinite(amount)) continue;

        const mappedKey = USDA_NAME_MAP[name];
        if (mappedKey) {
            const targetUnit = NUTRIENT_UNITS[mappedKey];
            const converted = convertToTargetUnit(amount, unit, targetUnit);
            addValue(profile, mappedKey, converted);
            continue;
        }

        if (isOmega3Name(name)) {
            const converted = convertToTargetUnit(amount, unit, NUTRIENT_UNITS.omega3);
            addValue(profile, 'omega3', converted);
        } else if (isOmega6Name(name)) {
            const converted = convertToTargetUnit(amount, unit, NUTRIENT_UNITS.omega6);
            addValue(profile, 'omega6', converted);
        }
    }

    return profile;
};

const fetchUsdaNutrition = async (query: string): Promise<ExternalNutritionResult | null> => {
    if (!USDA_API_KEY) return null;

    const searchUrl = `${USDA_BASE_URL}/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=5`;
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) return null;

    const searchJson = await searchResponse.json();
    const foods = Array.isArray(searchJson.foods) ? searchJson.foods : [];
    if (foods.length === 0) return null;

    const selected = foods[0];
    const fdcId = selected.fdcId;
    if (!fdcId) return null;

    const detailResponse = await fetch(`${USDA_BASE_URL}/food/${fdcId}?api_key=${USDA_API_KEY}`);
    if (!detailResponse.ok) return null;

    const detailJson = await detailResponse.json();
    const nutrients = detailJson.foodNutrients || selected.foodNutrients || [];
    const profile = buildUsdaProfile(nutrients);
    if (Object.keys(profile).length === 0) return null;

    return {
        name: detailJson.description || selected.description || query,
        profile,
        basis: 'per_100g',
        servingGrams: 100,
        confidence: 'high',
        sourceDetail: 'usda',
    };
};

const readOpenFoodFactsValue = (nutriments: any, key: string): { value: number | null; unit: string } => {
    const rawValue = nutriments?.[`${key}_100g`] ?? nutriments?.[key];
    const numericValue = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
    const unit = nutriments?.[`${key}_unit`] ?? nutriments?.[`${key}_100g_unit`] ?? nutriments?.[`${key}_unit`] ?? '';
    return { value: Number.isFinite(numericValue) ? numericValue : null, unit: unit || '' };
};

const getOpenFoodFactsNutrient = (nutriments: any, keys: string[]): { value: number | null; unit: string } => {
    for (const key of keys) {
        const result = readOpenFoodFactsValue(nutriments, key);
        if (result.value !== null) return result;
    }
    return { value: null, unit: '' };
};

const buildOpenFoodFactsProfile = (nutriments: any): Partial<NutrientProfile> => {
    const profile: Partial<NutrientProfile> = {};
    const mapValue = (key: NutrientKey, keys: string[]) => {
        const { value, unit } = getOpenFoodFactsNutrient(nutriments, keys);
        if (value === null) return;
        const converted = convertToTargetUnit(value, unit, NUTRIENT_UNITS[key]);
        addValue(profile, key, converted);
    };

    mapValue('vitaminA', ['vitamin-a', 'vitamin_a']);
    mapValue('vitaminB1', ['vitamin-b1', 'vitamin_b1']);
    mapValue('vitaminB2', ['vitamin-b2', 'vitamin_b2']);
    mapValue('vitaminB3', ['vitamin-b3', 'vitamin_b3', 'niacin']);
    mapValue('vitaminB5', ['vitamin-b5', 'vitamin_b5', 'pantothenic-acid']);
    mapValue('vitaminB6', ['vitamin-b6', 'vitamin_b6']);
    mapValue('vitaminB7', ['vitamin-b7', 'vitamin_b7', 'biotin']);
    mapValue('vitaminB9', ['vitamin-b9', 'vitamin_b9', 'folates', 'folate']);
    mapValue('vitaminB12', ['vitamin-b12', 'vitamin_b12']);
    mapValue('vitaminC', ['vitamin-c', 'vitamin_c']);
    mapValue('vitaminD', ['vitamin-d', 'vitamin_d']);
    mapValue('vitaminE', ['vitamin-e', 'vitamin_e']);
    mapValue('vitaminK', ['vitamin-k', 'vitamin_k']);
    mapValue('calcium', ['calcium']);
    mapValue('chloride', ['chloride']);
    mapValue('iron', ['iron']);
    mapValue('fluoride', ['fluoride']);
    mapValue('magnesium', ['magnesium']);
    mapValue('molybdenum', ['molybdenum']);
    mapValue('phosphorus', ['phosphorus']);
    mapValue('potassium', ['potassium']);
    mapValue('sodium', ['sodium']);
    mapValue('zinc', ['zinc']);
    mapValue('copper', ['copper']);
    mapValue('manganese', ['manganese']);
    mapValue('selenium', ['selenium']);
    mapValue('iodine', ['iodine']);
    mapValue('chromium', ['chromium']);
    mapValue('omega3', ['omega-3', 'omega_3', 'omega-3-fat', 'omega_3_fat']);
    mapValue('omega6', ['omega-6', 'omega_6', 'omega-6-fat', 'omega_6_fat']);
    mapValue('fiber', ['fiber']);
    mapValue('choline', ['choline']);
    mapValue('water', ['water']);

    return profile;
};

const fetchOpenFoodFactsNutrition = async (query: string): Promise<ExternalNutritionResult | null> => {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=1`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const json = await response.json();
    const product = Array.isArray(json.products) ? json.products[0] : null;
    if (!product || !product.nutriments) return null;

    const profile = buildOpenFoodFactsProfile(product.nutriments);
    if (Object.keys(profile).length === 0) return null;

    return {
        name: product.product_name || query,
        profile,
        basis: 'per_100g',
        servingGrams: 100,
        confidence: 'medium',
        sourceDetail: 'openfoodfacts',
    };
};

let warnedMissingUsdaKey = false;

const resolveProviderOrder = (): Array<'usda' | 'openfoodfacts'> => {
    const preferred = (process.env.EXPO_PUBLIC_NUTRITION_DB_PROVIDER || '').toLowerCase();
    if (preferred === 'usda' && !USDA_API_KEY && !warnedMissingUsdaKey) {
        warnedMissingUsdaKey = true;
        console.warn('[NutritionData] USDA provider selected but EXPO_PUBLIC_USDA_API_KEY is missing. Falling back to OpenFoodFacts.');
    }
    if (preferred === 'openfoodfacts') return ['openfoodfacts', 'usda'];
    if (preferred === 'usda') return ['usda', 'openfoodfacts'];
    if (USDA_API_KEY) return ['usda', 'openfoodfacts'];
    return ['openfoodfacts'];
};

const nutritionDataService = {
    async lookupExternalNutrition(foodName: string, ingredients?: string[]): Promise<ExternalNutritionResult | null> {
        const isOnline = await checkNetworkConnection();
        if (!isOnline) return null;

        const query = [foodName, ...(ingredients || [])].filter(Boolean).join(' ');
        if (!query.trim()) return null;

        const providerOrder = resolveProviderOrder();

        for (const provider of providerOrder) {
            try {
                if (provider === 'usda') {
                    const result = await fetchUsdaNutrition(query);
                    if (result) return result;
                } else {
                    const result = await fetchOpenFoodFactsNutrition(query);
                    if (result) return result;
                }
            } catch (error) {
                console.warn(`[NutritionData] ${provider} lookup failed:`, error);
            }
        }

        return null;
    },
};

export default nutritionDataService;
