import storage from './storageService';
import { getActiveDay, getLocalDateKey } from '../utils/dateUtils';

type DayBoundarySnapshot = {
    activeDayKey: string;
    dayStartMinutes: number;
    lastWakeTime?: number | null;
};

const LEGACY_LAST_WAKE_TIME_KEY = 'last_wake_time';
const LEGACY_ACTIVE_DAY_KEY = 'last_active_day';
const SLEEP_STALE_MS = 12 * 60 * 60 * 1000;

const parseTimeMinutes = (time: string): number | null => {
    const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
};

const normalizeWakeTime = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return value > 0 ? value : null;
};

const readLegacyWakeTime = async (): Promise<number | null> => {
    const legacy = await storage.get<number>(LEGACY_LAST_WAKE_TIME_KEY);
    return normalizeWakeTime(legacy);
};

const writeLegacyWakeTime = async (timestamp: number): Promise<void> => {
    await storage.set(LEGACY_LAST_WAKE_TIME_KEY, timestamp);
};

const writeLegacyActiveDay = async (activeDayKey: string): Promise<void> => {
    await storage.set(LEGACY_ACTIVE_DAY_KEY, activeDayKey);
};

export const getLastWakeTime = async (): Promise<number | null> => {
    const stored = await storage.get<number>(storage.keys.LAST_WAKE_TIME);
    const normalized = normalizeWakeTime(stored);
    if (normalized !== null) return normalized;
    return readLegacyWakeTime();
};

export const setLastWakeTime = async (timestamp: number): Promise<void> => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return;
    await storage.set(storage.keys.LAST_WAKE_TIME, timestamp);
    await writeLegacyWakeTime(timestamp);
};

export const getActiveDayKey = async (): Promise<string> => {
    const wakeTime = await getLastWakeTime();
    const activeDay = getActiveDay(wakeTime);
    const stored = await storage.get<string>(storage.keys.ACTIVE_DAY_KEY);

    if (stored !== activeDay) {
        await storage.set(storage.keys.ACTIVE_DAY_KEY, activeDay);
        await writeLegacyActiveDay(activeDay);
    }

    return activeDay;
};

const resolveSleepStart = (sleepStart: unknown, activeSession: any): number | null => {
    if (typeof sleepStart === 'number' && Number.isFinite(sleepStart)) return sleepStart;
    if (activeSession && typeof activeSession === 'object') {
        const candidate =
            (typeof activeSession.startTime === 'number' && activeSession.startTime) ||
            (typeof activeSession.start === 'number' && activeSession.start) ||
            (typeof activeSession.startedAt === 'number' && activeSession.startedAt) ||
            null;
        if (candidate && Number.isFinite(candidate)) return candidate;
    }
    return null;
};

const clearSleepFlags = async (reason: string) => {
    await Promise.all([
        storage.set('is_sleeping', false),
        storage.set('sleep_ghost_mode', false),
        storage.remove('active_sleep_session'),
        storage.remove('sleep_start_time'),
    ]);
    console.log(`[DayBoundary] Cleared stale sleep flags (${reason})`);
};

const getSleepSnapshot = async (nowMs: number): Promise<{ active: boolean; stale: boolean; startTime: number | null }> => {
    const [isSleeping, isGhost, activeSession, sleepStartTime, lastWakeTime] = await Promise.all([
        storage.get<boolean>('is_sleeping'),
        storage.get<boolean>('sleep_ghost_mode'),
        storage.get<any>('active_sleep_session'),
        storage.get<number>('sleep_start_time'),
        getLastWakeTime(),
    ]);

    const active = !!isSleeping || !!isGhost || !!activeSession;
    if (!active) return { active: false, stale: false, startTime: null };

    const startTime = resolveSleepStart(sleepStartTime, activeSession);
    if (typeof startTime === 'number' && Number.isFinite(startTime)) {
        return { active, stale: nowMs - startTime > SLEEP_STALE_MS, startTime };
    }

    if (typeof lastWakeTime === 'number' && Number.isFinite(lastWakeTime)) {
        return { active, stale: nowMs - lastWakeTime > SLEEP_STALE_MS, startTime: null };
    }

    return { active, stale: false, startTime: null };
};

export const maybeAdvanceActiveDay = async (options?: {
    now?: Date;
    reason?: string;
    allowWhenSleeping?: boolean;
}): Promise<{ previous: string; current: string; advanced: boolean }> => {
    const now = options?.now ?? new Date();
    const nowMs = now.getTime();
    const todayKey = getLocalDateKey(now);
    const previous = await getActiveDayKey();
    if (previous >= todayKey) {
        return { previous, current: previous, advanced: false };
    }

    const sleepSnapshot = await getSleepSnapshot(nowMs);
    if (sleepSnapshot.active && !options?.allowWhenSleeping) {
        if (!sleepSnapshot.stale) {
            return { previous, current: previous, advanced: false };
        }
        await clearSleepFlags('stale_sleep_state');
    }

    await setLastWakeTime(nowMs);
    const current = await getActiveDayKey();
    if (current !== previous) {
        console.log(`[DayBoundary] Advanced active day from ${previous} -> ${current}${options?.reason ? ` (${options.reason})` : ''}`);
    }
    return { previous, current, advanced: current !== previous };
};

export const getDayStartMinutes = async (dateKey?: string): Promise<number> => {
    const wakeTime = await getLastWakeTime();
    if (!wakeTime) return 0;

    const activeDay = await getActiveDayKey();
    if (dateKey && dateKey !== activeDay) return 0;

    const wakeDate = new Date(wakeTime);
    return wakeDate.getHours() * 60 + wakeDate.getMinutes();
};

export const getDayBoundarySnapshot = async (dateKey?: string): Promise<DayBoundarySnapshot> => {
    const [activeDayKey, lastWakeTime] = await Promise.all([
        getActiveDayKey(),
        getLastWakeTime(),
    ]);
    const dayStartMinutes = await getDayStartMinutes(dateKey || activeDayKey);
    return { activeDayKey, dayStartMinutes, lastWakeTime };
};

export const isActiveDay = async (dateKey: string): Promise<boolean> => {
    const activeDayKey = await getActiveDayKey();
    return activeDayKey === dateKey;
};

export const getPlanItemDateTime = async (dateKey: string, time: string): Promise<Date | null> => {
    const parsedMinutes = parseTimeMinutes(time);
    if (parsedMinutes === null) return null;

    const dateParts = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateParts) return null;
    const year = Number(dateParts[1]);
    const month = Number(dateParts[2]);
    const day = Number(dateParts[3]);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;

    const hours = Math.floor(parsedMinutes / 60);
    const minutes = parsedMinutes % 60;
    const baseDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

    const dayStartMinutes = await getDayStartMinutes(dateKey);
    if (dayStartMinutes > 0 && parsedMinutes < dayStartMinutes) {
        baseDate.setDate(baseDate.getDate() + 1);
    }

    return baseDate;
};

export const getPlanItemTimestamp = async (dateKey: string, time: string): Promise<number | null> => {
    const date = await getPlanItemDateTime(dateKey, time);
    return date ? date.getTime() : null;
};

export const getActiveDayKeyFallback = (): string => {
    return getLocalDateKey(new Date());
};

export default {
    getActiveDayKey,
    getActiveDayKeyFallback,
    getLastWakeTime,
    setLastWakeTime,
    getDayStartMinutes,
    getDayBoundarySnapshot,
    isActiveDay,
    getPlanItemDateTime,
    getPlanItemTimestamp,
};
