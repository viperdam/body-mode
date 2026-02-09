/**
 * Energy Service - Headless singleton for energy management
 * 
 * This service manages the energy budget for LLM calls.
 * It can be used from both React components (via EnergyContext) and services (like llmQueueService).
 * 
 * Features:
 * - Async storage persistence
 * - Auto-recharge over time (10 energy/hour)
 * - Subscription for UI updates
 * - Job type → energy cost mapping
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { getLocalDateKey } from '../utils/dateUtils';

const { EnergyBridge } = NativeModules;

// ==================== CONSTANTS ====================

const STORAGE_KEY = '@biosync_energy';
const MAX_ENERGY = 100;
const RECHARGE_RATE_PER_HOUR = 10;
const AD_DAILY_CAP = 3;
const AD_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Energy costs for each job type (must match JobType from llmQueueService)
export const JOB_ENERGY_COSTS: Record<string, number> = {
    'GENERATE_PLAN': 15,
    'REFINE_PLAN': 15,
    'ANALYZE_TEXT_FOOD': 10,
    'ANALYZE_FOOD_MEDIA': 12,
    'ANALYZE_FOOD_VIDEO': 35, // Video analysis - higher cost due to frame extraction
    'ANALYZE_SLEEP': 10,
    'ANALYZE_BODY_SCAN': 20,
    'ENRICH_FOOD': 5,
    'ENRICH_ACTIVITY': 5,
    'SUMMARIZE_HISTORY': 8,
    'CALCULATE_PROFILE': 10,
    'GENERATE_RECIPE': 10,
    'GENERATE_FRIDGE_RECIPES': 10,
    'DETECT_INGREDIENTS': 12,
    'DETECT_INGREDIENTS_VIDEO': 35, // Video fridge scan - higher cost
    'REFINE_FOOD_ANALYSIS': 8,
    'GENERATE_WRAPUP': 8,
    'GENERATE_NUTRITION_INSIGHTS': 8,
};

// ==================== ERROR ====================

export class InsufficientEnergyError extends Error {
    public readonly requiredEnergy: number;
    public readonly currentEnergy: number;
    public readonly jobType: string;

    constructor(requiredEnergy: number, currentEnergy: number, jobType: string) {
        super(`Insufficient energy: need ${requiredEnergy}, have ${currentEnergy}`);
        this.name = 'InsufficientEnergyError';
        this.requiredEnergy = requiredEnergy;
        this.currentEnergy = currentEnergy;
        this.jobType = jobType;
    }
}

// ==================== TYPES ====================

interface EnergyState {
    energy: number;
    lastRecharge: number;
    adDailyCount?: number;
    adDailyKey?: string;
    adCooldownUntil?: number;
}

type EnergyListener = (energy: number) => void;

// ==================== SERVICE ====================

class EnergyService {
    private energy: number = MAX_ENERGY;
    private lastRecharge: number = Date.now();
    private listeners: Set<EnergyListener> = new Set();
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;
    private adDailyCount: number = 0;
    private adDailyKey: string = getLocalDateKey(new Date());
    private adCooldownUntil: number = 0;

    /**
     * Initialize the service - load state from storage
     */
    async init(): Promise<void> {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = this._doInit();
        await this.initPromise;
    }

    private async _doInit(): Promise<void> {
        try {
            const data = await AsyncStorage.getItem(STORAGE_KEY);
            if (data) {
                const parsed: EnergyState = JSON.parse(data);
                this.energy = parsed.energy ?? MAX_ENERGY;
                this.lastRecharge = parsed.lastRecharge ?? Date.now();
                this.adDailyCount = parsed.adDailyCount ?? 0;
                this.adDailyKey = parsed.adDailyKey ?? getLocalDateKey(new Date());
                this.adCooldownUntil = parsed.adCooldownUntil ?? 0;

                // NOTE: Passive recharge REMOVED
                // Energy only changes via:
                // 1. LLM calls (consume)
                // 2. Watching ads (recharge)
                // Energy persists exactly as saved across days
            }
            this.initialized = true;
            console.log('[EnergyService] Initialized with energy:', this.energy);
        } catch (e) {
            console.error('[EnergyService] Failed to load energy:', e);
            this.initialized = true; // Continue with defaults
        }
    }

    /**
     * Test-only reset helper to avoid singleton state leaking between Jest tests.
     */
    __resetForTests(): void {
        if (process.env.NODE_ENV !== 'test') return;
        this.energy = MAX_ENERGY;
        this.lastRecharge = Date.now();
        this.adDailyCount = 0;
        this.adDailyKey = getLocalDateKey(new Date());
        this.adCooldownUntil = 0;
        this.listeners.clear();
        this.initialized = false;
        this.initPromise = null;
    }

    /**
     * Get current energy level
     */
    async getEnergy(): Promise<number> {
        await this.init();
        return this.energy;
    }

    /**
     * Get max energy constant
     */
    getMaxEnergy(): number {
        return MAX_ENERGY;
    }

    /**
     * Check if we can afford a cost
     */
    async canAfford(amount: number): Promise<boolean> {
        await this.init();
        return this.energy >= amount;
    }

    /**
     * Consume energy - returns true if successful, false if insufficient
     */
    async consume(amount: number): Promise<boolean> {
        await this.init();

        if (this.energy < amount) {
            console.log(`[EnergyService] Cannot consume ${amount}, only have ${this.energy}`);
            return false;
        }

        this.energy -= amount;
        await this._persist();
        this._notifyListeners();
        console.log(`[EnergyService] Consumed ${amount} energy, remaining: ${this.energy}`);
        return true;
    }

    /**
     * Recharge energy by a specific amount
     */
    async recharge(amount: number): Promise<void> {
        await this.init();
        this.energy = Math.min(MAX_ENERGY, this.energy + amount);
        this.lastRecharge = Date.now();
        await this._persist();
        this._notifyListeners();
        console.log(`[EnergyService] Recharged ${amount} energy, now: ${this.energy}`);
    }

    /**
     * Set energy to max (after watching ad)
     */
    async rechargeToMax(): Promise<void> {
        await this.init();
        this.energy = MAX_ENERGY;
        this.lastRecharge = Date.now();
        await this._persist();
        this._notifyListeners();
        console.log('[EnergyService] Recharged to max');
    }

    /**
     * Subscribe to energy changes - returns unsubscribe function
     */
    subscribe(listener: EnergyListener): () => void {
        this.listeners.add(listener);
        // Immediately notify with current value
        this.init().then(() => listener(this.energy));
        return () => this.listeners.delete(listener);
    }

    /**
     * Get energy cost for a job type
     */
    getCostForJob(jobType: string): number {
        return JOB_ENERGY_COSTS[jobType] || 0;
    }

    /**
     * Get time until next passive recharge (for UI display)
     */
    getRechargeTimeString(): string {
        if (this.energy >= MAX_ENERGY) return 'Full';
        const energyNeeded = MAX_ENERGY - this.energy;
        const hoursNeeded = energyNeeded / RECHARGE_RATE_PER_HOUR;
        if (hoursNeeded < 1) return 'Soon';
        return `~${Math.ceil(hoursNeeded)}h`;
    }

    private refreshAdLimits(now: number = Date.now()): void {
        const todayKey = getLocalDateKey(new Date(now));
        if (this.adDailyKey !== todayKey) {
            this.adDailyKey = todayKey;
            this.adDailyCount = 0;
            this.adCooldownUntil = 0;
        }
    }

    async getAdAvailability(): Promise<{
        canShow: boolean;
        reason?: 'cooldown' | 'daily_cap';
        cooldownRemainingMs?: number;
        remainingToday?: number;
    }> {
        await this.init();
        this.refreshAdLimits();
        const now = Date.now();
        if (this.adCooldownUntil > now) {
            return {
                canShow: false,
                reason: 'cooldown',
                cooldownRemainingMs: this.adCooldownUntil - now,
                remainingToday: Math.max(0, AD_DAILY_CAP - this.adDailyCount),
            };
        }
        if (this.adDailyCount >= AD_DAILY_CAP) {
            return {
                canShow: false,
                reason: 'daily_cap',
                remainingToday: 0,
            };
        }
        return {
            canShow: true,
            remainingToday: Math.max(0, AD_DAILY_CAP - this.adDailyCount),
        };
    }

    async rechargeFromAd(): Promise<void> {
        await this.init();
        this.refreshAdLimits();
        const availability = await this.getAdAvailability();
        if (!availability.canShow) {
            const reason = availability.reason || 'cooldown';
            throw new Error(`ad_unavailable:${reason}`);
        }
        this.adDailyCount += 1;
        this.adCooldownUntil = Date.now() + AD_COOLDOWN_MS;
        await this.rechargeToMax();
    }

    private async _persist(): Promise<void> {
        try {
            const state: EnergyState = {
                energy: this.energy,
                lastRecharge: this.lastRecharge,
                adDailyCount: this.adDailyCount,
                adDailyKey: this.adDailyKey,
                adCooldownUntil: this.adCooldownUntil,
            };
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));

            // Sync to native for overlay/worker access
            if (Platform.OS === 'android' && EnergyBridge) {
                try {
                    await EnergyBridge.syncEnergy(this.energy);
                } catch (e) {
                    console.warn('[EnergyService] Failed to sync to native:', e);
                }
            }
        } catch (e) {
            console.error('[EnergyService] Failed to persist energy:', e);
        }
    }

    private _notifyListeners(): void {
        this.listeners.forEach(listener => {
            try {
                listener(this.energy);
            } catch (e) {
                console.error('[EnergyService] Listener error:', e);
            }
        });
    }
}

// Export singleton instance
export const energyService = new EnergyService();

export default energyService;
