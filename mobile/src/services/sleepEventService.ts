import { getPendingSleepEvents, clearPendingSleepEvents, type SleepEvent } from './backgroundHealthService';
import { sleepSessionService } from './sleepSessionService';
import sleepHoursService from './sleepHoursService';
import { autoPlanService } from './autoPlanService';
import storage from './storageService';
import { sleepDraftService, type SleepDraft } from './sleepDraftService';
import { getLocalDateKey } from '../utils/dateUtils';
import { getActiveDayKey, setLastWakeTime } from './dayBoundaryService';
import { DailyPlan } from '../types';
import { completeItemWithSync, uncompleteItemWithSync } from './actionSyncService';
import { sleepScheduleService } from './sleepScheduleService';
import { emit as emitPlanEvent } from './planEventService';

/**
 * Sleep Event Processing Service
 *
 * Business Logic:
 * - Bridges native Android sleep detection events to JS storage/UI layer
 * - Deduplicates events using timestamp-based watermarking
 * - Processes events in chronological order
 * - Handles both confirmed and auto-assumed sleep
 * - Distinguishes between night sleep (triggers plan) and naps (logs only)
 * - Provides comprehensive error recovery and logging
 *
 * Architecture:
 * - Single in-flight promise to prevent concurrent processing
 * - Atomic operations with rollback on failure
 * - Event validation before processing
 * - Status reporting for monitoring
 */

type SleepEventResult = {
    processed: number;
    events: string[];
    errors: string[];
    skipped: number;
};

type ProcessingStatus = {
    isProcessing: boolean;
    lastProcessedAt: number | null;
    totalProcessed: number;
    totalErrors: number;
};

let inFlight: Promise<SleepEventResult> | null = null;
let processingStatus: ProcessingStatus = {
    isProcessing: false,
    lastProcessedAt: null,
    totalProcessed: 0,
    totalErrors: 0,
};

const PROCESSING_LOCK_KEY = '@sleep_event_processing_lock_v1';
const LOCK_TTL_MS = 2 * 60 * 1000;
const PROCESSED_EVENT_IDS_KEY = '@sleep_event_processed_ids_v1';
const MAX_PROCESSED_EVENT_IDS = 100;
const LOCAL_PENDING_EVENTS_KEY = storage.keys.PENDING_SLEEP_EVENTS_LOCAL;
const PENDING_SLEEP_COMPLETION_KEY = '@pending_sleep_plan_completion_v1';

const getPendingSleepCompletions = async (): Promise<string[]> => {
    const stored = await storage.get<string[]>(PENDING_SLEEP_COMPLETION_KEY);
    return Array.isArray(stored) ? stored.filter(Boolean) : [];
};

const queuePendingSleepCompletion = async (dateKey: string): Promise<void> => {
    if (!dateKey) return;
    const existing = await getPendingSleepCompletions();
    if (existing.includes(dateKey)) return;
    await storage.set(PENDING_SLEEP_COMPLETION_KEY, [...existing, dateKey]);
};

const getPendingLocalSleepEvents = async (): Promise<SleepEvent[]> => {
    const events = await storage.get<SleepEvent[]>(LOCAL_PENDING_EVENTS_KEY);
    return Array.isArray(events) ? events : [];
};

const clearPendingLocalSleepEvents = async (): Promise<void> => {
    await storage.remove(LOCAL_PENDING_EVENTS_KEY);
};

const buildSleepEventId = (event: SleepEvent): string => {
    const data = event.data || {};
    return [
        event.type || 'unknown',
        event.timestamp || 0,
        data.sleepStartTime || 0,
        data.wakeTime || 0,
        data.durationHours || 0,
        data.confirmed ?? '',
        data.autoAssumed ?? '',
    ].join('|');
};

const buildSleepMetadata = (data: SleepEvent['data']): { tags?: string[]; context?: Record<string, any> } => {
    const tags = Array.isArray(data?.tags)
        ? data?.tags.filter(tag => typeof tag === 'string')
        : [];
    const context = data?.sleepContext && typeof data.sleepContext === 'object'
        ? data.sleepContext as Record<string, any>
        : undefined;
    return {
        tags: tags.length ? tags : undefined,
        context,
    };
};

const createDraftFromSleepStart = async (
    sleepStartTime: number,
    metadata: { tags?: string[]; context?: Record<string, any> }
): Promise<SleepDraft> => {
    return sleepDraftService.upsertDraft({
        id: sleepDraftService.buildDraftId(sleepStartTime),
        sleepStartTime,
        state: 'pending_sleep',
        tags: metadata.tags,
        sleepContext: metadata.context,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
};

const createDraftFromWake = async (
    sleepStartTime: number,
    wakeTime: number,
    metadata: { tags?: string[]; context?: Record<string, any> }
): Promise<SleepDraft> => {
    const durationMs = Math.max(0, wakeTime - sleepStartTime);
    const durationHours = durationMs / (1000 * 60 * 60);
    return sleepDraftService.upsertDraft({
        id: sleepDraftService.buildDraftId(sleepStartTime),
        sleepStartTime,
        wakeTime,
        durationMs,
        durationHours,
        state: 'pending_review',
        tags: metadata.tags,
        sleepContext: metadata.context,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
};

const acquireProcessingLock = async (): Promise<boolean> => {
    const now = Date.now();
    const existing = await storage.get<{ startedAt: number }>(PROCESSING_LOCK_KEY);
    if (existing?.startedAt && now - existing.startedAt < LOCK_TTL_MS) {
        return false;
    }
    await storage.set(PROCESSING_LOCK_KEY, { startedAt: now });
    return true;
};

const releaseProcessingLock = async (): Promise<void> => {
    await storage.remove(PROCESSING_LOCK_KEY);
};

const getPlanForDate = async (dateKey: string): Promise<DailyPlan | null> => {
    const planKey = `${storage.keys.DAILY_PLAN}_${dateKey}`;
    const byDate = await storage.get<DailyPlan>(planKey);
    if (byDate && (!byDate.date || byDate.date === dateKey)) return byDate;

    const legacy = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
    if (legacy && (!legacy.date || legacy.date === dateKey)) return legacy;

    return null;
};

const completeSleepPlanItem = async (dateKey: string): Promise<boolean> => {
    const plan = await getPlanForDate(dateKey);
    if (!plan?.items?.length) {
        await queuePendingSleepCompletion(dateKey);
        return false;
    }

    const candidates = plan.items
        .filter(item => item.type === 'sleep' && !item.completed && !item.skipped);
    if (candidates.length === 0) {
        return false;
    }

    const target = [...candidates].sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0];
    if (!target?.id) {
        await queuePendingSleepCompletion(dateKey);
        return false;
    }

    await completeItemWithSync(dateKey, target.id, { skipSmartLogging: true });
    return true;
};

const uncompleteSleepPlanItem = async (dateKey: string): Promise<void> => {
    const plan = await getPlanForDate(dateKey);
    if (!plan?.items?.length) return;

    const candidates = plan.items
        .filter(item => item.type === 'sleep' && item.completed && !item.skipped);
    if (candidates.length === 0) return;

    const target = [...candidates].sort((a, b) => {
        const aCompleted = typeof (a as any).completedAt === 'number' ? (a as any).completedAt : 0;
        const bCompleted = typeof (b as any).completedAt === 'number' ? (b as any).completedAt : 0;
        if (aCompleted !== bCompleted) return bCompleted - aCompleted;
        return (b.time || '').localeCompare(a.time || '');
    })[0];
    if (!target?.id) return;

    await uncompleteItemWithSync(dateKey, target.id);
};

const clearPendingSleepState = async (): Promise<void> => {
    await sleepSessionService.cancelActiveSession();
    await storage.set('is_sleeping', false);
    await storage.set('sleep_ghost_mode', false);
    await storage.remove('sleep_start_time');
    await storage.remove('sleep_probe_time');
};

/**
 * Validates a sleep event has required fields
 */
const validateSleepEvent = (event: SleepEvent): boolean => {
    if (!event.type) {
        console.warn('[SleepEventService] Event missing type:', event);
        return false;
    }

    if (typeof event.timestamp !== 'number' || !Number.isFinite(event.timestamp)) {
        console.warn('[SleepEventService] Event has invalid timestamp:', event);
        return false;
    }

    // Validate future events (allow 1 hour tolerance for clock skew)
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    if (event.timestamp > now + oneHour) {
        console.warn('[SleepEventService] Event timestamp is too far in future:', new Date(event.timestamp));
        return false;
    }

    return true;
};

const getSleepSource = (event: SleepEvent): 'confirmed' | 'ghost' => {
    const data = event.data || {};
    if (data.autoAssumed || data.confirmed === false) return 'ghost';
    return 'confirmed';
};

const isLikelyNightSleep = (
    sleepStartTime?: number,
    wakeTime?: number,
    durationHours?: number
): boolean => {
    if (!sleepStartTime || !wakeTime) return false;
    const hours =
        typeof durationHours === 'number' && Number.isFinite(durationHours)
            ? durationHours
            : (wakeTime - sleepStartTime) / (1000 * 60 * 60);

    const startHour = new Date(sleepStartTime).getHours();

    if ((startHour >= 20 || startHour < 4) && hours > 3) return true;
    if (startHour >= 4 && startHour < 12 && hours > 4) return true;
    return false;
};

const processWakeEvent = async (params: {
    sleepStartTime?: number;
    wakeTime: number;
    durationHours?: number;
    source: 'confirmed' | 'ghost';
    metadata: { tags?: string[]; context?: Record<string, any> };
    allowPlan: boolean;
}): Promise<void> => {
    const {
        sleepStartTime,
        wakeTime,
        durationHours,
        source,
        metadata,
        allowPlan,
    } = params;

    await sleepSessionService.updateActiveSessionMetadata(metadata);
    let session = await sleepSessionService.endSession(wakeTime);

    if (!session && typeof sleepStartTime === 'number' && sleepStartTime < wakeTime) {
        session = await sleepSessionService.recordSessionFromNative(
            sleepStartTime,
            wakeTime,
            source,
            metadata
        );
    }

    let recordedDateKey: string | null = null;
    let recordedHours: number | null = null;
    if (session) {
        recordedDateKey = session.date;
        recordedHours = await sleepHoursService.recomputeForDate(session.date);
    } else if (typeof durationHours === 'number' && Number.isFinite(durationHours)) {
        const dateKey = getLocalDateKey(new Date(wakeTime));
        recordedDateKey = dateKey;
        recordedHours = durationHours;
        await sleepHoursService.record(durationHours, dateKey);
    }

    await storage.set('is_sleeping', false);
    await storage.set('sleep_ghost_mode', false);
    await storage.remove('sleep_start_time');
    await storage.remove('sleep_probe_time');

    if (typeof sleepStartTime === 'number') {
        await completeSleepPlanItem(getLocalDateKey(new Date(sleepStartTime)));
    }

    if (recordedDateKey && typeof recordedHours === 'number') {
        await emitPlanEvent('SLEEP_ANALYZED', { date: recordedDateKey, hours: recordedHours });
    }

    if (!allowPlan) return;

    const inferredDuration =
        typeof durationHours === 'number' && Number.isFinite(durationHours)
            ? durationHours
            : (typeof sleepStartTime === 'number' ? (wakeTime - sleepStartTime) / (1000 * 60 * 60) : undefined);
    const isNightSleep = session?.type === 'night' ||
        isLikelyNightSleep(
            typeof sleepStartTime === 'number' ? sleepStartTime : undefined,
            wakeTime,
            inferredDuration
        );

    if (isNightSleep) {
        await sleepScheduleService.maybeAutoApplySuggestion();
        await setLastWakeTime(wakeTime);
        await getActiveDayKey();
        await autoPlanService.generateTodayPlan('WAKE');
    }
};

/**
 * Get current processing status for monitoring
 */
export const getProcessingStatus = (): ProcessingStatus => {
    return { ...processingStatus };
};

/**
 * Main event processing function
 * Processes all pending sleep events from native layer
 */
export const processNativeSleepEvents = async (): Promise<SleepEventResult> => {
    // Prevent concurrent processing
    if (inFlight) {
        console.log('[SleepEventService] Already processing events - returning in-flight promise');
        return inFlight;
    }

    const hasLock = await acquireProcessingLock();
    if (!hasLock) {
        console.log('[SleepEventService] Processing lock active - skipping this run');
        return {
            processed: 0,
            events: [],
            errors: [],
            skipped: 0,
        };
    }

    inFlight = (async () => {
        processingStatus.isProcessing = true;
        const startTime = Date.now();

        console.log('[SleepEventService] Starting sleep event processing');

        const result: SleepEventResult = {
            processed: 0,
            events: [],
            errors: [],
            skipped: 0,
        };
        const processedIds = (await storage.get<string[]>(PROCESSED_EVENT_IDS_KEY)) || [];
        const processedSet = new Set(processedIds);
        let processedIdsDirty = false;

        try {
            // Fetch pending events from native bridge + local queue
            const [nativeEvents, localEvents] = await Promise.all([
                getPendingSleepEvents(),
                getPendingLocalSleepEvents(),
            ]);
            const events = [...nativeEvents, ...localEvents];

            if (!events.length) {
                console.log('[SleepEventService] No pending events to process');
                return result;
            }

            console.log(`[SleepEventService] Retrieved ${events.length} pending events from native`);

            // Get last processed timestamp for deduplication
            const lastProcessed = await storage.get<number>('last_sleep_event_processed_at');
            const cutoff = typeof lastProcessed === 'number' && Number.isFinite(lastProcessed) ? lastProcessed : 0;

            console.log(`[SleepEventService] Last processed timestamp: ${cutoff} (${new Date(cutoff).toISOString()})`);

            // Filter and sort events
            const sorted = [...events]
                .filter(event => {
                    const eventId = buildSleepEventId(event);
                    if (processedSet.has(eventId)) {
                        console.log('[SleepEventService] Skipping duplicate event:', event.type, new Date(event.timestamp || 0));
                        result.skipped++;
                        return false;
                    }

                    // Skip already processed events
                    if ((event.timestamp || 0) <= cutoff) {
                        console.log(`[SleepEventService] Skipping already processed event:`, event.type, new Date(event.timestamp || 0));
                        result.skipped++;
                        return false;
                    }

                    // Validate event structure
                    if (!validateSleepEvent(event)) {
                        result.errors.push(`Invalid event structure: ${event.type}`);
                        result.skipped++;
                        return false;
                    }

                    return true;
                })
                .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

            if (!sorted.length) {
                console.log('[SleepEventService] No new events to process after filtering');
                await clearPendingSleepEvents();
                await clearPendingLocalSleepEvents();
                return result;
            }

            console.log(`[SleepEventService] Processing ${sorted.length} new events`);

            let maxProcessed = cutoff;

            // Process each event
            for (const event of sorted) {
                const eventLabel = `${event.type} at ${new Date(event.timestamp || 0).toISOString()}`;
                const eventId = buildSleepEventId(event);

                try {
                    console.log(`[SleepEventService] Processing event: ${eventLabel}`);

                    const data = event.data || {};

                    if (event.type === 'SLEEP_STARTED') {
                        const startTime = typeof data.sleepStartTime === 'number' ? data.sleepStartTime : event.timestamp;
                        const source = getSleepSource(event);
                        const metadata = buildSleepMetadata(data);
                        const isAutoAssumed = data.autoAssumed === true;

                        console.log(`[SleepEventService] Starting sleep session: source=${source}, time=${new Date(startTime).toISOString()}`);

                        if (isAutoAssumed) {
                            await createDraftFromSleepStart(startTime, metadata);
                            await storage.set('is_sleeping', true);
                            await storage.set('sleep_start_time', startTime);
                            await storage.set('sleep_ghost_mode', true);
                            await storage.remove('sleep_probe_time');
                        } else {
                            await sleepSessionService.startSession(source, startTime, metadata);
                            await storage.set('is_sleeping', true);
                            await storage.set('sleep_start_time', startTime);
                            await storage.set('sleep_ghost_mode', source === 'ghost');
                            await storage.remove('sleep_probe_time');
                            await completeSleepPlanItem(getLocalDateKey(new Date(startTime)));
                        }

                        result.processed += 1;
                        result.events.push('SLEEP_STARTED');
                        if (!processedSet.has(eventId)) {
                            processedSet.add(eventId);
                            processedIds.push(eventId);
                            processedIdsDirty = true;
                        }

                        if (event.timestamp && event.timestamp > maxProcessed) {
                            maxProcessed = event.timestamp;
                        }

                        console.log(`[SleepEventService] Successfully processed SLEEP_STARTED`);
                        continue;
                    }

                    if (event.type === 'WAKE_CONFIRMED' || event.type === 'WAKE_DETECTED') {
                        const wakeTime = typeof data.wakeTime === 'number' ? data.wakeTime : event.timestamp;
                        const source = getSleepSource(event);
                        const metadata = buildSleepMetadata(data);
                        const isAutoAssumed = data.autoAssumed === true;

                        console.log(`[SleepEventService] Processing wake event: source=${source}, time=${new Date(wakeTime).toISOString()}`);

                        if (isAutoAssumed) {
                            const startTimeFromEvent = typeof data.sleepStartTime === 'number' ? data.sleepStartTime : null;
                            const fallbackStart = startTimeFromEvent ?? (await storage.get<number>('sleep_start_time')) ?? wakeTime;
                            await createDraftFromWake(fallbackStart, wakeTime, metadata);

                            await storage.set('is_sleeping', false);
                            await storage.set('sleep_ghost_mode', false);
                            await storage.remove('sleep_start_time');
                            await storage.remove('sleep_probe_time');
                        } else {
                            await processWakeEvent({
                                sleepStartTime: typeof data.sleepStartTime === 'number' ? data.sleepStartTime : undefined,
                                wakeTime,
                                durationHours: typeof data.durationHours === 'number' ? data.durationHours : undefined,
                                source,
                                metadata,
                                allowPlan: true,
                            });
                        }

                        result.processed += 1;
                        result.events.push(event.type);
                        if (!processedSet.has(eventId)) {
                            processedSet.add(eventId);
                            processedIds.push(eventId);
                            processedIdsDirty = true;
                        }

                        if (event.timestamp && event.timestamp > maxProcessed) {
                            maxProcessed = event.timestamp;
                        }

                        console.log(`[SleepEventService] Successfully processed ${event.type}`);
                        continue;
                    }

                    if (event.type === 'SLEEP_DECLINED') {
                        const startTime =
                            typeof data.sleepStartTime === 'number'
                                ? data.sleepStartTime
                                : (await storage.get<number>('sleep_start_time')) ?? 0;

                        if (startTime > 0) {
                            await sleepDraftService.removeDraft(sleepDraftService.buildDraftId(startTime));
                            await uncompleteSleepPlanItem(getLocalDateKey(new Date(startTime)));
                        }

                        await sleepSessionService.cancelActiveSession();
                        await storage.set('is_sleeping', false);
                        await storage.set('sleep_ghost_mode', false);
                        await storage.remove('sleep_start_time');
                        await storage.remove('sleep_probe_time');

                        result.processed += 1;
                        result.events.push('SLEEP_DECLINED');
                        if (!processedSet.has(eventId)) {
                            processedSet.add(eventId);
                            processedIds.push(eventId);
                            processedIdsDirty = true;
                        }

                        if (event.timestamp && event.timestamp > maxProcessed) {
                            maxProcessed = event.timestamp;
                        }

                        console.log('[SleepEventService] Cleared auto-assumed sleep after user declined');
                        continue;
                    }

                    // Ignore SLEEP_DETECTED unless we want to surface in-app prompts
                    console.log(`[SleepEventService] Ignoring event type: ${event.type}`);
                    result.skipped++;

                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    console.error(`[SleepEventService] Failed to process event ${eventLabel}:`, error);
                    result.errors.push(`${event.type}: ${errorMsg}`);
                    processingStatus.totalErrors++;
                }
            }

            // Update last processed timestamp watermark
            if (maxProcessed > cutoff) {
                console.log(`[SleepEventService] Updating watermark: ${maxProcessed} (${new Date(maxProcessed).toISOString()})`);
                await storage.set('last_sleep_event_processed_at', maxProcessed);
            }

            if (processedIdsDirty) {
                const trimmed = processedIds.slice(-MAX_PROCESSED_EVENT_IDS);
                await storage.set(PROCESSED_EVENT_IDS_KEY, trimmed);
            }

            // Clear processed events from native storage
            await clearPendingSleepEvents();
            await clearPendingLocalSleepEvents();

            // Update processing stats
            processingStatus.totalProcessed += result.processed;
            processingStatus.lastProcessedAt = Date.now();

            const duration = Date.now() - startTime;
            console.log(`[SleepEventService] Processing complete: ${result.processed} processed, ${result.skipped} skipped, ${result.errors.length} errors in ${duration}ms`);

            return result;

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('[SleepEventService] Fatal error during event processing:', error);
            result.errors.push(`Fatal: ${errorMsg}`);
            processingStatus.totalErrors++;
            return result;
        }
    })();

    try {
        return await inFlight;
    } finally {
        inFlight = null;
        processingStatus.isProcessing = false;
        await releaseProcessingLock();
    }
};

/**
 * Force reprocess all events (for debugging/recovery)
 */
export const reprocessAllEvents = async (): Promise<SleepEventResult> => {
    console.log('[SleepEventService] Forcing reprocess of all events');
    await storage.remove('last_sleep_event_processed_at');
    return processNativeSleepEvents();
};

export const getSleepDrafts = async (): Promise<SleepDraft[]> => {
    return sleepDraftService.getDrafts();
};

export const confirmSleepDraft = async (draftId: string): Promise<boolean> => {
    const drafts = await sleepDraftService.getDrafts();
    const draft = drafts.find(item => item.id === draftId);
    if (!draft) return false;
    let resolvedDraft = draft;
    if (!draft.wakeTime) {
        const updated = await sleepDraftService.updateDraftTimes(draft.id, draft.sleepStartTime, Date.now());
        if (!updated) return false;
        resolvedDraft = updated;
    }
    if (!resolvedDraft.wakeTime) return false;

    await processWakeEvent({
        sleepStartTime: resolvedDraft.sleepStartTime,
        wakeTime: resolvedDraft.wakeTime,
        durationHours: resolvedDraft.durationHours,
        source: 'confirmed',
        metadata: { tags: resolvedDraft.tags, context: resolvedDraft.sleepContext },
        allowPlan: true,
    });

    await sleepDraftService.removeDraft(resolvedDraft.id);
    return true;
};

export const discardSleepDraft = async (draftId: string): Promise<boolean> => {
    const drafts = await sleepDraftService.getDrafts();
    const draft = drafts.find(item => item.id === draftId);
    if (!draft) {
        await sleepDraftService.removeDraft(draftId);
        return true;
    }

    await sleepDraftService.removeDraft(draftId);

    if (draft.state === 'pending_sleep') {
        await clearPendingSleepState();
        await uncompleteSleepPlanItem(getLocalDateKey(new Date(draft.sleepStartTime)));
    }
    return true;
};

export const updateSleepDraftTimes = async (
    draftId: string,
    sleepStartTime: number,
    wakeTime?: number
): Promise<SleepDraft | null> => {
    const updated = await sleepDraftService.updateDraftTimes(draftId, sleepStartTime, wakeTime);
    if (!updated) return null;
    if (updated.state === 'pending_sleep') {
        await storage.set('sleep_start_time', updated.sleepStartTime);
    } else if (updated.wakeTime) {
        await storage.remove('sleep_start_time');
    }
    return updated;
};

export const upsertSleepDraftFromTimes = async (params: {
    sleepStartTime: number;
    wakeTime?: number;
    tags?: string[];
    sleepContext?: Record<string, any>;
}): Promise<SleepDraft> => {
    return sleepDraftService.upsertDraftFromTimes(params);
};

export const applyPendingSleepCompletion = async (dateKey: string): Promise<void> => {
    if (!dateKey) return;
    const pending = await getPendingSleepCompletions();
    if (!pending.includes(dateKey)) return;

    const plan = await getPlanForDate(dateKey);
    if (!plan?.items?.length) return;

    const candidates = plan.items.filter(item => item.type === 'sleep' && !item.completed && !item.skipped);
    if (candidates.length === 0) {
        const next = pending.filter(key => key !== dateKey);
        await storage.set(PENDING_SLEEP_COMPLETION_KEY, next);
        return;
    }

    const applied = await completeSleepPlanItem(dateKey);
    if (applied) {
        const next = pending.filter(key => key !== dateKey);
        await storage.set(PENDING_SLEEP_COMPLETION_KEY, next);
    }
};

export default {
    processNativeSleepEvents,
    getProcessingStatus,
    reprocessAllEvents,
    getSleepDrafts,
    confirmSleepDraft,
    discardSleepDraft,
    updateSleepDraftTimes,
    upsertSleepDraftFromTimes,
    applyPendingSleepCompletion,
};
