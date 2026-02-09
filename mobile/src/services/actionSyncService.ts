// Action Sync Service - Coordinates actions between notifications and overlays
// Provides: Mutex for concurrent access, retry logic, cross-channel sync

import { Platform, NativeModules } from 'react-native';
import * as Notifications from 'expo-notifications';
import storage, { addWaterForDate } from './storageService';
import { DailyPlan, PlanItem, FoodLogEntry, ActivityLogEntry } from '../types';
import { getLocalDateKey } from '../utils/dateUtils';
import { getActiveDayKey } from './dayBoundaryService';
import { cancelScheduledOverlay } from './overlayService';
import { llmQueueService } from './llmQueueService';
import { resolveLanguage } from './languageService';
import { planRefinementService } from './planRefinementService';
import { userAdaptiveService } from './userAdaptiveService';
import { invalidateLLMContextCache } from './llmContextService';
import { WidgetService } from './WidgetService';
import i18n from '../i18n';

// ============ MUTEX FOR CONCURRENT ACCESS ============

type MutexCallback<T> = () => Promise<T>;

class AsyncMutex {
    private locked = false;
    private queue: Array<() => void> = [];

    async acquire(): Promise<void> {
        if (!this.locked) {
            this.locked = true;
            return;
        }

        return new Promise<void>((resolve) => {
            this.queue.push(resolve);
        });
    }

    release(): void {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next?.();
        } else {
            this.locked = false;
        }
    }

    async runExclusive<T>(callback: MutexCallback<T>): Promise<T> {
        await this.acquire();
        try {
            return await callback();
        } finally {
            this.release();
        }
    }
}

// Single mutex for all plan modifications
const planMutex = new AsyncMutex();

// ============ RETRY LOGIC WITH EXPONENTIAL BACKOFF ============

interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffFactor: 2,
};

/**
 * Execute a function with retry and exponential backoff
 */
export const withRetry = async <T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> => {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: Error | null = null;
    let delay = opts.initialDelayMs;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            console.warn(`[ActionSync] Attempt ${attempt}/${opts.maxAttempts} failed:`, error);

            if (attempt < opts.maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delay));
                delay = Math.min(delay * opts.backoffFactor, opts.maxDelayMs);
            }
        }
    }

    throw lastError || new Error(i18n.t('errors.sync.retry_failed'));
};

const loadPlanForDate = async (
    planDate: string
): Promise<{ plan: DailyPlan | null; usedLegacy: boolean }> => {
    const planKey = `${storage.keys.DAILY_PLAN}_${planDate}`;
    const plan = await storage.get<DailyPlan>(planKey);
    if (plan) return { plan, usedLegacy: false };

    const legacyPlan = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
    if (!legacyPlan) return { plan: null, usedLegacy: false };

    const legacyDate = (legacyPlan as any)?.date;
    const matchesLegacy = !legacyDate || legacyDate === planDate;
    if (!matchesLegacy) return { plan: null, usedLegacy: false };

    return { plan: legacyPlan, usedLegacy: true };
};

const getPlanItemSnapshot = async (
    planDate: string,
    planItemId: string
): Promise<PlanItem | null> => {
    const { plan } = await loadPlanForDate(planDate);
    if (!plan?.items?.length) return null;
    return plan.items.find(item => item.id === planItemId) || null;
};

const persistPlanUpdate = async (
    planDate: string,
    plan: DailyPlan,
    usedLegacy: boolean
): Promise<void> => {
    const planKey = `${storage.keys.DAILY_PLAN}_${planDate}`;
    await storage.set(planKey, plan);

    const todayKey = await getActiveDayKey();
    if (usedLegacy || planDate === todayKey) {
        await storage.set(storage.keys.DAILY_PLAN, plan);
    }
};

// ============ HANDLED ACTIONS TRACKING ============

const HANDLED_ACTIONS_KEY = '@plan_action_handled_v1';
const ACTION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours to block duplicate replays
const handledActionCache = new Map<string, number>();
let handledActionsLoaded = false;

interface HandledAction {
    id: string;
    timestamp: number;
}

const pruneHandledActions = (now = Date.now()): void => {
    for (const [key, timestamp] of handledActionCache.entries()) {
        if (now - timestamp > ACTION_EXPIRY_MS) {
            handledActionCache.delete(key);
        }
    }
};

const ensureHandledActionsLoaded = async (): Promise<void> => {
    if (handledActionsLoaded) return;
    const stored = await storage.get<HandledAction[]>(HANDLED_ACTIONS_KEY);
    if (Array.isArray(stored)) {
        const now = Date.now();
        stored.forEach(entry => {
            if (entry?.id && typeof entry.timestamp === 'number' && (now - entry.timestamp) <= ACTION_EXPIRY_MS) {
                handledActionCache.set(entry.id, entry.timestamp);
            }
        });
    }
    handledActionsLoaded = true;
};

const persistHandledActions = async (): Promise<void> => {
    const entries: HandledAction[] = [];
    for (const [id, timestamp] of handledActionCache.entries()) {
        entries.push({ id, timestamp });
    }
    await storage.set(HANDLED_ACTIONS_KEY, entries);
};

/**
 * Check if an action has already been handled
 */
export const isActionHandled = (planItemId: string, actionType: string): boolean => {
    const key = `${planItemId}_${actionType}`;
    const timestamp = handledActionCache.get(key);
    if (!timestamp) return false;
    if (Date.now() - timestamp > ACTION_EXPIRY_MS) {
        handledActionCache.delete(key);
        return false;
    }
    return true;
};

/**
 * Mark an action as handled
 */
export const markActionHandled = async (planItemId: string, actionType: string): Promise<void> => {
    const key = `${planItemId}_${actionType}`;
    handledActionCache.set(key, Date.now());
    pruneHandledActions();
    await persistHandledActions();
};

/**
 * Clear an action as handled (call when uncompleting)
 */
export const clearActionHandled = async (planItemId: string, actionType: string): Promise<void> => {
    const key = `${planItemId}_${actionType}`;
    handledActionCache.delete(key);
    await persistHandledActions();
};

// ============ CROSS-CHANNEL SYNCHRONIZATION ============

/**
 * Cancel related notification when overlay action is taken
 */
export const cancelRelatedNotification = async (planItemId: string): Promise<void> => {
    try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();

        for (const notification of scheduled) {
            const data = notification.content.data as { planItemId?: string };
            if (data?.planItemId === planItemId) {
                await Notifications.cancelScheduledNotificationAsync(notification.identifier);
                console.log(`[ActionSync] Cancelled notification for item ${planItemId}`);
            }
        }
    } catch (error) {
        console.error('[ActionSync] Failed to cancel notification:', error);
    }
};

/**
 * Cancel related overlay when notification action is taken
 */
export const cancelRelatedOverlay = async (planItemId: string): Promise<void> => {
    try {
        if (Platform.OS === 'android') {
            // Cancel scheduled overlay via native module
            await cancelScheduledOverlay(planItemId);
            console.log(`[ActionSync] Cancelled overlay for item ${planItemId}`);

            // Also hide if currently visible
            const { OverlayModule } = NativeModules;
            if (OverlayModule?.hideOverlay) {
                await OverlayModule.hideOverlay();
            }
        }
    } catch (error) {
        console.error('[ActionSync] Failed to cancel overlay:', error);
    }
};

/**
 * Cancel all related reminders (both notification and overlay)
 */
export const cancelAllRemindersForItem = async (planItemId: string): Promise<void> => {
    await Promise.all([
        cancelRelatedNotification(planItemId),
        cancelRelatedOverlay(planItemId),
    ]);
};

// ============ SMART AMOUNT PARSING ============

/**
 * Parse hydration amount from plan item text
 * Handles multiple formats: "500ml", "1L", "Drink 250ml water", "Hydrate (500ml)", etc.
 */
const parseHydrationAmount = (item: PlanItem): number => {
    const textToSearch = `${item.title || ''} ${item.description || ''}`.toLowerCase();

    // Try multiple regex patterns for better coverage
    const patterns = [
        /(\d+(?:\.\d+)?)\s*ml/i,           // "500ml", "250 ml"
        /(\d+(?:\.\d+)?)\s*l(?:iters?|itres?)?(?!\w)/i, // "1L", "1.5 liters", "2 litres"
        /drink\s+(\d+)/i,                  // "Drink 500"
        /hydrate.*?(\d+)/i,                // "Hydrate 500ml" or "Hydration: 500"
        /water.*?(\d+)/i,                  // "Water 500ml"
        /(\d+)(?=\s*(?:ml|l))/i           // Fallback: any number before ml/l
    ];

    for (const pattern of patterns) {
        const match = textToSearch.match(pattern);
        if (match) {
            let amount = parseFloat(match[1]);

            // Check if it's in liters by looking at the full match context
            const fullMatch = match[0].toLowerCase();
            if (fullMatch.includes('l') && !fullMatch.includes('ml')) {
                amount *= 1000; // Convert liters to ml
            }

            // Sanity check: amount should be between 50ml and 5000ml
            if (amount >= 50 && amount <= 5000) {
                console.log(`[ActionSync] Parsed hydration amount: ${amount}ml from "${textToSearch}"`);
                return Math.round(amount);
            }
        }
    }

    // Default fallback
    console.warn(`[ActionSync] Could not parse hydration amount from "${textToSearch}", defaulting to 250ml`);
    return 250;
};

// ============ SAFE PLAN MODIFICATION ============

/**
 * Safely modify a plan item with mutex lock and retry
 */
export const safeModifyPlanItem = async (
    planDate: string,
    planItemId: string,
    modifier: (item: PlanItem) => PlanItem
): Promise<boolean> => {
    return planMutex.runExclusive(async () => {
        return withRetry(async () => {
            const { plan, usedLegacy } = await loadPlanForDate(planDate);

            if (!plan) {
                console.warn(`[ActionSync] Plan not found for date ${planDate}`);
                return false;
            }

            const items = Array.isArray(plan.items) ? plan.items : [];
            const itemIndex = items.findIndex(item => item.id === planItemId);
            if (itemIndex === -1) {
                console.warn(`[ActionSync] Item ${planItemId} not found in plan`);
                return false;
            }

            // Apply modification
            const updatedItem = modifier(items[itemIndex]);
            const updatedItems = [...items];
            updatedItems[itemIndex] = updatedItem;

            // Save with updated timestamp
            const normalizedPlan = (!plan.date || plan.date === planDate)
                ? { ...plan, date: planDate }
                : plan;

            await persistPlanUpdate(planDate, {
                ...normalizedPlan,
                items: updatedItems,
                updatedAt: Date.now(),
            }, usedLegacy);

            console.log(`[ActionSync] Modified item ${planItemId} successfully`);
            return true;
        });
    });
};



/**
 * Smartly log data based on the plan item type (Hydration, Workout, Meal)
 * This bridges the gap between "Checking a box" and "Logging data"
 */
const handleSmartLogging = async (planDate: string, planItemId: string): Promise<void> => {
    try {
        const { plan } = await loadPlanForDate(planDate);

        if (!plan) return;

        const items = Array.isArray(plan.items) ? plan.items : [];
        const item = items.find(i => i.id === planItemId);
        if (!item) return;

        const language = await resolveLanguage();

        // Lazy load to avoid circular dependency
        const { emit, notifyFoodLogged } = require('./planEventService');

        // === HYDRATION ===
        if (item.type === 'hydration') {
            const amount = parseHydrationAmount(item);
            const newAmount = await addWaterForDate(planDate, amount);
            console.log(`[ActionSync] Smart Log: Added ${amount}ml water (total: ${newAmount}ml)`);

            // Emit water event so UI refreshes
            emit('WATER_LOGGED', { date: planDate, amount: newAmount });
        }

        // === WORKOUT ===
        if (item.type === 'workout') {
            const allActivity = await storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY) || [];

            // Heuristic: default to 30 mins if not parsable
            let duration = 30;
            const timeMatch = item.description?.match(/(\d+)\s*mins/);
            if (timeMatch) duration = parseInt(timeMatch[1]);

            // Estimate calories (METs ~ 5 for moderate)
            const calories = duration * 5;
            const logId = `auto-${Date.now()}`;

            const newActivity: ActivityLogEntry = {
                id: logId,
                timestamp: Date.now(),
                planItemId: planItemId, // For reliable matching on uncomplete
                name: item.title,
                durationMinutes: duration,
                caloriesBurned: calories,
                intensity: 'moderate',
                notes: 'Logging...'
            };

            await storage.set(storage.keys.ACTIVITY, [...allActivity, newActivity]);
            console.log(`[ActionSync] Smart Log: Added activity "${item.title}" (${duration}m)`);
            emit('ACTIVITY_LOGGED', { name: item.title, duration, caloriesBurned: calories });

            // QUEUE AI ENRICHMENT
            void llmQueueService.addJob('ENRICH_ACTIVITY', { logId, itemName: item.title, duration, language }).catch((error) => {
                console.warn('[ActionSync] Failed to queue ENRICH_ACTIVITY:', error);
            });
        }

        // === MEAL ===
        if (item.type === 'meal') {
            const allFood = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
            const logId = `auto-${Date.now()}`;

            // Parse estimated macros from plan item description
            // Plan descriptions often contain: "~400 kcal", "30g protein", etc.
            const textToSearch = `${item.title || ''} ${item.description || ''}`;
            let calories = 0, protein = 0, carbs = 0, fat = 0;

            // Parse calories: "400 kcal", "~500 calories", "350kcal"
            const calMatch = textToSearch.match(/~?(\d+)\s*(?:kcal|calories?|cals?)/i);
            if (calMatch) calories = parseInt(calMatch[1]);

            // Parse protein: "30g protein", "protein: 25g"
            const proteinMatch = textToSearch.match(/(\d+)\s*g?\s*protein|protein[:\s]+(\d+)/i);
            if (proteinMatch) protein = parseInt(proteinMatch[1] || proteinMatch[2]);

            // Parse carbs: "50g carbs", "carbs: 40g"
            const carbsMatch = textToSearch.match(/(\d+)\s*g?\s*carbs?|carbs?[:\s]+(\d+)/i);
            if (carbsMatch) carbs = parseInt(carbsMatch[1] || carbsMatch[2]);

            // Parse fat: "15g fat", "fat: 20g"
            const fatMatch = textToSearch.match(/(\d+)\s*g?\s*fat|fat[:\s]+(\d+)/i);
            if (fatMatch) fat = parseInt(fatMatch[1] || fatMatch[2]);

            const newFood: FoodLogEntry = {
                id: logId,
                timestamp: Date.now(),
                planItemId: planItemId, // For reliable matching on uncomplete
                source: 'plan_auto',
                food: {
                    foodName: item.title,
                    description: item.description,

                    healthGrade: 'B',
                    confidence: 'auto',
                    advice: 'Logged via Plan',
                    ingredients: [],
                    macros: { calories, protein, carbs, fat }
                }
            };

            await storage.set(storage.keys.FOOD, [...allFood, newFood]);
            console.log(`[ActionSync] Smart Log: Added meal "${item.title}" with parsed macros: ${calories}kcal, ${protein}g protein`);
            if (typeof notifyFoodLogged === 'function') {
                void notifyFoodLogged(newFood);
            } else {
                emit('FOOD_LOGGED', { foodName: item.title, calories });
            }

            // QUEUE AI ENRICHMENT (will update with more accurate values)
            void llmQueueService.addJob('ENRICH_FOOD', { logId, itemName: item.title, itemDesc: item.description, language }).catch((error) => {
                console.warn('[ActionSync] Failed to queue ENRICH_FOOD:', error);
            });
        }

    } catch (error) {
        console.error('[ActionSync] Smart logging failed:', error);
        // Don't block the main completion action
    }
};

/**
 * Remove logged data when a plan item is uncompleted
 * Reverses the effects of handleSmartLogging
 */
const handleSmartUnlogging = async (planDate: string, planItemId: string): Promise<void> => {
    try {
        const { plan } = await loadPlanForDate(planDate);

        if (!plan) return;

        const items = Array.isArray(plan.items) ? plan.items : [];
        const item = items.find(i => i.id === planItemId);
        if (!item) return;

        // Lazy load to avoid circular dependency
        const { emit } = require('./planEventService');
        const { getWaterAmountForDate, setWaterAmountForDate } = require('./storageService');
        const { getLocalDateKey } = require('../utils/dateUtils');

        // === HYDRATION: Decrement water ===
        if (item.type === 'hydration') {
            const amount = parseHydrationAmount(item); // Use same parsing as logging
            const current = await getWaterAmountForDate(planDate);
            const newAmount = Math.max(0, current - amount);
            await setWaterAmountForDate(planDate, newAmount);
            console.log(`[ActionSync] Smart Unlog: Removed ${amount}ml water (total: ${newAmount}ml)`);
            emit('WATER_LOGGED', { date: planDate, amount: newAmount });
        }

        // === WORKOUT: Remove activity log by planItemId (reliable) or name (fallback) ===
        if (item.type === 'workout') {
            const allActivity = await storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY) || [];
            const filtered = allActivity.filter(a => {
                const activityDate = getLocalDateKey(new Date(a.timestamp));
                // Match by planItemId first (reliable even after AI enrichment)
                if ((a as any).planItemId === planItemId && activityDate === planDate) return false;
                // Fallback: match by name for legacy entries
                return !(a.name === item.title && activityDate === planDate);
            });

            if (filtered.length < allActivity.length) {
                await storage.set(storage.keys.ACTIVITY, filtered);
                console.log(`[ActionSync] Smart Unlog: Removed activity "${item.title}"`);
                emit('ACTIVITY_LOGGED', { name: item.title, removed: true });
            }
        }

        // === MEAL: Remove food log by planItemId (reliable) or foodName (fallback) ===
        if (item.type === 'meal') {
            const allFood = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
            const filtered = allFood.filter(f => {
                const foodDate = getLocalDateKey(new Date(f.timestamp));
                // Match by planItemId first (reliable even after AI enrichment changes foodName)
                if ((f as any).planItemId === planItemId && foodDate === planDate) return false;
                // Fallback: match by foodName for legacy entries
                return !(f.food.foodName === item.title && foodDate === planDate);
            });

            if (filtered.length < allFood.length) {
                await storage.set(storage.keys.FOOD, filtered);
                console.log(`[ActionSync] Smart Unlog: Removed meal "${item.title}"`);
                emit('FOOD_LOGGED', { foodName: item.title, removed: true });
                try {
                    const { nutritionService } = require('./nutritionService');
                    void nutritionService.refreshSnapshotForDate(planDate, { force: true });
                } catch (error) {
                    console.warn('[ActionSync] Failed to refresh nutrition snapshot:', error);
                }
            }
        }

    } catch (error) {
        console.error('[ActionSync] Smart unlogging failed:', error);
    }
};

/**
 * Uncomplete a plan item with full sync - removes logged data
 */
export const uncompleteItemWithSync = async (
    planDate: string,
    planItemId: string
): Promise<boolean> => {
    // CRITICAL: Clear the 'complete' handler so re-complete works
    await clearActionHandled(planItemId, 'complete');

    // Remove logged data first (water, activity, food)
    await handleSmartUnlogging(planDate, planItemId);

    // Modify plan to uncomplete
    const success = await safeModifyPlanItem(planDate, planItemId, (item) => ({
        ...item,
        completed: false,
        skipped: false,
        completedAt: undefined,
        skippedAt: undefined,
        missed: false,
        missedAt: undefined,
        snoozedUntil: undefined,
    }));

    if (success) {
        const { emit } = require('./planEventService');
        emit('PLAN_ITEM_COMPLETED', { date: planDate, itemId: planItemId, uncompleted: true });
        emit('PLAN_UPDATED', { date: planDate, source: 'action_sync', reason: 'uncomplete' });
        console.log(`[ActionSync] Uncompleted item ${planItemId}`);
        invalidateLLMContextCache();
        void WidgetService.updateWidgetFromStorage();
    }

    return success;
};

/**
 * Complete a plan item with full sync
 */
export const completeItemWithSync = async (
    planDate: string,
    planItemId: string,
    options?: { skipSmartLogging?: boolean }
): Promise<boolean> => {
    await ensureHandledActionsLoaded();
    // Check if already handled
    if (isActionHandled(planItemId, 'complete')) {
        console.log(`[ActionSync] Item ${planItemId} already completed, skipping`);
        return true;
    }

    // Mark as handled immediately to prevent duplicates
    await markActionHandled(planItemId, 'complete');

    const itemSnapshot = await getPlanItemSnapshot(planDate, planItemId);

    // SMART BRIDGE: Log the data (Water, Activity, Food) before marking complete
    // This ensures history is updated and graphs move
    if (!options?.skipSmartLogging) {
        await handleSmartLogging(planDate, planItemId);
    }

    // Cancel all reminders
    await cancelAllRemindersForItem(planItemId);

    // Modify plan
    const success = await safeModifyPlanItem(planDate, planItemId, (item) => ({
        ...item,
        completed: true,
        skipped: false,
        completedAt: Date.now(),
        missed: false,
        missedAt: undefined,
        snoozedUntil: undefined,
    }));

    if (!success) {
        await clearActionHandled(planItemId, 'complete');
        return false;
    }

    if (success) {
        // EVENT BUS: Notify system that item was completed
        // This triggers UI refresh and AI updates
        const { emit } = require('./planEventService'); // Lazy require to avoid circular dependency
        emit('PLAN_ITEM_COMPLETED', { date: planDate, itemId: planItemId });
        emit('PLAN_UPDATED', { date: planDate, source: 'action_sync', reason: 'complete' });
        console.log(`[ActionSync] Emitted PLAN_ITEM_COMPLETED for ${planItemId}`);

        // Track for plan refinement (trigger after 3+ completions)
        void planRefinementService.recordItemCompleted().catch(console.warn);

        if (itemSnapshot) {
            void userAdaptiveService.recordPlanItemAction('complete', itemSnapshot, Date.now());
        }
        invalidateLLMContextCache();
        void WidgetService.updateWidgetFromStorage();
    }

    return success;
};

/**
 * Skip a plan item with full sync
 */
export const skipItemWithSync = async (
    planDate: string,
    planItemId: string
): Promise<boolean> => {
    await ensureHandledActionsLoaded();
    if (isActionHandled(planItemId, 'skip')) {
        console.log(`[ActionSync] Item ${planItemId} already skipped, skipping`);
        return true;
    }

    await markActionHandled(planItemId, 'skip');
    const itemSnapshot = await getPlanItemSnapshot(planDate, planItemId);
    await cancelAllRemindersForItem(planItemId);

    // Track for plan refinement (trigger after 2+ skips)
    void planRefinementService.recordItemSkipped().catch(console.warn);

    const success = await safeModifyPlanItem(planDate, planItemId, (item) => ({
        ...item,
        skipped: true,
        skippedAt: Date.now(),
        missed: true,
        missedAt: Date.now(),
        snoozedUntil: undefined,
    }));
    if (!success) {
        await clearActionHandled(planItemId, 'skip');
        return false;
    }
    if (itemSnapshot) {
        void userAdaptiveService.recordPlanItemAction('skip', itemSnapshot, Date.now());
    }
    try {
        const { emit } = require('./planEventService');
        emit('PLAN_ITEM_SKIPPED', { date: planDate, itemId: planItemId });
        emit('PLAN_UPDATED', { date: planDate, source: 'action_sync', reason: 'skip' });
    } catch (error) {
        console.warn('[ActionSync] Failed to emit skip events:', error);
    }
    invalidateLLMContextCache();
    void WidgetService.updateWidgetFromStorage();
    return success;
};

/**
 * Snooze a plan item with full sync
 */
export const snoozeItemWithSync = async (
    planDate: string,
    planItemId: string,
    minutes: number
): Promise<boolean> => {
    // Snooze can be repeated, so we don't check isActionHandled

    const itemSnapshot = await getPlanItemSnapshot(planDate, planItemId);

    // Cancel current reminders
    await cancelAllRemindersForItem(planItemId);

    const snoozedUntil = Date.now() + minutes * 60 * 1000;

    const success = await safeModifyPlanItem(planDate, planItemId, (item) => ({
        ...item,
        snoozedUntil,
    }));
    if (success && itemSnapshot) {
        void userAdaptiveService.recordPlanItemAction('snooze', itemSnapshot, Date.now());
    }
    if (success) {
        try {
            const { emit } = require('./planEventService');
            emit('PLAN_UPDATED', { date: planDate, source: 'action_sync', reason: 'snooze' });
        } catch (error) {
            console.warn('[ActionSync] Failed to emit snooze event:', error);
        }
        invalidateLLMContextCache();
        void WidgetService.updateWidgetFromStorage();
    }
    return success;
};

/**
 * Snooze a plan item until an absolute timestamp (ms).
 * Used for killed-state overlay actions where the user picked a concrete snooze time.
 */
export const snoozeItemUntilWithSync = async (
    planDate: string,
    planItemId: string,
    untilMs: number
): Promise<boolean> => {
    await cancelAllRemindersForItem(planItemId);

    const now = Date.now();
    const itemSnapshot = await getPlanItemSnapshot(planDate, planItemId);
    const snoozedUntil =
        typeof untilMs === 'number' && Number.isFinite(untilMs) && untilMs > now
            ? untilMs
            : undefined;

    const success = await safeModifyPlanItem(planDate, planItemId, (item) => ({
        ...item,
        snoozedUntil,
    }));
    if (success && itemSnapshot) {
        void userAdaptiveService.recordPlanItemAction('snooze', itemSnapshot, now);
    }
    if (success) {
        try {
            const { emit } = require('./planEventService');
            emit('PLAN_UPDATED', { date: planDate, source: 'action_sync', reason: 'snooze_until' });
        } catch (error) {
            console.warn('[ActionSync] Failed to emit snooze-until event:', error);
        }
        invalidateLLMContextCache();
        void WidgetService.updateWidgetFromStorage();
    }
    return success;
};

// ============ ERROR RECOVERY ============

interface FailedAction {
    planDate: string;
    planItemId: string;
    actionType: 'complete' | 'skip' | 'snooze';
    snoozedUntil?: number;
    timestamp: number;
    retryCount: number;
}

const FAILED_ACTIONS_KEY = 'failed_actions';
const MAX_RECOVERY_RETRIES = 5;

// Edge case handling: prevent unbounded growth and stale actions
const MAX_FAILED_ACTION_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_FAILED_ACTIONS = 20; // Prevent unbounded queue growth

// In-memory fallback when storage is full
let inMemoryFailedActions: FailedAction[] = [];

/**
 * Store a failed action for later recovery
 * Falls back to in-memory storage if device storage is full
 */
export const storeFailedAction = async (action: Omit<FailedAction, 'timestamp' | 'retryCount'>): Promise<void> => {
    const newAction: FailedAction = {
        ...action,
        timestamp: Date.now(),
        retryCount: 0,
    };

    try {
        const existing = await storage.get<FailedAction[]>(FAILED_ACTIONS_KEY) || [];
        existing.push(newAction);

        // Keep bounded to prevent unbounded growth
        const bounded = existing.slice(-MAX_FAILED_ACTIONS);
        await storage.set(FAILED_ACTIONS_KEY, bounded);
        console.log(`[ActionSync] Stored failed action for recovery: ${action.actionType} on ${action.planItemId}`);
    } catch (storageError) {
        // Storage full - fall back to in-memory
        console.warn('[ActionSync] Storage full, falling back to in-memory:', storageError);
        inMemoryFailedActions.push(newAction);

        // Bound in-memory array too
        if (inMemoryFailedActions.length > MAX_FAILED_ACTIONS) {
            inMemoryFailedActions = inMemoryFailedActions.slice(-MAX_FAILED_ACTIONS);
        }
    }
};

/**
 * Recover failed actions
 * Handles stale action cleanup and merges in-memory fallback
 */
export const recoverFailedActions = async (): Promise<{ recovered: number; failed: number }> => {
    const result = { recovered: 0, failed: 0 };

    try {
        // Get stored actions and merge with any in-memory fallback
        let failedActions = await storage.get<FailedAction[]>(FAILED_ACTIONS_KEY) || [];

        // Merge in-memory fallback actions
        if (inMemoryFailedActions.length > 0) {
            console.log(`[ActionSync] Merging ${inMemoryFailedActions.length} in-memory actions`);
            failedActions = [...failedActions, ...inMemoryFailedActions];
            inMemoryFailedActions = []; // Clear after merging
        }

        // Filter out stale actions (older than 48 hours)
        const now = Date.now();
        const freshActions = failedActions.filter(a => {
            const age = now - a.timestamp;
            if (age > MAX_FAILED_ACTION_AGE_MS) {
                console.log(`[ActionSync] Discarding stale action (${Math.round(age / 3600000)}h old): ${a.planItemId}`);
                return false;
            }
            return true;
        });

        // Keep only most recent if too many
        if (freshActions.length > MAX_FAILED_ACTIONS) {
            console.log(`[ActionSync] Trimming actions from ${freshActions.length} to ${MAX_FAILED_ACTIONS}`);
            failedActions = freshActions.slice(-MAX_FAILED_ACTIONS);
        } else {
            failedActions = freshActions;
        }

        if (failedActions.length === 0) {
            return result;
        }

        console.log(`[ActionSync] Attempting to recover ${failedActions.length} failed actions`);

        const remaining: FailedAction[] = [];

        for (const action of failedActions) {
            if (action.retryCount >= MAX_RECOVERY_RETRIES) {
                console.warn(`[ActionSync] Action exceeded max retries, discarding: ${action.planItemId}`);
                result.failed++;
                continue;
            }

            try {
                let success = false;
                switch (action.actionType) {
                    case 'complete':
                        success = await completeItemWithSync(action.planDate, action.planItemId);
                        break;
                    case 'skip':
                        success = await skipItemWithSync(action.planDate, action.planItemId);
                        break;
                    case 'snooze':
                        success = typeof action.snoozedUntil === 'number'
                            ? await snoozeItemUntilWithSync(action.planDate, action.planItemId, action.snoozedUntil)
                            : await snoozeItemWithSync(action.planDate, action.planItemId, 15);
                        break;
                }

                if (success) {
                    result.recovered++;
                    console.log(`[ActionSync] Recovered action: ${action.actionType} on ${action.planItemId}`);
                } else {
                    action.retryCount++;
                    remaining.push(action);
                }
            } catch (error) {
                console.error(`[ActionSync] Recovery failed for ${action.planItemId}:`, error);
                action.retryCount++;
                remaining.push(action);
            }
        }

        // Save remaining failed actions
        try {
            await storage.set(FAILED_ACTIONS_KEY, remaining);
        } catch (saveError) {
            console.warn('[ActionSync] Could not save remaining actions:', saveError);
            // Keep in memory as fallback
            inMemoryFailedActions = remaining;
        }
        result.failed += remaining.length;

        return result;
    } catch (error) {
        console.error('[ActionSync] Failed to recover actions:', error);
        return result;
    }
};

/**
 * Clear all failed actions (for testing/reset)
 */
export const clearFailedActions = async (): Promise<void> => {
    await storage.set(FAILED_ACTIONS_KEY, []);
};

export default {
    // Mutex
    planMutex,

    // Retry
    withRetry,

    // Action tracking
    isActionHandled,
    markActionHandled,

    // Cross-channel sync
    cancelRelatedNotification,
    cancelRelatedOverlay,
    cancelAllRemindersForItem,

    // Safe modifications
    safeModifyPlanItem,
    completeItemWithSync,
    skipItemWithSync,
    snoozeItemWithSync,
    snoozeItemUntilWithSync,

    // Error recovery
    storeFailedAction,
    recoverFailedActions,
    clearFailedActions,
};
