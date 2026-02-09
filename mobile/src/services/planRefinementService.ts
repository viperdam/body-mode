/**
 * Plan Refinement Service - Event-driven plan updates
 * 
 * Triggers plan refinement when significant changes occur:
 * - 3+ items completed (user is ahead of schedule)
 * - 2+ items skipped (plan needs adjustment)
 * - 500+ extra calories logged (adjust remaining meals)
 * - Nap ended (adjust afternoon schedule)
 * 
 * Uses debouncing to batch changes and avoid excessive LLM calls.
 */

import { llmQueueService } from './llmQueueService';
import { energyService } from './energyService';
import { emit } from './planEventService';
import storage from './storageService';
import { getLocalDateKey } from '../utils/dateUtils';
import { getActiveDayKey, getLastWakeTime, setLastWakeTime } from './dayBoundaryService';
import { showLocationContextOverlay } from './locationOverlayService';
import { resolveLanguage } from './languageService';
import { DailyPlan, PlanItem, FoodLogEntry, ActivityLogEntry, UserContextState } from '../types';

// ==================== DEVIATION TRACKING ====================

export interface DeviationContext {
    originalItem?: PlanItem;
    actualMeal?: { name: string; calories?: number; protein?: number };
    actualActivity?: { name: string; duration: number; calories?: number };
    caloriesDiff?: number;  // positive = ate/burned more, negative = less
    proteinDiff?: number;
    activityTypeDiff?: string; // e.g., "yoga instead of HIIT"
    timestamp?: number;
}

export interface ContextChangeEvent {
    from: UserContextState;
    to: UserContextState;
    location?: string;
    locationContext?: string;
    timestamp: number;
}

// ==================== CONFIGURATION ====================

interface RefineTrigger {
    threshold: number;
    debounceMs: number;
    priority: 'low' | 'normal' | 'high' | 'critical';
}

const REFINE_TRIGGERS: Record<string, RefineTrigger> = {
    ITEMS_COMPLETED: { threshold: 3, debounceMs: 5 * 60 * 1000, priority: 'low' },
    ITEMS_SKIPPED: { threshold: 2, debounceMs: 5 * 60 * 1000, priority: 'normal' },
    EXTRA_CALORIES: { threshold: 500, debounceMs: 2 * 60 * 1000, priority: 'normal' },
    NAP_ENDED: { threshold: 1, debounceMs: 3 * 60 * 1000, priority: 'low' },
    UNEXPECTED_MEAL: { threshold: 1, debounceMs: 5 * 60 * 1000, priority: 'low' },
    CONTEXT_CHANGE: { threshold: 1, debounceMs: 2 * 60 * 1000, priority: 'normal' }, // User context changed
    WAKE_DETECTED: { threshold: 1, debounceMs: 0, priority: 'critical' }, // New day!
};

const STORAGE_KEYS = {
    PENDING_REFINE: '@pending_plan_refine',
    LAST_REFINE_TIME: '@last_plan_refine_time',
    EVENT_COUNTS: '@plan_refine_event_counts',
    DEVIATIONS: '@plan_deviations',
    CONTEXT_CHANGES: '@plan_context_changes',
    LAST_CONTEXT: '@last_user_context',
    CARRIED_OVER_ITEMS: '@carried_over_items',
    LAST_MIDNIGHT_ROLLOVER: '@last_midnight_rollover',
};

const LOCATION_OVERLAY_COOLDOWN_MS = 30 * 60 * 1000;
const LAST_LOCATION_OVERLAY_KEY = '@last_location_overlay_prompt';

// ==================== STATE ====================

interface EventCounts {
    itemsCompleted: number;
    itemsSkipped: number;
    extraCalories: number;
    napsEnded: number;
    unexpectedMeals: number;
    lastReset: number;
}

const defaultCounts: EventCounts = {
    itemsCompleted: 0,
    itemsSkipped: 0,
    extraCalories: 0,
    napsEnded: 0,
    unexpectedMeals: 0,
    lastReset: Date.now(),
};

const dateFromKey = (dateKey: string): Date | null => {
    const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
    return new Date(year, month - 1, day, 0, 0, 0, 0);
};

type StoredContextSnapshot = {
    state: UserContextState;
    location?: string;
};

const normalizeState = (state?: UserContextState | null): UserContextState | null => {
    if (!state) return null;
    return state === 'idle' ? 'resting' : state;
};

const normalizeStoredContext = (value: unknown): StoredContextSnapshot | null => {
    if (!value) return null;
    if (typeof value === 'string') {
        return { state: normalizeState(value as UserContextState) as UserContextState };
    }
    if (typeof value === 'object' && value !== null) {
        const record = value as { state?: UserContextState; location?: string };
        if (record.state) {
            return { state: normalizeState(record.state) as UserContextState, location: record.location };
        }
    }
    return null;
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ==================== SERVICE ====================

export const planRefinementService = {
    /**
     * Record that an item was completed
     */
    async recordItemCompleted(): Promise<void> {
        const counts = await this.getEventCounts();
        counts.itemsCompleted++;
        await this.saveEventCounts(counts);
        console.log(`[PlanRefine] Item completed (${counts.itemsCompleted} total)`);
        await this.evaluateRefine('ITEMS_COMPLETED', counts.itemsCompleted);
    },

    /**
     * Record that an item was skipped
     */
    async recordItemSkipped(): Promise<void> {
        const counts = await this.getEventCounts();
        counts.itemsSkipped++;
        await this.saveEventCounts(counts);
        console.log(`[PlanRefine] Item skipped (${counts.itemsSkipped} total)`);
        await this.evaluateRefine('ITEMS_SKIPPED', counts.itemsSkipped);
    },

    /**
     * Record extra calories logged (beyond plan)
     */
    async recordExtraCalories(amount: number): Promise<void> {
        const counts = await this.getEventCounts();
        counts.extraCalories += amount;
        await this.saveEventCounts(counts);
        console.log(`[PlanRefine] Extra calories: +${amount} (${counts.extraCalories} total)`);
        await this.evaluateRefine('EXTRA_CALORIES', counts.extraCalories);
    },

    /**
     * Record that a nap ended
     */
    async recordNapEnded(): Promise<void> {
        const counts = await this.getEventCounts();
        counts.napsEnded++;
        await this.saveEventCounts(counts);
        console.log(`[PlanRefine] Nap ended`);
        await this.evaluateRefine('NAP_ENDED', counts.napsEnded);
    },

    /**
     * Record an unexpected meal (not in plan)
     */
    async recordUnexpectedMeal(): Promise<void> {
        const counts = await this.getEventCounts();
        counts.unexpectedMeals++;
        await this.saveEventCounts(counts);
        console.log(`[PlanRefine] Unexpected meal recorded`);
        await this.evaluateRefine('UNEXPECTED_MEAL', counts.unexpectedMeals);
    },

    /**
     * Evaluate if we should trigger a refine
     */
    async evaluateRefine(eventType: string, currentCount: number): Promise<void> {
        const trigger = REFINE_TRIGGERS[eventType];
        if (!trigger) return;

        if (currentCount >= trigger.threshold) {
            console.log(`[PlanRefine] Threshold met for ${eventType}, scheduling refine`);
            await this.scheduleRefine(trigger.debounceMs, trigger.priority);
        }
    },

    /**
     * Schedule a plan refine with debounce
     */
    async scheduleRefine(debounceMs: number, priority: 'low' | 'normal' | 'high' | 'critical'): Promise<void> {
        // Cancel existing timer
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        // Check if a refine was done recently (within 30 min)
        const lastRefine = await storage.get<number>(STORAGE_KEYS.LAST_REFINE_TIME);
        if (lastRefine && Date.now() - lastRefine < 30 * 60 * 1000) {
            console.log('[PlanRefine] Skipping - refined recently');
            return;
        }

        // Store pending refine
        await storage.set(STORAGE_KEYS.PENDING_REFINE, {
            scheduledAt: Date.now(),
            priority,
        });

        // Schedule with debounce
        debounceTimer = setTimeout(async () => {
            await this.executeRefine(priority);
        }, debounceMs);

        console.log(`[PlanRefine] Scheduled refine in ${debounceMs / 1000}s (priority: ${priority})`);
    },

    /**
     * Execute the plan refine
     */
    async executeRefine(priority: 'low' | 'normal' | 'high' | 'critical'): Promise<void> {
        try {
            // Pre-flight energy check
            const cost = energyService.getCostForJob('REFINE_PLAN');
            const currentEnergy = await energyService.getEnergy();
            const bypassAvailable = llmQueueService.hasEnergyBypass();
            const canAfford = currentEnergy >= cost || bypassAvailable;

            if (!canAfford) {
                console.log(`[PlanRefine] Insufficient energy for refine (need ${cost}, have ${currentEnergy})`);

                // Emit energy low event to show AdOverlay
                emit('ENERGY_LOW', {
                    forPlanRefine: true,
                    required: cost,
                    current: currentEnergy,
                    operation: 'Plan Refinement',
                });

                // Don't fail silently - user will see the ad overlay
                return;
            }
            if (currentEnergy < cost && bypassAvailable) {
                console.log('[PlanRefine] Energy low, using bypass token for plan refinement');
            }

            // Get current plan
            const activeDay = await getActiveDayKey();
            const planKey = `${storage.keys.DAILY_PLAN}_${activeDay}`;
            const datedPlan = await storage.get<DailyPlan>(planKey);
            const legacyPlan = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
            let currentPlan =
                (datedPlan && (!datedPlan.date || datedPlan.date === activeDay) ? datedPlan : null) ||
                (legacyPlan && (!legacyPlan.date || legacyPlan.date === activeDay) ? legacyPlan : null);

            if (!currentPlan) {
                console.log('[PlanRefine] No plan to refine');
                return;
            }

            console.log(`[PlanRefine] Executing plan refinement (consuming ${cost} energy)...`);

            // Get deviations and context changes to pass to LLM
            const deviations = await this.getDeviations();
            const contextChanges = await this.getContextChanges();
            console.log(`[PlanRefine] Including ${deviations.length} deviations, ${contextChanges.length} context changes`);

            // Determine refine reason
            let reason = 'auto_refine';
            if (deviations.length > 0) reason = 'deviation_refine';
            else if (contextChanges.length > 0) reason = 'context_refine';

            const language = await resolveLanguage();

            // Queue refine job with full context
            await llmQueueService.addJob('REFINE_PLAN', {
                dateKey: activeDay,
                currentPlan,
                reason,
                deviations, // What user did differently
                contextChanges, // Where user went / what they're doing
                language,
            }, priority);

            // Reset counts, clear context, update last refine time
            await this.resetEventCounts();
            await this.clearDeviations();
            await this.clearContextChanges();
            await storage.set(STORAGE_KEYS.LAST_REFINE_TIME, Date.now());
            await storage.remove(STORAGE_KEYS.PENDING_REFINE);

            console.log('[PlanRefine] Refine job queued successfully');

        } catch (error) {
            console.error('[PlanRefine] Refine failed:', error);
        }
    },

    /**
     * Process pending refine on app startup
     */
    async processPendingOnStartup(): Promise<void> {
        const pending = await storage.get<{ scheduledAt: number; priority: string }>(
            STORAGE_KEYS.PENDING_REFINE
        );

        if (!pending) return;

        // If there was a pending refine, try to execute it
        console.log('[PlanRefine] Found pending refine from app background');
        await this.executeRefine(pending.priority as any);
    },

    /**
     * Get current event counts
     */
    async getEventCounts(): Promise<EventCounts> {
        const counts = await storage.get<EventCounts>(STORAGE_KEYS.EVENT_COUNTS);

        if (!counts) {
            return { ...defaultCounts };
        }

        // Reset if it's a new day
        const activeDay = await getActiveDayKey();
        const lastResetDate = getLocalDateKey(new Date(counts.lastReset));
        if (activeDay !== lastResetDate) {
            return { ...defaultCounts, lastReset: Date.now() };
        }

        return counts;
    },

    /**
     * Save event counts
     */
    async saveEventCounts(counts: EventCounts): Promise<void> {
        await storage.set(STORAGE_KEYS.EVENT_COUNTS, counts);
    },

    /**
     * Reset event counts
     */
    async resetEventCounts(): Promise<void> {
        await storage.set(STORAGE_KEYS.EVENT_COUNTS, { ...defaultCounts, lastReset: Date.now() });
    },

    /**
     * Record a deviation from the planned item (user did something else)
     * This triggers high-priority refinement with context for the LLM
     */
    async recordDeviation(context: DeviationContext): Promise<void> {
        try {
            // Store deviation context for LLM
            const existing = await storage.get<DeviationContext[]>(STORAGE_KEYS.DEVIATIONS) || [];
            existing.push({ ...context, timestamp: Date.now() });
            await storage.set(STORAGE_KEYS.DEVIATIONS, existing);

            console.log(`[PlanRefine] Recorded deviation:`, {
                original: context.originalItem?.title,
                actualMeal: context.actualMeal?.name,
                actualActivity: context.actualActivity?.name,
                caloriesDiff: context.caloriesDiff,
            });

            // Immediately schedule high-priority refine with short debounce
            await this.scheduleRefine(30_000, 'high'); // 30 sec debounce
        } catch (error) {
            console.error('[PlanRefine] Failed to record deviation:', error);
        }
    },

    /**
     * Get stored deviations for LLM context
     */
    async getDeviations(): Promise<DeviationContext[]> {
        return await storage.get<DeviationContext[]>(STORAGE_KEYS.DEVIATIONS) || [];
    },

    /**
     * Clear deviations after refine
     */
    async clearDeviations(): Promise<void> {
        await storage.remove(STORAGE_KEYS.DEVIATIONS);
    },

    // ==================== CONTEXT CHANGE DETECTION ====================

    /**
     * Record a context change (driving→home, outside→gym, etc.)
     * Triggers plan refinement to adjust for new context
     */
    async recordContextChange(
        from: UserContextState,
        to: UserContextState,
        details?: { location?: string; locationContext?: string }
    ): Promise<void> {
        try {
            const lastContextRaw = await storage.get<UserContextState | StoredContextSnapshot>(STORAGE_KEYS.LAST_CONTEXT);

            // Normalize snapshot if needed
            const normalizedSnapshot = normalizeStoredContext(lastContextRaw);
            const lastState = normalizedSnapshot?.state;
            const lastLocation = normalizedSnapshot?.location;

            const contextChanged = lastState !== to;
            const locationChanged = (details?.location || undefined) !== (lastLocation || undefined);

            // Only record if actually changed
            if (!contextChanged && !locationChanged) return;

            const normalizedFrom = normalizeState(from) || from || lastState || 'unknown';
            const normalizedTo = normalizeState(to) || to;

            const event: ContextChangeEvent = {
                from: normalizedFrom,
                to: normalizedTo,
                location: details?.location,
                locationContext: details?.locationContext,
                timestamp: Date.now(),
            };

            // Store the change
            const existing = await storage.get<ContextChangeEvent[]>(STORAGE_KEYS.CONTEXT_CHANGES) || [];
            existing.push(event);
            await storage.set(STORAGE_KEYS.CONTEXT_CHANGES, existing);
            await storage.set(STORAGE_KEYS.LAST_CONTEXT, { state: to, location: details?.location });

            console.log(`[PlanRefine] Context changed: ${event.from} -> ${event.to}`);

            const knownLocations = new Set(['home', 'work', 'gym']);
            const shouldPromptLocation =
                event.from === 'driving' &&
                event.to !== 'driving' &&
                (!details?.location || !knownLocations.has(details.location));

            if (shouldPromptLocation) {
                const lastPromptAt = await storage.get<number>(LAST_LOCATION_OVERLAY_KEY);
                const now = Date.now();
                const canPrompt = !lastPromptAt || now - lastPromptAt > LOCATION_OVERLAY_COOLDOWN_MS;
                if (canPrompt) {
                    const shown = await showLocationContextOverlay();
                    if (shown) {
                        await storage.set(LAST_LOCATION_OVERLAY_KEY, now);
                    }
                }
            }

            // Significant context changes trigger refine
            const significantChanges = [
                // Arrived home after being out
                (event.from === 'driving' || event.from === 'commuting' || event.from === 'walking') &&
                (to === 'resting' || to === 'home_active'),
                // Woke up (from sleeping to any activity)
                event.from === 'sleeping' && to !== 'sleeping',
                // Started exercising
                to === 'running' || to === 'gym_workout',
                // Just stopped driving
                (event.from === 'driving' || event.from === 'commuting') && to !== 'driving' && to !== 'commuting',
                // Location label changed (home/work/gym/outside)
                locationChanged && !!details?.location,
            ];

            if (significantChanges.some(Boolean)) {
                console.log(`[PlanRefine] Significant context change detected, scheduling refine`);
                await this.scheduleRefine(REFINE_TRIGGERS.CONTEXT_CHANGE.debounceMs, 'normal');
            }
        } catch (error) {
            console.error('[PlanRefine] Failed to record context change:', error);
        }
    },

    /**
     * Get stored context changes for LLM
     */
    async getContextChanges(): Promise<ContextChangeEvent[]> {
        return await storage.get<ContextChangeEvent[]>(STORAGE_KEYS.CONTEXT_CHANGES) || [];
    },

    /**
     * Clear context changes after refine
     */
    async clearContextChanges(): Promise<void> {
        await storage.remove(STORAGE_KEYS.CONTEXT_CHANGES);
    },

    /**
     * Get last known user context
     */
    async getLastContext(): Promise<UserContextState | null> {
        const stored = await storage.get<UserContextState | StoredContextSnapshot>(STORAGE_KEYS.LAST_CONTEXT);
        const normalized = normalizeStoredContext(stored);
        return normalized?.state || null;
    },

    // ==================== WAKE-BASED DAY HANDLING ====================

    /**
     * Handle wake event - triggers new day plan if appropriate
     * Called from sleep detection when user wakes up
     */
    async handleWakeEvent(wakeTime: number): Promise<void> {
        try {
            const previousActiveDay = await storage.get<string>(storage.keys.ACTIVE_DAY_KEY);
            await setLastWakeTime(wakeTime);
            const activeDay = await getActiveDayKey();

            console.log(`[PlanRefine] Wake detected at ${new Date(wakeTime).toLocaleTimeString()}`);
            console.log(`[PlanRefine] Active day: ${activeDay}, Previous: ${previousActiveDay || 'none'}`);

            if (activeDay !== previousActiveDay) {
                console.log(`[PlanRefine] NEW DAY DETECTED! Generating fresh plan...`);

                // Clear previous day's deviations and context changes
                await this.clearDeviations();
                await this.clearContextChanges();

                // Critical priority - user just woke up, needs fresh plan immediately
                await this.scheduleRefine(REFINE_TRIGGERS.WAKE_DETECTED.debounceMs, 'critical');
            }

            // Also record context change from sleeping
            await this.recordContextChange('sleeping', 'resting');
        } catch (error) {
            console.error('[PlanRefine] Failed to handle wake event:', error);
        }
    },

    /**
     * Get the last wake time
     */
    async getLastWakeTime(): Promise<number | null> {
        return await getLastWakeTime();
    },

    /**
     * Get the current active day key
     */
    async getActiveDay(): Promise<string> {
        return await getActiveDayKey();
    },

    // ==================== MIDNIGHT ROLLOVER ====================

    /**
     * Handle midnight rollover - carry incomplete items to next day
     * Should be called at midnight or when checking for new day
     */
    async handleMidnightRollover(): Promise<void> {
        try {
            const todayKey = getLocalDateKey(new Date());
            const lastRollover = await storage.get<string>(STORAGE_KEYS.LAST_MIDNIGHT_ROLLOVER);

            // Only run once per calendar day
            if (lastRollover === todayKey) {
                return;
            }

            const todayDate = dateFromKey(todayKey);
            const yesterday = todayDate ? new Date(todayDate) : new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayKey = getLocalDateKey(yesterday);

            // Get yesterday's plan
            const planKey = `${storage.keys.DAILY_PLAN}_${yesterdayKey}`;
            const datedPlan = await storage.get<DailyPlan>(planKey);
            const legacyPlan = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
            const yesterdayPlan =
                (datedPlan && (!datedPlan.date || datedPlan.date === yesterdayKey) ? datedPlan : null) ||
                (legacyPlan && (!legacyPlan.date || legacyPlan.date === yesterdayKey) ? legacyPlan : null);

            if (!yesterdayPlan?.items) {
                console.log('[PlanRefine] No yesterday plan for rollover');
                await storage.set(STORAGE_KEYS.LAST_MIDNIGHT_ROLLOVER, todayKey);
                return;
            }

            // Find incomplete items from after 6 PM
            const incompleteItems = yesterdayPlan.items.filter(item => {
                if (item.completed || item.skipped) return false;

                // Only carry evening items (after 18:00)
                const [hour] = item.time.split(':').map(Number);
                return hour >= 18;
            });

            if (incompleteItems.length > 0) {
                const carriedItems = incompleteItems.map(item => ({
                    ...item,
                    originalDate: yesterdayKey,
                    carriedOver: true,
                    originalTime: item.time,
                }));

                await storage.set(STORAGE_KEYS.CARRIED_OVER_ITEMS, carriedItems);
                console.log(`[PlanRefine] Carried over ${carriedItems.length} incomplete items from yesterday:`,
                    carriedItems.map(i => i.title));
            }

            await storage.set(STORAGE_KEYS.LAST_MIDNIGHT_ROLLOVER, todayKey);
        } catch (error) {
            console.error('[PlanRefine] Midnight rollover failed:', error);
        }
    },

    /**
     * Get carried over items from yesterday
     */
    async getCarriedOverItems(): Promise<PlanItem[]> {
        return await storage.get<PlanItem[]>(STORAGE_KEYS.CARRIED_OVER_ITEMS) || [];
    },

    /**
     * Clear carried over items (call after new plan generation)
     */
    async clearCarriedOverItems(): Promise<void> {
        await storage.remove(STORAGE_KEYS.CARRIED_OVER_ITEMS);
    },

    /**
     * Build comprehensive context for LLM including location, nutrition, and carried items
     */
    async buildFullContextForLLM(): Promise<string> {
        let context = '';

        // Get carried over items
        const carriedItems = await this.getCarriedOverItems();
        if (carriedItems.length > 0) {
            context += '\n=== INCOMPLETE TASKS FROM YESTERDAY ===\n';
            for (const item of carriedItems) {
                const typeEmoji = item.type === 'meal' ? '🍽️' : item.type === 'workout' ? '🏃' : '📋';
                const time = (item as any).originalTime || item.time;
                context += `${typeEmoji} [${time}] ${item.title} - NOT DONE\n`;
            }
            context += '\nConsider including or adjusting these in today\'s plan.\n';
        }

        return context;
    },
};

export default planRefinementService;

