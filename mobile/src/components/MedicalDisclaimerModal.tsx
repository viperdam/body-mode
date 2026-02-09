/**
 * Medical Disclaimer Modal - FDA Compliance
 * Must be shown and accepted before using health features
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../contexts/LanguageContext';

const DISCLAIMER_KEY = 'disclaimer:accepted';
const DISCLAIMER_VERSION = '1.0'; // Increment to force re-acceptance

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDecline?: () => void;
}

export const MedicalDisclaimerModal: React.FC<Props> = ({
  visible,
  onAccept,
  onDecline,
}) => {
  const { t } = useLanguage();
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 30;
    const isAtBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isAtBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setHasScrolledToBottom(false);
    setContentHeight(0);
    setContainerHeight(0);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (contentHeight > 0 && containerHeight > 0) {
      if (contentHeight <= containerHeight + 20 && !hasScrolledToBottom) {
        setHasScrolledToBottom(true);
      }
    }
  }, [visible, contentHeight, containerHeight, hasScrolledToBottom]);

  const handleAccept = async () => {
    try {
      await AsyncStorage.setItem(
        DISCLAIMER_KEY,
        JSON.stringify({
          accepted: true,
          version: DISCLAIMER_VERSION,
          timestamp: new Date().toISOString(),
        })
      );
      onAccept();
    } catch (error) {
      console.error('Failed to save disclaimer acceptance:', error);
      onAccept(); // Still proceed
    }
  };

  const handlePrimaryPress = () => {
    if (!hasScrolledToBottom) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
      setTimeout(() => {
        setHasScrolledToBottom(true);
      }, 350);
      return;
    }
    void handleAccept();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerIcon}>⚕️</Text>
          <Text style={styles.headerTitle}>{t('medical_disclaimer.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('medical_disclaimer.subtitle')}</Text>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          onLayout={(event) => setContainerHeight(event.nativeEvent.layout.height)}
          onContentSizeChange={(_, height) => setContentHeight(height)}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <View
            onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
          >
            <Section title={t('medical_disclaimer.section.notice.title')}>
              {t('medical_disclaimer.section.notice.body')}
            </Section>

            <Section title={t('medical_disclaimer.section.not_device.title')}>
              {t('medical_disclaimer.section.not_device.body')}
            </Section>

            <Section title={t('medical_disclaimer.section.health_data.title')}>
              {t('medical_disclaimer.section.health_data.body')}
            </Section>

            <Section title={t('medical_disclaimer.section.ai_content.title')}>
              {t('medical_disclaimer.section.ai_content.body')}
            </Section>

            <Section title={t('medical_disclaimer.section.consult.title')}>
              {t('medical_disclaimer.section.consult.body')}
            </Section>

            <Section title={t('medical_disclaimer.section.emergency.title')}>
              <Text style={styles.emergencyText}>
                {t('medical_disclaimer.section.emergency.highlight')}
              </Text>
              {'\n\n'}
              {t('medical_disclaimer.section.emergency.body')}
            </Section>

            <Section title={t('medical_disclaimer.section.assumption.title')}>
              {t('medical_disclaimer.section.assumption.body')}
            </Section>

            <Section title={t('medical_disclaimer.section.data_accuracy.title')}>
              {t('medical_disclaimer.section.data_accuracy.body')}
            </Section>

            <View style={styles.scrollIndicator}>
            {!hasScrolledToBottom && (
              <TouchableOpacity
                onPress={() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                  setTimeout(() => setHasScrolledToBottom(true), 350);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('medical_disclaimer.scroll_to_bottom_accessibility')}
              >
                <Text style={styles.scrollIndicatorText}>
                  {t('medical_disclaimer.scroll_hint')}
                </Text>
              </TouchableOpacity>
            )}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.acceptButton,
              !hasScrolledToBottom && styles.acceptButtonDisabled,
            ]}
            onPress={handlePrimaryPress}
          >
            <Text style={styles.acceptButtonText}>
              {hasScrolledToBottom
                ? t('medical_disclaimer.accept')
                : t('medical_disclaimer.accept_disabled')}
            </Text>
          </TouchableOpacity>

          {onDecline && (
            <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
              <Text style={styles.declineButtonText}>{t('medical_disclaimer.decline')}</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.footerNote}>
            {t('medical_disclaimer.footer_note')}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

// Helper component for sections
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.sectionText}>{children}</Text>
  </View>
);

// Check if disclaimer has been accepted
export const checkDisclaimerAccepted = async (): Promise<boolean> => {
  try {
    const stored = await AsyncStorage.getItem(DISCLAIMER_KEY);
    if (!stored) return false;

    const data = JSON.parse(stored);
    return data.accepted === true && data.version === DISCLAIMER_VERSION;
  } catch {
    return false;
  }
};

// Reset disclaimer acceptance (for testing or version updates)
export const resetDisclaimerAcceptance = async (): Promise<void> => {
  await AsyncStorage.removeItem(DISCLAIMER_KEY);
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6366f1',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  sectionText: {
    fontSize: 15,
    color: '#cccccc',
    lineHeight: 24,
  },
  emergencyText: {
    color: '#ef4444',
    fontWeight: 'bold',
  },
  scrollIndicator: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  scrollIndicatorText: {
    color: '#6366f1',
    fontSize: 14,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#222',
    backgroundColor: '#0a0a0a',
  },
  acceptButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    backgroundColor: '#333',
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  declineButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  declineButtonText: {
    color: '#888',
    fontSize: 14,
  },
  footerNote: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },
});

export default MedicalDisclaimerModal;
