import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as RNIap from 'react-native-iap';
import type { Purchase } from 'react-native-iap';
import { analytics } from './analyticsService';
import i18n from '../i18n';

type SubscriptionProduct = {
  productId: string;
  localizedPrice?: string;
  price?: string;
  subscriptionOfferDetails?: Array<{
    offerToken?: string;
    pricingPhases?: {
      pricingPhaseList?: Array<{
        formattedPrice?: string;
      }>;
    };
  }>;
};

type IapModule = typeof RNIap & {
  flushFailedPurchasesCachedAsPendingAndroid?: () => Promise<void>;
  getSubscriptions?: (options: { skus: string[] }) => Promise<SubscriptionProduct[]>;
  requestSubscription?: (options: {
    sku: string;
    subscriptionOffers?: Array<{ sku: string; offerToken: string }>;
  }) => Promise<void>;
};

const iap = RNIap as IapModule;

type SubscriptionSnapshot = {
  isPremium: boolean;
  priceLabel: string;
  ready: boolean;
  lastUpdatedAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
};

const STORAGE_KEY_PREMIUM = 'bm_premium_active';
const STORAGE_KEY_PREMIUM_UPDATED_AT = 'bm_premium_updated_at';
const DEFAULT_PRICE_LABEL = '$1.50 / month';
const ANDROID_PACKAGE = 'com.viperdam.bodymode';

const getSkuForPlatform = (): string => {
  const sku = Platform.select({
    ios: process.env.EXPO_PUBLIC_IAP_IOS_PREMIUM_ID,
    android: process.env.EXPO_PUBLIC_IAP_ANDROID_PREMIUM_ID,
  });
  return (sku || '').trim();
};

const getPriceLabel = (product?: SubscriptionProduct): string => {
  if (!product) return DEFAULT_PRICE_LABEL;
  const androidPrice =
    product.subscriptionOfferDetails?.[0]?.pricingPhases?.pricingPhaseList?.[0]?.formattedPrice;
  const price = product.localizedPrice || androidPrice || product.price;
  if (!price) return DEFAULT_PRICE_LABEL;
  return `${price} / month`;
};

const isPurchaseActive = (purchase: Purchase): boolean => {
  const expiry =
    (purchase as { expirationDate?: string }).expirationDate ||
    (purchase as { expiryTimeMillis?: string }).expiryTimeMillis ||
    (purchase as { expiresDateMs?: string }).expiresDateMs;
  if (!expiry) return true;
  const expiryMs = Number(expiry);
  if (!Number.isFinite(expiryMs)) return true;
  return Date.now() < expiryMs;
};

class SubscriptionService {
  private initPromise: Promise<void> | null = null;
  private ready = false;
  private premiumActive = false;
  private priceLabel = DEFAULT_PRICE_LABEL;
  private products: SubscriptionProduct[] = [];
  private lastUpdatedAt: number | null = null;
  private lastError: string | null = null;
  private lastErrorAt: number | null = null;
  private listeners = new Set<(snapshot: SubscriptionSnapshot) => void>();
  private purchaseUpdateSub: ReturnType<typeof RNIap.purchaseUpdatedListener> | null = null;
  private purchaseErrorSub: ReturnType<typeof RNIap.purchaseErrorListener> | null = null;

  getSnapshot(): SubscriptionSnapshot {
    return {
      isPremium: this.premiumActive,
      priceLabel: this.priceLabel,
      ready: this.ready,
      lastUpdatedAt: this.lastUpdatedAt,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
    };
  }

  subscribe(listener: (snapshot: SubscriptionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  isPremiumActive(): boolean {
    return this.premiumActive;
  }

  getLastUpdatedAt(): number | null {
    return this.lastUpdatedAt;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  private setError(message: string, source: string) {
    this.lastError = message;
    this.lastErrorAt = Date.now();
    analytics.logEvent('subscription_error', { source, message });
    this.notify();
  }

  private clearError() {
    if (!this.lastError) return;
    this.lastError = null;
    this.lastErrorAt = null;
    this.notify();
  }

  getManageUrl(): string | null {
    const sku = getSkuForPlatform();
    if (!sku) return null;
    if (Platform.OS === 'ios') {
      return 'https://apps.apple.com/account/subscriptions';
    }
    return `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}&sku=${sku}`;
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initInternal();
    return this.initPromise;
  }

  private notify() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch (error) {
        console.warn('[Subscription] Listener error:', error);
      }
    });
  }

  private async initInternal() {
    await this.loadCachedState();
    const sku = getSkuForPlatform();
    if (!sku) {
      this.ready = true;
      this.notify();
      const message = 'Missing SKU configuration for IAP';
      console.warn('[Subscription] Missing SKU configuration for IAP');
      this.setError(message, 'init');
      return;
    }

    try {
      await iap.initConnection();
      if (Platform.OS === 'android') {
        if (iap.flushFailedPurchasesCachedAsPendingAndroid) {
          await iap.flushFailedPurchasesCachedAsPendingAndroid();
        }
      }
    } catch (error) {
      console.warn('[Subscription] IAP init failed:', error);
      this.setError('IAP initialization failed', 'init');
      this.ready = true;
      this.notify();
      return;
    }

    this.attachListeners();

    try {
      await this.refreshProducts();
      await this.refreshPurchases();
    } catch (error) {
      console.warn('[Subscription] Failed to load products/purchases:', error);
      this.setError('Failed to load subscription details', 'init');
    }

    this.ready = true;
    this.notify();
  }

  private attachListeners() {
    if (!this.purchaseUpdateSub) {
      this.purchaseUpdateSub = iap.purchaseUpdatedListener(async (purchase) => {
        try {
          await this.handlePurchaseUpdate(purchase);
        } catch (error) {
          console.warn('[Subscription] Purchase update failed:', error);
          this.setError('Purchase update failed', 'purchase_update');
        }
      });
    }
    if (!this.purchaseErrorSub) {
      this.purchaseErrorSub = iap.purchaseErrorListener((error) => {
        console.warn('[Subscription] Purchase error:', error);
        this.setError('Purchase failed', 'purchase_error');
      });
    }
  }

  private async handlePurchaseUpdate(purchase: Purchase) {
    const sku = getSkuForPlatform();
    if (!sku || purchase.productId !== sku) {
      await iap.finishTransaction({ purchase, isConsumable: false });
      return;
    }

    const transactionReceipt = (purchase as { transactionReceipt?: string }).transactionReceipt;
    if (transactionReceipt) {
      await iap.finishTransaction({ purchase, isConsumable: false });
    }

    await this.setPremiumActive(true, 'purchase_update');
    this.clearError();
    analytics.logEvent('subscription_purchase_completed', { source: 'purchase_update' });
  }

  private async setPremiumActive(active: boolean, source: string = 'unknown') {
    const previous = this.premiumActive;
    this.premiumActive = active;
    this.lastUpdatedAt = Date.now();
    try {
      await AsyncStorage.setItem(STORAGE_KEY_PREMIUM, active ? 'true' : 'false');
      await AsyncStorage.setItem(STORAGE_KEY_PREMIUM_UPDATED_AT, `${this.lastUpdatedAt}`);
    } catch (error) {
      console.warn('[Subscription] Failed to persist premium state:', error);
    }

    if (previous !== active) {
      analytics.logEvent(active ? 'subscription_activated' : 'subscription_deactivated', { source });
    }
    this.notify();
  }

  private async loadCachedState() {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEY_PREMIUM);
      this.premiumActive = cached === 'true';
      const updatedAt = await AsyncStorage.getItem(STORAGE_KEY_PREMIUM_UPDATED_AT);
      this.lastUpdatedAt = updatedAt ? Number(updatedAt) : null;
    } catch (error) {
      console.warn('[Subscription] Failed to load cached premium state:', error);
      this.setError('Failed to load cached premium state', 'cache');
    }
  }

  private async refreshProducts() {
    const sku = getSkuForPlatform();
    if (!sku) return;
    try {
      const products = iap.getSubscriptions ? await iap.getSubscriptions({ skus: [sku] }) : [];
      this.products = products;
      const match = products.find(product => product.productId === sku);
      this.priceLabel = getPriceLabel(match);
      this.clearError();
      analytics.logEvent('subscription_products_loaded', { source: 'refresh' });
      this.notify();
    } catch (error) {
      console.warn('[Subscription] Failed to load products:', error);
      this.setError('Failed to load subscription price', 'products');
    }
  }

  private async refreshPurchases(source: string = 'refresh') {
    const sku = getSkuForPlatform();
    if (!sku) return;
    try {
      const purchases = await iap.getAvailablePurchases();
      const match = purchases.find(purchase => purchase.productId === sku && isPurchaseActive(purchase));
      await this.setPremiumActive(!!match, source);
      this.clearError();
    } catch (error) {
      console.warn('[Subscription] Failed to refresh purchases:', error);
      this.setError('Failed to refresh subscription status', source);
    }
  }

  async purchasePremium(): Promise<void> {
    await this.init();
    const sku = getSkuForPlatform();
    if (!sku) {
      throw new Error(i18n.t('errors.subscription.missing_sku'));
    }

    const product = this.products.find(item => item.productId === sku);
    const offerToken = product?.subscriptionOfferDetails?.[0]?.offerToken;

    if (Platform.OS === 'android' && offerToken) {
      if (!iap.requestSubscription) {
        throw new Error(i18n.t('paywall.error.purchase_failed'));
      }
      await iap.requestSubscription({
        sku,
        subscriptionOffers: [{ sku, offerToken }],
      });
      analytics.logEvent('subscription_purchase_requested', { source: 'android_offer' });
      return;
    }

    if (!iap.requestSubscription) {
      throw new Error(i18n.t('paywall.error.purchase_failed'));
    }
    await iap.requestSubscription({ sku });
    analytics.logEvent('subscription_purchase_requested', { source: 'default' });
  }

  async restorePurchases(): Promise<void> {
    await this.init();
    await this.refreshPurchases('restore');
    analytics.logEvent('subscription_restore_completed', { source: 'restore' });
  }

  async refreshEntitlements(options?: { reason?: string; maxAgeMs?: number; force?: boolean }): Promise<void> {
    const reason = options?.reason || 'manual';
    const maxAgeMs = options?.maxAgeMs;
    const force = options?.force === true;

    await this.init();
    const sku = getSkuForPlatform();
    if (!sku) return;

    const lastUpdatedAt = this.lastUpdatedAt || 0;
    if (!force && typeof maxAgeMs === 'number' && Date.now() - lastUpdatedAt < maxAgeMs) {
      return;
    }

    await this.refreshPurchases(reason);
    analytics.logEvent('subscription_refreshed', { source: reason });
  }

  async destroy(): Promise<void> {
    this.purchaseUpdateSub?.remove();
    this.purchaseErrorSub?.remove();
    this.purchaseUpdateSub = null;
    this.purchaseErrorSub = null;
    await iap.endConnection();
  }
}

export const subscriptionService = new SubscriptionService();
