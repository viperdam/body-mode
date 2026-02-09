import { Platform } from 'react-native';
import storage from './storageService';
import { txStoreService } from './txStoreService';
import * as overlayService from './overlayService';
import { sleepService } from './sleepService';
import { midnightPlanService } from './midnightPlanService';
import {
    DEFAULT_AUTO_SLEEP_SETTINGS,
    DEFAULT_OVERLAY_SETTINGS,
    OVERLAY_MODE_PRESETS,
    type OverlaySettings,
    type AutoSleepSettings,
} from '../types';

/**
 * One-time defaults bootstrap.
 *
 * Goals:
 * - Fresh install defaults to FULL background mode
 * - Overlays default to HIGH mode (all types enabled)
 * - Auto sleep detection defaults enabled (anytime mode)
 * - When permissions are granted, the native execution plane should work immediately
 *
 * This runs once per install (tracked via `ls_defaults_initialized_v1`).
 * It does not overwrite user-changed settings after initialization.
 */
export const ensureAppDefaults = async (): Promise<void> => {
    try {
        // Ensure first install timestamp exists (used by some UX/grace logic).
        const existingInstall = await storage.get<number>(storage.keys.FIRST_INSTALL_TIME);
        if (!existingInstall) {
            await storage.set(storage.keys.FIRST_INSTALL_TIME, Date.now());
        }

        const alreadyInitialized = await storage.get<boolean>(storage.keys.DEFAULTS_INITIALIZED);
        if (alreadyInitialized) {
            // Still keep overlay permission state in sync (does not change user toggles).
            if (Platform.OS === 'android') {
                await overlayService.checkOverlayPermission();
            }

            const autoSleep = await storage.get<AutoSleepSettings>(storage.keys.AUTO_SLEEP_SETTINGS);
            if (autoSleep && typeof autoSleep.useActivityRecognition !== 'boolean') {
                const updated = { ...autoSleep, useActivityRecognition: true };
                await storage.set(storage.keys.AUTO_SLEEP_SETTINGS, updated);
                if (Platform.OS === 'android') {
                    await sleepService.syncSettingsToNative(updated);
                }
            }

            const existingPrefs = (await storage.get<any>(storage.keys.APP_PREFERENCES)) || {};
            const nextPrefs = { ...existingPrefs };
            if (typeof existingPrefs.sleepScheduleAutoEnabled !== 'boolean') {
                nextPrefs.sleepScheduleAutoEnabled = true;
            }
            if (typeof existingPrefs.midnightPlanEnabled !== 'boolean') {
                nextPrefs.midnightPlanEnabled = true;
            }
            if (typeof existingPrefs.contextSensingEnabled !== 'boolean') {
                nextPrefs.contextSensingEnabled = true;
            }
            if (typeof existingPrefs.environmentSensingEnabled !== 'boolean') {
                nextPrefs.environmentSensingEnabled = true;
            }
            if (typeof existingPrefs.networkMonitoringEnabled !== 'boolean') {
                nextPrefs.networkMonitoringEnabled = true;
            }
            if (typeof existingPrefs.contextHistoryEnabled !== 'boolean') {
                nextPrefs.contextHistoryEnabled = true;
            }
            if (typeof existingPrefs.contextSignalHistoryEnabled !== 'boolean') {
                nextPrefs.contextSignalHistoryEnabled = true;
            }
            if (typeof existingPrefs.contextLearningEnabled !== 'boolean') {
                nextPrefs.contextLearningEnabled = true;
            }
            if (typeof existingPrefs.contextDiagnosticsEnabled !== 'boolean') {
                nextPrefs.contextDiagnosticsEnabled = true;
            }
            if (typeof existingPrefs.contextHistoryDays !== 'number') {
                nextPrefs.contextHistoryDays = 2;
            }
            if (typeof existingPrefs.contextSignalHistoryHours !== 'number') {
                nextPrefs.contextSignalHistoryHours = 48;
            }
            if (typeof existingPrefs.contextPrivacyMode !== 'string') {
                nextPrefs.contextPrivacyMode = 'standard';
            }
            if (typeof existingPrefs.adRechargeOnWake !== 'boolean') {
                nextPrefs.adRechargeOnWake = false;
            }
            if (typeof existingPrefs.adRechargeOnBackground !== 'boolean') {
                nextPrefs.adRechargeOnBackground = false;
            }
            if (nextPrefs !== existingPrefs) {
                await storage.set(storage.keys.APP_PREFERENCES, nextPrefs);
            }

            if (Platform.OS === 'android' && nextPrefs.midnightPlanEnabled !== false) {
                await midnightPlanService.enable();
            }
            return;
        }

        const existingPrefs = (await storage.get<any>(storage.keys.APP_PREFERENCES)) || {};
        const nextPrefs = { ...existingPrefs };
        if (typeof existingPrefs.sleepScheduleAutoEnabled !== 'boolean') {
            nextPrefs.sleepScheduleAutoEnabled = true;
        }
        if (typeof existingPrefs.midnightPlanEnabled !== 'boolean') {
            nextPrefs.midnightPlanEnabled = true;
        }
        if (typeof existingPrefs.contextSensingEnabled !== 'boolean') {
            nextPrefs.contextSensingEnabled = true;
        }
        if (typeof existingPrefs.environmentSensingEnabled !== 'boolean') {
            nextPrefs.environmentSensingEnabled = true;
        }
        if (typeof existingPrefs.networkMonitoringEnabled !== 'boolean') {
            nextPrefs.networkMonitoringEnabled = true;
        }
        if (typeof existingPrefs.contextHistoryEnabled !== 'boolean') {
            nextPrefs.contextHistoryEnabled = true;
        }
        if (typeof existingPrefs.contextSignalHistoryEnabled !== 'boolean') {
            nextPrefs.contextSignalHistoryEnabled = true;
        }
        if (typeof existingPrefs.contextLearningEnabled !== 'boolean') {
            nextPrefs.contextLearningEnabled = true;
        }
        if (typeof existingPrefs.contextDiagnosticsEnabled !== 'boolean') {
            nextPrefs.contextDiagnosticsEnabled = true;
        }
        if (typeof existingPrefs.contextHistoryDays !== 'number') {
            nextPrefs.contextHistoryDays = 2;
        }
        if (typeof existingPrefs.contextSignalHistoryHours !== 'number') {
            nextPrefs.contextSignalHistoryHours = 48;
        }
        if (typeof existingPrefs.contextPrivacyMode !== 'string') {
            nextPrefs.contextPrivacyMode = 'standard';
        }
        if (typeof existingPrefs.adRechargeOnWake !== 'boolean') {
            nextPrefs.adRechargeOnWake = false;
        }
        if (typeof existingPrefs.adRechargeOnBackground !== 'boolean') {
            nextPrefs.adRechargeOnBackground = false;
        }
        await storage.set(storage.keys.APP_PREFERENCES, nextPrefs);

        // ---- Overlays ----
        const hasOverlayPermission =
            Platform.OS === 'android' ? await overlayService.checkOverlayPermission() : false;

        const desiredOverlaySettings: OverlaySettings = {
            ...DEFAULT_OVERLAY_SETTINGS,
            enabled: true,
            mode: 'high',
            types: OVERLAY_MODE_PRESETS.high,
            permissionGranted: hasOverlayPermission,
        };
        await overlayService.saveOverlaySettings(desiredOverlaySettings);

        // ---- Auto Sleep ----
        await storage.set(storage.keys.AUTO_SLEEP_SETTINGS, DEFAULT_AUTO_SLEEP_SETTINGS);
        if (Platform.OS === 'android') {
            await sleepService.syncSettingsToNative(DEFAULT_AUTO_SLEEP_SETTINGS);
            // Ensure WorkManager is actually scheduled on first install when enabled by default.
            await sleepService.setAutoSleepEnabled(!!DEFAULT_AUTO_SLEEP_SETTINGS.enabled);
        }

        // ---- Background Mode / Execution Plane ----
        if (Platform.OS === 'android' && txStoreService.available()) {
            await txStoreService.setMode('FULL');
            // Make sure core toggles match the defaults.
            await txStoreService.updateConfig({
                notificationsEnabled: true,
                overlaysEnabled: !!desiredOverlaySettings.enabled && !!desiredOverlaySettings.permissionGranted,
                sleepDetectionEnabled: !!DEFAULT_AUTO_SLEEP_SETTINGS.enabled,
                anytimeSleepMode: !!DEFAULT_AUTO_SLEEP_SETTINGS.anytimeMode,
                requireChargingForSleep: !!DEFAULT_AUTO_SLEEP_SETTINGS.requireCharging,
                overlayMealEnabled: true,
                overlayHydrationEnabled: true,
                overlayActivityEnabled: true,
                overlaySleepEnabled: true,
                adRechargeOnWake: nextPrefs.adRechargeOnWake === true,
                adRechargeOnBackground: nextPrefs.adRechargeOnBackground === true,
            });
        }

        if (Platform.OS === 'android' && nextPrefs.midnightPlanEnabled !== false) {
            await midnightPlanService.enable();
        }

        await storage.set(storage.keys.DEFAULTS_INITIALIZED, true);
    } catch (error) {
        console.warn('[AppDefaults] Failed to initialize defaults (non-fatal):', error);
    }
};
