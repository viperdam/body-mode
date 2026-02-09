import storage from './storageService';
import { FoodAnalysisResult, NutrientProfile } from '../types';
import { seedFoods } from '../data/nutritionSeed';
import nutritionDataService from './nutritionDataService';
import { checkNetworkConnection } from './offlineService';

export type NutritionDbSource = 'llm' | 'db' | 'mixed' | 'estimated';
export type NutritionDbConfidence = 'high' | 'medium' | 'low';
export type NutritionDbBasis = 'per_100g' | 'per_serving' | 'per_unit';

export interface NutritionDbEntry {
    key: string;
    name: string;
    profile: Partial<NutrientProfile>;
    source: NutritionDbSource;
    confidence: NutritionDbConfidence;
    basis?: NutritionDbBasis;
    servingGrams?: number;
    sourceDetail?: 'seed' | 'usda' | 'openfoodfacts' | 'llm' | 'user';
    updatedAt: number;
}

export type NutritionDb = Record<string, NutritionDbEntry>;

const NUTRITION_DB_PENDING_KEY = 'ls_nutrition_db_pending_v1';
const NUTRITION_DB_SEEDED_KEY = 'ls_nutrition_db_seeded_v1';

const NUTRIENT_KEYS = [
    'vitaminA',
    'vitaminB1',
    'vitaminB2',
    'vitaminB3',
    'vitaminB5',
    'vitaminB6',
    'vitaminB7',
    'vitaminB9',
    'vitaminB12',
    'vitaminC',
    'vitaminD',
    'vitaminE',
    'vitaminK',
    'calcium',
    'chloride',
    'iron',
    'fluoride',
    'magnesium',
    'molybdenum',
    'phosphorus',
    'potassium',
    'sodium',
    'zinc',
    'copper',
    'manganese',
    'selenium',
    'iodine',
    'chromium',
    'omega3',
    'omega6',
    'fiber',
    'choline',
    'water',
] as const;

type LocalNutrientKey = (typeof NUTRIENT_KEYS)[number];

const normalizeToken = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const buildKeys = (foodName: string, ingredients?: string[]): string[] => {
    const base = normalizeToken(foodName);
    const keys = new Set<string>();

    if (base) keys.add(`food:${base}`);

    if (ingredients && ingredients.length > 0) {
        const normalizedIngredients = ingredients
            .map(normalizeToken)
            .filter(Boolean)
            .sort();
        if (normalizedIngredients.length > 0) {
            keys.add(`food:${base}|ing:${normalizedIngredients.join(',')}`);
        }
    }

    return Array.from(keys);
};

const buildSeedKeys = (foodName: string, aliases?: string[]): string[] => {
    const keys = new Set<string>();
    const base = normalizeToken(foodName);
    if (base) keys.add(`food:${base}`);
    (aliases || []).forEach((alias) => {
        const normalized = normalizeToken(alias);
        if (normalized) keys.add(`food:${normalized}`);
    });
    return Array.from(keys);
};

const normalizeConfidence = (value?: string): NutritionDbConfidence => {
    if (value === 'high' || value === 'medium' || value === 'low') return value;
    return 'medium';
};

const confidenceWeight = (value?: NutritionDbConfidence): number => {
    switch (value) {
        case 'high':
            return 3;
        case 'medium':
            return 2;
        case 'low':
        default:
            return 1;
    }
};

const mergeConfidence = (primary?: NutritionDbConfidence, fallback?: NutritionDbConfidence): NutritionDbConfidence => {
    const primaryWeight = confidenceWeight(primary);
    const fallbackWeight = confidenceWeight(fallback);
    return primaryWeight >= fallbackWeight ? (primary || 'medium') : (fallback || 'medium');
};

const mergeSource = (primary: NutritionDbSource, fallback?: NutritionDbSource): NutritionDbSource => {
    if (fallback && fallback !== primary) return 'mixed';
    return primary;
};

const sanitizeValue = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return value < 0 ? 0 : value;
};

const hasOwnValue = (obj: Partial<NutrientProfile> | undefined, key: LocalNutrientKey): boolean =>
    !!obj && Object.prototype.hasOwnProperty.call(obj, key);

const sanitizeProfile = (profile?: Partial<NutrientProfile>): Partial<NutrientProfile> => {
    const sanitized: Partial<NutrientProfile> = {};
    for (const key of NUTRIENT_KEYS) {
        const value = sanitizeValue(profile?.[key]);
        if (value !== null) {
            sanitized[key] = value;
        }
    }
    return sanitized;
};

const scaleProfileValues = (profile: Partial<NutrientProfile>, factor: number): Partial<NutrientProfile> => {
    if (!Number.isFinite(factor) || factor <= 0) return profile;
    const scaled: Partial<NutrientProfile> = {};
    for (const key of NUTRIENT_KEYS) {
        const value = profile[key];
        const scaledValue = sanitizeValue(typeof value === 'number' ? value * factor : value);
        if (scaledValue !== null) {
            scaled[key] = scaledValue;
        }
    }
    return scaled;
};

const toPer100gProfile = (profile: Partial<NutrientProfile>, servingGrams: number): Partial<NutrientProfile> => {
    if (!Number.isFinite(servingGrams) || servingGrams <= 0) return profile;
    const factor = 100 / servingGrams;
    return scaleProfileValues(profile, factor);
};

const mergeProfiles = (
    primary: Partial<NutrientProfile>,
    fallback?: Partial<NutrientProfile>
): Partial<NutrientProfile> => {
    const merged: Partial<NutrientProfile> = {};
    for (const key of NUTRIENT_KEYS) {
        if (hasOwnValue(primary, key)) {
            const value = sanitizeValue(primary[key]);
            if (value !== null) {
                merged[key] = value;
            }
        } else if (hasOwnValue(fallback, key)) {
            const value = sanitizeValue(fallback?.[key]);
            if (value !== null) {
                merged[key] = value;
            }
        }
    }
    return merged;
};

const normalizeServingGrams = (value?: number): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return value > 0 ? Math.round(value) : undefined;
};

const parseKey = (key: string): { food: string; ingredients: string[] } | null => {
    if (!key.startsWith('food:')) return null;
    const [foodPart, ingredientPart] = key.split('|ing:');
    const food = foodPart.replace('food:', '');
    const ingredients = ingredientPart ? ingredientPart.split(',').filter(Boolean) : [];
    return { food, ingredients };
};

const findClosestEntry = (
    db: NutritionDb,
    foodName: string,
    ingredients?: string[]
): NutritionDbEntry | null => {
    const base = normalizeToken(foodName);
    if (!base) return null;

    const baseTokens = new Set(base.split(' ').filter(Boolean));
    const ingredientTokens = new Set(
        (ingredients || [])
            .map(normalizeToken)
            .flatMap((value) => value.split(' ').filter(Boolean))
    );

    let bestEntry: NutritionDbEntry | null = null;
    let bestScore = 0;

    for (const entry of Object.values(db)) {
        const parsed = parseKey(entry.key);
        if (!parsed?.food) continue;

        const entryTokens = new Set(parsed.food.split(' ').filter(Boolean));
        let score = 0;

        for (const token of baseTokens) {
            if (entryTokens.has(token)) score += 2;
        }

        if (parsed.food === base) score += 4;
        else if (parsed.food.includes(base) || base.includes(parsed.food)) score += 2;

        if (ingredientTokens.size > 0 && parsed.ingredients.length > 0) {
            const entryIngredientTokens = new Set(
                parsed.ingredients.flatMap((value) => value.split(' ').filter(Boolean))
            );
            for (const token of ingredientTokens) {
                if (entryIngredientTokens.has(token)) score += 1;
            }
        }

        score += confidenceWeight(entry.confidence);

        if (score > bestScore) {
            bestScore = score;
            bestEntry = entry;
        }
    }

    return bestScore > 0 ? bestEntry : null;
};

const shouldSkipRemoteEnrichment = (entry: NutritionDbEntry | null): boolean => {
    if (!entry) return false;
    if (entry.source === 'db' && entry.confidence === 'high' && entry.sourceDetail !== 'seed') return true;
    if (entry.sourceDetail === 'usda' && entry.confidence !== 'low') return true;
    if (entry.sourceDetail === 'openfoodfacts' && entry.confidence !== 'low') return true;
    return false;
};

const pendingRemoteLookups = new Set<string>();
const remoteLookupCooldownMs = 12 * 60 * 60 * 1000;
const lastRemoteLookupAt = new Map<string, number>();

type PendingNutritionLookup = {
    id: string;
    foodName: string;
    ingredients?: string[];
    queuedAt: number;
    retryCount: number;
};

const loadPendingLookups = async (): Promise<PendingNutritionLookup[]> => {
    const stored = await storage.get<PendingNutritionLookup[]>(NUTRITION_DB_PENDING_KEY);
    return Array.isArray(stored) ? stored : [];
};

const savePendingLookups = async (pending: PendingNutritionLookup[]): Promise<void> => {
    await storage.set(NUTRITION_DB_PENDING_KEY, pending);
};

const enqueueLookup = async (foodName: string, ingredients?: string[]): Promise<void> => {
    const pending = await loadPendingLookups();
    const key = normalizeToken(foodName);
    if (!key) return;
    const existing = pending.find((item) => normalizeToken(item.foodName) === key);
    if (existing) return;

    pending.push({
        id: `nutrition_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        foodName,
        ingredients,
        queuedAt: Date.now(),
        retryCount: 0,
    });

    await savePendingLookups(pending);
};

export const nutritionDbService = {
    async getDb(): Promise<NutritionDb> {
        const db = await storage.get<NutritionDb>(storage.keys.NUTRITION_DB);
        return db || {};
    },

    async saveDb(db: NutritionDb): Promise<void> {
        await storage.set(storage.keys.NUTRITION_DB, db);
    },

    findEntry(db: NutritionDb, foodName: string, ingredients?: string[]): NutritionDbEntry | null {
        const keys = buildKeys(foodName, ingredients);
        for (const key of keys) {
            const entry = db[key];
            if (entry) return entry;
        }
        return findClosestEntry(db, foodName, ingredients);
    },

    async ensureSeeded(): Promise<void> {
        const seeded = await storage.get<boolean>(NUTRITION_DB_SEEDED_KEY);
        if (seeded) return;

        const db = await this.getDb();
        let added = 0;

        for (const seed of seedFoods) {
            const keys = buildSeedKeys(seed.name, seed.aliases);
            if (keys.length === 0) continue;

            const entry: NutritionDbEntry = {
                key: keys[0],
                name: seed.name,
                profile: sanitizeProfile(seed.profile),
                source: 'db',
                confidence: seed.confidence ?? 'medium',
                basis: seed.basis,
                servingGrams: normalizeServingGrams(seed.servingGrams),
                sourceDetail: 'seed',
                updatedAt: Date.now(),
            };

            for (const key of keys) {
                if (!db[key]) {
                    db[key] = { ...entry, key };
                    added += 1;
                }
            }
        }

        if (added > 0) {
            await this.saveDb(db);
        }
        await storage.set(NUTRITION_DB_SEEDED_KEY, true);
    },

    async upsertFromFood(food: FoodAnalysisResult): Promise<void> {
        const micronutrients = food.micronutrients;
        if (!micronutrients || Object.keys(micronutrients).length === 0) return;

        const keys = buildKeys(food.foodName, food.ingredients);
        if (keys.length === 0) return;

        const db = await this.getDb();
        const existing = this.findEntry(db, food.foodName, food.ingredients);
        const source = food.nutritionSource || 'llm';
        const estimatedGrams = normalizeServingGrams(food.estimatedWeightGrams);
        const isPer100g = existing?.basis === 'per_100g';

        if (isPer100g && !estimatedGrams) {
            return;
        }

        const normalizedMicros = isPer100g && estimatedGrams
            ? toPer100gProfile(micronutrients, estimatedGrams)
            : micronutrients;

        const mergedSource = mergeSource(existing?.source || source, source);
        const mergedConfidence = mergeConfidence(
            normalizeConfidence(food.micronutrientsConfidence),
            existing?.confidence
        );

        const entry: NutritionDbEntry = {
            key: keys[0],
            name: food.foodName,
            profile: existing
                ? isPer100g
                    ? mergeProfiles(existing.profile, normalizedMicros)
                    : mergeProfiles(normalizedMicros, existing.profile)
                : sanitizeProfile(normalizedMicros),
            source: mergedSource,
            confidence: mergedConfidence,
            basis: isPer100g ? 'per_100g' : 'per_serving',
            servingGrams: isPer100g ? 100 : estimatedGrams || existing?.servingGrams,
            sourceDetail: existing?.sourceDetail || 'llm',
            updatedAt: Date.now(),
        };

        for (const key of keys) {
            db[key] = { ...entry, key };
        }

        await this.saveDb(db);
    },

    async enrichFromRemote(food: FoodAnalysisResult): Promise<boolean> {
        const foodName = food.foodName;
        if (!foodName) return false;

        const lookupKey = normalizeToken(foodName);
        if (!lookupKey || pendingRemoteLookups.has(lookupKey)) return false;

        const lastLookup = lastRemoteLookupAt.get(lookupKey);
        if (lastLookup && Date.now() - lastLookup < remoteLookupCooldownMs) {
            return false;
        }

        const isOnline = await checkNetworkConnection();
        if (!isOnline) {
            await enqueueLookup(foodName, food.ingredients);
            return false;
        }

        const db = await this.getDb();
        const existing = this.findEntry(db, foodName, food.ingredients);
        if (shouldSkipRemoteEnrichment(existing)) return false;

        pendingRemoteLookups.add(lookupKey);
        try {
            const lookup = await nutritionDataService.lookupExternalNutrition(foodName, food.ingredients);
            if (!lookup) return false;

            const keys = buildKeys(foodName, food.ingredients);
            if (keys.length === 0) return false;

            const mergedProfile = existing
                ? mergeProfiles(lookup.profile, existing.profile)
                : sanitizeProfile(lookup.profile);

            const entry: NutritionDbEntry = {
                key: keys[0],
                name: lookup.name || foodName,
                profile: mergedProfile,
                source: mergeSource('db', existing?.source),
                confidence: mergeConfidence(lookup.confidence, existing?.confidence),
                basis: lookup.basis,
                servingGrams: normalizeServingGrams(lookup.servingGrams) || existing?.servingGrams,
                sourceDetail: lookup.sourceDetail,
                updatedAt: Date.now(),
            };

            for (const key of keys) {
                db[key] = { ...entry, key };
            }

            await this.saveDb(db);
            return true;
        } catch (error) {
            console.warn('[NutritionDb] Remote enrichment failed:', error);
            return false;
        } finally {
            pendingRemoteLookups.delete(lookupKey);
            lastRemoteLookupAt.set(lookupKey, Date.now());
        }
    },

    async processPendingLookups(): Promise<void> {
        const isOnline = await checkNetworkConnection();
        if (!isOnline) return;

        const pending = await loadPendingLookups();
        if (pending.length === 0) return;

        const db = await this.getDb();
        const remaining: PendingNutritionLookup[] = [];

        for (const item of pending) {
            const existing = this.findEntry(db, item.foodName, item.ingredients);
            if (shouldSkipRemoteEnrichment(existing)) {
                continue;
            }

            const result = await this.enrichFromRemote({
                foodName: item.foodName,
                ingredients: item.ingredients || [],
                description: item.foodName,
                macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
                healthGrade: 'B',
                confidence: 'Low',
                advice: '',
            });

            if (!result) {
                const retryCount = item.retryCount + 1;
                if (retryCount < 5) {
                    remaining.push({ ...item, retryCount });
                }
            }
        }

        await savePendingLookups(remaining);
    },
};

export default nutritionDbService;
