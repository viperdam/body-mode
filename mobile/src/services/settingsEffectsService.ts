import { Platform } from 'react-native';
import storage from './storageService';
import {
  clearNotificationType,
  scheduleNightlyWrapUpReminder,
  schedulePlanNotifications,
} from './notificationService';
import { syncOverlaysWithCurrentPlan } from './overlaySchedulerService';
import { sleepService } from './sleepService';
import { getActiveDayKey } from './dayBoundaryService';
import { setNetworkMonitoringEnabled } from './offlineService';
import type { AutoSleepSettings, DailyPlan, NotificationPlanMode, OverlaySettings } from '../types';

type PreferencesSnapshot = {
  notificationsEnabled?: boolean;
  notificationPlanMode?: NotificationPlanMode;
  sleepScheduleAutoEnabled?: boolean;
  networkMonitoringEnabled?: boolean;
};

const PREF_DEBOUNCE_MS = 600;
const OVERLAY_DEBOUNCE_MS = 600;
const AUTO_SLEEP_DEBOUNCE_MS = 600;
const RUNTIME_DEBOUNCE_MS = 600;

let initialized = false;
let unsubscribe: (() => void) | null = null;
let prefTimer: ReturnType<typeof setTimeout> | null = null;
let overlayTimer: ReturnType<typeof setTimeout> | null = null;
let autoSleepTimer: ReturnType<typeof setTimeout> | null = null;
let lastPrefs: PreferencesSnapshot | null = null;
let lastOverlaySettings: OverlaySettings | null = null;
let lastAutoSleepSettings: AutoSleepSettings | null = null;
let lastRuntimePrefs: PreferencesSnapshot | null = null;
let runtimeTimer: ReturnType<typeof setTimeout> | null = null;

const getActivePlan = async (): Promise<DailyPlan | null> => {
  const activeDayKey = await getActiveDayKey();
  const planKey = `${storage.keys.DAILY_PLAN}_${activeDayKey}`;
  let plan = await storage.get<DailyPlan>(planKey);

  if (!plan) {
    plan = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
  }

  if (!plan) return null;
  if (plan.date && plan.date !== activeDayKey) return null;
  return plan;
};

const normalizeNotificationsEnabled = (prefs?: PreferencesSnapshot | null): boolean => {
  if (!prefs) return true;
  return prefs.notificationsEnabled !== false;
};

const normalizeNotificationMode = (prefs?: PreferencesSnapshot | null): NotificationPlanMode => {
  if (prefs?.notificationPlanMode) return prefs.notificationPlanMode;
  return 'high';
};

const normalizeNetworkMonitoring = (prefs?: PreferencesSnapshot | null): boolean => {
  if (!prefs) return true;
  return prefs.networkMonitoringEnabled !== false;
};

const hasNotificationChanges = (
  next: PreferencesSnapshot | null,
  prev: PreferencesSnapshot | null
): boolean => {
  if (!prev) return true;
  return (
    normalizeNotificationsEnabled(next) !== normalizeNotificationsEnabled(prev) ||
    normalizeNotificationMode(next) !== normalizeNotificationMode(prev)
  );
};

const handlePreferenceChange = async (prefs: PreferencesSnapshot | null, force = false): Promise<void> => {
  if (!force && !hasNotificationChanges(prefs, lastPrefs)) {
    lastPrefs = prefs;
    return;
  }

  lastPrefs = prefs;

  if (!normalizeNotificationsEnabled(prefs)) {
    await Promise.all([
      clearNotificationType('plan'),
      clearNotificationType('hydration'),
      clearNotificationType('hydration_snooze'),
      clearNotificationType('wrapup'),
      clearNotificationType('wrapup_snooze'),
    ]);
    return;
  }

  const plan = await getActivePlan();
  if (plan) {
    await schedulePlanNotifications(plan, { mode: normalizeNotificationMode(prefs) });
  }
  await scheduleNightlyWrapUpReminder();
};

const overlaySettingsEqual = (a?: OverlaySettings | null, b?: OverlaySettings | null): boolean => {
  if (!a || !b) return false;
  if (a.enabled !== b.enabled) return false;
  if (a.mode !== b.mode) return false;
  if (a.permissionGranted !== b.permissionGranted) return false;
  const typesA = a.types || {};
  const typesB = b.types || {};
  const keys = Object.keys({ ...typesA, ...typesB });
  for (const key of keys) {
    if (Boolean((typesA as any)[key]) !== Boolean((typesB as any)[key])) {
      return false;
    }
  }
  return true;
};

const handleOverlaySettingsChange = async (
  settings: OverlaySettings | null,
  force = false
): Promise<void> => {
  if (!settings) return;
  if (!force && overlaySettingsEqual(settings, lastOverlaySettings)) {
    lastOverlaySettings = settings;
    return;
  }
  lastOverlaySettings = settings;
  await syncOverlaysWithCurrentPlan();
};

const autoSleepSettingsEqual = (a?: AutoSleepSettings | null, b?: AutoSleepSettings | null): boolean => {
  if (!a || !b) return false;
  return (
    a.enabled === b.enabled &&
    a.nightStartHour === b.nightStartHour &&
    a.nightEndHour === b.nightEndHour &&
    a.anytimeMode === b.anytimeMode &&
    a.requireCharging === b.requireCharging &&
    a.sensitivityLevel === b.sensitivityLevel &&
    a.stillnessThresholdMinutes === b.stillnessThresholdMinutes &&
    a.useActivityRecognition === b.useActivityRecognition
  );
};

const handleAutoSleepSettingsChange = async (
  settings: AutoSleepSettings | null,
  force = false
): Promise<void> => {
  if (!settings) return;
  if (!force && autoSleepSettingsEqual(settings, lastAutoSleepSettings)) {
    lastAutoSleepSettings = settings;
    return;
  }
  lastAutoSleepSettings = settings;
  await sleepService.syncSettingsToNative(settings);
  if (Platform.OS === 'android') {
    await sleepService.setAutoSleepEnabled(!!settings.enabled);
  }
};

const handleRuntimePreferencesChange = async (
  prefs: PreferencesSnapshot | null,
  force = false
): Promise<void> => {
  try {
    const nextEnabled = normalizeNetworkMonitoring(prefs);
    const prevEnabled = normalizeNetworkMonitoring(lastRuntimePrefs);
    if (!force && nextEnabled === prevEnabled) {
      lastRuntimePrefs = prefs;
      return;
    }
    lastRuntimePrefs = prefs;
    await setNetworkMonitoringEnabled(nextEnabled);
  } catch (error) {
    console.warn('[SettingsEffects] Runtime preference update failed:', error);
  }
};

const schedulePrefSideEffects = (prefs: PreferencesSnapshot | null, force = false): void => {
  if (prefTimer) clearTimeout(prefTimer);
  prefTimer = setTimeout(() => {
    prefTimer = null;
    void handlePreferenceChange(prefs, force);
  }, PREF_DEBOUNCE_MS);
};

const scheduleOverlaySideEffects = (settings: OverlaySettings | null, force = false): void => {
  if (overlayTimer) clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => {
    overlayTimer = null;
    void handleOverlaySettingsChange(settings, force);
  }, OVERLAY_DEBOUNCE_MS);
};

const scheduleAutoSleepSideEffects = (settings: AutoSleepSettings | null, force = false): void => {
  if (autoSleepTimer) clearTimeout(autoSleepTimer);
  autoSleepTimer = setTimeout(() => {
    autoSleepTimer = null;
    void handleAutoSleepSettingsChange(settings, force);
  }, AUTO_SLEEP_DEBOUNCE_MS);
};

const scheduleRuntimeSideEffects = (prefs: PreferencesSnapshot | null, force = false): void => {
  if (runtimeTimer) clearTimeout(runtimeTimer);
  runtimeTimer = setTimeout(() => {
    runtimeTimer = null;
    void handleRuntimePreferencesChange(prefs, force);
  }, RUNTIME_DEBOUNCE_MS);
};

const initialize = async (): Promise<void> => {
  if (initialized) return;
  initialized = true;

  const [prefs, overlaySettings, autoSleepSettings] = await Promise.all([
    storage.get<PreferencesSnapshot>(storage.keys.APP_PREFERENCES),
    storage.get<OverlaySettings>(storage.keys.OVERLAY_SETTINGS),
    storage.get<AutoSleepSettings>(storage.keys.AUTO_SLEEP_SETTINGS),
  ]);

  lastPrefs = prefs || null;
  lastOverlaySettings = overlaySettings || null;
  lastAutoSleepSettings = autoSleepSettings || null;
  lastRuntimePrefs = prefs || null;

  schedulePrefSideEffects(lastPrefs, true);
  scheduleOverlaySideEffects(lastOverlaySettings, true);
  scheduleAutoSleepSideEffects(lastAutoSleepSettings, true);
  scheduleRuntimeSideEffects(lastPrefs, true);

  unsubscribe = storage.subscribe((key, value, action) => {
    if (action !== 'set') return;
    if (key === storage.keys.APP_PREFERENCES) {
      schedulePrefSideEffects(value as PreferencesSnapshot);
      scheduleRuntimeSideEffects(value as PreferencesSnapshot);
    }
    if (key === storage.keys.OVERLAY_SETTINGS) {
      scheduleOverlaySideEffects(value as OverlaySettings);
    }
    if (key === storage.keys.AUTO_SLEEP_SETTINGS) {
      scheduleAutoSleepSideEffects(value as AutoSleepSettings);
    }
  });
};

const destroy = (): void => {
  if (prefTimer) clearTimeout(prefTimer);
  if (overlayTimer) clearTimeout(overlayTimer);
  if (autoSleepTimer) clearTimeout(autoSleepTimer);
  if (runtimeTimer) clearTimeout(runtimeTimer);
  prefTimer = null;
  overlayTimer = null;
  autoSleepTimer = null;
  runtimeTimer = null;
  unsubscribe?.();
  unsubscribe = null;
  initialized = false;
};

export const settingsEffectsService = {
  initialize,
  destroy,
  refreshForLanguage: async (options: { regeneratePlan?: boolean } = {}): Promise<void> => {
    const [prefs, overlaySettings] = await Promise.all([
      storage.get<PreferencesSnapshot>(storage.keys.APP_PREFERENCES),
      storage.get<OverlaySettings>(storage.keys.OVERLAY_SETTINGS),
    ]);

    if (options.regeneratePlan) {
      try {
        const { autoPlanService } = await import('./autoPlanService');
        await autoPlanService.generateTodayPlan('MANUAL');
      } catch (error) {
        console.warn('[SettingsEffects] Failed to regenerate plan for language change:', error);
      }
    }

    await handlePreferenceChange(prefs || null, true);
    await handleOverlaySettingsChange(overlaySettings || null, true);
  },
};

export default settingsEffectsService;
