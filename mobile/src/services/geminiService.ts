// Gemini AI Service for React Native
// Uses @google/genai which works with HTTP fetch (RN compatible)
// SECURITY: Now proxied through Netlify serverless functions

import { Type, Schema } from "@google/genai";
import { callNetlifyGemini, callNetlifyGeminiWithUpload, GeminiUploadPayload } from "./netlifyGeminiService";
import { isDirectUploadAvailable, uploadGeminiFile } from "./geminiUploadService";
import {
    FoodAnalysisResult, UserProfile, FoodLogEntry, MoodLog,
    WeightLogEntry, AppContext, DailyPlan, Language,
    ActivityLogEntry, DailyWrapUp, CookingMood, Recipe,
    NutrientBalanceSnapshot, NutritionInsight,
    BioSnapshot, BioTrend, BodyScanAnalysis
} from "../types";
import {
    COACH_PERSONA, FOOD_ANALYSIS_PROMPT, TEXT_FOOD_ANALYSIS_PROMPT,
    DAILY_PLAN_PROMPT, SLEEP_ANALYSIS_PROMPT, SUMMARIZATION_PROMPT,
    INGREDIENTS_DETECTION_PROMPT, RECIPE_GENERATION_PROMPT,
    PROFILE_CALCULATION_PROMPT, REFINED_FOOD_ANALYSIS_PROMPT,
    DAILY_WRAPUP_PROMPT, ACTIVITY_ANALYSIS_PROMPT, NUTRITION_INSIGHTS_PROMPT,
    BODY_PROGRESS_PROMPT
} from "../prompts/aiPrompts";
import { getLocalDateKey, getLocalTime } from "../utils/dateUtils";
import { normalizePlan } from "./planNormalization";
import i18n from "../i18n";
import { calculateBioLoad } from "./bioEngine";
import { computeBioTrends, computeDailyBioSummary, formatBioContextForPrompt } from "./bioAlgorithms";
import { formatDistanceMeters, formatWeightKg } from "../utils/unitFormat";
import { getBioContextForAppContext } from "./healthContextService";
import locationService from "./locationService";
import { getWeatherSnapshot, WEATHER_SNAPSHOT_TTL_MS } from "./weatherService";
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';

const normalizeModelName = (model?: string | null): string | undefined => {
    if (!model) return undefined;
    const trimmed = model.trim();
    if (!trimmed) return undefined;
    return trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed;
};

const estimateBytesFromBase64 = (dataBase64: string): number => {
    if (!dataBase64 || typeof dataBase64 !== 'string') return 0;
    const padding = dataBase64.endsWith('==') ? 2 : dataBase64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((dataBase64.length * 3) / 4) - padding);
};

const INLINE_MEDIA_MAX_BYTES = 4 * 1024 * 1024;
const buildFileDataContents = (fileUri: string, mimeType: string, text: string) => ({
    parts: [{ fileData: { fileUri, mimeType } }, { text }],
});
const guessImageMimeType = (uri: string): string => {
    const lower = (uri || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
    return 'image/jpeg';
};

const getDirectApiKey = (): string => {
    const directKey = process.env.EXPO_PUBLIC_GEMINI_UPLOAD_KEY;
    if (directKey && directKey.length > 10) return directKey;
    const fallbackKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (fallbackKey && fallbackKey.length > 10) return fallbackKey;
    return '';
};

const normalizeSystemInstruction = (instruction: any) => {
    if (!instruction) return undefined;
    if (typeof instruction === 'string') {
        return { parts: [{ text: instruction }] };
    }
    if (instruction.parts && Array.isArray(instruction.parts)) {
        const { role, ...rest } = instruction;
        return { parts: rest.parts };
    }
    if (instruction.text) {
        return { parts: [{ text: instruction.text }] };
    }
    const { role, ...rest } = instruction || {};
    return rest;
};

const callGeminiDirect = async (
    model: string,
    contents: any,
    config: any = {},
    timeout: number = 45000
): Promise<any> => {
    const apiKey = getDirectApiKey();
    if (!apiKey) {
        throw new Error(i18n.t('errors.llm.api_key_missing'));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const normalizeContents = (input: any) => {
            if (!input) return input;
            if (Array.isArray(input)) return input;
            if (typeof input === 'string') {
                return [{ role: 'user', parts: [{ text: input }] }];
            }
            if (Array.isArray(input.parts)) {
                return [{ role: 'user', parts: input.parts }];
            }
            return input;
        };

        const requestBody: any = {
            contents: normalizeContents(contents),
            generationConfig: config.generationConfig || {},
            safetySettings: config.safetySettings || [],
        };

        if (config.systemInstruction) {
            requestBody.systemInstruction = normalizeSystemInstruction(config.systemInstruction);
        }

        if (config.responseMimeType) {
            requestBody.generationConfig.responseMimeType = config.responseMimeType;
        }

        if (config.responseSchema) {
            requestBody.generationConfig.responseSchema = config.responseSchema;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(i18n.t('errors.llm.api_error', { status: response.status, details: errorText }));
        }

        const result = await response.json();
        if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
            result.text = result.candidates[0].content.parts[0].text;
        }
        return result;
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(i18n.t('errors.llm.timeout'));
        }
        if (error.message?.includes('fetch failed') || error.message?.includes('Network request failed')) {
            throw new Error(i18n.t('errors.llm.network'));
        }
        throw error;
    }
};

// Model fallback chain (in order):
// 1. gemini-3-flash-preview (primary - latest and most capable)
// 2. gemini-flash-latest (fast fallback)
// 3. gemini-flash-lite-latest (lightweight fallback)
// 4. gemini-robotics-er-1.5-preview (last resort)
const envModel = normalizeModelName(process.env.EXPO_PUBLIC_GEMINI_MODEL);
const DEFAULT_MODEL = envModel || 'gemini-3-flash-preview';

// Primary fallback when main model hits quota
const FALLBACK_MODEL = normalizeModelName(process.env.EXPO_PUBLIC_GEMINI_FALLBACK_MODEL) || 'gemini-flash-latest';

// Extra fallbacks when all above hit per-model quota
const EXTRA_FALLBACK_MODELS: string[] = [
    'gemini-flash-lite-latest',
    'gemini-robotics-er-1.5-preview',
];

import { analytics } from './analyticsService';

type GenerateParams = {
    contents: any;
    config?: any;
    model?: string;
    upload?: GeminiUploadPayload;
    useDirect?: boolean;
};

// ============ GLOBAL RATE LIMIT COOLDOWN ============
// When we hit 429, set a cooldown period to prevent API spam
let globalRateLimitCooldownUntil = 0;
const MIN_COOLDOWN_MS = 30000; // At least 30 seconds after any 429

/**
 * Check if we're in a rate limit cooldown period
 */
export const isRateLimited = (): boolean => {
    return Date.now() < globalRateLimitCooldownUntil;
};

/**
 * Get remaining cooldown time in ms
 */
export const getRateLimitRemainingMs = (): number => {
    return Math.max(0, globalRateLimitCooldownUntil - Date.now());
};

/**
 * Set rate limit cooldown (used when we get a 429)
 */
const setRateLimitCooldown = (retryAfterMs?: number): void => {
    const cooldownMs = Math.max(MIN_COOLDOWN_MS, retryAfterMs || MIN_COOLDOWN_MS);
    globalRateLimitCooldownUntil = Date.now() + cooldownMs;
    console.log(`[Gemini] Rate limited for ${Math.round(cooldownMs / 1000)}s`);
};

// Error classification helpers
const parseStatusFromMessage = (error: any): number | null => {
    const message = typeof error?.message === 'string' ? error.message : '';
    if (!message) return null;
    const match = message.match(/\b(4\d{2}|5\d{2})\b/);
    if (match) {
        const status = Number(match[1]);
        return Number.isFinite(status) ? status : null;
    }
    if (message.toLowerCase().includes('unavailable')) return 503;
    if (message.toLowerCase().includes('overloaded')) return 503;
    return null;
};

const isQuotaError = (error: any) => {
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    const status = error?.status || error?.code || parseStatusFromMessage(error);
    return status === 429 || message.includes('quota') || message.includes('rate') || message.includes('resource_exhausted');
};


const isModelAccessError = (error: any) => {
    const status = error?.status || error?.code || parseStatusFromMessage(error);
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    return (
        status === 401 ||
        status === 403 ||
        status === 404 ||
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('permission') ||
        (message.includes('model') && message.includes('not found'))
    );
};

const isNetworkError = (error: any) => {
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('fetch failed') ||
        message.includes('aborted') ||
        error?.name === 'AbortError' ||
        error?.name === 'TypeError' // Usually network issues in fetch
    );
};

const isServerError = (error: any) => {
    const status = error?.status || error?.code || parseStatusFromMessage(error);
    return status >= 500 && status < 600;
};

const isRetryableError = (error: any) => {
    return isNetworkError(error) || isServerError(error) || isQuotaError(error);
};

const parseRetryDelaySeconds = (value: unknown): number | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d+(?:\.\d+)?)s$/);
    if (!match) return null;
    const seconds = Number(match[1]);
    if (Number.isNaN(seconds) || seconds <= 0) return null;
    return seconds;
};

const getRetryAfterMs = (error: any): number | null => {
    // Try Google RPC RetryInfo first
    const details = error?.error?.details || error?.details;
    if (Array.isArray(details)) {
        const retryInfo = details.find((d: any) => d?.retryDelay);
        const seconds = parseRetryDelaySeconds(retryInfo?.retryDelay);
        if (seconds) return Math.ceil(seconds * 1000);
    }

    // Fallback to parsing the message
    const message = typeof error?.message === 'string' ? error.message : '';
    const match = message.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
    if (match) {
        const seconds = Number(match[1]);
        if (!Number.isNaN(seconds) && seconds > 0) return Math.ceil(seconds * 1000);
    }
    return null;
};

// Exponential backoff delay calculation
const getBackoffDelay = (attempt: number, baseDelay: number = 1000): number => {
    // Exponential backoff with jitter: baseDelay * 2^attempt + random jitter
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
};

// Sleep utility
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface RetryConfig {
    maxRetries: number;
    baseDelay: number;
    requestTimeoutMs: number;
    onRetry?: (attempt: number, error: any) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    requestTimeoutMs: 45000,
};

/**
 * Smart content generation with retry logic for network issues
 * - Retries on network errors, timeouts, and 5xx server errors
 * - Falls back to FALLBACK_MODEL on quota errors
 * - Uses exponential backoff between retries
 */
const generateContentSmart = async (
    params: Omit<GenerateParams, 'model'> & { model?: string },
    retryConfig: Partial<RetryConfig> = {}
) => {
    // SECURITY NOTE: API key check removed - now handled by Netlify serverless function
    // The API key is stored securely on the server and never exposed to the client

    // Check global rate limit cooldown
    if (isRateLimited()) {
        const remainingMs = getRateLimitRemainingMs();
        console.log(`[Gemini] Blocked by rate limit cooldown (${Math.round(remainingMs / 1000)}s remaining)`);
        throw new Error(i18n.t('errors.llm.rate_limit_seconds', { seconds: Math.round(remainingMs / 1000) }));
    }

    const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    const requestedModel = normalizeModelName(params.model);

    // Build the candidate chain
    // If a specific model was requested, try that first.
    // Otherwise start with DEFAULT > FALLBACK > EXTRAS
    let candidateModels: string[] = [];

    if (requestedModel) {
        candidateModels = [requestedModel];
        // If the requested model fails, we still want to fall back to others 
        // unless it's a very specific capability model.
        // For general tasks like "generate plan", falling back is safe.
        if (requestedModel !== DEFAULT_MODEL) candidateModels.push(DEFAULT_MODEL);
        candidateModels.push(FALLBACK_MODEL);
        candidateModels.push(...EXTRA_FALLBACK_MODELS);
    } else {
        candidateModels = [DEFAULT_MODEL, FALLBACK_MODEL, ...EXTRA_FALLBACK_MODELS];
    }

    // Deduplicate
    candidateModels = Array.from(new Set(candidateModels.map(m => normalizeModelName(m)!))).filter(Boolean);

    let lastError: any;

    // Combined loop: Attempts * Models
    // We try to switch models faster than we retry the same model

    for (let modelIndex = 0; modelIndex < candidateModels.length; modelIndex++) {
        const currentModel = candidateModels[modelIndex];

        // For each model, we allow a few retries (for network blips)
        // But if it's a 404/403/429, we fail over to the next model immediately
        const modelRetries = 2;

        for (let attempt = 0; attempt <= modelRetries; attempt++) {
            try {
                const attemptConfig = params.config || {};
                const timeoutMs = config.requestTimeoutMs;

                if (__DEV__) {
                    console.log(`[Gemini] Trying ${currentModel} (Attempt ${attempt + 1}/${modelRetries + 1})`);
                }

                const useDirect = params.useDirect === true;
                const result = useDirect
                    ? await callGeminiDirect(
                        currentModel,
                        params.contents,
                        attemptConfig,
                        timeoutMs
                    )
                    : params.upload
                        ? await callNetlifyGeminiWithUpload(
                            currentModel,
                            params.contents,
                            params.upload,
                            attemptConfig,
                            timeoutMs
                        )
                        : await callNetlifyGemini(
                            currentModel,
                            params.contents,
                            attemptConfig,
                            timeoutMs
                        );

                return result; // Success!

            } catch (error: any) {
                lastError = error;

                const isQuota = isQuotaError(error);
                const isAccess = isModelAccessError(error);
                const isNet = isNetworkError(error);
                const isServer = isServerError(error);

                // LOGGING
                analytics.logWarning(
                    `Gemini attempt failed`,
                    'GeminiService',
                    { model: currentModel, attempt, errorType: error?.name, status: error?.status }
                );

                // DECISION MATRIX

                // 1. Critical Model Failure (404, 403, 429) -> BREAK to next model immediately
                if (isQuota || isAccess) {
                    console.warn(`[Gemini] ${currentModel} failed with ${isQuota ? 'QUOTA' : 'ACCESS'} error. Switching model...`);

                    // If this was the last model, set global cooldown if it was a quota error
                    if (modelIndex === candidateModels.length - 1 && isQuota) {
                        const retryAfter = getRetryAfterMs(error);
                        setRateLimitCooldown(retryAfter ?? undefined);
                    }
                    break; // Break execution loop for THIS model, proceed to next model in outer loop
                }

                // 2. Transiennt Network/Server Error -> Wait and Retry SAME model
                if (isNet || isServer) {
                    if (attempt < modelRetries) {
                        const delay = getBackoffDelay(attempt, config.baseDelay);
                        console.log(`[Gemini] Network/Server error on ${currentModel}. Retrying in ${delay}ms...`);
                        await sleep(delay);
                        continue; // Retry same model
                    } else {
                        // Exhausted retries for this model, try next model if available
                        console.warn(`[Gemini] Exhausted retries for ${currentModel}. Moving to next model...`);
                        break; // Break inner loop, go to outer loop
                    }
                }

                // 3. Unknown/Client Error (400) -> Fatal, do not retry
                throw error;
            }
        }
    }

    // If we get here, all models failed
    console.error('[Gemini] All models exhausted.');
    throw lastError;
};

const nowDateKey = () => getLocalDateKey(new Date());
const normalizeTime = (time?: string) => {
    if (!time) return null;
    const trimmed = time.trim();
    const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const resolveFallbackAppContext = async (): Promise<AppContext> => {
    try {
        const lastLocation = await locationService.getLastKnownLocation();
        const coords = lastLocation
            ? { lat: lastLocation.lat, lng: lastLocation.lng }
            : undefined;
        const snapshot = await getWeatherSnapshot({
            coords,
            maxAgeMs: WEATHER_SNAPSHOT_TTL_MS,
        });
        return {
            weather: snapshot?.weather || { temp: 20, condition: 'Unknown', code: 0 },
            currentLocation: snapshot?.locationName || 'Unknown',
        };
    } catch (error) {
        console.warn('[Gemini] Failed to load weather snapshot fallback:', error);
        return { weather: { temp: 20, condition: 'Unknown', code: 0 }, currentLocation: 'Unknown' };
    }
};

const ensurePlanIds = (plan: DailyPlan): DailyPlan => {
    return (
        normalizePlan(plan, nowDateKey(), { forceDateKey: true }) ||
        { ...plan, date: nowDateKey(), items: plan.items || [] }
    );
};

const cleanAndParseJSON = (text: string): any => {
    try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Failed to parse JSON:", text);
        throw new Error(i18n.t('errors.llm.invalid_json'));
    }
};

const getLanguageFullName = (code: Language): string => {
    const map: Record<Language, string> = {
        'en': 'English', 'ar': 'Arabic', 'fr': 'French', 'es': 'Spanish',
        'hi': 'Hindi', 'de': 'German', 'nl': 'Dutch', 'zh': 'Simplified Chinese',
        'ja': 'Japanese', 'ko': 'Korean', 'tr': 'Turkish', 'sw': 'Swahili', 'pt': 'Portuguese'
    };
    return map[code] || 'English';
};

type DeepAIContext = {
    foodHistory?: FoodLogEntry[];
    activityHistory?: ActivityLogEntry[];
    moodHistory?: MoodLog[];
    weightHistory?: WeightLogEntry[];
    waterLog?: { date: string; amount: number };
    sleepHistory?: { date: string; hours: number }[];
    appContext?: AppContext;
    currentPlan?: DailyPlan | null;
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

const generateUserContextString = (
    userProfile: UserProfile,
    foodHistory: FoodLogEntry[],
    activityHistory: ActivityLogEntry[],
    moodHistory: MoodLog[],
    weightHistory: WeightLogEntry[],
    waterLog: { date: string, amount: number },
    sleepHistory: { date: string, hours: number }[],
    appContext: AppContext,
    currentPlan: DailyPlan | null,
    targetLanguage: Language = 'en',
    historySummary?: string,
    healthData?: DeepAIContext['healthData'],
    bioSnapshot?: BioSnapshot,
    bioTrends?: BioTrend[]
): string => {
    const now = new Date();
    const currentTime = getLocalTime(now);

    const bioLoad = calculateBioLoad(
        userProfile, foodHistory, activityHistory, moodHistory, sleepHistory,
        { weatherCode: appContext?.weather?.code ?? 0, currentTime },
        bioSnapshot
    );

    const todayStr = getLocalDateKey(now);
    const todayFoodLogs = foodHistory.filter(f => getLocalDateKey(new Date(f.timestamp)) === todayStr);
    const todayMacros = todayFoodLogs.reduce((acc, log) => ({
        calories: acc.calories + log.food.macros.calories,
        protein: acc.protein + log.food.macros.protein,
        carbs: acc.carbs + (log.food.macros.carbs || 0),
        fat: acc.fat + (log.food.macros.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    const recentFoodLogs = todayFoodLogs
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5);
    const foodLogLines = recentFoodLogs.length
        ? recentFoodLogs
            .map(log => {
                const timeLabel = getLocalTime(new Date(log.timestamp));
                const sourceLabel = (log as any).source ? `, source: ${(log as any).source}` : '';
                return `- ${timeLabel}: ${log.food.foodName}${sourceLabel}`;
            })
            .join('\n')
        : '- None';

    const todayActivities = activityHistory.filter(a => getLocalDateKey(new Date(a.timestamp)) === todayStr);
    const activityBurned = todayActivities.reduce((sum, a) => sum + (a.caloriesBurned || 0), 0);

    const latestMood = moodHistory.slice().sort((a, b) => b.timestamp - a.timestamp)[0];
    const latestWeight = weightHistory.slice().sort((a, b) => b.timestamp - a.timestamp)[0];

    const waterAmount = (() => {
        if (!waterLog?.date) return 0;
        const dateKey = getLocalDateKey(new Date(waterLog.date));
        return dateKey === todayStr ? waterLog.amount : 0;
    })();

    const lastSleep = (() => {
        if (!sleepHistory?.length) return null;
        const parsed = sleepHistory
            .map(s => ({ ...s, ts: Number(new Date(s.date)) }))
            .filter(s => !Number.isNaN(s.ts))
            .sort((a, b) => b.ts - a.ts);
        return parsed[0] || null;
    })();

    const calorieTarget = userProfile.dailyCalorieTarget || 2000;
    const remainingCalories = Math.round(calorieTarget - todayMacros.calories);
    const proteinTarget = userProfile.dailyProteinTarget
        ? Math.round(userProfile.dailyProteinTarget)
        : Math.round((userProfile.weight || 70) * 1.6);
    const waterTarget = userProfile.dailyWaterTargetMl
        ? Math.round(userProfile.dailyWaterTargetMl)
        : 2500;

    let planAdherenceStr = "No plan active.";
    let planItemsStr = "No plan items available.";
    if (currentPlan && currentPlan.date === todayStr) {
        const completed = currentPlan.items.filter(i => i.completed).length;
        const missed = currentPlan.items.filter(i => !i.completed && (i.skipped || i.missed)).length;
        const pending = currentPlan.items.filter(i => !i.completed && !(i.skipped || i.missed)).length;
        planAdherenceStr = `Done: ${completed}/${currentPlan.items.length} (missed ${missed}, pending ${pending})`;

        const itemsSorted = (currentPlan.items || []).slice().sort((a, b) => a.time.localeCompare(b.time));
        const completedItems = itemsSorted.filter(i => i.completed).slice(0, 8);
        const missedItems = itemsSorted.filter(i => !i.completed && (i.skipped || i.missed)).slice(0, 8);
        const upcomingItems = itemsSorted.filter(i => !i.completed && !(i.skipped || i.missed)).slice(0, 10);

        const completedList = completedItems.length
            ? completedItems.map(i => `- [${i.time}] ${i.title} (completed)`).join('\n')
            : '- None';
        const missedList = missedItems.length
            ? missedItems.map(i => `- [${i.time}] ${i.title} (missed)`).join('\n')
            : '- None';
        const upcomingList = upcomingItems.length
            ? upcomingItems.map(i => `- [${i.time}] ${i.title}`).join('\n')
            : '- None';

        planItemsStr = `Completed:\n${completedList}\nMissed:\n${missedList}\nUpcoming:\n${upcomingList}`;
    }

    const targetLangName = getLanguageFullName(targetLanguage);
    const bioTranslator = (key: string, options?: Record<string, any>) =>
        i18n.t(key, { ...(options || {}), locale: targetLanguage }) as string;
    const contextDetailsText = (() => {
        const details = appContext?.contextDetails;
        if (!details) return 'None';
        const parts: string[] = [];
        if (details.environment) parts.push(`Environment: ${details.environment}`);
        if (typeof details.confidence === 'number') parts.push(`Confidence: ${Math.round(details.confidence * 100)}%`);
        if (details.pollTier) parts.push(`Poll tier: ${details.pollTier}`);
        if (details.movementType) parts.push(`Movement: ${details.movementType}`);
        if (details.locationType) parts.push(`Location type: ${details.locationType}`);
        if (details.conflicts?.length) parts.push(`Conflicts: ${details.conflicts.join(', ')}`);
        if (details.lastUpdatedAt) {
            parts.push(`Last update: ${new Date(details.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        }
        return parts.length ? parts.join(' | ') : 'None';
    })();

    return `
    === DEEP BIO-CONTEXT (CRITICAL) ===
    - Neural Battery: ${bioLoad.neuralBattery}/100
    - Hormonal Load: ${bioLoad.hormonalLoad}/100
    - Physical Fatigue: ${bioLoad.physicalFatigue}/100
    - Social Drain: ${bioLoad.socialDrain}
    - Vitamin Alerts: ${bioLoad.vitaminStatus.join(', ') || 'None detected'}
    
    === USER PROFILE ===
    - Age: ${userProfile.age}
    - Gender: ${userProfile.gender}
    - Height: ${userProfile.height} cm
    - Weight: ${userProfile.weight} kg
    - Goal: ${userProfile.goal} (pace: ${userProfile.planIntensity})
    - Activity Level: ${userProfile.activityLevel}
    - Daily Calorie Target: ${calorieTarget} kcal
    - Protein Target: ${proteinTarget} g
    - Water Target: ${Math.round(waterTarget)} ml

    === USER IDENTITY ===
    Origin: ${userProfile.culinaryIdentity.origin}
    Location: ${userProfile.culinaryIdentity.residence}
    Work: ${userProfile.workProfile.type} (${userProfile.workProfile.intensity})
    Role: ${userProfile.workProfile.role || 'Unknown'}
    Industry: ${userProfile.workProfile.industry || 'Unknown'}
    Commute: ${userProfile.workProfile.commuteType || 'Unknown'}
    Family: ${userProfile.maritalStatus}, ${userProfile.childrenCount} kids

    === USER SCHEDULE (CRITICAL FOR TIMING) ===
    Day Starts (Wake Time): ${userProfile.sleepRoutine?.targetWakeTime || '07:00'}
    Day Ends (Bed Time): ${userProfile.sleepRoutine?.targetBedTime || '23:00'}
    Work Type: ${userProfile.workProfile.type}
    Meals/Day: ${userProfile.mealPattern?.mealsPerDay ?? 'Unknown'}
    Meal Times: ${userProfile.mealPattern?.mealTimes?.length ? userProfile.mealPattern.mealTimes.join(', ') : 'Unknown'}
    Late-night eating: ${userProfile.mealPattern?.lateNightEating === undefined ? 'Unknown' : userProfile.mealPattern.lateNightEating ? 'Yes' : 'No'}
    IMPORTANT: Schedule ALL meals and activities relative to when the user WAKES UP.
    ${userProfile.workProfile.type === 'night_shift' ? 'This user works NIGHT SHIFT - their day is INVERTED from normal. Breakfast should be around 6pm, not 7am!' : ''}

    === MEAL PATTERN & HABITS ===
    Typical Meals: ${userProfile.mealPattern?.typicalMeals?.length ? userProfile.mealPattern.typicalMeals.join(', ') : 'Unknown'}
    Smoking: ${userProfile.habits?.smoking || 'Unknown'}
    Alcohol: ${userProfile.habits?.alcohol || 'Unknown'}
    Vaping: ${userProfile.habits?.vaping || 'Unknown'}
    Sugar cravings: ${userProfile.habits?.sugarCravings || 'Unknown'}
    Caffeine: ${userProfile.habits?.caffeine || 'Unknown'}
    Other habits: ${userProfile.habits?.otherHabits?.length ? userProfile.habits.otherHabits.join(', ') : 'None'}

    === MEDICAL ===
    Conditions: ${userProfile.medicalProfile?.conditions?.join(', ') || 'None'}
    Medications: ${userProfile.medicalProfile?.medications?.join(', ') || 'None'}
    Injuries/Limitations: ${userProfile.medicalProfile?.injuries?.join(', ') || 'None'}
    Current Status: ${userProfile.medicalProfile?.currentStatus || 'healthy'}

    === TODAY (SO FAR) ===
    - Calories: ${Math.round(todayMacros.calories)} kcal (${remainingCalories >= 0 ? `${remainingCalories} under target` : `${Math.abs(remainingCalories)} over target`})
    - Protein: ${Math.round(todayMacros.protein)} g
    - Carbs: ${Math.round(todayMacros.carbs)} g
    - Fat: ${Math.round(todayMacros.fat)} g
    - Water: ${Math.round(waterAmount)} ml / ${waterTarget} ml
    - Activity Burned: ${Math.round(activityBurned)} kcal
    - Latest Mood: ${latestMood ? `${latestMood.mood} (${latestMood.score}/100)` : 'None'}
    - Latest Weight Log: ${latestWeight ? `${latestWeight.weight} kg` : 'None'}
    - Latest Sleep: ${lastSleep ? `${lastSleep.hours} hours (${lastSleep.date})` : 'None'}

    === FOOD LOGS (LATEST) ===
    ${foodLogLines}

    === REAL-TIME ===
    Time: ${currentTime}
    Location: ${appContext?.currentLocation || 'Unknown'}
    Weather: ${appContext?.weather?.temp ?? '?'}°C, ${appContext?.weather?.condition || 'Unknown'}
    Context State: ${appContext?.userContextState || 'unknown'}
    Context Summary: ${appContext?.contextSummary || 'None'}
    Context Details: ${contextDetailsText}
    Recent Context Transitions: ${appContext?.contextTransitions || 'None'}
    Target Language: ${targetLangName}
    Wrap-Up Insights: ${appContext?.wrapUpSummary || 'No recent wrap-up history.'}
    User Requested Changes: ${appContext?.userFeedback || 'None'}
    Adaptive Preferences: ${appContext?.adaptationContext || 'None'}
    ${appContext?.deviationContext ? `
    === PLAN DEVIATIONS (ADJUST REMAINING ITEMS!) ===
    ${appContext.deviationContext}
    ` : ''}
    === ADHERENCE ===
    ${planAdherenceStr}
    ${planItemsStr}

    === HEALTH PLATFORM DATA (Google Fit / Apple Health) ===
    ${healthData ? `
    - Steps Today: ${healthData.steps.toLocaleString()} steps
    - Distance: ${formatDistanceMeters(healthData.distance, targetLanguage)}
    - Active Calories Burned: ${healthData.calories} kcal
    ${healthData.sleepMinutes ? `- Last Night Sleep: ${(healthData.sleepMinutes / 60).toFixed(1)} hours (${healthData.sleepQuality || 'unknown'} quality)` : ''}
    ${healthData.latestWeight ? `- Latest Weight (from Health): ${formatWeightKg(healthData.latestWeight, targetLanguage)}` : ''}
    ${healthData.heartRateBpm ? `- Current Heart Rate: ${healthData.heartRateBpm} bpm` : ''}
    ` : 'Not connected'}

    ${bioSnapshot && bioSnapshot.source !== 'fallback' ? `
    === BIOMETRIC SENSOR DATA (REAL-TIME FROM WEARABLE/PHONE) ===
    ${formatBioContextForPrompt(bioSnapshot, bioTrends || [], { t: bioTranslator, locale: targetLanguage })}
    ` : ''}

    ${appContext?.bioHistorySummary ? `
    === BIO HISTORY SUMMARY ===
    ${appContext.bioHistorySummary}
    ` : ''}

    ${appContext?.bodyProgressSummary ? `
    === BODY PROGRESS SUMMARY ===
    ${appContext.bodyProgressSummary}
    ` : ''}

    === LONG TERM HISTORY ===
    ${historySummary || "No history summary available."}
    
    ${appContext?.nutritionContext || ''}
    ${appContext?.carriedOverContext || ''}
    ${appContext?.locationContext || ''}
  `;
};

const FOOD_SCHEMA: Schema = {
    type: Type.OBJECT,
    properties: {
        foodName: { type: Type.STRING },
        description: { type: Type.STRING },
        ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
        ingredientsDetailed: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    estimatedGrams: { type: Type.NUMBER },
                    quantity: { type: Type.STRING },
                    unit: { type: Type.STRING },
                    notes: { type: Type.STRING }
                },
                required: ['name']
            }
        },
        macros: {
            type: Type.OBJECT,
            properties: {
                calories: { type: Type.NUMBER },
                protein: { type: Type.NUMBER },
                carbs: { type: Type.NUMBER },
                fat: { type: Type.NUMBER },
                vitamins: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["calories", "protein", "carbs", "fat"]
        },
        micronutrients: {
            type: Type.OBJECT,
            properties: {
                vitaminA: { type: Type.NUMBER },
                vitaminB1: { type: Type.NUMBER },
                vitaminB2: { type: Type.NUMBER },
                vitaminB3: { type: Type.NUMBER },
                vitaminB5: { type: Type.NUMBER },
                vitaminB6: { type: Type.NUMBER },
                vitaminB7: { type: Type.NUMBER },
                vitaminB9: { type: Type.NUMBER },
                vitaminB12: { type: Type.NUMBER },
                vitaminC: { type: Type.NUMBER },
                vitaminD: { type: Type.NUMBER },
                vitaminE: { type: Type.NUMBER },
                vitaminK: { type: Type.NUMBER },
                calcium: { type: Type.NUMBER },
                chloride: { type: Type.NUMBER },
                iron: { type: Type.NUMBER },
                fluoride: { type: Type.NUMBER },
                magnesium: { type: Type.NUMBER },
                molybdenum: { type: Type.NUMBER },
                phosphorus: { type: Type.NUMBER },
                potassium: { type: Type.NUMBER },
                sodium: { type: Type.NUMBER },
                zinc: { type: Type.NUMBER },
                copper: { type: Type.NUMBER },
                manganese: { type: Type.NUMBER },
                selenium: { type: Type.NUMBER },
                iodine: { type: Type.NUMBER },
                chromium: { type: Type.NUMBER },
                omega3: { type: Type.NUMBER },
                omega6: { type: Type.NUMBER },
                fiber: { type: Type.NUMBER },
                choline: { type: Type.NUMBER },
                water: { type: Type.NUMBER }
            }
        },
        micronutrientsConfidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
        nutritionSource: { type: Type.STRING, enum: ["llm", "db", "mixed", "estimated"] },
        estimatedWeightGrams: { type: Type.NUMBER },
        healthGrade: { type: Type.STRING, enum: ["A", "B", "C", "D", "F"] },
        confidence: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
        advice: { type: Type.STRING }
    },
    required: ["foodName", "description", "ingredients", "macros", "healthGrade", "confidence", "advice"]
};

const BODY_PROGRESS_SCHEMA: Schema = {
    type: Type.OBJECT,
    properties: {
        bodyComposition: { type: Type.STRING },
        skinCondition: { type: Type.STRING },
        postureAnalysis: { type: Type.STRING },
        visibleChanges: { type: Type.STRING },
        muscleGroups: { type: Type.STRING },
        estimatedBodyFat: { type: Type.STRING },
        overallAssessment: { type: Type.STRING },
        recommendations: { type: Type.STRING },
        motivationalFeedback: { type: Type.STRING },
        comparisonWithPrevious: { type: Type.STRING },
        comparisonWithBaseline: { type: Type.STRING },
        progressScore: { type: Type.NUMBER },
        biggestImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
        areasNeedingFocus: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: [
        "bodyComposition",
        "skinCondition",
        "postureAnalysis",
        "visibleChanges",
        "muscleGroups",
        "estimatedBodyFat",
        "overallAssessment",
        "recommendations",
        "motivationalFeedback",
        "comparisonWithPrevious",
        "comparisonWithBaseline",
        "progressScore",
        "biggestImprovements",
        "areasNeedingFocus"
    ]
};

const NUTRITION_INSIGHTS_SCHEMA: Schema = {
    type: Type.OBJECT,
    properties: {
        summary: { type: Type.STRING },
        eatMore: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    nutrient: { type: Type.STRING },
                    foods: { type: Type.ARRAY, items: { type: Type.STRING } },
                    reason: { type: Type.STRING }
                },
                required: ['nutrient', 'foods']
            }
        },
        eatLess: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    nutrient: { type: Type.STRING },
                    foods: { type: Type.ARRAY, items: { type: Type.STRING } },
                    reason: { type: Type.STRING }
                },
                required: ['nutrient', 'foods']
            }
        },
        focusNutrients: { type: Type.ARRAY, items: { type: Type.STRING } },
        caution: { type: Type.STRING }
    },
    required: ['summary', 'eatMore', 'eatLess', 'focusNutrients']
};

export const calculateUserProfile = async (formData: Partial<UserProfile>): Promise<Partial<UserProfile>> => {
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            dailyCalorieTarget: { type: Type.NUMBER },
            calculatedIdealWeight: { type: Type.NUMBER },
            projectedWeeks: { type: Type.NUMBER },
            weeklyGoalSummary: { type: Type.STRING },
            monthlyGoalSummary: { type: Type.STRING }
        },
        required: ["dailyCalorieTarget", "calculatedIdealWeight", "projectedWeeks", "weeklyGoalSummary", "monthlyGoalSummary"]
    };

    let promptText = `${PROFILE_CALCULATION_PROMPT}\n\nUSER DATA:\n${JSON.stringify(formData, null, 2)}`;

    if (formData.goalWeight && formData.targetDate) {
        promptText += `\n\nCRITICAL OVERRIDE: The user wants to reach ${formData.goalWeight}kg by ${formData.targetDate}.`;
    }

    try {
        const response = await generateContentSmart({
            contents: { parts: [{ text: promptText }] },
            config: { responseMimeType: 'application/json', responseSchema: schema, systemInstruction: COACH_PERSONA }
        });
        if (response.text) return cleanAndParseJSON(response.text);
        throw new Error(i18n.t('errors.llm.no_data'));
    } catch (e) {
        console.error("Profile Calculation Failed", e);
        return {
            dailyCalorieTarget: 2000,
            calculatedIdealWeight: 70,
            projectedWeeks: 12,
            weeklyGoalSummary: "Start tracking habits",
            monthlyGoalSummary: "Build consistency"
        };
    }
};

export const analyzeMedia = async (
    media: { data?: string; fileUri?: string; mimeType: string; fileName?: string },
    userProfile?: UserProfile,
    targetLanguage: Language = 'en',
    deepContext?: DeepAIContext
): Promise<FoodAnalysisResult> => {
    const isVideo = media.mimeType.startsWith('video/');
    const isAudio = media.mimeType.startsWith('audio/');

    console.log('[GeminiService] analyzeMedia called:', {
        hasData: !!media.data,
        dataLength: media.data?.length,
        hasFileUri: !!media.fileUri,
        mimeType: media.mimeType,
        fileName: media.fileName,
        isVideo,
        directUploadAvailable: isDirectUploadAvailable()
    });

    try {
        const targetLangName = getLanguageFullName(targetLanguage);
        const resolvedAppContext = deepContext
            ? deepContext.appContext || (await resolveFallbackAppContext())
            : undefined;

        const userContext = userProfile
            ? deepContext
                ? generateUserContextString(
                    userProfile,
                    deepContext.foodHistory || [],
                    deepContext.activityHistory || [],
                    deepContext.moodHistory || [],
                    deepContext.weightHistory || [],
                    deepContext.waterLog || { date: new Date().toDateString(), amount: 0 },
                    deepContext.sleepHistory || [],
                    resolvedAppContext || { weather: { temp: 20, condition: 'Unknown', code: 0 }, currentLocation: 'Unknown' },
                    deepContext.currentPlan || null,
                    targetLanguage,
                    deepContext.historySummary,
                    deepContext.healthData,
                    deepContext.bioSnapshot,
                    deepContext.bioTrends
                )
                : `User Profile: Goal ${userProfile.goal}, Weight ${userProfile.weight}kg, Target ${userProfile.dailyCalorieTarget}kcal.\nMedical: ${userProfile.medicalProfile?.conditions?.join(', ') || 'None'}`
            : "";

        const prompt = `${FOOD_ANALYSIS_PROMPT}\n\nTARGET LANGUAGE: ${targetLangName}. Write foodName, description, and advice in ${targetLangName}.\n\n${userContext}`;
        const mediaBytes = media.data ? estimateBytesFromBase64(media.data) : 0;
        const canInline = !!media.data && !isVideo && !isAudio && mediaBytes <= INLINE_MEDIA_MAX_BYTES;
        let contents = { parts: [{ text: prompt }] } as any;
        let upload: GeminiUploadPayload | undefined;
        let useDirect = false;

        if (canInline) {
            console.log('[GeminiService] Using INLINE path (small image)');
            contents = {
                parts: [
                    { inlineData: { mimeType: media.mimeType, data: media.data } },
                    { text: prompt }
                ]
            };
        } else if (isDirectUploadAvailable() && media.fileUri) {
            console.log('[GeminiService] Using DIRECT UPLOAD path (video/large file)');
            console.log('[GeminiService] Uploading file to Gemini File API...');
            try {
                const file = await uploadGeminiFile({
                    fileUri: media.fileUri,
                    mimeType: media.mimeType,
                    fileName: media.fileName,
                });
                const fileUri = file?.uri;
                console.log('[GeminiService] File uploaded, URI:', fileUri?.substring(0, 60));
                if (!fileUri) {
                    throw new Error(i18n.t('errors.video.upload_missing_uri'));
                }
                contents = buildFileDataContents(fileUri, file.mimeType || media.mimeType, prompt);
                useDirect = true;
            } catch (uploadError) {
                if (media.data) {
                    console.warn('[GeminiService] Direct upload failed, falling back to Netlify upload:', uploadError);
                    upload = { dataBase64: media.data, mimeType: media.mimeType, fileName: media.fileName };
                } else {
                    throw uploadError;
                }
            }
        } else if (media.data) {
            console.log('[GeminiService] Using NETLIFY PROXY path (base64 upload)');
            upload = { dataBase64: media.data, mimeType: media.mimeType, fileName: media.fileName };
        } else {
            console.error('[GeminiService] No valid upload path available!', {
                hasData: !!media.data,
                hasFileUri: !!media.fileUri,
                directUploadAvailable: isDirectUploadAvailable()
            });
            throw new Error(i18n.t('errors.video.upload_key_missing'));
        }

        console.log('[GeminiService] Calling generateContentSmart...', { useDirect, hasUpload: !!upload });
        const response = await generateContentSmart(
            {
                contents,
                config: { responseMimeType: 'application/json', responseSchema: FOOD_SCHEMA, systemInstruction: COACH_PERSONA },
                upload,
                useDirect
            },
            canInline ? {} : { requestTimeoutMs: 120000 }
        );

        console.log('[GeminiService] generateContentSmart completed, hasText:', !!response?.text);
        if (response.text) return cleanAndParseJSON(response.text) as FoodAnalysisResult;
        throw new Error(i18n.t('errors.llm.no_data'));
    } catch (error) {
        console.error("[GeminiService] analyzeMedia error:", error);
        throw error;
    }
};

export const analyzeTextFood = async (
    textDescription: string,
    userProfile?: UserProfile,
    targetLanguage: Language = 'en',
    deepContext?: DeepAIContext
): Promise<FoodAnalysisResult> => {
    try {
        const targetLangName = getLanguageFullName(targetLanguage);
        const resolvedAppContext = deepContext
            ? deepContext.appContext || (await resolveFallbackAppContext())
            : undefined;

        const userContext = userProfile
            ? deepContext
                ? generateUserContextString(
                    userProfile,
                    deepContext.foodHistory || [],
                    deepContext.activityHistory || [],
                    deepContext.moodHistory || [],
                    deepContext.weightHistory || [],
                    deepContext.waterLog || { date: new Date().toDateString(), amount: 0 },
                    deepContext.sleepHistory || [],
                    resolvedAppContext || { weather: { temp: 20, condition: 'Unknown', code: 0 }, currentLocation: 'Unknown' },
                    deepContext.currentPlan || null,
                    targetLanguage,
                    deepContext.historySummary,
                    deepContext.healthData,
                    deepContext.bioSnapshot,
                    deepContext.bioTrends
                )
                : `User Profile: Goal ${userProfile.goal}, Weight ${userProfile.weight}kg, Target ${userProfile.dailyCalorieTarget}kcal.\nMedical: ${userProfile.medicalProfile?.conditions?.join(', ') || 'None'}`
            : "";

        const response = await generateContentSmart({
            contents: {
                parts: [{
                    text: `${TEXT_FOOD_ANALYSIS_PROMPT}\n\nTARGET LANGUAGE: ${targetLangName}. Write foodName, description, and advice in ${targetLangName}.\n\nUSER MEAL DESCRIPTION: "${textDescription}"\n\n${userContext}`
                }]
            },
            config: { responseMimeType: 'application/json', responseSchema: FOOD_SCHEMA, systemInstruction: COACH_PERSONA }
        });

        if (response.text) return cleanAndParseJSON(response.text) as FoodAnalysisResult;
        throw new Error(i18n.t('errors.llm.no_data'));
    } catch (e) {
        console.error("Error analyzing text food", e);
        throw e;
    }
};

export const analyzeBodyScan = async (payload: {
    imageUri: string;
    baselineSummary?: string;
    previousSummary?: string;
    targetLanguage?: Language;
    userProfile?: UserProfile;
    deepContext?: DeepAIContext;
}): Promise<BodyScanAnalysis> => {
    const {
        imageUri,
        baselineSummary,
        previousSummary,
        targetLanguage = 'en',
        userProfile,
        deepContext,
    } = payload;

    if (!imageUri) {
        throw new Error(i18n.t('errors.food.missing_image'));
    }

    const resolvedAppContext = deepContext
        ? deepContext.appContext || (await resolveFallbackAppContext())
        : undefined;

    const userContext = userProfile
        ? deepContext
            ? generateUserContextString(
                userProfile,
                deepContext.foodHistory || [],
                deepContext.activityHistory || [],
                deepContext.moodHistory || [],
                deepContext.weightHistory || [],
                deepContext.waterLog || { date: new Date().toDateString(), amount: 0 },
                deepContext.sleepHistory || [],
                resolvedAppContext || { weather: { temp: 20, condition: 'Unknown', code: 0 }, currentLocation: 'Unknown' },
                deepContext.currentPlan || null,
                targetLanguage,
                deepContext.historySummary,
                deepContext.healthData,
                deepContext.bioSnapshot,
                deepContext.bioTrends
            )
            : `User Profile: Goal ${userProfile.goal}, Weight ${userProfile.weight}kg, Target ${userProfile.dailyCalorieTarget}kcal.\nMedical: ${userProfile.medicalProfile?.conditions?.join(', ') || 'None'}`
        : '';

    const targetLangName = getLanguageFullName(targetLanguage);
    const historyContext = [
        baselineSummary ? `BASELINE SUMMARY:\n${baselineSummary}` : 'BASELINE SUMMARY:\nNone',
        previousSummary ? `PREVIOUS SUMMARY:\n${previousSummary}` : 'PREVIOUS SUMMARY:\nNone',
    ].join('\n\n');

    const prompt = `${BODY_PROGRESS_PROMPT}\n\nTARGET LANGUAGE: ${targetLangName}.\n\n${historyContext}\n\n${userContext}`;
    const mimeType = guessImageMimeType(imageUri);
    const fileName = imageUri.split('?')[0].split('/').pop() || `body-scan-${Date.now()}.jpg`;

    let contents: any = { parts: [{ text: prompt }] };
    let upload: GeminiUploadPayload | undefined;
    let useDirect = false;

    if (isDirectUploadAvailable()) {
        const file = await uploadGeminiFile({
            fileUri: imageUri,
            mimeType,
            fileName,
        });
        const fileUri = file?.uri;
        if (!fileUri) {
            throw new Error(i18n.t('errors.video.upload_missing_uri'));
        }
        contents = buildFileDataContents(fileUri, file.mimeType || mimeType, prompt);
        useDirect = true;
    } else {
        const base64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });
        upload = { dataBase64: base64, mimeType, fileName };
    }

    const response = await generateContentSmart(
        {
            contents,
            config: { responseMimeType: 'application/json', responseSchema: BODY_PROGRESS_SCHEMA, systemInstruction: COACH_PERSONA },
            upload,
            useDirect,
        },
        { requestTimeoutMs: 120000 }
    );

    if (response.text) {
        return cleanAndParseJSON(response.text) as BodyScanAnalysis;
    }
    throw new Error(i18n.t('errors.llm.no_data'));
};

export const generateDailyPlan = async (
    userProfile: UserProfile,
    foodHistory: FoodLogEntry[],
    activityHistory: ActivityLogEntry[],
    moodHistory: MoodLog[],
    weightHistory: WeightLogEntry[],
    waterLog: { date: string, amount: number },
    sleepHistory: { date: string, hours: number }[],
    appContext: AppContext,
    targetLanguage: Language,
    currentPlan: DailyPlan | null,
    historySummary?: string,
    sleepContextString?: string
): Promise<DailyPlan> => {
    let context = generateUserContextString(
        userProfile, foodHistory, activityHistory, moodHistory,
        weightHistory, waterLog, sleepHistory, appContext, currentPlan, targetLanguage, historySummary,
        appContext.healthData, appContext.bioSnapshot, appContext.bioTrends
    );
    if (sleepContextString) {
        context += `\n\n=== SLEEP CONTEXT ===\n${sleepContextString}`;
    }
    const targetLangName = getLanguageFullName(targetLanguage);

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            date: { type: Type.STRING },
            summary: { type: Type.STRING },
            bioLoadSnapshot: {
                type: Type.OBJECT,
                properties: {
                    neuralBattery: { type: Type.NUMBER },
                    hormonalStress: { type: Type.STRING, enum: ['low', 'moderate', 'high'] },
                    physicalRecovery: { type: Type.NUMBER }
                }
            },
            items: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING },
                        time: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ['meal', 'workout', 'hydration', 'sleep', 'work_break'] },
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        completed: { type: Type.BOOLEAN },
                        linkedAction: { type: Type.STRING, enum: ['log_food', 'start_sleep', 'log_water'] },
                        priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] }
                    },
                    required: ["time", "type", "title", "description", "priority"]
                }
            }
        },
        required: ["date", "summary", "items", "bioLoadSnapshot"]
    };

    const response = await generateContentSmart({
        contents: { parts: [{ text: `${DAILY_PLAN_PROMPT}\n\n${context}` }] },
        config: { responseMimeType: 'application/json', responseSchema: schema, systemInstruction: COACH_PERSONA }
    });

    if (response.text) {
        const parsed = cleanAndParseJSON(response.text) as DailyPlan;
        const normalized = ensurePlanIds({
            ...parsed,
            date: nowDateKey(),
            summary: parsed.summary || 'Your plan for today',
        });
        return normalized;
    }
    throw new Error(i18n.t('errors.plan.generation_failed'));
};

export const generateNutritionInsights = async (
    snapshot: NutrientBalanceSnapshot,
    userProfile: UserProfile,
    targetLanguage: Language,
    options?: {
        foodsLogged?: string[];
        appContext?: AppContext;
    }
): Promise<NutritionInsight> => {
    const targetLangName = getLanguageFullName(targetLanguage);
    const foodsLogged = options?.foodsLogged || [];
    const location = options?.appContext?.currentLocation || 'Unknown';

    const prompt = `${NUTRITION_INSIGHTS_PROMPT}

TARGET LANGUAGE: ${targetLangName}

USER PROFILE:
- Goal: ${userProfile.goal}
- Gender: ${userProfile.gender}
- Age: ${userProfile.age}
- Medical Conditions: ${userProfile.medicalProfile?.conditions?.join(', ') || 'None'}
- Location: ${location}

TODAY NUTRIENT SNAPSHOT (Totals, Targets, Gaps):
${JSON.stringify({
        totals: snapshot.totals,
        targets: snapshot.targets,
        gaps: snapshot.gaps,
        overallScore: snapshot.overallScore,
        coverage: snapshot.coverage,
    }, null, 2)}

FOODS LOGGED:
${foodsLogged.slice(0, 15).join(', ') || 'No foods logged'}
`;

    try {
        const response = await generateContentSmart({
            contents: { parts: [{ text: prompt }] },
            config: { responseMimeType: 'application/json', responseSchema: NUTRITION_INSIGHTS_SCHEMA, systemInstruction: COACH_PERSONA }
        });

        if (response.text) return cleanAndParseJSON(response.text) as NutritionInsight;
        throw new Error(i18n.t('errors.llm.no_data'));
    } catch (error) {
        console.error('[Gemini] Nutrition insights failed:', error);
        return {
            summary: 'Nutrition insights are unavailable right now.',
            eatMore: [],
            eatLess: [],
            focusNutrients: [],
        };
    }
};

export const createChatSession = (
    userProfile: UserProfile,
    foodHistory: FoodLogEntry[],
    moodHistory: MoodLog[],
    weightHistory: WeightLogEntry[],
    appContext: AppContext,
    dailyPlan: DailyPlan | null,
    mode: 'personal' | 'general',
    targetLanguage: Language = 'en',
    historySummary?: string
) => {
    let finalInstruction = COACH_PERSONA;
    if (mode === 'personal') {
        const mockWater = { date: new Date().toDateString(), amount: 0 };
        const mockActivity: ActivityLogEntry[] = [];
        const sleepMock = [{ date: 'today', hours: 7 }];
        const dynamicContext = generateUserContextString(
            userProfile, foodHistory, mockActivity, moodHistory,
            weightHistory, mockWater, sleepMock, appContext, dailyPlan, targetLanguage, historySummary,
            appContext.healthData, appContext.bioSnapshot, appContext.bioTrends
        );
        finalInstruction = `${COACH_PERSONA}\n\n${dynamicContext}`;
    } else {
        const targetLangName = getLanguageFullName(targetLanguage);
        finalInstruction = `${COACH_PERSONA}\n\nCONTEXT: General question. Give expert advice in ${targetLangName}.`;
    }

    type ChatHistoryEntry = { role: 'user' | 'model'; parts: { text: string }[] };
    const history: ChatHistoryEntry[] = [];
    const maxEntries = 16; // Keep context bounded (8 user/assistant pairs).

    const trimHistory = () => {
        if (history.length <= maxEntries) return;
        history.splice(0, history.length - maxEntries);
    };

    return {
        sendMessage: async ({ message }: { message: string }) => {
            const safeMessage = typeof message === 'string' ? message : String(message);
            history.push({ role: 'user', parts: [{ text: safeMessage }] });
            trimHistory();

            const response = await generateContentSmart({
                contents: history,
                config: { systemInstruction: finalInstruction },
                model: DEFAULT_MODEL || FALLBACK_MODEL,
            });

            const replyText =
                response?.text || "I couldn't generate a response. Please try again.";

            history.push({ role: 'model', parts: [{ text: replyText }] });
            trimHistory();

            return { text: replyText };
        },
    };
};

export const analyzeActivity = async (
    description: string,
    durationMinutes: number,
    userProfile?: UserProfile,
    targetLanguage: Language = 'en'
): Promise<{ caloriesBurned: number, intensity: 'low' | 'moderate' | 'high', notes: string }> => {
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            caloriesBurned: { type: Type.NUMBER },
            intensity: { type: Type.STRING, enum: ['low', 'moderate', 'high'] },
            notes: { type: Type.STRING }
        },
        required: ["caloriesBurned", "intensity", "notes"]
    };

    try {
        const targetLangName = getLanguageFullName(targetLanguage);
        const response = await generateContentSmart({
            contents: {
                parts: [{
                    text: `${ACTIVITY_ANALYSIS_PROMPT}\n\nTARGET LANGUAGE: ${targetLangName}. Write the notes in ${targetLangName}.\n\nACTIVITY: "${description}"\nDURATION: ${durationMinutes} minutes`
                }]
            },
            config: { responseMimeType: 'application/json', responseSchema: schema, systemInstruction: COACH_PERSONA }
        });

        if (response.text) return cleanAndParseJSON(response.text);
        throw new Error(i18n.t('errors.llm.no_data'));
    } catch (e) {
        console.error("Activity Analysis Failed", e);
        // Fallback
        return { caloriesBurned: durationMinutes * 5, intensity: 'moderate', notes: 'Estimated (Fallback)' };
    }
};

export const detectFridgeIngredients = async (media: { data?: string; fileUri?: string; mimeType: string; fileName?: string }): Promise<string[]> => {
    const isVideo = media.mimeType.startsWith('video/');

    console.log('[GeminiService] detectFridgeIngredients called:', {
        hasData: !!media.data,
        dataLength: media.data?.length,
        hasFileUri: !!media.fileUri,
        mimeType: media.mimeType,
        fileName: media.fileName,
        isVideo,
        directUploadAvailable: isDirectUploadAvailable()
    });

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            detectedIngredients: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["detectedIngredients"]
    };

    const mediaBytes = media.data ? estimateBytesFromBase64(media.data) : 0;
    const canInline = !!media.data && !isVideo && mediaBytes <= INLINE_MEDIA_MAX_BYTES;
    let contents = { parts: [{ text: INGREDIENTS_DETECTION_PROMPT }] } as any;
    let upload: GeminiUploadPayload | undefined;
    let useDirect = false;

    try {
        if (canInline) {
            console.log('[GeminiService] Fridge: Using INLINE path (small image)');
            contents = {
                parts: [
                    { inlineData: { mimeType: media.mimeType, data: media.data } },
                    { text: INGREDIENTS_DETECTION_PROMPT }
                ]
            };
        } else if (isDirectUploadAvailable() && media.fileUri) {
            console.log('[GeminiService] Fridge: Using DIRECT UPLOAD path (video/large file)');
            console.log('[GeminiService] Fridge: Uploading file to Gemini File API...');
            try {
                const file = await uploadGeminiFile({
                    fileUri: media.fileUri,
                    mimeType: media.mimeType,
                    fileName: media.fileName,
                });
                const fileUri = file?.uri;
                console.log('[GeminiService] Fridge: File uploaded, URI:', fileUri?.substring(0, 60));
                if (!fileUri) {
                    throw new Error(i18n.t('errors.video.upload_missing_uri'));
                }
                contents = buildFileDataContents(fileUri, file.mimeType || media.mimeType, INGREDIENTS_DETECTION_PROMPT);
                useDirect = true;
            } catch (uploadError) {
                if (media.data) {
                    console.warn('[GeminiService] Fridge: Direct upload failed, falling back to Netlify upload:', uploadError);
                    upload = { dataBase64: media.data, mimeType: media.mimeType, fileName: media.fileName };
                } else {
                    throw uploadError;
                }
            }
        } else if (media.data) {
            console.log('[GeminiService] Fridge: Using NETLIFY PROXY path (base64 upload)');
            upload = { dataBase64: media.data, mimeType: media.mimeType, fileName: media.fileName };
        } else {
            console.error('[GeminiService] Fridge: No valid upload path available!', {
                hasData: !!media.data,
                hasFileUri: !!media.fileUri,
                directUploadAvailable: isDirectUploadAvailable()
            });
            throw new Error(i18n.t('errors.video.upload_key_missing'));
        }

        console.log('[GeminiService] Fridge: Calling generateContentSmart...', { useDirect, hasUpload: !!upload });
        const response = await generateContentSmart({
            contents,
            config: { responseMimeType: 'application/json', responseSchema: schema },
            upload,
            useDirect
        }, canInline ? {} : { requestTimeoutMs: 120000 });

        console.log('[GeminiService] Fridge: generateContentSmart completed, hasText:', !!response?.text);
        if (response.text) {
            const res = cleanAndParseJSON(response.text);
            console.log('[GeminiService] Fridge: Detected', res.detectedIngredients?.length, 'ingredients');
            return res.detectedIngredients;
        }
        throw new Error(i18n.t('errors.food.ingredients_no_response'));
    } catch (error) {
        console.error('[GeminiService] detectFridgeIngredients error:', error);
        throw error;
    }
};

export const generateFridgeRecipes = async (
    ingredients: string[],
    mood: CookingMood,
    userProfile: UserProfile,
    targetLanguage: Language
): Promise<Recipe[]> => {
    const targetLangName = getLanguageFullName(targetLanguage);
    const userContext = `
    User Origin: ${userProfile.culinaryIdentity.origin}
    User Location: ${userProfile.culinaryIdentity.residence}
    Cooking Mood: ${mood.toUpperCase()}
    Medical Profile: ${userProfile.medicalProfile.conditions.join(', ')}
    Target Language: ${targetLangName}
  `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            recipes: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        calories: { type: Type.NUMBER },
                        protein: { type: Type.NUMBER },
                        prepTime: { type: Type.STRING },
                        ingredientsUsed: { type: Type.ARRAY, items: { type: Type.STRING } },
                        missingIngredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                        instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        chefNote: { type: Type.STRING }
                    },
                    required: ["name", "calories", "protein", "prepTime", "ingredientsUsed", "instructions", "chefNote"]
                }
            }
        },
        required: ["recipes"]
    };

    const response = await generateContentSmart({
        contents: { parts: [{ text: `${RECIPE_GENERATION_PROMPT}\n\nINGREDIENTS: ${ingredients.join(', ')}\n\nCONTEXT: ${userContext}` }] },
        config: { responseMimeType: 'application/json', responseSchema: schema, systemInstruction: COACH_PERSONA }
    });

    if (response.text) {
        const res = cleanAndParseJSON(response.text);
        return res.recipes;
    }
    throw new Error(i18n.t('errors.recipe.generation_failed'));
};

export const generateRecipeForMeal = async (
    mealTitle: string,
    mealContext?: string,
    targetLanguage: Language = 'en'
): Promise<{
    name: string;
    ingredients: string[];
    steps: string[];
    tips: string;
    macros?: { calories?: number; protein?: number; carbs?: number; fat?: number };
}> => {
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            name: { type: Type.STRING },
            ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
            steps: { type: Type.ARRAY, items: { type: Type.STRING } },
            tips: { type: Type.STRING },
            macros: {
                type: Type.OBJECT,
                properties: {
                    calories: { type: Type.NUMBER },
                    protein: { type: Type.NUMBER },
                    carbs: { type: Type.NUMBER },
                    fat: { type: Type.NUMBER },
                }
            }
        },
        required: ['name', 'ingredients', 'steps', 'tips']
    };

    const targetLangName = getLanguageFullName(targetLanguage);
    const prompt = `Create a concise, step-by-step recipe for "${mealTitle}".
${mealContext || ''}
TARGET LANGUAGE: ${targetLangName}. Write ingredients, steps, and tips in ${targetLangName}.
Return ingredients, ordered steps, a short tip, and approximate macros if possible.`;

    const response = await generateContentSmart({
        contents: { parts: [{ text: prompt }] },
        config: { responseMimeType: 'application/json', responseSchema: schema }
    });

    if (response.text) return cleanAndParseJSON(response.text);
    throw new Error(i18n.t('errors.recipe.generation_failed'));
};

// Generate Daily Wrap-Up
export const generateDailyWrapUp = async (
    dailyPlan: DailyPlan,
    dailyFoodLogs: FoodLogEntry[],
    dailyActivityLogs: ActivityLogEntry[],
    waterAmount: number,
    sleepHours: number,
    targetLanguage: Language
): Promise<DailyWrapUp> => {
    const targetLangName = getLanguageFullName(targetLanguage);
    let bioContextText = '';
    let bioSummary: DailyWrapUp['bioSummary'] | undefined;
    let bioSnapshot: BioSnapshot | undefined;
    let bioTrends: BioTrend[] | undefined;

    const completedItems = dailyPlan.items.filter(i => i.completed).length;
    const plannedCalories = dailyPlan.summary?.split(' ')[0] || '2000';
    const actualCalories = dailyFoodLogs.reduce((sum, log) => sum + log.food.macros.calories, 0);
    const actualWorkoutMins = dailyActivityLogs.reduce((sum, log) => sum + log.durationMinutes, 0);

    const context = `
    Plan Adherence: ${completedItems}/${dailyPlan.items.length} tasks completed.
    Planned Calories: ~${plannedCalories}
    Actual Calories: ${actualCalories}
    Exercise: ${actualWorkoutMins} minutes
    Water: ${waterAmount}ml
    Sleep: ${sleepHours} hours
    Target Language: ${targetLangName}
    `;

    try {
        const { bioSnapshotService } = require('./bioSnapshotService') as typeof import('./bioSnapshotService');
        await bioSnapshotService.initialize();
        const config = bioSnapshotService.getConfig();
        if (config.shareWithAI) {
            const bioContext = await getBioContextForAppContext();
            bioSnapshot = bioContext.bioSnapshot;
            bioTrends = bioContext.bioTrends;
            if (bioSnapshot) {
                const bioTranslator = (key: string, options?: Record<string, any>) =>
                    i18n.t(key, { ...(options || {}), locale: targetLanguage }) as string;
                bioContextText = formatBioContextForPrompt(bioSnapshot, bioTrends || [], {
                    t: bioTranslator,
                    locale: targetLanguage
                });
                const history = await bioSnapshotService.getHistoryForAI(7);
                const todayKey = getLocalDateKey(new Date());
                const todayHistory = history.filter((entry) => getLocalDateKey(new Date(entry.timestamp)) === todayKey);
                bioSummary = computeDailyBioSummary(todayHistory) || undefined;
            }
        }
    } catch (e) {
        console.warn('[Gemini] Failed to load bio trends for wrapup:', e);
    }

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            aiScore: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            comparison: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        category: { type: Type.STRING },
                        planned: { type: Type.STRING },
                        actual: { type: Type.STRING },
                        status: { type: Type.STRING, enum: ['hit', 'miss', 'partial'] }
                    },
                    required: ['category', 'planned', 'actual', 'status']
                }
            },
            tomorrowFocus: { type: Type.STRING }
        },
        required: ['aiScore', 'summary', 'comparison', 'tomorrowFocus']
    };

    try {
        const promptText = `${DAILY_WRAPUP_PROMPT}\n\nCONTEXT: ${context}` +
            (bioContextText ? `\n\n=== TODAY'S BIO TRENDS ===\n${bioContextText}` : '');

        const response = await generateContentSmart({
            contents: { parts: [{ text: promptText }] },
            config: { responseMimeType: 'application/json', responseSchema: schema, systemInstruction: COACH_PERSONA }
        });

        if (response.text) {
            const wrapup = cleanAndParseJSON(response.text) as DailyWrapUp;
            if (bioSummary && !wrapup.bioSummary) {
                wrapup.bioSummary = bioSummary;
            }
            return wrapup;
        }
        throw new Error(i18n.t('errors.llm.no_data'));
    } catch (error) {
        console.error("Daily WrapUp failed:", error);
        // Return fallback
        return {
            date: new Date().toISOString().split('T')[0],
            aiScore: 7,
            summary: "Good effort today!",
            comparison: [
                { category: "Calories", planned: plannedCalories.toString(), actual: actualCalories.toString(), status: 'partial' },
                { category: "Workout", planned: "30 min", actual: `${actualWorkoutMins} min`, status: actualWorkoutMins >= 30 ? 'hit' : 'miss' },
                { category: "Hydration", planned: "2000ml", actual: `${waterAmount}ml`, status: waterAmount >= 1500 ? 'hit' : 'partial' }
            ],
            tomorrowFocus: "Stay consistent with your plan"
        };
    }
};

// Analyze Sleep Session with AI
export const analyzeSleepSession = async (
    movementLog: { timestamp: number; intensity: number }[],
    targetLanguage: Language = 'en'
): Promise<{
    sleepScore: number;
    stages: { stage: string; percentage: number }[];
    analysis: string;
}> => {
    const targetLangName = getLanguageFullName(targetLanguage);

    // Summarize movement data
    const avgIntensity = movementLog.length > 0
        ? movementLog.reduce((sum, m) => sum + m.intensity, 0) / movementLog.length
        : 0;
    const durationMins = movementLog.length > 0
        ? (movementLog[movementLog.length - 1].timestamp - movementLog[0].timestamp) / 60000
        : 0;
    const lowMovementPeriods = movementLog.filter(m => m.intensity < 15).length;
    const highMovementEvents = movementLog.filter(m => m.intensity > 50).length;

    const context = `
    Duration: ${Math.round(durationMins)} minutes
    Average Movement Intensity: ${avgIntensity.toFixed(1)}
    Low Movement Periods: ${lowMovementPeriods}
    High Movement Events: ${highMovementEvents}
    Target Language: ${targetLangName}
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            sleepScore: { type: Type.NUMBER },
            stages: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        stage: { type: Type.STRING },
                        percentage: { type: Type.NUMBER }
                    },
                    required: ['stage', 'percentage']
                }
            },
            analysis: { type: Type.STRING }
        },
        required: ['sleepScore', 'stages', 'analysis']
    };

    try {
        const response = await generateContentSmart({
            contents: { parts: [{ text: `${SLEEP_ANALYSIS_PROMPT}\n\nMOVEMENT DATA: ${context}` }] },
            config: { responseMimeType: 'application/json', responseSchema: schema, systemInstruction: COACH_PERSONA }
        });

        if (response.text) return cleanAndParseJSON(response.text);
        throw new Error(i18n.t('errors.llm.no_data'));
    } catch (error) {
        console.error("Sleep analysis failed:", error);
        // Calculate basic score from movement data
        const score = Math.max(40, Math.min(95, 100 - avgIntensity * 2));
        return {
            sleepScore: Math.round(score),
            stages: [
                { stage: 'Deep', percentage: lowMovementPeriods > highMovementEvents ? 35 : 20 },
                { stage: 'Light', percentage: 45 },
                { stage: 'REM', percentage: 15 },
                { stage: 'Awake', percentage: highMovementEvents > 10 ? 10 : 5 }
            ],
            analysis: "Based on your movement patterns, your sleep quality was " +
                (score > 70 ? "good" : score > 50 ? "fair" : "poor") +
                ". Try to maintain a consistent sleep schedule."
        };
    }
};

// Refine Food Analysis with corrections
export const refineFoodAnalysis = async (
    originalAnalysis: FoodAnalysisResult,
    correction: string,
    userProfile?: UserProfile,
    originalImage?: string,
    targetLanguage: Language = 'en',
    deepContext?: DeepAIContext
): Promise<FoodAnalysisResult> => {
    const targetLangName = getLanguageFullName(targetLanguage);
    const resolvedAppContext = deepContext
        ? deepContext.appContext || (await resolveFallbackAppContext())
        : undefined;

    const userContext = userProfile
        ? deepContext
            ? generateUserContextString(
                userProfile,
                deepContext.foodHistory || [],
                deepContext.activityHistory || [],
                deepContext.moodHistory || [],
                deepContext.weightHistory || [],
                deepContext.waterLog || { date: new Date().toDateString(), amount: 0 },
                deepContext.sleepHistory || [],
                resolvedAppContext || { weather: { temp: 20, condition: 'Unknown', code: 0 }, currentLocation: 'Unknown' },
                deepContext.currentPlan || null,
                targetLanguage,
                deepContext.historySummary,
                deepContext.healthData,
                deepContext.bioSnapshot,
                deepContext.bioTrends
            )
            : `User Profile: Goal ${userProfile.goal}, Weight ${userProfile.weight}kg, Target ${userProfile.dailyCalorieTarget}kcal.\nMedical: ${userProfile.medicalProfile?.conditions?.join(', ') || 'None'}`
        : "";

    const prompt = `${REFINED_FOOD_ANALYSIS_PROMPT}

TARGET LANGUAGE: ${targetLangName}. Write foodName, description, and advice in ${targetLangName}.
    
ORIGINAL ANALYSIS:
${JSON.stringify(originalAnalysis, null, 2)}

USER CORRECTION:
"${correction}"

${userContext}

Re-analyze and return corrected JSON.`;

    try {
        const parts: any[] = [{ text: prompt }];

        // Include original image if available
        if (originalImage) {
            parts.unshift({
                inlineData: { mimeType: 'image/jpeg', data: originalImage }
            });
        }

        const response = await generateContentSmart({
            contents: { parts },
            config: { responseMimeType: 'application/json', responseSchema: FOOD_SCHEMA, systemInstruction: COACH_PERSONA }
        });

        if (response.text) return cleanAndParseJSON(response.text) as FoodAnalysisResult;
        throw new Error(i18n.t('errors.llm.no_data'));
    } catch (error) {
        console.error("Food refinement failed:", error);
        throw error;
    }
};

// Summarize History for Infinite Memory
export const summarizeHistory = async (
    existingSummary: string,
    oldFoodLogs: FoodLogEntry[],
    oldMoodLogs: MoodLog[],
    oldWeightLogs: WeightLogEntry[],
    targetLanguage: Language = 'en'
): Promise<string> => {
    const targetLangName = getLanguageFullName(targetLanguage);
    const prompt = `You are compressing user health history into a concise summary.

EXISTING SUMMARY:
${existingSummary || "No previous summary."}

NEW DATA TO INCORPORATE:
- Food Logs (${oldFoodLogs.length} entries): ${oldFoodLogs.slice(-20).map(f => f.food.foodName).join(", ")}
- Mood Logs (${oldMoodLogs.length} entries): ${oldMoodLogs.slice(-10).map(m => m.mood).join(", ")}
- Weight Logs (${oldWeightLogs.length} entries): ${oldWeightLogs.slice(-5).map(w => `${w.weight}kg`).join(", ")}

Create a 2-3 sentence summary that captures:
1. Notable eating patterns
2. Mood trends
3. Weight trajectory
4. Any concerning patterns

TARGET LANGUAGE: ${targetLangName}. Write the summary in ${targetLangName}.

Be very concise. Return ONLY the summary text, no markdown or formatting.`;

    try {
        const response = await generateContentSmart({
            contents: prompt,
        });

        return response.text || existingSummary || "No summary available.";
    } catch (error) {
        console.error("History summarization failed:", error);
        return existingSummary || "Summary unavailable.";
    }
};
