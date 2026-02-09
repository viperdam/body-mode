import { Platform } from 'react-native';
import storage from './storageService';
import { sleepSessionService } from './sleepSessionService';
import { sleepService } from './sleepService';
import { parseTimeToHour } from './scheduleService';
import userProfileService from './userProfileService';
import type { AutoSleepSettings, SleepScheduleSuggestion, UserProfile } from '../types';

type ScheduleUpdateSource = 'manual' | 'auto' | 'suggested';

const AUTO_APPLY_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
const MANUAL_OVERRIDE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_SUGGESTION_DIFF_MINUTES = 30;

const normalizeTimeInput = (value?: string | null): string | null => {
    if (!value) return null;
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const timeToMinutes = (value?: string | null): number | null => {
    const normalized = normalizeTimeInput(value);
    if (!normalized) return null;
    const [h, m] = normalized.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
};

const diffMinutes = (a?: string | null, b?: string | null): number | null => {
    const aMin = timeToMinutes(a);
    const bMin = timeToMinutes(b);
    if (aMin === null || bMin === null) return null;
    const raw = Math.abs(aMin - bMin);
    return Math.min(raw, 1440 - raw);
};

const updateAutoSleepWindow = async (
    bedTime?: string,
    wakeTime?: string
): Promise<void> => {
    const settings = await storage.get<AutoSleepSettings>(storage.keys.AUTO_SLEEP_SETTINGS);
    if (!settings) return;

    const nightStartHour = parseTimeToHour(bedTime) ?? settings.nightStartHour;
    const nightEndHour = parseTimeToHour(wakeTime) ?? settings.nightEndHour;
    const updated: AutoSleepSettings = {
        ...settings,
        nightStartHour,
        nightEndHour,
    };

    await storage.set(storage.keys.AUTO_SLEEP_SETTINGS, updated);
    if (Platform.OS === 'android') {
        await sleepService.syncSettingsToNative(updated);
    }
};

const updateSchedule = async (
    bedTime: string,
    wakeTime: string,
    source: ScheduleUpdateSource
): Promise<UserProfile | null> => {
    const profile = await storage.get<UserProfile>(storage.keys.USER);
    if (!profile) return null;

    const normalizedBed = normalizeTimeInput(bedTime);
    const normalizedWake = normalizeTimeInput(wakeTime);
    if (!normalizedBed || !normalizedWake) return null;

    const nextProfile: UserProfile = {
        ...profile,
        sleepRoutine: {
            ...profile.sleepRoutine,
            targetBedTime: normalizedBed,
            targetWakeTime: normalizedWake,
            lastUpdatedAt: Date.now(),
            lastUpdateSource: source,
        },
    };

    await userProfileService.saveUserProfile(nextProfile, { source });
    await updateAutoSleepWindow(normalizedBed, normalizedWake);

    const prefs = (await storage.get<any>(storage.keys.APP_PREFERENCES)) || {};
    const timestampKey = source === 'manual' ? 'sleepScheduleManualUpdatedAt' : 'sleepScheduleAutoAppliedAt';
    await storage.set(storage.keys.APP_PREFERENCES, {
        ...prefs,
        [timestampKey]: Date.now(),
    });

    return nextProfile;
};

export const sleepScheduleService = {
    normalizeTimeInput,

    async getScheduleSuggestion(): Promise<SleepScheduleSuggestion | null> {
        return sleepSessionService.getScheduleSuggestion();
    },

    async getCurrentSchedule(): Promise<{ bedTime?: string; wakeTime?: string } | null> {
        const profile = await storage.get<UserProfile>(storage.keys.USER);
        if (!profile) return null;
        return {
            bedTime: profile.sleepRoutine?.targetBedTime,
            wakeTime: profile.sleepRoutine?.targetWakeTime,
        };
    },

    async setAutoApplyEnabled(enabled: boolean): Promise<void> {
        const prefs = (await storage.get<any>(storage.keys.APP_PREFERENCES)) || {};
        await storage.set(storage.keys.APP_PREFERENCES, {
            ...prefs,
            sleepScheduleAutoEnabled: enabled,
        });
    },

    async getAutoApplyEnabled(): Promise<boolean> {
        const prefs = (await storage.get<any>(storage.keys.APP_PREFERENCES)) || {};
        if (typeof prefs.sleepScheduleAutoEnabled !== 'boolean') return true;
        return prefs.sleepScheduleAutoEnabled === true;
    },

    async applySuggestion(source: ScheduleUpdateSource = 'suggested'): Promise<UserProfile | null> {
        const suggestion = await this.getScheduleSuggestion();
        if (!suggestion) return null;
        return updateSchedule(suggestion.bedTime, suggestion.wakeTime, source);
    },

    async updateScheduleManually(bedTime: string, wakeTime: string): Promise<UserProfile | null> {
        return updateSchedule(bedTime, wakeTime, 'manual');
    },

    async maybeAutoApplySuggestion(): Promise<{ applied: boolean; reason?: string }> {
        const suggestion = await this.getScheduleSuggestion();
        if (!suggestion) return { applied: false, reason: 'no_suggestion' };
        if (suggestion.confidence === 'low') return { applied: false, reason: 'low_confidence' };

        const autoEnabled = await this.getAutoApplyEnabled();
        if (!autoEnabled) return { applied: false, reason: 'auto_disabled' };

        const prefs = (await storage.get<any>(storage.keys.APP_PREFERENCES)) || {};
        const lastManual = Number(prefs.sleepScheduleManualUpdatedAt) || 0;
        const lastAuto = Number(prefs.sleepScheduleAutoAppliedAt) || 0;
        const now = Date.now();

        if (lastManual && now - lastManual < MANUAL_OVERRIDE_GRACE_MS) {
            return { applied: false, reason: 'manual_recent' };
        }

        if (lastAuto && now - lastAuto < AUTO_APPLY_COOLDOWN_MS) {
            return { applied: false, reason: 'cooldown' };
        }

        const current = await this.getCurrentSchedule();
        const diff = diffMinutes(current?.bedTime, suggestion.bedTime);
        if (diff !== null && diff < MIN_SUGGESTION_DIFF_MINUTES) {
            return { applied: false, reason: 'minor_change' };
        }

        const applied = await updateSchedule(suggestion.bedTime, suggestion.wakeTime, 'auto');
        return { applied: !!applied, reason: applied ? undefined : 'apply_failed' };
    },
};

export default sleepScheduleService;
