// WidgetService.ts
// Handles data synchronization with Native Home Screen Widget

import { NativeModules, Platform } from 'react-native';
import storage, { getWaterAmountForDate } from './storageService';
import { getLocalDateKey } from '../utils/dateUtils';
import { getActiveDayKey, getPlanItemDateTime } from './dayBoundaryService';
import type { DailyPlan, FoodLogEntry, PlanItem } from '../types';

const { WidgetBridge } = NativeModules;

export interface WidgetData {
    calories: number;
    protein: number;
    water: number;
    nextItem?: string;
}

const resolvePlanForDate = (plan: DailyPlan | null, dateKey: string): DailyPlan | null => {
    if (!plan) return null;
    if (!plan.date || plan.date === dateKey) return plan;
    return null;
};

const buildNextItemLabel = async (plan: DailyPlan | null, dateKey: string): Promise<string | undefined> => {
    if (!plan?.items?.length) return undefined;

    const now = Date.now();
    const candidates: Array<{ timestamp: number; item: PlanItem }> = [];

    for (const item of plan.items) {
        if (item.completed || item.skipped) continue;
        const snoozedUntil = typeof item.snoozedUntil === 'number' ? item.snoozedUntil : null;
        const scheduledDate = await getPlanItemDateTime(dateKey, item.time);
        const scheduledAt = scheduledDate ? scheduledDate.getTime() : null;
        const timestamp = snoozedUntil && snoozedUntil > now ? snoozedUntil : scheduledAt;
        if (!timestamp || timestamp <= now) continue;
        candidates.push({ timestamp, item });
    }

    if (!candidates.length) return undefined;
    candidates.sort((a, b) => a.timestamp - b.timestamp);
    const next = candidates[0].item;
    const timeLabel = next.time ? `${next.time} - ` : '';
    return `${timeLabel}${next.title}`;
};

/**
 * WidgetService - Updates the home screen widget with daily progress data
 */
export const WidgetService = {
    /**
     * Check if widget functionality is available
     */
    isAvailable: (): boolean => {
        return Platform.OS === 'android' && WidgetBridge != null;
    },

    /**
     * Update widget with current daily progress
     * @param data - Current calories, protein, water, and next item
     */
    updateWidgetData: async (data: WidgetData): Promise<boolean> => {
        if (!WidgetService.isAvailable()) {
            console.log('[WidgetService] Widget not available on this platform');
            return false;
        }

        try {
            await WidgetBridge.updateWidgetData({
                calories: data.calories || 0,
                protein: data.protein || 0,
                water: data.water || 0,
                nextItem: data.nextItem || 'No upcoming items',
            });
            console.log('[WidgetService] Widget updated:', data);
            return true;
        } catch (error) {
            console.error('[WidgetService] Failed to update widget:', error);
            return false;
        }
    },

    /**
     * Build widget data from storage (today's totals + next plan item).
     */
    buildWidgetDataFromStorage: async (): Promise<WidgetData> => {
        const dayKey = await getActiveDayKey();
        const [foodLogs, waterAmount, datedPlan, legacyPlan] = await Promise.all([
            storage.get<FoodLogEntry[]>(storage.keys.FOOD),
            getWaterAmountForDate(dayKey),
            storage.get<DailyPlan>(`${storage.keys.DAILY_PLAN}_${dayKey}`),
            storage.get<DailyPlan>(storage.keys.DAILY_PLAN),
        ]);

        const normalizedFood = Array.isArray(foodLogs) ? foodLogs : [];
        const todayKey = getLocalDateKey(new Date());
        const targetKey = dayKey || todayKey;
        const todayLogs = normalizedFood.filter(log => getLocalDateKey(new Date(log.timestamp)) === targetKey);

        const totals = todayLogs.reduce(
            (acc, log) => {
                acc.calories += Number(log.food?.macros?.calories) || 0;
                acc.protein += Number(log.food?.macros?.protein) || 0;
                return acc;
            },
            { calories: 0, protein: 0 }
        );

        const plan =
            resolvePlanForDate(datedPlan || null, targetKey) ||
            resolvePlanForDate(legacyPlan || null, targetKey);
        const nextItem = await buildNextItemLabel(plan, targetKey);

        return {
            calories: Math.round(totals.calories),
            protein: Math.round(totals.protein),
            water: Math.round(waterAmount || 0),
            nextItem,
        };
    },

    /**
     * Update widget directly from storage data.
     */
    updateWidgetFromStorage: async (): Promise<boolean> => {
        try {
            const data = await WidgetService.buildWidgetDataFromStorage();
            return await WidgetService.updateWidgetData(data);
        } catch (error) {
            console.error('[WidgetService] Failed to build widget data:', error);
            return false;
        }
    },

    /**
     * Force refresh all widgets
     */
    refreshWidget: async (): Promise<boolean> => {
        if (!WidgetService.isAvailable()) {
            return false;
        }

        try {
            await WidgetBridge.refreshWidget();
            console.log('[WidgetService] Widget refresh triggered');
            return true;
        } catch (error) {
            console.error('[WidgetService] Failed to refresh widget:', error);
            return false;
        }
    },
};

export default WidgetService;
