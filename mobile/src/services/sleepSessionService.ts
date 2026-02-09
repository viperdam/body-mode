/**
 * Sleep Session Service - Manages multiple sleep sessions per day
 * 
 * Supports:
 * - Night sleep sessions
 * - Naps (daytime sessions)
 * - Ghost mode sessions (auto-detected)
 * - LLM context generation
 */

import { storage } from './storageService';
import { NativeModules, Platform } from 'react-native';
import type { SleepScheduleSuggestion } from '../types';

const { TxStoreBridge, SleepBridge } = NativeModules;

// ==================== TYPES ====================

export interface SleepSession {
    id: string;
    date: string;           // YYYY-MM-DD
    startTime: number;      // Timestamp
    endTime: number;        // Timestamp
    durationHours: number;  // Calculated
    type: 'night' | 'nap';  // Based on time of day
    source: 'confirmed' | 'ghost';
    quality?: number;       // 1-100, optional
    tags?: string[];
    context?: Record<string, any>;
}

export interface DailySleepRecord {
    date: string;
    sessions: SleepSession[];
    totalHours: number;     // Sum of all sessions
    nightHours: number;     // Only night sleep
    napHours: number;       // Only naps
}

export interface SleepContext {
    lastNight: {
        totalHours: number;
        sessions: { start: string; end: string; type: string }[];
        quality: string;
        wentToBedLate: boolean;
        wokeEarly: boolean;
        tags?: string[];
    } | null;
    napsToday: { start: string; end: string; duration: number }[];
    weeklyAverage: number;
    weeklyNapAverage: number;
    consistencyScore: number;
    sleepDebt: number;
    usualBedtime: string;
    usualWakeTime: string;
    tags?: string[];
}

export interface SleepSessionMetadata {
    tags?: string[];
    context?: Record<string, any>;
}

// ==================== STORAGE KEYS ====================

const SESSIONS_KEY_PREFIX = 'sleep_sessions_';
const HISTORY_KEY = 'sleep_history_summary';
const SCHEDULE_LOOKBACK_DAYS = 21;
const MIN_NIGHTS_FOR_SCHEDULE = 4;
const MINUTES_PER_DAY = 24 * 60;
const SESSION_LOOKBACK_DAYS = 30;

const getDateKeyFromTimestamp = (timestamp: number): string =>
    new Date(timestamp).toISOString().split('T')[0];

const computeTotals = (sessions: SleepSession[]) => {
    const totalHours = sessions.reduce((sum, s) => sum + s.durationHours, 0);
    const nightHours = sessions.filter(s => s.type === 'night').reduce((sum, s) => sum + s.durationHours, 0);
    const napHours = sessions.filter(s => s.type === 'nap').reduce((sum, s) => sum + s.durationHours, 0);
    return {
        totalHours: Math.round(totalHours * 100) / 100,
        nightHours: Math.round(nightHours * 100) / 100,
        napHours: Math.round(napHours * 100) / 100,
    };
};

const toLocalMinutes = (timestamp: number): number => {
    const date = new Date(timestamp);
    return date.getHours() * 60 + date.getMinutes();
};

const formatMinutes = (minutes: number): string => {
    const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const hours = Math.floor(normalized / 60);
    const mins = Math.round(normalized % 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const computeMedian = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
    return sorted[mid];
};

const normalizeWrappedTimes = (values: number[]): { median: number; stdev: number } => {
    if (values.length === 0) return { median: 0, stdev: 0 };
    const median = computeMedian(values);
    const adjusted = values.map(value => (value < median - 720 ? value + MINUTES_PER_DAY : value));
    const adjustedMedian = computeMedian(adjusted);
    const mean = adjusted.reduce((sum, value) => sum + value, 0) / adjusted.length;
    const variance =
        adjusted.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / adjusted.length;
    return {
        median: ((adjustedMedian % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY,
        stdev: Math.sqrt(variance),
    };
};

const getConfidence = (sampleSize: number, stdev: number): SleepScheduleSuggestion['confidence'] => {
    if (sampleSize >= 10 && stdev <= 60) return 'high';
    if (sampleSize >= 6 && stdev <= 90) return 'medium';
    return 'low';
};

// ==================== SERVICE ====================

export const sleepSessionService = {
    /**
     * Start a new sleep session
     */
    async startSession(
        source: 'confirmed' | 'ghost' = 'confirmed',
        startTimeOverride?: number,
        metadata?: SleepSessionMetadata
    ): Promise<string> {
        const active = await storage.get<any>('active_sleep_session');
        if (active?.id && typeof active.startTime === 'number') {
            if (metadata) {
                await storage.set('active_sleep_session', {
                    ...active,
                    tags: metadata.tags || active.tags,
                    context: metadata.context || active.context,
                });
            }
            if (typeof startTimeOverride === 'number' && Number.isFinite(startTimeOverride) && startTimeOverride < active.startTime) {
                await storage.set('active_sleep_session', {
                    ...active,
                    startTime: startTimeOverride,
                    date: new Date(startTimeOverride).toISOString().split('T')[0],
                });
            }
            return active.id;
        }

        const startTime =
            typeof startTimeOverride === 'number' && Number.isFinite(startTimeOverride)
                ? startTimeOverride
                : Date.now();
        const date = new Date(startTime).toISOString().split('T')[0];
        const sessionId = `session_${startTime}`;

        // Store active session
        await storage.set('active_sleep_session', {
            id: sessionId,
            date,
            startTime,
            source,
            tags: metadata?.tags || [],
            context: metadata?.context || undefined,
        });

        // Sync to native for wake detection (skip if native already provided timestamps)
        if (Platform.OS === 'android' && SleepBridge && !startTimeOverride) {
            try {
                await SleepBridge.startSleepSession();
            } catch (e) {
                console.warn('[SleepSessionService] Failed to sync sleep start to native:', e);
            }
        }

        console.log(`[SleepSessionService] Started ${source} session: ${sessionId}`);
        return sessionId;
    },

    /**
     * End the current sleep session and save to history
     */
    async endSession(endTimeOverride?: number): Promise<SleepSession | null> {
        const active = await storage.get<any>('active_sleep_session');
        if (!active) {
            console.log('[SleepSessionService] No active session to end');
            return null;
        }

        const endTime =
            typeof endTimeOverride === 'number' && Number.isFinite(endTimeOverride)
                ? endTimeOverride
                : Date.now();
        const durationMs = endTime - active.startTime;
        if (durationMs <= 0) {
            console.warn('[SleepSessionService] Invalid sleep duration, skipping end');
            return null;
        }
        const durationHours = durationMs / (1000 * 60 * 60);

        // Determine type based on start time
        const startHour = new Date(active.startTime).getHours();
        const type = this.classifySession(startHour, durationHours);

        const session: SleepSession = {
            id: active.id,
            date: active.date,
            startTime: active.startTime,
            endTime,
            durationHours: Math.round(durationHours * 100) / 100,
            type,
            source: active.source,
            tags: active.tags || [],
            context: active.context || undefined,
        };

        // Save to daily sessions
        await this.addSessionToDay(session);

        // Sync to native TxStore
        if (Platform.OS === 'android' && TxStoreBridge) {
            try {
                await TxStoreBridge.recordSleep(active.date, session.durationHours, active.source);
            } catch (e) {
                console.warn('[SleepSessionService] Failed to sync to native:', e);
            }
        }

        // Clear active session
        await storage.remove('active_sleep_session');

        // Sync to native to clear sleeping flag (skip if native already provided timestamps)
        if (Platform.OS === 'android' && SleepBridge && !endTimeOverride) {
            try {
                await SleepBridge.endSleepSession();
            } catch (e) {
                console.warn('[SleepSessionService] Failed to sync sleep end to native:', e);
            }
        }

        // Trigger plan refinement if this was a nap (to adjust afternoon schedule)
        if (type === 'nap') {
            try {
                const { planRefinementService } = require('./planRefinementService');
                await planRefinementService.recordNapEnded();
            } catch (e) {
                console.warn('[SleepSessionService] Failed to trigger nap refinement:', e);
            }
        }

        console.log(`[SleepSessionService] Ended session: ${session.durationHours}h (${type})`);
        return session;
    },

    /**
     * Record a session from native timestamps (when no active session exists)
     */
    async recordSessionFromNative(
        startTime: number,
        endTime: number,
        source: 'confirmed' | 'ghost' = 'confirmed',
        metadata?: SleepSessionMetadata
    ): Promise<SleepSession | null> {
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
            return null;
        }

        const durationMs = endTime - startTime;
        const durationHours = durationMs / (1000 * 60 * 60);
        const startHour = new Date(startTime).getHours();
        const type = this.classifySession(startHour, durationHours);

        const session: SleepSession = {
            id: `session_${startTime}`,
            date: new Date(startTime).toISOString().split('T')[0],
            startTime,
            endTime,
            durationHours: Math.round(durationHours * 100) / 100,
            type,
            source,
            tags: metadata?.tags || [],
            context: metadata?.context || undefined,
        };

        await this.addSessionToDay(session);

        // Sync to native TxStore
        if (Platform.OS === 'android' && TxStoreBridge) {
            try {
                await TxStoreBridge.recordSleep(session.date, session.durationHours, source);
            } catch (e) {
                console.warn('[SleepSessionService] Failed to sync native session:', e);
            }
        }

        return session;
    },

    /**
     * Classify session as night or nap based on start time and duration
     */
    classifySession(startHour: number, durationHours: number): 'night' | 'nap' {
        // Night: starts between 8 PM and 4 AM, lasts > 3 hours
        if ((startHour >= 20 || startHour < 4) && durationHours > 3) {
            return 'night';
        }
        // Extended morning sleep counts as night
        if (startHour >= 4 && startHour < 12 && durationHours > 4) {
            return 'night';
        }
        return 'nap';
    },

    /**
     * Add a session to the day's record
     */
    async addSessionToDay(session: SleepSession): Promise<void> {
        const key = `${SESSIONS_KEY_PREFIX}${session.date}`;
        const existing = await storage.get<DailySleepRecord>(key);

        const sessions = existing?.sessions || [];
        sessions.push(session);

        const totals = computeTotals(sessions);

        const record: DailySleepRecord = {
            date: session.date,
            sessions,
            ...totals,
        };

        await storage.set(key, record);
        console.log(`[SleepSessionService] Day ${session.date}: ${record.totalHours}h total`);
    },

    /**
     * Get sessions for a specific date
     */
    async getSessionsForDate(date: string): Promise<DailySleepRecord | null> {
        const key = `${SESSIONS_KEY_PREFIX}${date}`;
        return await storage.get<DailySleepRecord>(key);
    },

    /**
     * Get last night's sleep (for dashboard/LLM)
     */
    async getLastNightSleep(): Promise<DailySleepRecord | null> {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Check yesterday first
        let record = await this.getSessionsForDate(yesterdayStr);
        if (record && record.nightHours > 0) {
            return record;
        }

        // Check today (for late sleepers who slept past midnight)
        const today = new Date().toISOString().split('T')[0];
        record = await this.getSessionsForDate(today);
        if (record && record.nightHours > 0) {
            return record;
        }

        return null;
    },

    /**
     * Get weekly sleep statistics
     */
    async getWeeklyStats(): Promise<{
        totalNightHours: number;
        totalNapHours: number;
        averageNightHours: number;
        averageNapHours: number;
        daysWithData: number;
    }> {
        let totalNightHours = 0;
        let totalNapHours = 0;
        let daysWithData = 0;

        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const record = await this.getSessionsForDate(dateStr);
            if (record) {
                totalNightHours += record.nightHours;
                totalNapHours += record.napHours;
                if (record.totalHours > 0) daysWithData++;
            }
        }

        return {
            totalNightHours,
            totalNapHours,
            averageNightHours: daysWithData > 0 ? totalNightHours / daysWithData : 0,
            averageNapHours: daysWithData > 0 ? totalNapHours / daysWithData : 0,
            daysWithData,
        };
    },

    /**
     * Attach metadata to the active session without starting/stopping.
     */
    async updateActiveSessionMetadata(metadata: SleepSessionMetadata): Promise<void> {
        const active = await storage.get<any>('active_sleep_session');
        if (!active) return;

        await storage.set('active_sleep_session', {
            ...active,
            tags: metadata.tags || active.tags || [],
            context: metadata.context || active.context,
        });
    },

    /**
     * Cancel the active sleep session without recording it.
     */
    async cancelActiveSession(): Promise<void> {
        const active = await storage.get<any>('active_sleep_session');
        if (!active) return;

        await storage.remove('active_sleep_session');

        // Sync to native to clear sleeping flag (only if JS started it).
        if (Platform.OS === 'android' && SleepBridge) {
            try {
                await SleepBridge.endSleepSession();
            } catch (e) {
                console.warn('[SleepSessionService] Failed to cancel sleep session on native:', e);
            }
        }
    },

    /**
     * Infer a stable sleep schedule from recent night sessions.
     */
    async getScheduleSuggestion(): Promise<SleepScheduleSuggestion | null> {
        const bedTimes: number[] = [];
        const wakeTimes: number[] = [];

        for (let i = 0; i < SCHEDULE_LOOKBACK_DAYS; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const record = await this.getSessionsForDate(dateStr);
            if (!record?.sessions?.length) continue;

            const nightSessions = record.sessions
                .filter(session => session.type === 'night' && session.durationHours >= 2);
            if (!nightSessions.length) continue;

            const longest = [...nightSessions].sort((a, b) => b.durationHours - a.durationHours)[0];
            if (!longest) continue;

            bedTimes.push(toLocalMinutes(longest.startTime));
            wakeTimes.push(toLocalMinutes(longest.endTime));
        }

        if (bedTimes.length < MIN_NIGHTS_FOR_SCHEDULE) return null;

        const bedStats = normalizeWrappedTimes(bedTimes);
        const wakeStats = normalizeWrappedTimes(wakeTimes);
        const varianceMinutes = Math.round(Math.max(bedStats.stdev, wakeStats.stdev));

        return {
            bedTime: formatMinutes(bedStats.median),
            wakeTime: formatMinutes(wakeStats.median),
            sampleSize: bedTimes.length,
            varianceMinutes,
            confidence: getConfidence(bedTimes.length, varianceMinutes),
            computedAt: Date.now(),
        };
    },

    /**
     * Generate context for LLM plan generation
     */
    async getSleepContextForLLM(): Promise<SleepContext> {
        const lastNight = await this.getLastNightSleep();
        const weeklyStats = await this.getWeeklyStats();
        const scheduleSuggestion = await this.getScheduleSuggestion();
        const today = new Date().toISOString().split('T')[0];
        const todayRecord = await this.getSessionsForDate(today);

        const lastNightTags = lastNight?.sessions
            ?.flatMap(s => s.tags || [])
            .filter(tag => typeof tag === 'string') || [];
        const uniqueTags = Array.from(new Set(lastNightTags));

        // Calculate sleep debt (assuming 8hr target)
        const targetHours = 8;
        const weeklyDebt = (targetHours * 7) - weeklyStats.totalNightHours;

        // Get usual bedtime from history (simplified)
        const usualBedtime = scheduleSuggestion?.bedTime || "22:00";
        const usualWakeTime = scheduleSuggestion?.wakeTime || "07:00";

        // Format naps today
        const napsToday = (todayRecord?.sessions || [])
            .filter(s => s.type === 'nap')
            .map(s => ({
                start: new Date(s.startTime).toTimeString().slice(0, 5),
                end: new Date(s.endTime).toTimeString().slice(0, 5),
                duration: s.durationHours,
            }));

        // Quality rating
        let quality = 'fair';
        if (lastNight && lastNight.nightHours >= 7) quality = 'good';
        else if (lastNight && lastNight.nightHours >= 8) quality = 'excellent';
        else if (lastNight && lastNight.nightHours < 6) quality = 'poor';

        return {
            lastNight: lastNight ? {
                totalHours: lastNight.nightHours,
                sessions: lastNight.sessions
                    .filter(s => s.type === 'night')
                    .map(s => ({
                        start: new Date(s.startTime).toTimeString().slice(0, 5),
                        end: new Date(s.endTime).toTimeString().slice(0, 5),
                        type: s.source,
                    })),
                quality,
                wentToBedLate: false, // TODO: Calculate based on usualBedtime
                wokeEarly: false,
                tags: uniqueTags.length ? uniqueTags : undefined,
            } : null,
            napsToday,
            weeklyAverage: Math.round(weeklyStats.averageNightHours * 10) / 10,
            weeklyNapAverage: Math.round(weeklyStats.averageNapHours * 10) / 10,
            consistencyScore: scheduleSuggestion
                ? Math.max(0, 100 - Math.round(scheduleSuggestion.varianceMinutes / 2))
                : 70,
            sleepDebt: Math.max(0, Math.round(weeklyDebt * 10) / 10),
            usualBedtime,
            usualWakeTime,
            tags: uniqueTags.length ? uniqueTags : undefined,
        };
    },

    /**
     * Compute a sleep score from a session (0-100)
     */
    async computeSleepScore(session: SleepSession): Promise<number> {
        let score = 50;

        if (session.durationHours >= 7 && session.durationHours <= 9) score += 20;
        else if (session.durationHours >= 6) score += 10;
        else score -= 10;

        if (typeof session.quality === 'number') {
            if (session.quality > 70) score += 15;
            else if (session.quality > 50) score += 5;
        }

        try {
            const { sleepScheduleService } = require('./sleepScheduleService');
            const schedule = await sleepScheduleService.getCurrentSchedule();
            if (schedule?.bedTime) {
                const startMinutes = toLocalMinutes(session.startTime);
                const [h, m] = schedule.bedTime.split(':').map(Number);
                const targetMinutes = (h * 60) + m;
                const diff = Math.abs(startMinutes - targetMinutes);
                const wrapped = Math.min(diff, MINUTES_PER_DAY - diff);
                if (wrapped <= 30) score += 10;
                else if (wrapped >= 90) score -= 10;
            }
        } catch (e) {
            console.warn('[SleepSessionService] Sleep schedule lookup failed:', e);
        }

        return Math.max(0, Math.min(100, Math.round(score)));
    },

    /**
     * Format sleep context as prompt for LLM
     */
    formatContextForPrompt(context: SleepContext): string {
        const lines: string[] = [];

        if (context.lastNight) {
            lines.push(`Last night: ${context.lastNight.totalHours} hours (${context.lastNight.quality})`);
        } else {
            lines.push('Last night: No sleep data');
        }

        if (context.napsToday.length > 0) {
            const napTotal = context.napsToday.reduce((sum, n) => sum + n.duration, 0);
            lines.push(`Naps today: ${context.napsToday.length} nap(s), ${napTotal.toFixed(1)}h total`);
        }

        lines.push(`Weekly average: ${context.weeklyAverage}h/night`);

        if (context.sleepDebt > 0) {
            lines.push(`Sleep debt: ${context.sleepDebt}h behind this week`);
        }

        if (context.tags && context.tags.length > 0) {
            lines.push(`Sleep tags: ${context.tags.join(', ')}`);
        }

        return lines.join('\n');
    },

    /**
     * Check if there's an active session
     */
    async isSessionActive(): Promise<boolean> {
        const active = await storage.get<any>('active_sleep_session');
        return !!active;
    },

    /**
     * Get active session info
     */
    async getActiveSession(): Promise<{ id: string; startTime: number; source: string } | null> {
        return await storage.get<any>('active_sleep_session');
    },

    /**
     * Update a stored session's start/end times and recalculate totals.
     */
    async updateSessionTimes(
        sessionId: string,
        startTime: number,
        endTime: number
    ): Promise<{
        updated: boolean;
        previousDate?: string;
        nextDate?: string;
        session?: SleepSession;
    }> {
        if (!sessionId || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
            return { updated: false };
        }

        let previousDate: string | undefined;
        let foundSession: SleepSession | null = null;

        for (let i = 0; i < SESSION_LOOKBACK_DAYS; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            const record = await this.getSessionsForDate(dateKey);
            if (!record?.sessions?.length) continue;

            const match = record.sessions.find(session => session.id === sessionId);
            if (match) {
                previousDate = dateKey;
                foundSession = match;
                // Remove from old record
                const remaining = record.sessions.filter(session => session.id !== sessionId);
                const totals = computeTotals(remaining);
                await storage.set(`${SESSIONS_KEY_PREFIX}${dateKey}`, {
                    date: dateKey,
                    sessions: remaining,
                    ...totals,
                } as DailySleepRecord);
                break;
            }
        }

        if (!foundSession) {
            return { updated: false };
        }

        const durationHours = Math.round(((endTime - startTime) / (1000 * 60 * 60)) * 100) / 100;
        const type = this.classifySession(new Date(startTime).getHours(), durationHours);
        const nextDate = getDateKeyFromTimestamp(startTime);
        const updatedSession: SleepSession = {
            ...foundSession,
            startTime,
            endTime,
            durationHours,
            type,
            date: nextDate,
        };

        const nextKey = `${SESSIONS_KEY_PREFIX}${nextDate}`;
        const nextRecord = await storage.get<DailySleepRecord>(nextKey);
        const nextSessions = nextRecord?.sessions ? [...nextRecord.sessions, updatedSession] : [updatedSession];
        const nextTotals = computeTotals(nextSessions);
        await storage.set(nextKey, {
            date: nextDate,
            sessions: nextSessions,
            ...nextTotals,
        } as DailySleepRecord);

        // Keep legacy sleep history in sync if present
        const legacyHistory = await storage.get<any[]>(storage.keys.SLEEP_HISTORY);
        if (Array.isArray(legacyHistory) && legacyHistory.length) {
            const updatedHistory = legacyHistory.map(entry => {
                if (entry?.id !== sessionId) return entry;
                return {
                    ...entry,
                    startTime,
                    endTime,
                    duration: durationHours,
                    durationHours,
                    date: nextDate,
                };
            });
            await storage.set(storage.keys.SLEEP_HISTORY, updatedHistory);
        }

        return {
            updated: true,
            previousDate,
            nextDate,
            session: updatedSession,
        };
    },

    /**
     * Remove a session by id.
     */
    async removeSession(sessionId: string): Promise<{ removed: boolean; dateKey?: string }> {
        if (!sessionId) return { removed: false };
        for (let i = 0; i < SESSION_LOOKBACK_DAYS; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            const record = await this.getSessionsForDate(dateKey);
            if (!record?.sessions?.length) continue;
            const hasMatch = record.sessions.some(session => session.id === sessionId);
            if (!hasMatch) continue;

            const remaining = record.sessions.filter(session => session.id !== sessionId);
            const totals = computeTotals(remaining);
            await storage.set(`${SESSIONS_KEY_PREFIX}${dateKey}`, {
                date: dateKey,
                sessions: remaining,
                ...totals,
            } as DailySleepRecord);

            const legacyHistory = await storage.get<any[]>(storage.keys.SLEEP_HISTORY);
            if (Array.isArray(legacyHistory) && legacyHistory.length) {
                await storage.set(
                    storage.keys.SLEEP_HISTORY,
                    legacyHistory.filter(entry => entry?.id !== sessionId)
                );
            }

            return { removed: true, dateKey };
        }
        return { removed: false };
    },
};

export default sleepSessionService;
