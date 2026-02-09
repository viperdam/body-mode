/**
 * ScheduleService - Centralized source of truth for user's day/night schedule
 * 
 * All components (sleep detection, wake detection, LLM, greeting, etc.) should
 * use these helpers instead of hardcoding times like "21-7" or "6-11".
 * 
 * This enables night workers, flexible schedules, and rotating shifts to work correctly.
 */

import { UserProfile } from '../types';

/**
 * Parse time string to hour number (e.g., "18:30" -> 18)
 */
export const parseTimeToHour = (time: string | undefined): number | null => {
    if (!time) return null;
    const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = parseInt(match[1], 10);
    if (isNaN(h) || h < 0 || h > 23) return null;
    return h;
};

/**
 * Get user's day start hour (when they wake up)
 * Default: 7am for standard schedule
 */
export const getUserDayStartHour = (user: UserProfile | null | undefined): number => {
    if (!user?.sleepRoutine?.targetWakeTime) return 7;
    return parseTimeToHour(user.sleepRoutine.targetWakeTime) ?? 7;
};

/**
 * Get user's day end hour (when they go to bed)
 * Default: 23 (11pm) for standard schedule
 */
export const getUserDayEndHour = (user: UserProfile | null | undefined): number => {
    if (!user?.sleepRoutine?.targetBedTime) return 23;
    return parseTimeToHour(user.sleepRoutine.targetBedTime) ?? 23;
};

/**
 * Check if an hour falls within a range, handling wrap-around (e.g., 22-6)
 */
export const isHourInRange = (hour: number, start: number, end: number): boolean => {
    if (start <= end) {
        // Normal range (e.g., 9-17)
        return hour >= start && hour < end;
    } else {
        // Wraps midnight (e.g., 22-6)
        return hour >= start || hour < end;
    }
};

/**
 * Check if current hour is during user's "night" (sleep period)
 * For a night worker who sleeps 10am-6pm, night = 10-18
 */
export const isUserNighttime = (hour: number, user: UserProfile | null | undefined): boolean => {
    const dayStart = getUserDayStartHour(user); // Wake time
    const dayEnd = getUserDayEndHour(user);     // Bed time

    // Night is between bed time and wake time
    return isHourInRange(hour, dayEnd, dayStart);
};

/**
 * Check if current hour is during user's "day" (active period)
 */
export const isUserDaytime = (hour: number, user: UserProfile | null | undefined): boolean => {
    return !isUserNighttime(hour, user);
};

/**
 * Check if current hour is user's "morning" (first 5 hours after wake)
 */
export const isUserMorning = (hour: number, user: UserProfile | null | undefined): boolean => {
    const dayStart = getUserDayStartHour(user);
    const morningEnd = (dayStart + 5) % 24;
    return isHourInRange(hour, dayStart, morningEnd);
};

/**
 * Calculate hours since user's wake time (0-23)
 * Useful for context-aware greeting
 */
export const hoursIntoUserDay = (hour: number, user: UserProfile | null | undefined): number => {
    const dayStart = getUserDayStartHour(user);
    return (hour - dayStart + 24) % 24;
};

/**
 * Get context-aware greeting key based on user's schedule
 * Returns translation key like 'good_morning', 'good_afternoon', etc.
 */
export const getGreetingKey = (hour: number, user: UserProfile | null | undefined): string => {
    const hoursSinceWake = hoursIntoUserDay(hour, user);

    if (hoursSinceWake < 4) return 'good_morning';      // First 4h after wake
    if (hoursSinceWake < 10) return 'good_afternoon';   // 4-10h after wake
    if (hoursSinceWake < 14) return 'good_evening';     // 10-14h after wake
    return 'good_night';                                 // Approaching bed
};

/**
 * Get schedule offset from default (7am wake)
 * Used to shift plan item times for night workers
 */
export const getScheduleOffset = (user: UserProfile | null | undefined): number => {
    const DEFAULT_WAKE = 7;
    const userWake = getUserDayStartHour(user);
    return userWake - DEFAULT_WAKE;
};

/**
 * Shift a time string by offset hours
 * e.g., shiftTime("07:00", 11) -> "18:00"
 */
export const shiftTime = (baseTime: string, offsetHours: number): string => {
    const hour = parseTimeToHour(baseTime);
    if (hour === null) return baseTime;

    const newHour = (hour + offsetHours + 24) % 24;
    const match = baseTime.match(/:(\d{2})$/);
    const minutes = match ? match[1] : '00';

    return `${String(newHour).padStart(2, '0')}:${minutes}`;
};

/**
 * Get explicit schedule context for LLM prompts
 */
export const getScheduleContext = (user: UserProfile | null | undefined): string => {
    const dayStart = getUserDayStartHour(user);
    const dayEnd = getUserDayEndHour(user);
    const workType = user?.workProfile?.type || 'flexible';

    const formatHour = (h: number) => `${String(h).padStart(2, '0')}:00`;

    return `=== USER SCHEDULE ===
Day Starts (Wake Time): ${formatHour(dayStart)}
Day Ends (Bed Time): ${formatHour(dayEnd)}
Work Type: ${workType}
IMPORTANT: Schedule ALL meals and activities relative to when the user WAKES UP, not clock time.
For this user, "breakfast" should be around ${formatHour(dayStart)}, "lunch" ~5h after wake, "dinner" ~12h after wake.`;
};

/**
 * Calculate the "wrap-up" hour (Day Complete time) - 1 hour before bed
 */
export const getWrapUpHour = (user: UserProfile | null | undefined): number => {
    const dayEnd = getUserDayEndHour(user);
    return (dayEnd - 1 + 24) % 24;
};

export default {
    parseTimeToHour,
    getUserDayStartHour,
    getUserDayEndHour,
    isHourInRange,
    isUserNighttime,
    isUserDaytime,
    isUserMorning,
    hoursIntoUserDay,
    getGreetingKey,
    getScheduleOffset,
    shiftTime,
    getScheduleContext,
    getWrapUpHour,
};
