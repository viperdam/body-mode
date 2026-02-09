/**
 * TxStore Service - TypeScript interface to native transactional store
 * 
 * This is the RN "control plane" interface to the native background system.
 * RN writes config and plan; native reads and schedules.
 */

import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalDateKey } from '../utils/dateUtils';
import { getActiveDayKey } from './dayBoundaryService';
import { buildStablePlanItemId } from './planNormalization';
import storage from './storageService';

const { TxStoreBridge } = NativeModules;

// ==================== TYPES ====================

export type BackgroundMode = 'OFF' | 'LIGHT' | 'FULL';

export interface BackgroundConfig {
    mode: BackgroundMode;
    overlaysEnabled: boolean;
    sleepDetectionEnabled: boolean;
    notificationsEnabled: boolean;
    overlayMealEnabled: boolean;
    overlayHydrationEnabled: boolean;
    overlayActivityEnabled: boolean;
    overlaySleepEnabled: boolean;
    anytimeSleepMode: boolean;
    requireChargingForSleep: boolean;
    adRechargeOnWake?: boolean;
    adRechargeOnBackground?: boolean;
    configRevision: number;
    updatedAt: number;
}

export interface TxPlanItem {
    id: string;
    time: string;         // HH:MM format
    type: string;         // meal, hydration, activity, sleep
    title: string;
    description: string;
    completed: boolean;
    skipped: boolean;
    scheduledAt?: number;
    completedAt?: number;
    skippedAt?: number;
    snoozedUntil?: number;
}

export interface TxPlanSnapshot {
    date: string;
    items: TxPlanItem[];
    summary: string;
    planRevision: number;
    updatedAt: number;
}

export interface SchedulerState {
    lastReconciledConfigRevision: number;
    lastReconciledPlanRevision: number;
    lastReconcileTime: number;
    lastReconcileResult: string;
    lastReconcileError: string | null;
    scheduledAlarmCount: number;
    scheduledOverlayCount: number;
}

export interface SleepRecord {
    date: string;
    hours: number;
    source: string;
    startTime?: number;
    endTime?: number;
    sleepScore?: number;
    linkedPlanItemId?: string;
}

// ==================== SERVICE ====================

class TxStoreService {
    private isAvailable: boolean;

    constructor() {
        this.isAvailable = Platform.OS === 'android' && TxStoreBridge != null;
    }

    /**
     * Check if TxStore is available (Android only)
     */
    available(): boolean {
        return this.isAvailable;
    }

    // ==================== BACKGROUND CONFIG ====================

    /**
     * Get current background configuration
     */
    async getConfig(): Promise<BackgroundConfig | null> {
        if (!this.isAvailable) return null;
        try {
            return await TxStoreBridge.getConfig();
        } catch (error) {
            console.error('[TxStore] getConfig error:', error);
            return null;
        }
    }

    /**
     * Set background mode (OFF, LIGHT, FULL)
     */
    async setMode(mode: BackgroundMode): Promise<boolean> {
        if (!this.isAvailable) return false;
        try {
            await TxStoreBridge.setMode(mode);
            return true;
        } catch (error) {
            console.error('[TxStore] setMode error:', error);
            return false;
        }
    }

    /**
     * Update background configuration
     */
    async updateConfig(config: Partial<BackgroundConfig>): Promise<boolean> {
        if (!this.isAvailable) return false;
        try {
            await TxStoreBridge.updateConfig(config);
            return true;
        } catch (error) {
            console.error('[TxStore] updateConfig error:', error);
            return false;
        }
    }

    // ==================== PLAN SNAPSHOT ====================

    /**
     * Get plan for a specific date
     */
    async getPlan(date: string): Promise<TxPlanSnapshot | null> {
        if (!this.isAvailable) return null;
        try {
            const raw = await TxStoreBridge.getPlan(date);
            if (!raw) return null;
            const itemsRaw = (raw as any).items;
            let items: TxPlanItem[] = [];
            if (Array.isArray(itemsRaw)) {
                items = itemsRaw;
            } else if (typeof itemsRaw === 'string') {
                try {
                    const parsed = JSON.parse(itemsRaw);
                    if (Array.isArray(parsed)) {
                        items = parsed;
                    }
                } catch (error) {
                    console.warn('[TxStore] Failed to parse native plan items:', error);
                }
            }
            return { ...raw, items };
        } catch (error) {
            console.error('[TxStore] getPlan error:', error);
            return null;
        }
    }

    /**
     * Update plan for a date
     * Call this after generating/refining a plan
     */
    async updatePlan(date: string, items: TxPlanItem[], summary: string = ''): Promise<boolean> {
        if (!this.isAvailable) return false;
        try {
            const itemsJson = JSON.stringify(items);
            await TxStoreBridge.updatePlan(date, itemsJson, summary);
            return true;
        } catch (error) {
            console.error('[TxStore] updatePlan error:', error);
            return false;
        }
    }

    /**
     * Mark item as completed
     * Triggers reconcile in native layer
     */
    async completeItem(date: string, itemId: string): Promise<boolean> {
        if (!this.isAvailable) return false;
        try {
            return await TxStoreBridge.completeItem(date, itemId);
        } catch (error) {
            console.error('[TxStore] completeItem error:', error);
            return false;
        }
    }

    /**
     * Mark item as skipped
     * Triggers reconcile in native layer
     */
    async skipItem(date: string, itemId: string): Promise<boolean> {
        if (!this.isAvailable) return false;
        try {
            return await TxStoreBridge.skipItem(date, itemId);
        } catch (error) {
            console.error('[TxStore] skipItem error:', error);
            return false;
        }
    }

    // ==================== SCHEDULER CONTROL ====================

    /**
     * Trigger reconciliation
     * Call after plan/config changes to schedule/update alarms
     */
    async triggerReconcile(): Promise<boolean> {
        if (!this.isAvailable) return false;
        try {
            const needed = await TxStoreBridge.triggerReconcile();
            console.log('[TxStore] triggerReconcile: needed =', needed);
            return needed;
        } catch (error) {
            console.error('[TxStore] triggerReconcile error:', error);
            return false;
        }
    }

    /**
     * Get scheduler state for diagnostics
     */
    async getSchedulerState(): Promise<SchedulerState | null> {
        if (!this.isAvailable) return null;
        try {
            return await TxStoreBridge.getSchedulerState();
        } catch (error) {
            console.error('[TxStore] getSchedulerState error:', error);
            return null;
        }
    }

    /**
     * Get pending action count
     */
    async getPendingActionCount(): Promise<number> {
        if (!this.isAvailable) return 0;
        try {
            return await TxStoreBridge.getPendingActionCount();
        } catch (error) {
            console.error('[TxStore] getPendingActionCount error:', error);
            return 0;
        }
    }

    // ==================== SLEEP RECORDS ====================

    /**
     * Get sleep history from unified TxStore
     */
    async getSleepHistory(limit: number = 30): Promise<SleepRecord[]> {
        if (!this.isAvailable || !TxStoreBridge?.getSleepHistory) return [];
        try {
            return await TxStoreBridge.getSleepHistory(limit);
        } catch (error) {
            console.error('[TxStore] getSleepHistory error:', error);
            return [];
        }
    }

    /**
     * Record sleep hours to unified TxStore
     */
    async recordSleep(hours: number, date: string, source: string = 'manual'): Promise<boolean> {
        if (!this.isAvailable || !TxStoreBridge?.recordSleep) return false;
        try {
            return await TxStoreBridge.recordSleep(date, hours, source);
        } catch (error) {
            console.error('[TxStore] recordSleep error:', error);
            return false;
        }
    }

    // ==================== HELPERS ====================

    private normalizeTime(value: unknown): string {
        if (typeof value !== 'string') return '';
        const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return '';
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (Number.isNaN(hours) || Number.isNaN(minutes)) return '';
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    private resolveItemId(
        planDate: string,
        item: any,
        index: number,
        normalizedTime: string
    ): string {
        const rawId = typeof item?.id === 'string' ? item.id.trim() : '';
        if (rawId) return rawId;
        if (normalizedTime) {
            return buildStablePlanItemId(
                planDate,
                normalizedTime,
                String(item?.type || 'item'),
                String(item?.title || ''),
                index
            );
        }
        return `plan-${planDate}-idx-${index}`;
    }

    /**
     * Convert DailyPlan items to TxPlanItem format
     */
    convertPlanItems(planDate: string, items: any[]): TxPlanItem[] {
        return items.map((item, index) => {
            const time = this.normalizeTime(item?.time);
            const id = this.resolveItemId(planDate, item, index, time);
            return {
                id,
                time,
                type: String(item?.type || 'other'),
                title: String(item?.title || ''),
                description: String(item?.description || ''),
                completed: !!item?.completed,
                skipped: !!item?.skipped,
                scheduledAt: typeof item?.scheduledAt === 'number' ? item.scheduledAt : undefined,
                completedAt: item?.completedAt,
                skippedAt: item?.skippedAt,
                snoozedUntil: item?.snoozedUntil,
            };
        });
    }

    /**
     * Sync a DailyPlan to TxStore and trigger reconcile
     * Call this after saving a plan to storage
     */
    async syncPlan(plan: any): Promise<boolean> {
        if (!this.isAvailable || !plan) return false;

        try {
            const planDate = typeof plan.date === 'string' && plan.date ? plan.date : getLocalDateKey(new Date());
            const items = this.convertPlanItems(planDate, plan.items || []);
            await this.updatePlan(planDate, items, plan.summary || '');
            // Native `TxStoreBridge.updatePlan()` already triggers the execution-plane reconcile.
            // Calling `triggerReconcile()` here causes redundant WorkManager churn/log spam.
            console.log('[TxStore] Plan synced to TxStore for', planDate);
            return true;
        } catch (error) {
            console.error('[TxStore] syncPlan error:', error);
            return false;
        }
    }

    /**
     * Sync plan FROM native TxStore TO AsyncStorage
     * Call this on app launch to pick up changes made while app was closed
     * (e.g., overlay actions that updated TxStore directly)
     */
    async syncFromNative(date: string): Promise<boolean> {
        if (!this.isAvailable) return false;

        try {
            const txPlan = await this.getPlan(date);
            if (!txPlan || !txPlan.items || txPlan.items.length === 0) {
                console.log('[TxStore] No native plan found for', date);
                return false;
            }

            const planKey = `ls_daily_plan_${date}`;
            const legacyKey = 'ls_daily_plan';
            const asyncPlanJson = await AsyncStorage.getItem(planKey);
            let asyncPlan = asyncPlanJson ? JSON.parse(asyncPlanJson) : null;
            const planKeyMissing = !asyncPlan;
            let usedLegacy = false;

            if (!asyncPlan) {
                const legacyJson = await AsyncStorage.getItem(legacyKey);
                const legacyPlan = legacyJson ? JSON.parse(legacyJson) : null;
                const legacyDate = legacyPlan?.date;
                const matchesLegacy = legacyPlan && (!legacyDate || legacyDate === date);
                if (matchesLegacy) {
                    asyncPlan = legacyPlan;
                    usedLegacy = true;
                } else {
                    console.log('[TxStore] No AsyncStorage plan to sync for', date);
                    return false;
                }
            }

            if (!asyncPlan) {
                console.log('[TxStore] No AsyncStorage plan to sync for', date);
                return false;
            }

            if (!asyncPlan.date || asyncPlan.date !== date) {
                asyncPlan.date = date;
            }

            if (typeof asyncPlan.items === 'string') {
                try {
                    const parsedItems = JSON.parse(asyncPlan.items);
                    asyncPlan.items = Array.isArray(parsedItems) ? parsedItems : [];
                } catch (error) {
                    console.warn('[TxStore] Failed to parse AsyncStorage plan items:', error);
                    asyncPlan.items = [];
                }
            } else if (!Array.isArray(asyncPlan.items)) {
                asyncPlan.items = [];
            }

            // Only sync if TxStore has newer revision
            const txRevision = txPlan.planRevision || 0;
            const asyncRevision = asyncPlan.planRevision || asyncPlan.revision || 0;

            // Merge TxStore item states into AsyncStorage plan
            let itemsUpdated = 0;
            const txItemsById = new Map<string, TxPlanItem>();
            const txItemsBySlot = new Map<string, TxPlanItem>();
            txPlan.items.forEach((txItem) => {
                if (txItem.id) txItemsById.set(txItem.id, txItem);
                const slotKey = `${this.normalizeTime(txItem.time)}|${String(txItem.type || '')}`;
                if (!txItemsBySlot.has(slotKey)) {
                    txItemsBySlot.set(slotKey, txItem);
                }
            });

            asyncPlan.items = asyncPlan.items.map((item: any, index: number) => {
                const normalizedTime = this.normalizeTime(item?.time);
                const resolvedId = this.resolveItemId(date, item, index, normalizedTime);
                const slotKey = `${normalizedTime}|${String(item?.type || '')}`;
                const txItem = txItemsById.get(resolvedId) || txItemsBySlot.get(slotKey);
                if (txItem) {
                    // Only update if native has newer state
                    const changed =
                        (txItem.completed && !item.completed) ||
                        (txItem.skipped && !item.skipped) ||
                        (txItem.snoozedUntil !== item.snoozedUntil);

                    if (changed) {
                        itemsUpdated++;
                        return {
                            ...item,
                            id: resolvedId,
                            time: normalizedTime || item.time,
                            completed: txItem.completed || item.completed,
                            skipped: txItem.skipped || item.skipped,
                            scheduledAt: typeof txItem.scheduledAt === 'number'
                                ? txItem.scheduledAt
                                : item.scheduledAt,
                            completedAt: txItem.completedAt || item.completedAt,
                            skippedAt: txItem.skippedAt || item.skippedAt,
                            snoozedUntil: txItem.snoozedUntil,
                        };
                    }
                }
                if (resolvedId !== item?.id || normalizedTime !== item?.time) {
                    itemsUpdated++;
                }
                return {
                    ...item,
                    id: resolvedId,
                    time: normalizedTime || item?.time || '',
                };
            });

            const revisionUpdated = txRevision > asyncRevision;
            const shouldPersist = itemsUpdated > 0 || revisionUpdated || planKeyMissing;

            if (!shouldPersist) {
                console.log('[TxStore] No item changes to sync for', date);
                return false;
            }

            asyncPlan.planRevision = Math.max(txRevision, asyncRevision);
            asyncPlan.updatedAt = txPlan.updatedAt || Date.now();
            await storage.set(planKey, asyncPlan, { skipPlanSync: true });

            const todayKey = await getActiveDayKey();
            if (usedLegacy || date === todayKey) {
                await storage.set(legacyKey, asyncPlan, { skipPlanSync: true });
            }

            console.log(`[TxStore] Synced ${itemsUpdated} items from native for ${date}, revision: ${txRevision}`);
            return true;
        } catch (error) {
            console.error('[TxStore] syncFromNative error:', error);
            return false;
        }
    }
}

// Export singleton instance
export const txStoreService = new TxStoreService();


