// Permission Modal - Reusable component for requesting permissions with explanations
import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity, AppState
} from 'react-native';
import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermission } from '../services/notificationService';
import useLocationPermission from '../hooks/useLocationPermission';
import { openAppSettings, openLocationSettings, openNotificationSettings } from '../services/permissionSettingsService';
import { useLanguage } from '../contexts/LanguageContext';

type PermissionType = 'camera' | 'location' | 'motion' | 'notifications';

interface PermissionModalProps {
    visible: boolean;
    permissionType: PermissionType;
    canAskAgain?: boolean; // If false, show "Go to Settings" instead of request
    onGranted: () => void;
    onDenied: () => void;
    onClose: () => void;
}

const PERMISSION_INFO: Record<
    PermissionType,
    { emoji: string; titleKey: string; descriptionKey: string; featureKey: string }
> = {
    camera: {
        emoji: '📷',
        titleKey: 'permission_modal.camera.title',
        descriptionKey: 'permission_modal.camera.description',
        featureKey: 'permission_modal.camera.feature',
    },
    location: {
        emoji: '📍',
        titleKey: 'permission_modal.location.title',
        descriptionKey: 'permission_modal.location.description',
        featureKey: 'permission_modal.location.feature',
    },
    motion: {
        emoji: '🏃',
        titleKey: 'permission_modal.motion.title',
        descriptionKey: 'permission_modal.motion.description',
        featureKey: 'permission_modal.motion.feature',
    },
    notifications: {
        emoji: '🔔',
        titleKey: 'permission_modal.notifications.title',
        descriptionKey: 'permission_modal.notifications.description',
        featureKey: 'permission_modal.notifications.feature',
    },
};

export const PermissionModal: React.FC<PermissionModalProps> = ({
    visible,
    permissionType,
    canAskAgain = true, // Default to true, can request permission
    onGranted,
    onDenied,
    onClose,
}) => {
    const { t } = useLanguage();
    const [isRequesting, setIsRequesting] = useState(false);
    const info = PERMISSION_INFO[permissionType];
    const title = t(info.titleKey);
    const description = t(info.descriptionKey);
    const feature = t(info.featureKey);
    const { requestForeground } = useLocationPermission();

    // Monitor app state to re-check permission when returning from settings
    useEffect(() => {
        if (!visible || canAskAgain) return; // Only monitor when showing "Go to Settings" mode

        const checkPermissionOnResume = async (nextState: string) => {
            if (nextState === 'active') {
                // User returned from settings, check if permission was granted
                let granted = false;
                switch (permissionType) {
                    case 'camera': {
                        const { status } = await Camera.getCameraPermissionsAsync();
                        granted = status === 'granted';
                        break;
                    }
                    case 'location': {
                        const { status } = await Location.getForegroundPermissionsAsync();
                        granted = status === 'granted';
                        break;
                    }
                    case 'motion': {
                        const { status } = await Accelerometer.getPermissionsAsync();
                        granted = status === 'granted';
                        break;
                    }
                    case 'notifications': {
                        const { status } = await Notifications.getPermissionsAsync();
                        granted = status === 'granted';
                        break;
                    }
                }
                if (granted) {
                    onGranted();
                }
            }
        };

        const subscription = AppState.addEventListener('change', checkPermissionOnResume);
        return () => subscription.remove();
    }, [visible, canAskAgain, permissionType, onGranted]);

    const requestPermission = async () => {
        console.log('[PermissionModal] requestPermission called for:', permissionType);
        console.log('[PermissionModal] canAskAgain:', canAskAgain, 'showSettingsMode:', showSettingsMode);
        setIsRequesting(true);
        try {
            let granted = false;

            switch (permissionType) {
                case 'camera': {
                    console.log('[PermissionModal] Calling Camera.requestCameraPermissionsAsync...');
                    const result = await Camera.requestCameraPermissionsAsync();
                    console.log('[PermissionModal] Camera permission result:', result);
                    granted = result.status === 'granted';
                    break;
                }
                case 'location': {
                    console.log('[PermissionModal] Calling requestForeground...');
                    const result = await requestForeground();
                    console.log('[PermissionModal] Location permission result:', result);
                    granted = result;
                    break;
                }
                case 'motion': {
                    console.log('[PermissionModal] Checking Accelerometer permissions...');
                    const { status } = await Accelerometer.getPermissionsAsync();
                    console.log('[PermissionModal] Motion current status:', status);
                    if (status === 'granted') {
                        granted = true;
                    } else {
                        console.log('[PermissionModal] Calling Accelerometer.requestPermissionsAsync...');
                        const result = await Accelerometer.requestPermissionsAsync();
                        console.log('[PermissionModal] Motion permission result:', result);
                        granted = result.status === 'granted';
                    }
                    break;
                }
                case 'notifications': {
                    console.log('[PermissionModal] Calling requestNotificationPermission...');
                    granted = await requestNotificationPermission();
                    console.log('[PermissionModal] Notification permission result:', granted);
                    break;
                }
            }

            console.log('[PermissionModal] Final granted status:', granted);
            if (granted) {
                onGranted();
            } else {
                onDenied();
            }
        } catch (error) {
            console.error('[PermissionModal] Permission request failed:', error);
            onDenied();
        } finally {
            setIsRequesting(false);
        }
    };

    const openSettings = () => {
        if (permissionType === 'location') {
            void openLocationSettings();
            return;
        }
        if (permissionType === 'notifications') {
            void openNotificationSettings();
            return;
        }
        void openAppSettings();
    };

    // Show different UI based on whether we can ask again
    const showSettingsMode = canAskAgain === false;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.modal}>
                    <Text style={styles.emoji}>{info.emoji}</Text>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.description}>
                        {showSettingsMode
                            ? t('permission_modal.denied', { permission: title })
                            : description
                        }
                    </Text>

                    <View style={styles.featureBox}>
                        <Text style={styles.featureLabel}>{t('permission_modal.enables')}</Text>
                        <Text style={styles.featureText}>{feature}</Text>
                    </View>

                    {showSettingsMode ? (
                        // Can't ask again - show "Go to Settings" button
                        <TouchableOpacity
                            style={styles.allowButton}
                            onPress={openSettings}
                        >
                            <Text style={styles.allowText}>{t('permission_modal.open_settings')}</Text>
                        </TouchableOpacity>
                    ) : (
                        // Can ask again - show normal request button
                        <TouchableOpacity
                            style={styles.allowButton}
                            onPress={requestPermission}
                            disabled={isRequesting}
                        >
                            <Text style={styles.allowText}>
                                {isRequesting ? t('permission_modal.requesting') : t('permission_modal.allow')}
                            </Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.denyButton} onPress={onDenied}>
                        <Text style={styles.denyText}>{t('permission_modal.not_now')}</Text>
                    </TouchableOpacity>

                    <Text style={styles.privacyNote}>
                        {showSettingsMode
                            ? t('permission_modal.after_enable')
                            : t('permission_modal.change_anytime')
                        }
                    </Text>
                </View>
            </View>
        </Modal>
    );
};


// Hook for checking multiple permissions
export const usePermissions = () => {
    const [permissions, setPermissions] = useState({
        camera: false,
        location: false,
        motion: false,
        notifications: false,
    });

    const checkAllPermissions = async () => {
        const cameraStatus = await Camera.getCameraPermissionsAsync();
        const locationStatus = await Location.getForegroundPermissionsAsync();
        const motionStatus = await Accelerometer.getPermissionsAsync();
        const notificationStatus = await Notifications.getPermissionsAsync();

        setPermissions({
            camera: cameraStatus.granted,
            location: locationStatus.granted,
            motion: motionStatus.granted,
            notifications: notificationStatus.granted,
        });

        return {
            camera: cameraStatus.granted,
            location: locationStatus.granted,
            motion: motionStatus.granted,
            notifications: notificationStatus.granted,
        };
    };

    return { permissions, checkAllPermissions };
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modal: {
        backgroundColor: '#0f172a',
        borderRadius: 24,
        padding: 32,
        width: '100%',
        maxWidth: 360,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    emoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 12,
        textAlign: 'center',
    },
    description: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
    },
    featureBox: {
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        borderRadius: 12,
        padding: 16,
        width: '100%',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.3)',
    },
    featureLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 4,
    },
    featureText: {
        fontSize: 16,
        color: '#06b6d4',
        fontWeight: '600',
    },
    allowButton: {
        backgroundColor: '#06b6d4',
        paddingVertical: 16,
        paddingHorizontal: 48,
        borderRadius: 12,
        width: '100%',
        alignItems: 'center',
        marginBottom: 12,
    },
    allowText: {
        color: '#020617',
        fontSize: 17,
        fontWeight: '700',
    },
    denyButton: {
        paddingVertical: 12,
    },
    denyText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 15,
    },
    privacyNote: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
        marginTop: 16,
        textAlign: 'center',
    },
});

export default PermissionModal;
