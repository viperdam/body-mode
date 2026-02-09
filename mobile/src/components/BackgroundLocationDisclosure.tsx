/**
 * BackgroundLocationDisclosure - Prominent disclosure for background location permission
 *
 * GOOGLE PLAY COMPLIANCE: This component shows a prominent disclosure BEFORE
 * requesting ACCESS_BACKGROUND_LOCATION permission. It includes:
 * - The word "location"
 * - The phrase "background" or "when the app is closed"
 * - The specific feature: "sleep detection"
 *
 * This disclosure must be shown and acknowledged by the user before the
 * system permission dialog appears.
 */

import React, { useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';

interface BackgroundLocationDisclosureProps {
  visible: boolean;
  onAllow: () => void;
  onDeny: () => void;
  onDismiss?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const BackgroundLocationDisclosure: React.FC<BackgroundLocationDisclosureProps> = ({
  visible,
  onAllow,
  onDeny,
  onDismiss,
  isLoading = false,
  error = null,
}) => {
  const { t } = useLanguage();
  const handleAllow = useCallback(() => {
    if (!isLoading) {
      onAllow();
    }
  }, [isLoading, onAllow]);

  const handleDeny = useCallback(() => {
    if (!isLoading) {
      onDeny();
    }
  }, [isLoading, onDeny]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss || onDeny}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Icon */}
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>🌙</Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>{t('permissions.background_location.title')}</Text>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Main Description - Contains required phrases for Google compliance */}
            <Text style={styles.description}>
              {t('permissions.background_location.description_prefix')}{' '}
              <Text style={styles.highlight}>{t('permissions.background_location.highlight_location')}</Text>{' '}
              {t('permissions.background_location.description_in')}{' '}
              <Text style={styles.highlight}>{t('permissions.background_location.highlight_background')}</Text>{' '}
              {t('permissions.background_location.description_to_improve')}{' '}
              <Text style={styles.highlight}>{t('permissions.background_location.highlight_sleep')}</Text>{' '}
              {t('permissions.background_location.description_suffix')}
            </Text>

            {/* Feature List */}
            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <Text style={styles.checkmark}>✓</Text>
                <Text style={styles.featureText}>
                  {t('permissions.background_location.feature.indoor_outdoor')}
                </Text>
              </View>

              <View style={styles.featureItem}>
                <Text style={styles.checkmark}>✓</Text>
                <Text style={styles.featureText}>
                  {t('permissions.background_location.feature.local_only')}
                </Text>
              </View>

              <View style={styles.featureItem}>
                <Text style={styles.checkmark}>✓</Text>
                <Text style={styles.featureText}>
                  {t('permissions.background_location.feature.disable_anytime')}
                </Text>
              </View>
            </View>

            {/* Privacy Note */}
            <View style={styles.privacyNote}>
              <Text style={styles.privacyIcon}>🔒</Text>
              <Text style={styles.privacyText}>
                {t('permissions.background_location.privacy_note')}
              </Text>
            </View>

            {/* Error Message */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.allowButton, isLoading && styles.buttonDisabled]}
              onPress={handleAllow}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.allowButtonText}>{t('permissions.background_location.allow')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.denyButton}
              onPress={handleDeny}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.denyButtonText}>{t('permissions.background_location.deny')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  scrollContent: {
    padding: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 16,
  },
  description: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  highlight: {
    color: '#06b6d4',
    fontWeight: '600',
  },
  featureList: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  checkmark: {
    fontSize: 16,
    color: '#22c55e',
    marginRight: 10,
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  privacyIcon: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 2,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    color: '#06b6d4',
    lineHeight: 18,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
  },
  buttonContainer: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  allowButton: {
    backgroundColor: '#06b6d4',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  allowButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  denyButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  denyButtonText: {
    fontSize: 15,
    color: '#888',
  },
});

export default BackgroundLocationDisclosure;
