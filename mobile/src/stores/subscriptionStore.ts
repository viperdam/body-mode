/**
 * Subscription Store - Zustand store for premium status and feature usage
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FeatureId, FEATURES } from '../config/premiumFeatures';

interface FeatureUsage {
  count: number;
  periodStart: string; // ISO date when the period started
}

interface SubscriptionState {
  // Premium status
  isPremium: boolean;
  subscriptionId: string | null;
  productId: string | null;
  expiresAt: string | null;
  trialEndsAt: string | null;
  syncPremiumStatus: (isPremium: boolean) => void;

  // Feature usage tracking
  featureUsage: Partial<Record<FeatureId, FeatureUsage>>;

  // Actions
  setSubscription: (data: {
    subscriptionId: string;
    productId: string;
    expiresAt: string;
    trialEndsAt?: string;
  }) => void;
  clearSubscription: () => void;
  checkFeatureAccess: (featureId: FeatureId) => {
    allowed: boolean;
    remaining: number | 'unlimited';
    limit: number | null;
  };
  consumeFeature: (featureId: FeatureId) => boolean;
  getUsageCount: (featureId: FeatureId) => number;
  resetExpiredPeriods: () => void;
}

const getPeriodStart = (period: 'day' | 'week' | 'month'): string => {
  const now = new Date();
  switch (period) {
    case 'day':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case 'week':
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - dayOfWeek);
      weekStart.setHours(0, 0, 0, 0);
      return weekStart.toISOString();
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
};

const isInCurrentPeriod = (periodStart: string, period: 'day' | 'week' | 'month'): boolean => {
  const currentPeriodStart = getPeriodStart(period);
  return new Date(periodStart).getTime() >= new Date(currentPeriodStart).getTime();
};

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      // Initial state
      isPremium: false,
      subscriptionId: null,
      productId: null,
      expiresAt: null,
      trialEndsAt: null,
      featureUsage: {},

      setSubscription: (data) => {
        set({
          isPremium: true,
          subscriptionId: data.subscriptionId,
          productId: data.productId,
          expiresAt: data.expiresAt,
          trialEndsAt: data.trialEndsAt || null,
        });
      },

      clearSubscription: () => {
        set({
          isPremium: false,
          subscriptionId: null,
          productId: null,
          expiresAt: null,
          trialEndsAt: null,
        });
      },
      syncPremiumStatus: (isPremium) => {
        if (isPremium) {
          set({ isPremium: true });
        } else {
          set({
            isPremium: false,
            subscriptionId: null,
            productId: null,
            expiresAt: null,
            trialEndsAt: null,
          });
        }
      },

      checkFeatureAccess: (featureId: FeatureId) => {
        const state = get();
        const feature = FEATURES[featureId];

        if (!feature) {
          return { allowed: false, remaining: 0, limit: 0 };
        }

        // Premium users have unlimited access
        if (state.isPremium) {
          // Check if subscription has expired
          if (state.expiresAt && new Date(state.expiresAt) < new Date()) {
            // Subscription expired, clear it
            get().clearSubscription();
          } else {
            return { allowed: true, remaining: 'unlimited', limit: null };
          }
        }

        // Feature has no limit (free unlimited)
        if (feature.freeLimit === null) {
          return { allowed: true, remaining: 'unlimited', limit: null };
        }

        // Feature is premium only
        if (feature.freeLimit === 0) {
          return { allowed: false, remaining: 0, limit: 0 };
        }

        // Check usage against limit
        const usage = state.featureUsage[featureId];
        const currentPeriodStart = getPeriodStart(feature.freePeriod);

        // No usage recorded or usage is from a previous period
        if (!usage || !isInCurrentPeriod(usage.periodStart, feature.freePeriod)) {
          return {
            allowed: true,
            remaining: feature.freeLimit,
            limit: feature.freeLimit,
          };
        }

        const remaining = Math.max(0, feature.freeLimit - usage.count);
        return {
          allowed: remaining > 0,
          remaining,
          limit: feature.freeLimit,
        };
      },

      consumeFeature: (featureId: FeatureId) => {
        const state = get();
        const access = state.checkFeatureAccess(featureId);

        if (!access.allowed) {
          return false;
        }

        // Premium users don't consume
        if (state.isPremium) {
          return true;
        }

        const feature = FEATURES[featureId];
        if (!feature || feature.freeLimit === null) {
          return true; // Unlimited feature
        }

        const currentUsage = state.featureUsage[featureId];
        const currentPeriodStart = getPeriodStart(feature.freePeriod);

        // Reset if new period or increment existing
        if (!currentUsage || !isInCurrentPeriod(currentUsage.periodStart, feature.freePeriod)) {
          set({
            featureUsage: {
              ...state.featureUsage,
              [featureId]: {
                count: 1,
                periodStart: currentPeriodStart,
              },
            },
          });
        } else {
          set({
            featureUsage: {
              ...state.featureUsage,
              [featureId]: {
                ...currentUsage,
                count: currentUsage.count + 1,
              },
            },
          });
        }

        return true;
      },

      getUsageCount: (featureId: FeatureId) => {
        const state = get();
        const feature = FEATURES[featureId];
        const usage = state.featureUsage[featureId];

        if (!usage || !feature) return 0;
        if (!isInCurrentPeriod(usage.periodStart, feature.freePeriod)) return 0;

        return usage.count;
      },

      resetExpiredPeriods: () => {
        const state = get();
        const newUsage: Partial<Record<FeatureId, FeatureUsage>> = {};

        for (const [featureId, usage] of Object.entries(state.featureUsage)) {
          const feature = FEATURES[featureId as FeatureId];
          if (feature && usage && isInCurrentPeriod(usage.periodStart, feature.freePeriod)) {
            newUsage[featureId as FeatureId] = usage;
          }
        }

        set({ featureUsage: newUsage });
      },
    }),
    {
      name: 'subscription-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        isPremium: state.isPremium,
        subscriptionId: state.subscriptionId,
        productId: state.productId,
        expiresAt: state.expiresAt,
        trialEndsAt: state.trialEndsAt,
        featureUsage: state.featureUsage,
      }),
    }
  )
);

// Selector hooks for convenience
export const useIsPremium = () => useSubscriptionStore((state) => state.isPremium);
export const useFeatureAccess = (featureId: FeatureId) =>
  useSubscriptionStore((state) => state.checkFeatureAccess(featureId));
