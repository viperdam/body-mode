/**
 * Midnight Plan Service - Automatic plan generation at midnight
 *
 * Manages:
 * - Enabling/disabling midnight auto-plan
 * - Checking for pending generation on app startup
 * - Triggering plan generation via autoPlanService
 *
 * Flow:
 * 1. App enables midnight plan (user preference)
 * 2. Native AlarmManager schedules daily alarm at 00:00
 * 3. At midnight, alarm triggers and sets pending flag
 * 4. When user opens app, check for pending flag
 * 5. If pending, generate plan with MIDNIGHT trigger
 * 6. Clear pending flag
 */

import { NativeModules, Platform } from 'react-native';
import { autoPlanService } from './autoPlanService';
import { getActiveDayKey, maybeAdvanceActiveDay } from './dayBoundaryService';
import { getLocalDateKey } from '../utils/dateUtils';

const { MidnightPlanBridge } = NativeModules;

interface MidnightPlanSettings {
    enabled: boolean;
}

export const midnightPlanService = {
    /**
     * Enable midnight auto-plan generation
     */
    async enable(): Promise<void> {
        if (Platform.OS !== 'android' || !MidnightPlanBridge) {
            console.warn('[MidnightPlan] MidnightPlanBridge not available on this platform');
            return;
        }

        try {
            await MidnightPlanBridge.enableMidnightPlan();
            console.log('[MidnightPlan] Enabled midnight auto-plan');
        } catch (error) {
            console.error('[MidnightPlan] Failed to enable:', error);
            throw error;
        }
    },

    /**
     * Disable midnight auto-plan generation
     */
    async disable(): Promise<void> {
        if (Platform.OS !== 'android' || !MidnightPlanBridge) {
            console.warn('[MidnightPlan] MidnightPlanBridge not available on this platform');
            return;
        }

        try {
            await MidnightPlanBridge.disableMidnightPlan();
            console.log('[MidnightPlan] Disabled midnight auto-plan');
        } catch (error) {
            console.error('[MidnightPlan] Failed to disable:', error);
            throw error;
        }
    },

    /**
     * Check if midnight plan is enabled
     */
    async isEnabled(): Promise<boolean> {
        if (Platform.OS !== 'android' || !MidnightPlanBridge) {
            return false;
        }

        try {
            return await MidnightPlanBridge.isEnabled();
        } catch (error) {
            console.error('[MidnightPlan] Failed to check enabled status:', error);
            return false;
        }
    },

    /**
     * Check for pending midnight generation and trigger if found
     * Call this on app startup (App.tsx useEffect)
     */
    async checkAndGeneratePending(): Promise<void> {
        if (Platform.OS !== 'android' || !MidnightPlanBridge) {
            return;
        }

        try {
            const pendingTimestamp = await MidnightPlanBridge.checkPendingGeneration();

            if (pendingTimestamp !== null) {
                const triggerTime = new Date(pendingTimestamp);
                console.log(`[MidnightPlan] Found pending generation from ${triggerTime.toISOString()}`);
                await maybeAdvanceActiveDay({ reason: 'midnight_pending' });
                const activeDay = await getActiveDayKey();
                const pendingDay = getLocalDateKey(triggerTime);

                if (activeDay !== pendingDay) {
                    console.log(`[MidnightPlan] Active day is ${activeDay}; deferring midnight generation for ${pendingDay}`);
                    return;
                }

                // Generate plan with MIDNIGHT trigger
                const result = await autoPlanService.generateTodayPlan('MIDNIGHT');

                if (result.status === 'SUCCESS' || result.status === 'SKIPPED') {
                    // Clear pending flag after successful generation
                    await MidnightPlanBridge.clearPendingGeneration();
                    console.log('[MidnightPlan] Plan generated and pending flag cleared');
                } else {
                    console.log(`[MidnightPlan] Generation ${result.status}: ${result.reason || 'unknown'}`);
                    // Don't clear flag - will retry next app launch
                }
            }
        } catch (error) {
            console.error('[MidnightPlan] Failed to check/generate pending:', error);
        }
    },

    /**
     * Get midnight plan settings
     */
    async getSettings(): Promise<MidnightPlanSettings> {
        const enabled = await this.isEnabled();
        return { enabled };
    },

    /**
     * Update midnight plan settings
     */
    async updateSettings(settings: Partial<MidnightPlanSettings>): Promise<void> {
        if (settings.enabled !== undefined) {
            if (settings.enabled) {
                await this.enable();
            } else {
                await this.disable();
            }
        }
    },
};

export default midnightPlanService;
