// Date utility functions for BioSync AI

export const getLocalDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getLocalTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const formatDate = (date: Date): string => {
    return date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
};

export const parseTimeToMinutes = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

export const addMinutesToTime = (timeStr: string, minutes: number): string => {
    const totalMinutes = parseTimeToMinutes(timeStr) + minutes;
    const hours = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export const buildLocalDateTimeFromKey = (dateKey: string, time: string): Date | null => {
    const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;

    const timeMatch = time.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) return null;
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    return new Date(year, month - 1, day, hour, minute, 0, 0);
};

/**
 * Get the "active day" based on wake time (not midnight)
 * 
 * This supports night workers - their "day" starts when they wake up,
 * not at midnight. If the user woke up today, it's today's plan.
 * If they haven't woken yet (e.g., still sleeping past midnight), 
 * use yesterday's plan.
 * 
 * @param lastWakeTime - Timestamp of last wake event
 * @returns The date key for the active day (YYYY-MM-DD)
 */
export const getActiveDay = (lastWakeTime?: number | null): string => {
    const now = new Date();
    const today = getLocalDateKey(now);

    if (!lastWakeTime) {
        // No wake data - use today
        return today;
    }

    // Guard against stale or future wake timestamps
    const maxStaleMs = 36 * 60 * 60 * 1000;
    if (Date.now() - lastWakeTime > maxStaleMs) {
        return today;
    }

    const wakeDate = new Date(lastWakeTime);
    const wakeDay = getLocalDateKey(wakeDate);
    if (wakeDay > today) {
        return today;
    }

    // Day starts when the user actually wakes up
    return wakeDay;
};

/**
 * Check if two dates are the same calendar day
 */
export const isSameCalendarDay = (timestamp1: number, timestamp2: number): boolean => {
    return getLocalDateKey(new Date(timestamp1)) === getLocalDateKey(new Date(timestamp2));
};
