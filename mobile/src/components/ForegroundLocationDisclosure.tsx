/**
 * ForegroundLocationDisclosure - Disclosure for foreground location permission
 *
 * This component shows a disclosure explaining why the app needs foreground
 * location access (weather-based recommendations).
 */

import React, { useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';

interface ForegroundLocationDisclosureProps {
  visible: boolean;
  onAllow: () => void;
  onDeny: () => void;
  onDismiss?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const ForegroundLocationDisclosure: React.FC<ForegroundLocationDisclosureProps> = ({
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
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>📍</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>{t('permissions.foreground.title')}</Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Description */}
          <Text style={styles.description}>
            {t('permissions.foreground.description')}
          </Text>

          {/* Feature List */}
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.featureText}>
                {t('permissions.foreground.feature.weather')}
              </Text>
            </View>

            <View style={styles.featureItem}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.featureText}>
                {t('permissions.foreground.feature.privacy')}
              </Text>
            </View>
          </View>

          {/* Error Message */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

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
                <Text style={styles.allowButtonText}>{t('permissions.foreground.allow')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.denyButton}
              onPress={handleDeny}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.denyButtonText}>{t('permissions.foreground.deny')}</Text>
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
    padding: 24,
    width: '100%',
    maxWidth: 400,
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
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
  },
  buttonContainer: {
    marginTop: 8,
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

export default ForegroundLocationDisclosure;
