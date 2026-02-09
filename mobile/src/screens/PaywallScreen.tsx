import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSubscription } from '../contexts/SubscriptionContext';
import { analytics } from '../services/analyticsService';
import { useLanguage } from '../contexts/LanguageContext';

type PaywallRouteParams = {
  source?: string;
};

const PaywallScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useLanguage();
  const source = (route.params as PaywallRouteParams | undefined)?.source || 'unknown';
  const {
    isPremium,
    priceLabel,
    ready,
    processing,
    restoring,
    manageUrl,
    lastError,
    subscribePremium,
    restorePremium,
  } = useSubscription();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    analytics.logSubscriptionViewed();
    analytics.logEvent('subscription_paywall_viewed', { source });
  }, [source]);

  const benefits = useMemo(
    () => [
      {
        title: t('paywall.benefit.no_ads.title'),
        description: t('paywall.benefit.no_ads.desc'),
      },
      {
        title: t('paywall.benefit.unlimited.title'),
        description: t('paywall.benefit.unlimited.desc'),
      },
      {
        title: t('paywall.benefit.priority.title'),
        description: t('paywall.benefit.priority.desc'),
      },
    ],
    [t]
  );

  const handleSubscribe = useCallback(async () => {
    setActionError(null);
    try {
      analytics.logSubscriptionStarted({ plan: 'premium_monthly', source });
      await subscribePremium();
    } catch (error) {
      console.warn('[Paywall] Purchase failed:', error);
      setActionError(t('paywall.error.purchase_failed'));
      analytics.logEvent('subscription_purchase_failed', { source });
    }
  }, [source, subscribePremium, t]);

  const handleRestore = useCallback(async () => {
    setActionError(null);
    try {
      analytics.logEvent('subscription_restore_started', { source });
      await restorePremium();
      analytics.logEvent('subscription_restore_completed', { source });
    } catch (error) {
      console.warn('[Paywall] Restore failed:', error);
      setActionError(t('paywall.error.restore_failed'));
      analytics.logEvent('subscription_restore_failed', { source });
    }
  }, [restorePremium, source, t]);

  const handleManage = useCallback(() => {
    if (!manageUrl) return;
    Linking.openURL(manageUrl).catch((error) => {
      console.warn('[Paywall] Failed to open manage url:', error);
    });
  }, [manageUrl]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={['#020617', '#0f172a']} style={styles.background}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>{t('paywall.hero.eyebrow')}</Text>
            <Text style={styles.heroTitle}>{t('paywall.hero.title')}</Text>
            <Text style={styles.heroSubtitle}>
              {t('paywall.hero.subtitle')}
            </Text>
          </View>

          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>{priceLabel}</Text>
            <Text style={styles.priceNote}>{t('paywall.price.note')}</Text>
          </View>

          <View style={styles.benefitsCard}>
            {benefits.map((benefit, index) => (
              <View key={benefit.title} style={[styles.benefitRow, index > 0 && styles.benefitRowDivider]}>
                <View style={styles.bullet} />
                <View style={styles.benefitText}>
                  <Text style={styles.benefitTitle}>{benefit.title}</Text>
                  <Text style={styles.benefitDescription}>{benefit.description}</Text>
                </View>
              </View>
            ))}
          </View>

          {!ready && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#38bdf8" />
              <Text style={styles.loadingText}>{t('paywall.loading')}</Text>
            </View>
          )}
          {(actionError || lastError) && (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>{actionError || lastError}</Text>
            </View>
          )}

          <View style={styles.ctaSection}>
            {!isPremium ? (
              <TouchableOpacity
                style={[styles.primaryButton, (!ready || processing) && styles.buttonDisabled]}
                onPress={handleSubscribe}
                disabled={!ready || processing}
              >
                {processing ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <Text style={styles.primaryButtonText}>{t('paywall.cta.start')}</Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>{t('paywall.cta.active')}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.secondaryButton, (!ready || restoring) && styles.buttonDisabled]}
              onPress={handleRestore}
              disabled={!ready || restoring}
            >
              {restoring ? (
                <ActivityIndicator color="#38bdf8" />
              ) : (
                <Text style={styles.secondaryButtonText}>{t('paywall.cta.restore')}</Text>
              )}
            </TouchableOpacity>

            {isPremium && manageUrl && (
              <TouchableOpacity style={styles.ghostButton} onPress={handleManage}>
                <Text style={styles.ghostButtonText}>{t('paywall.cta.manage')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
              <Text style={styles.closeButtonText}>{t('paywall.cta.not_now')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.legalText}>
            {t('paywall.legal')}
          </Text>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  background: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  hero: {
    marginBottom: 24,
  },
  heroEyebrow: {
    color: '#38bdf8',
    fontSize: 14,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(248, 250, 252, 0.7)',
    lineHeight: 24,
  },
  priceCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    marginBottom: 20,
  },
  priceLabel: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 6,
  },
  priceNote: {
    color: 'rgba(148, 163, 184, 0.8)',
    fontSize: 14,
  },
  benefitsCard: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    marginBottom: 24,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  benefitRowDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.12)',
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#38bdf8',
    marginTop: 8,
    marginRight: 12,
  },
  benefitText: {
    flex: 1,
  },
  benefitTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  benefitDescription: {
    color: 'rgba(148, 163, 184, 0.85)',
    fontSize: 14,
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingText: {
    marginLeft: 10,
    color: 'rgba(148, 163, 184, 0.8)',
  },
  errorRow: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#fecaca',
    fontSize: 13,
    textAlign: 'center',
  },
  ctaSection: {
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#38bdf8',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  activeBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.5)',
  },
  activeBadgeText: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.6)',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: '600',
  },
  ghostButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  ghostButtonText: {
    color: 'rgba(148, 163, 184, 0.9)',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  closeButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'rgba(148, 163, 184, 0.7)',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  legalText: {
    color: 'rgba(148, 163, 184, 0.65)',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});

export default PaywallScreen;
