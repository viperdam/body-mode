import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';

type BlockedType = 'foreground' | 'background';

interface PermissionBlockedModalProps {
  visible: boolean;
  type: BlockedType;
  onOpenSettings: () => void;
  onClose: () => void;
}

const PermissionBlockedModal: React.FC<PermissionBlockedModalProps> = ({
  visible,
  type,
  onOpenSettings,
  onClose,
}) => {
  const { t } = useLanguage();
  const title = t('permissions.blocked.title');
  const body =
    type === 'background'
      ? t('permissions.blocked.body_background')
      : t('permissions.blocked.body_foreground');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
        <View style={styles.card}>
          <View
            style={styles.icon}
            accessibilityLabel={t('permissions.blocked.icon_settings')}
          >
            <Ionicons name="settings-outline" size={28} color="#94a3b8" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <TouchableOpacity style={styles.primaryButton} onPress={onOpenSettings}>
            <Text style={styles.primaryText}>{t('permissions.blocked.open_settings')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryText}>{t('permissions.blocked.maybe_later')}</Text>
          </TouchableOpacity>
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
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  icon: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#06b6d4',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryText: {
    color: '#020617',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    paddingVertical: 8,
  },
  secondaryText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
});

export default PermissionBlockedModal;
