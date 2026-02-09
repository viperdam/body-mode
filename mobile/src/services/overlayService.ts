// Overlay Service - Manages floating reminder overlays on Android
// This service bridges React Native with native Android overlay capabilities
import { Platform, NativeModules, Linking, DeviceEventEmitter, EmitterSubscription, AppState } from 'react-native';
import storage from './storageService';
import { OverlayBridge } from './nativeBridge/OverlayBridge';
import { PermissionErrorType } from './permissions/types';
import i18n from '../i18n';
import {
    OverlaySettings,
    DEFAULT_OVERLAY_SETTINGS,
    OVERLAY_MODE_PRESETS,
    NotificationPlanMode,
    OverlayReminderTypes,
    PlanItem
} from '../types';

// Native module interface for immediate overlay display
interface OverlayNativeModule {
    checkPermission: () => Promise<boolean>;
    requestPermission: () => Promise<void>;
    showOverlay: (data: OverlayData) => Promise<void>;
    hideOverlay: () => Promise<void>;
    isOverlayVisible: () => Promise<boolean>;
}

// Native module interface for AlarmManager-based scheduling
interface OverlaySchedulerModule {
    scheduleOverlay: (data: ScheduleOverlayData) => Promise<boolean>;
    cancelOverlay: (id: string) => Promise<boolean>;
    cancelAllOverlays: () => Promise<boolean>;
    syncSettings: (settings: OverlaySettings) => Promise<boolean>;
    getScheduledCount: () => Promise<number>;
}

// Data for scheduling an overlay
interface ScheduleOverlayData {
    id: string;
    type: string;
    title: string;
    description: string;
    icon: string;
    scheduledTime: number;
    planDate?: string;
    planItemId?: string;
}

// Data passed to the native overlay
export interface OverlayData {
    id: string;
    type: 'meal' | 'workout' | 'hydration' | 'sleep' | 'work_break' | 'wrapup' | 'weight_check';
    title: string;
    description: string;
    icon: string;
    planDate?: string;
    planItemId?: string;
}

// Get native modules (may be null if not available)
const OverlayModule: OverlayNativeModule | null =
    Platform.OS === 'android' ? NativeModules.OverlayModule : null;

const OverlayScheduler: OverlaySchedulerModule | null =
    Platform.OS === 'android' ? NativeModules.OverlayScheduler : null;

let overlayCheckInFlight: Promise<boolean> | null = null;
let lastOverlayCheckAt = 0;
let lastOverlayCheckResult: boolean | null = null;
const OVERLAY_CHECK_MIN_INTERVAL_MS = 1500;

let overlaySyncInFlight: Promise<boolean> | null = null;
let lastOverlaySyncAt = 0;
let lastOverlaySyncResult: boolean | null = null;
let lastOverlaySyncSignature: string | null = null;
const OVERLAY_SYNC_MIN_INTERVAL_MS = 1500;

const normalizeOverlaySettings = (saved: OverlaySettings | null): OverlaySettings => {
    const safeSaved = saved && typeof saved === 'object' ? saved : null;
    const rawTypes = safeSaved?.types && typeof safeSaved.types === 'object' ? safeSaved.types : null;
    const types: OverlayReminderTypes = {
        ...DEFAULT_OVERLAY_SETTINGS.types,
        ...(rawTypes || {}),
    };
    const mode = safeSaved?.mode && OVERLAY_MODE_PRESETS[safeSaved.mode] ? safeSaved.mode : DEFAULT_OVERLAY_SETTINGS.mode;
    return {
        ...DEFAULT_OVERLAY_SETTINGS,
        ...(safeSaved || {}),
        mode,
        types,
    };
};

const shouldPersistNormalizedSettings = (saved: OverlaySettings | null, normalized: OverlaySettings): boolean => {
    if (!saved || typeof saved !== 'object') return true;
    if (saved.enabled !== normalized.enabled) return true;
    if (saved.permissionGranted !== normalized.permissionGranted) return true;
    if (saved.mode !== normalized.mode) return true;
    if (!saved.types) return true;
    return (Object.keys(normalized.types) as Array<keyof OverlayReminderTypes>)
        .some((key) => saved.types?.[key] !== normalized.types[key]);
};

/**
 * Check if overlay functionality is available
 */
export const isOverlayAvailable = (): boolean => {
    return Platform.OS === 'android' && OverlayModule !== null;
};

/**
 * Check if overlay permission is granted
 * Now uses OverlayBridge for proper native module integration
 */
export const checkOverlayPermission = async (): Promise<boolean> => {
    if (!isOverlayAvailable()) return false;

    const now = Date.now();
    if (overlayCheckInFlight) {
        return overlayCheckInFlight;
    }
    if (AppState.currentState !== 'active' && lastOverlayCheckResult !== null) {
        return lastOverlayCheckResult;
    }
    if (lastOverlayCheckResult !== null && now - lastOverlayCheckAt < OVERLAY_CHECK_MIN_INTERVAL_MS) {
        return lastOverlayCheckResult;
    }

    overlayCheckInFlight = (async () => {
        try {
            const granted = await OverlayBridge.checkPermission();

            // Update stored permission status
            const settings = await getOverlaySettings();
            if (settings.permissionGranted !== granted) {
                const updatedSettings = {
                    ...settings,
                    permissionGranted: granted,
                    enabled: granted ? settings.enabled : false,
                };
                await saveOverlaySettings(updatedSettings);
                if (!granted) {
                    await cancelAllScheduledOverlays();
                    await hideOverlay();
                }
            }

            lastOverlayCheckAt = Date.now();
            lastOverlayCheckResult = granted;
            return granted;
        } catch (error) {
            console.error('Failed to check overlay permission:', error);
            return false;
        } finally {
            overlayCheckInFlight = null;
        }
    })();

    return overlayCheckInFlight;
};

const getOverlaySignature = (settings: OverlaySettings): string =>
    JSON.stringify({
        enabled: settings.enabled,
        permissionGranted: settings.permissionGranted,
        mode: settings.mode,
        types: settings.types,
    });

/**
 * Request overlay permission - opens Android settings
 * FIXED: Now uses OverlayBridge to open SPECIFIC overlay permission page
 * Instead of generic App Info page (Linking.openSettings)
 */
export const requestOverlayPermission = async (): Promise<void> => {
    if (!isOverlayAvailable()) {
        console.warn('Overlay not available on this platform');
        return;
    }

    try {
        // Use OverlayBridge to open Settings.ACTION_MANAGE_OVERLAY_PERMISSION
        // This opens the SPECIFIC overlay permission page for this app
        // NOT the generic App Info page!
        await OverlayBridge.requestPermissionWithFallback();
        // Note: User must manually enable, then return to the app
        // We'll check permission again when they return (AppState listener)
    } catch (error) {
        console.error('Failed to open overlay settings:', error);
        // Final fallback - try Linking as last resort
        try {
            await Linking.openSettings();
        } catch (fallbackError) {
            console.error('Linking fallback also failed:', fallbackError);
        }
    }
};

/**
 * Get current overlay settings
 */
export const getOverlaySettings = async (): Promise<OverlaySettings> => {
    const saved = await storage.get<OverlaySettings>(storage.keys.OVERLAY_SETTINGS);
    const normalized = normalizeOverlaySettings(saved || null);
    if (shouldPersistNormalizedSettings(saved, normalized)) {
        await storage.set(storage.keys.OVERLAY_SETTINGS, normalized);
    }
    return normalized;
};

/**
 * Save overlay settings and sync to native
 * Important: This syncs to BOTH SharedPreferences (for OverlaySchedulerReceiver)
 * AND Room DB (for ReconcileWorker) to ensure overlay pipeline works end-to-end
 */
export const saveOverlaySettings = async (settings: OverlaySettings): Promise<void> => {
    const normalized = normalizeOverlaySettings(settings);
    try {
        const current = await getOverlaySettings();
        const nextSignature = getOverlaySignature(normalized);
        const currentSignature = getOverlaySignature(current);
        if (nextSignature === currentSignature) {
            return;
        }
    } catch (error) {
        console.warn('[OverlayService] Failed to compare overlay settings:', error);
    }

    await storage.set(storage.keys.OVERLAY_SETTINGS, normalized);

    // Auto-sync to native SharedPreferences
    if (OverlayScheduler?.syncSettings) {
        try {
            await OverlayScheduler.syncSettings(normalized);
            console.log('[OverlayService] Settings auto-synced to native SharedPreferences');
        } catch (error) {
            console.warn('[OverlayService] Failed to sync to SharedPreferences:', error);
        }
    }

    // Auto-sync to Room DB via TxStoreBridge for ReconcileWorker
    if (Platform.OS === 'android') {
        try {
            const { txStoreService } = await import('./txStoreService');
            if (txStoreService.available()) {
                await txStoreService.updateConfig({
                    overlaysEnabled: !!normalized.enabled && !!normalized.permissionGranted,
                    overlayMealEnabled: !!normalized.types?.meal,
                    overlayHydrationEnabled: !!normalized.types?.hydration,
                    overlayActivityEnabled: !!normalized.types?.workout || !!normalized.types?.workBreak,
                    overlaySleepEnabled: !!normalized.types?.sleep,
                });
                console.log('[OverlayService] Settings auto-synced to Room DB');
            }
        } catch (error) {
            console.warn('[OverlayService] Failed to sync to Room DB:', error);
        }
    }
};

/**
 * Enable overlays with current settings
 */
export const enableOverlays = async (): Promise<boolean> => {
    const hasPermission = await checkOverlayPermission();
    if (!hasPermission) {
        return false;
    }

    const settings = await getOverlaySettings();
    await saveOverlaySettings({ ...settings, enabled: true, permissionGranted: true });
    return true;
};

/**
 * Disable overlays
 */
export const disableOverlays = async (): Promise<void> => {
    const settings = await getOverlaySettings();
    await saveOverlaySettings({ ...settings, enabled: false });
    await cancelAllScheduledOverlays();
    await hideOverlay();
};

/**
 * Sync overlay settings to native SharedPreferences
 * Call this after permission is granted or settings change
 */
export const syncSettingsToNative = async (): Promise<boolean> => {
    if (!OverlayScheduler?.syncSettings) {
        console.warn('[OverlayService] OverlayScheduler.syncSettings not available');
        return false;
    }

    const now = Date.now();
    if (overlaySyncInFlight) {
        return overlaySyncInFlight;
    }
    if (lastOverlaySyncResult !== null && now - lastOverlaySyncAt < OVERLAY_SYNC_MIN_INTERVAL_MS) {
        return lastOverlaySyncResult;
    }

    overlaySyncInFlight = (async () => {
        try {
            const settings = await getOverlaySettings();
            const signature = getOverlaySignature(settings);
            if (lastOverlaySyncSignature === signature && lastOverlaySyncResult === true) {
                lastOverlaySyncAt = Date.now();
                return true;
            }
            const result = await OverlayScheduler.syncSettings(settings);
            console.log('[OverlayService] Settings synced to native:', result);
            lastOverlaySyncAt = Date.now();
            lastOverlaySyncResult = result;
            if (result) {
                lastOverlaySyncSignature = signature;
            }
            return result;
        } catch (error) {
            console.error('[OverlayService] Failed to sync settings to native:', error);
            return false;
        } finally {
            overlaySyncInFlight = null;
        }
    })();

    return overlaySyncInFlight;
};

/**
 * Set overlay mode and update type toggles accordingly
 */
export const setOverlayMode = async (mode: NotificationPlanMode): Promise<void> => {
    const settings = await getOverlaySettings();
    const types = OVERLAY_MODE_PRESETS[mode];
    await saveOverlaySettings({ ...settings, mode, types });
};

/**
 * Toggle a specific reminder type
 */
export const toggleOverlayType = async (
    type: keyof OverlayReminderTypes,
    enabled: boolean
): Promise<void> => {
    const settings = await getOverlaySettings();
    await saveOverlaySettings({
        ...settings,
        types: { ...settings.types, [type]: enabled },
    });
};

/**
 * Enable all overlay types
 */
export const enableAllOverlayTypes = async (): Promise<void> => {
    const settings = await getOverlaySettings();
    await saveOverlaySettings({
        ...settings,
        types: OVERLAY_MODE_PRESETS.high,
    });
};

/**
 * Disable all overlay types
 */
export const disableAllOverlayTypes = async (): Promise<void> => {
    const settings = await getOverlaySettings();
    await saveOverlaySettings({
        ...settings,
        types: {
            meal: false,
            hydration: false,
            workout: false,
            sleep: false,
            workBreak: false,
            wrapUp: false,
            weightCheck: false,
        },
    });
};

/**
 * Map PlanItem type to overlay type key
 */
const mapPlanItemToOverlayType = (item: PlanItem): keyof OverlayReminderTypes | null => {
    switch (item.type) {
        case 'meal': return 'meal';
        case 'hydration': return 'hydration';
        case 'workout': return 'workout';
        case 'sleep': return 'sleep';
        case 'work_break': return 'workBreak';
        default: return null;
    }
};

/**
 * Get icon for overlay type
 */
const getOverlayIcon = (type: string): string => {
    switch (type) {
        case 'meal': return '🍔';
        case 'hydration': return '💧';
        case 'workout': return '💪';
        case 'sleep': return '😴';
        case 'work_break': return '⏰';
        case 'wrapup': return '🌙';
        case 'weight_check': return '⚖️';
        default: return '📋';
    }
};

/**
 * Check if overlay should be shown for a specific plan item
 */
export const shouldShowOverlay = async (item: PlanItem): Promise<boolean> => {
    if (!isOverlayAvailable()) return false;

    const settings = await getOverlaySettings();
    if (!settings.enabled || !settings.permissionGranted) return false;

    const typeKey = mapPlanItemToOverlayType(item);
    if (!typeKey) return false;

    return settings.types[typeKey];
};

/**
 * Show overlay for a plan item
 */
export const showPlanItemOverlay = async (
    item: PlanItem,
    planDate: string
): Promise<void> => {
    if (!OverlayModule) {
        console.warn('Overlay module not available');
        return;
    }

    const hasPermission = await checkOverlayPermission();
    if (!hasPermission) return;

    const shouldShow = await shouldShowOverlay(item);
    if (!shouldShow) return;

    const overlayData: OverlayData = {
        id: item.id,
        type: item.type as OverlayData['type'],
        title: item.title,
        description: item.description || getDefaultDescription(item.type),
        icon: getOverlayIcon(item.type),
        planDate,
        planItemId: item.id,
    };

    try {
        await OverlayModule.showOverlay(overlayData);
    } catch (error) {
        console.error('Failed to show overlay:', error);
    }
};

/**
 * Get default description for item type (localized)
 */
const getDefaultDescription = (type: string): string => {
    const key = `overlay.description.${type}`;
    const translated = i18n.t(key);
    // Fallback to default if key doesn't exist
    if (translated === key) {
        return i18n.t('overlay.description.default');
    }
    return translated;
};

/**
 * Show wrap-up overlay
 */
export const showWrapUpOverlay = async (): Promise<void> => {
    if (!OverlayModule) return;

    const hasPermission = await checkOverlayPermission();
    if (!hasPermission) return;

    const settings = await getOverlaySettings();
    if (!settings.enabled || !settings.types.wrapUp) return;

    const overlayData: OverlayData = {
        id: 'wrapup-' + Date.now(),
        type: 'wrapup',
        title: i18n.t('notifications.wrap_up.title'),
        description: i18n.t('notifications.wrap_up.body'),
        icon: '🌙',
    };

    try {
        await OverlayModule.showOverlay(overlayData);
    } catch (error) {
        console.error('Failed to show wrap-up overlay:', error);
    }
};

/**
 * Show weight check overlay
 */
export const showWeightCheckOverlay = async (): Promise<void> => {
    if (!OverlayModule) return;

    const hasPermission = await checkOverlayPermission();
    if (!hasPermission) return;

    const settings = await getOverlaySettings();
    if (!settings.enabled || !settings.types.weightCheck) return;

    const overlayData: OverlayData = {
        id: 'weight-' + Date.now(),
        type: 'weight_check',
        title: i18n.t('action.weight.weekly_title'),
        description: i18n.t('action.weight.weekly_subtitle'),
        icon: '⚖️',
    };

    try {
        await OverlayModule.showOverlay(overlayData);
    } catch (error) {
        console.error('Failed to show weight check overlay:', error);
    }
};

/**
 * Hide any visible overlay
 */
export const hideOverlay = async (): Promise<void> => {
    if (!OverlayModule) return;

    try {
        await OverlayModule.hideOverlay();
    } catch (error) {
        console.error('Failed to hide overlay:', error);
    }
};

/**
 * Check if an overlay is currently visible (Android only).
 */
export const isOverlayVisible = async (): Promise<boolean> => {
    if (!OverlayModule?.isOverlayVisible) return false;

    try {
        return await OverlayModule.isOverlayVisible();
    } catch (error) {
        console.error('Failed to check overlay visibility:', error);
        return false;
    }
};

// ============ NATIVE ALARM-BASED SCHEDULING ============

/**
 * Schedule an overlay to appear at a specific time via native AlarmManager.
 * This will work even when the app is killed.
 */
export const scheduleOverlay = async (
    item: PlanItem,
    triggerDate: Date,
    planDate: string
): Promise<boolean> => {
    console.log(`[OverlayService] scheduleOverlay called for ${item.title}, type=${item.type}, time=${triggerDate.toISOString()}`);

    if (!OverlayScheduler) {
        console.warn('[OverlayService] OverlayScheduler native module not available');
        return false;
    }

    // Check if overlay should be scheduled (settings check)
    const settings = await getOverlaySettings();
    console.log(`[OverlayService] Settings: enabled=${settings.enabled}, permissionGranted=${settings.permissionGranted}`);

    if (!settings.enabled) {
        console.log('[OverlayService] Overlays disabled in settings, skipping schedule');
        return false;
    }

    const typeKey = mapPlanItemToOverlayType(item);
    console.log(`[OverlayService] Type mapping: ${item.type} -> ${typeKey}, enabled=${typeKey ? settings.types[typeKey] : 'N/A'}`);

    if (!typeKey) {
        console.log(`[OverlayService] No overlay type mapping for ${item.type}, skipping`);
        return false;
    }

    if (!settings.types[typeKey]) {
        console.log(`[OverlayService] Overlay type ${typeKey} is disabled, skipping`);
        return false;
    }

    try {
        const scheduleData = {
            id: item.id,
            type: item.type,
            title: item.title,
            description: item.description || getDefaultDescription(item.type),
            icon: getOverlayIcon(item.type),
            scheduledTime: triggerDate.getTime(),  // FIXED: was triggerTimeMs, native expects scheduledTime
            planDate,
            planItemId: item.id,
        };
        console.log('[OverlayService] Calling native scheduleOverlay with:', JSON.stringify(scheduleData));

        await OverlayScheduler.scheduleOverlay(scheduleData);
        console.log(`[OverlayService] ✅ Successfully scheduled overlay for ${item.title} at ${triggerDate}`);
        return true;
    } catch (error) {
        console.error('[OverlayService] ❌ Failed to schedule overlay:', error);
        return false;
    }
};

/**
 * Cancel a scheduled overlay.
 */
export const cancelScheduledOverlay = async (itemId: string): Promise<boolean> => {
    if (!OverlayScheduler) return false;

    try {
        await OverlayScheduler.cancelOverlay(itemId);
        return true;
    } catch (error) {
        console.error('Failed to cancel overlay:', error);
        return false;
    }
};

/**
 * Cancel all scheduled overlays.
 */
export const cancelAllScheduledOverlays = async (): Promise<boolean> => {
    if (!OverlayScheduler) return false;

    try {
        await OverlayScheduler.cancelAllOverlays();
        return true;
    } catch (error) {
        console.error('Failed to cancel all overlays:', error);
        return false;
    }
};

/**
 * Get count of scheduled overlays.
 */
export const getScheduledOverlayCount = async (): Promise<number> => {
    if (!OverlayScheduler) return 0;

    try {
        return await OverlayScheduler.getScheduledCount();
    } catch (error) {
        console.error('Failed to get scheduled count:', error);
        return 0;
    }
};

/**
 * Schedule overlay for wrap-up.
 */
export const scheduleWrapUpOverlay = async (triggerDate: Date): Promise<boolean> => {
    if (!OverlayScheduler) return false;

    const settings = await getOverlaySettings();
    if (!settings.enabled || !settings.types.wrapUp) return false;

    try {
        await OverlayScheduler.scheduleOverlay({
            id: `overlay_wrapup_${triggerDate.getTime()}`,
            type: 'wrapup',
            title: i18n.t('notifications.wrap_up.title'),
            description: i18n.t('notifications.wrap_up.body'),
            icon: '🌙',
            scheduledTime: triggerDate.getTime(),
        });
        return true;
    } catch (error) {
        console.error('Failed to schedule wrap-up overlay:', error);
        return false;
    }
};

export default {
    isOverlayAvailable,
    checkOverlayPermission,
    requestOverlayPermission,
    getOverlaySettings,
    saveOverlaySettings,
    enableOverlays,
    disableOverlays,
    setOverlayMode,
    toggleOverlayType,
    enableAllOverlayTypes,
    disableAllOverlayTypes,
    shouldShowOverlay,
    showPlanItemOverlay,
    showWrapUpOverlay,
    showWeightCheckOverlay,
    hideOverlay,
    isOverlayVisible,
    // Native AlarmManager scheduling
    scheduleOverlay,
    cancelScheduledOverlay,
    cancelAllScheduledOverlays,
    syncSettingsToNative,
    getScheduledOverlayCount,
    scheduleWrapUpOverlay,
};

// ============ OVERLAY ACTION LISTENER ============

export interface OverlayActionEvent {
    id: string;
    action: 'COMPLETE' | 'SKIP' | 'SNOOZE';
    planDate?: string;
    planItemId?: string;
    snoozedUntil?: number;
}

type OverlayActionCallback = (event: OverlayActionEvent) => void;

let overlayActionSubscription: EmitterSubscription | null = null;
const overlayActionCallbacks: Set<OverlayActionCallback> = new Set();

/**
 * Add a listener for overlay actions (when user taps Done/Skip/Snooze on overlay).
 * The native side emits 'onOverlayAction' event which triggers this callback.
 * Use this in Dashboard to reload plan data when item is completed from overlay.
 */
export const addOverlayActionListener = (callback: OverlayActionCallback): (() => void) => {
    overlayActionCallbacks.add(callback);

    // Start listening if this is the first callback
    if (overlayActionCallbacks.size === 1 && Platform.OS === 'android') {
        overlayActionSubscription = DeviceEventEmitter.addListener(
            'onOverlayAction',
            (event: OverlayActionEvent) => {
                console.log('[OverlayService] Received overlay action:', event);
                overlayActionCallbacks.forEach(cb => {
                    try {
                        cb(event);
                    } catch (error) {
                        console.error('[OverlayService] Callback error:', error);
                    }
                });
            }
        );
        console.log('[OverlayService] Started overlay action listener');
    }

    // Return cleanup function
    return () => removeOverlayActionListener(callback);
};

/**
 * Remove an overlay action listener.
 */
export const removeOverlayActionListener = (callback: OverlayActionCallback): void => {
    overlayActionCallbacks.delete(callback);

    // Stop listening if no more callbacks
    if (overlayActionCallbacks.size === 0 && overlayActionSubscription) {
        overlayActionSubscription.remove();
        overlayActionSubscription = null;
        console.log('[OverlayService] Stopped overlay action listener');
    }
};
