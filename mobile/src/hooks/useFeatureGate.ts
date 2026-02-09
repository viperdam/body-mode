/**
 * Feature Gate Hook
 * Easy way to check feature access and show paywall when needed
 */

import { useCallback, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { FeatureId, FEATURES } from '../config/premiumFeatures';

interface FeatureGateResult {
  // Access info
  canUse: boolean;
  isPremium: boolean;
  remaining: number | 'unlimited';
  limit: number | null;

  // Feature info
  feature: typeof FEATURES[FeatureId];

  // Actions
  consume: () => boolean;
  showPaywall: () => void;

  /**
   * Execute action if allowed, otherwise show paywall
   * Automatically consumes one usage if free tier
   */
  executeOrPaywall: <T>(action: () => T | Promise<T>) => Promise<T | null>;

  /**
   * Check access without consuming - useful for UI display
   */
  checkOnly: () => boolean;
}

export const useFeatureGate = (featureId: FeatureId): FeatureGateResult => {
  const navigation = useNavigation<any>();
  const { isPremium, checkFeatureAccess, consumeFeature } = useSubscriptionStore();

  const feature = FEATURES[featureId];
  const access = useMemo(
    () => checkFeatureAccess(featureId),
    [checkFeatureAccess, featureId]
  );

  const showPaywall = useCallback(() => {
    navigation.navigate('Paywall', { featureId });
  }, [navigation, featureId]);

  const consume = useCallback(() => {
    return consumeFeature(featureId);
  }, [consumeFeature, featureId]);

  const checkOnly = useCallback(() => {
    return checkFeatureAccess(featureId).allowed;
  }, [checkFeatureAccess, featureId]);

  const executeOrPaywall = useCallback(
    async <T>(action: () => T | Promise<T>): Promise<T | null> => {
      // Premium users - just execute
      if (isPremium) {
        return await action();
      }

      // Check if feature is accessible
      const currentAccess = checkFeatureAccess(featureId);

      if (!currentAccess.allowed) {
        showPaywall();
        return null;
      }

      // Consume one usage
      const consumed = consumeFeature(featureId);
      if (!consumed) {
        showPaywall();
        return null;
      }

      // Execute the action
      return await action();
    },
    [isPremium, checkFeatureAccess, consumeFeature, featureId, showPaywall]
  );

  return {
    canUse: access.allowed,
    isPremium,
    remaining: access.remaining,
    limit: access.limit,
    feature,
    consume,
    showPaywall,
    executeOrPaywall,
    checkOnly,
  };
};

/**
 * Hook to get premium status and subscription info
 */
export const usePremiumStatus = () => {
  const store = useSubscriptionStore();

  return {
    isPremium: store.isPremium,
    expiresAt: store.expiresAt,
    trialEndsAt: store.trialEndsAt,
    productId: store.productId,
    isTrialing: store.trialEndsAt ? new Date(store.trialEndsAt) > new Date() : false,
  };
};
