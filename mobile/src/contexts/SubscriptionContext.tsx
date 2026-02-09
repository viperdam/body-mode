import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { subscriptionService } from '../services/subscriptionService';
import { initializeAds } from '../services/adService';
import { onNetworkEvent } from '../services/offlineService';
import { useSubscriptionStore } from '../stores/subscriptionStore';

type SubscriptionContextValue = {
  isPremium: boolean;
  priceLabel: string;
  ready: boolean;
  processing: boolean;
  restoring: boolean;
  manageUrl: string | null;
  lastUpdatedAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  subscribePremium: () => Promise<void>;
  restorePremium: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue>({
  isPremium: false,
  priceLabel: '$1.50 / month',
  ready: false,
  processing: false,
  restoring: false,
  manageUrl: null,
  lastUpdatedAt: null,
  lastError: null,
  lastErrorAt: null,
  subscribePremium: async () => undefined,
  restorePremium: async () => undefined,
});

const ENTITLEMENT_REFRESH_MS = 24 * 60 * 60 * 1000;

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState(() => subscriptionService.getSnapshot());
  const [processing, setProcessing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const readyRef = useRef(snapshot.ready);

  useEffect(() => {
    readyRef.current = snapshot.ready;
  }, [snapshot.ready]);

  useEffect(() => {
    const unsubscribe = subscriptionService.subscribe(setSnapshot);
    subscriptionService.init().catch((error) => {
      console.warn('[Subscription] Init failed:', error);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    useSubscriptionStore.getState().syncPremiumStatus(snapshot.isPremium);
  }, [snapshot.isPremium]);

  useEffect(() => {
    if (!snapshot.ready || snapshot.isPremium) return;
    initializeAds().catch((error) => {
      console.warn('[Subscription] Ads init failed:', error);
    });
  }, [snapshot.ready, snapshot.isPremium]);

  useEffect(() => {
    const refreshIfStale = async (reason: string) => {
      if (!readyRef.current) return;
      try {
        await subscriptionService.refreshEntitlements({
          reason,
          maxAgeMs: ENTITLEMENT_REFRESH_MS,
        });
      } catch (error) {
        console.warn('[Subscription] Entitlement refresh failed:', error);
      }
    };

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshIfStale('app_resume');
      }
    });

    const unsubscribeNetwork = onNetworkEvent('networkRestored', () => {
      void refreshIfStale('network_restored');
    });

    return () => {
      appStateSub.remove();
      unsubscribeNetwork();
    };
  }, []);

  const subscribePremium = async () => {
    setProcessing(true);
    try {
      await subscriptionService.purchasePremium();
    } finally {
      setProcessing(false);
    }
  };

  const restorePremium = async () => {
    setRestoring(true);
    try {
      await subscriptionService.restorePurchases();
    } finally {
      setRestoring(false);
    }
  };

  const value = useMemo(
    () => ({
      isPremium: snapshot.isPremium,
      priceLabel: snapshot.priceLabel,
      ready: snapshot.ready,
      processing,
      restoring,
      manageUrl: subscriptionService.getManageUrl(),
      lastUpdatedAt: snapshot.lastUpdatedAt,
      lastError: snapshot.lastError,
      lastErrorAt: snapshot.lastErrorAt,
      subscribePremium,
      restorePremium,
    }),
    [snapshot, processing, restoring]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => useContext(SubscriptionContext);
