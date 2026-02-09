// Permissions Onboarding Screen - Request all permissions upfront with explanations
// REFACTORED: Now uses PermissionManager, PermissionStore, and proper native bridges
import React, { useCallback, useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    SafeAreaView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useLanguage } from '../contexts/LanguageContext';
import { OverlayBridge } from '../services/nativeBridge/OverlayBridge';
import * as overlayService from '../services/overlayService';
import { openAppSettings, openLocationSettings, openNotificationSettings } from '../services/permissionSettingsService';

// NEW: Import permission management system
import { usePermissionStore, useAllPermissions } from '../services/permissions/PermissionStore';
import { usePermissionLifecycle } from '../hooks/usePermissionLifecycle';
import type { PermissionType } from '../services/permissions/types';

// Location permission disclosure flow (Google Play compliance)
import useLocationPermission from '../hooks/useLocationPermission';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Permissions'>;

const PermissionsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [enableAllActive, setEnableAllActive] = useState(false);

    // NEW: Use permission store instead of local state
    const permissions = useAllPermissions();
    const { requestPermission } = usePermissionStore();

    // NEW: Automatic permission checking on mount and resume
    usePermissionLifecycle(true, true);

    // Background location disclosure flow (Google Play compliance)
    const {
        foregroundStatus,
        backgroundStatus,
        openBackgroundDisclosure,
        openForegroundDisclosure,
        isRequesting: isLocationRequesting,
    } = useLocationPermission();

    const openForegroundFlow = useCallback(() => {
        openForegroundDisclosure();
        navigation.navigate('PermissionDisclosure', { type: 'foreground' });
    }, [navigation, openForegroundDisclosure]);

    const openBackgroundFlow = useCallback(() => {
        openBackgroundDisclosure();
        navigation.navigate('PermissionDisclosure', { type: 'background' });
    }, [navigation, openBackgroundDisclosure]);

    // FALLBACK: Force direct overlay permission check if store shows null
    // This ensures overlay permission is always accurate on fresh install
    useEffect(() => {
        const recheckOverlay = async () => {
            if (Platform.OS !== 'android') return;

            // Only recheck if overlay permission is unknown (null)
            if (permissions.overlay.granted === null) {
                console.log('[PermissionsScreen] Overlay permission is null, forcing direct check...');
                try {
                    const granted = await overlayService.checkOverlayPermission();
                    console.log('[PermissionsScreen] Direct overlay check result:', granted);

                    // Update the store with the result
                    usePermissionStore.getState().updatePermissionStatus('overlay', {
                        granted,
                        lastChecked: Date.now(),
                        error: null,
                    });
                } catch (error) {
                    console.warn('[PermissionsScreen] Direct overlay check failed:', error);
                }
            }
        };

        // Small delay to ensure native modules are ready
        const timer = setTimeout(recheckOverlay, 500);
        return () => clearTimeout(timer);
    }, [permissions.overlay.granted]);

    // REMOVED: checkPermissions - now handled by PermissionManager + usePermissionLifecycle
    // REMOVED: AppState listener - now handled by usePermissionDetection hook
    // REMOVED: Individual request functions - now use unified requestPermission from store

    // NEW: Unified request handler using PermissionManager
    const handleRequestPermission = async (type: PermissionType): Promise<boolean> => {
        try {
            const granted = await requestPermission(type);
            return granted;
        } catch (error) {
            console.error(`Failed to request ${type}:`, error);
            return false;
        }
    };

    const openSettingsForPermission = (type: PermissionType) => {
        if (type === 'location' || type === 'backgroundLocation') {
            void openLocationSettings();
            return;
        }
        if (type === 'notifications') {
            void openNotificationSettings();
            return;
        }
        void openAppSettings();
    };

    // Enable all permissions - REFACTORED to use PermissionManager
    const advanceEnableAll = useCallback(async () => {
        if (loading) return;
        if (!enableAllActive) {
            setEnableAllActive(true);
        }

        setLoading(true);
        try {
            if (permissions.notifications.granted !== true) {
                await handleRequestPermission('notifications');
                return;
            }

            if (permissions.camera.granted !== true) {
                await handleRequestPermission('camera');
                return;
            }

            if (foregroundStatus !== 'granted') {
                if (foregroundStatus === 'blocked') {
                    openSettingsForPermission('location');
                } else {
                    openForegroundFlow();
                }
                return;
            }

            if (backgroundStatus !== 'granted') {
                if (backgroundStatus === 'blocked') {
                    openSettingsForPermission('backgroundLocation');
                } else {
                    openBackgroundFlow();
                }
                return;
            }

            if (Platform.OS === 'android' && permissions.overlay.granted !== true && !permissions.overlay.requesting) {
                await handleRequestPermission('overlay');
                return;
            }

            if (
                Platform.OS === 'android' &&
                permissions.batteryOptimization.granted !== true &&
                !permissions.batteryOptimization.requesting
            ) {
                await handleRequestPermission('batteryOptimization');
                return;
            }

            if (
                Platform.OS === 'android' &&
                permissions.exactAlarm.granted !== true &&
                !permissions.exactAlarm.requesting
            ) {
                await handleRequestPermission('exactAlarm');
                return;
            }

            if (permissions.microphone.granted !== true && !permissions.microphone.requesting) {
                await handleRequestPermission('microphone');
                return;
            }

            if (
                Platform.OS === 'android' &&
                permissions.activityRecognition.granted !== true &&
                !permissions.activityRecognition.requesting
            ) {
                await handleRequestPermission('activityRecognition');
                return;
            }

            if (Platform.OS === 'android' && permissions.overlay.granted) {
                const settings = await overlayService.getOverlaySettings();
                await overlayService.saveOverlaySettings({
                    ...settings,
                    enabled: true,
                    permissionGranted: true
                });
                await overlayService.syncSettingsToNative();
            }

            setEnableAllActive(false);
            navigation.navigate('Onboarding');
        } catch (error) {
            console.error('Failed to enable all:', error);
            setEnableAllActive(false);
            Alert.alert(t('permissions.error.title'), t('permissions.error.body'));
            navigation.navigate('Onboarding');
        } finally {
            setLoading(false);
        }
    }, [
        foregroundStatus,
        backgroundStatus,
        enableAllActive,
        loading,
        permissions.overlay.granted,
        permissions.overlay.requesting,
        permissions.batteryOptimization.granted,
        permissions.batteryOptimization.requesting,
        permissions.exactAlarm.granted,
        permissions.exactAlarm.requesting,
        permissions.microphone.granted,
        permissions.microphone.requesting,
        permissions.activityRecognition.granted,
        permissions.activityRecognition.requesting,
        permissions.notifications.granted,
        permissions.camera.granted,
        handleRequestPermission,
        navigation,
        openBackgroundFlow,
        openForegroundFlow,
        openSettingsForPermission,
    ]);

    // Skip and continue
    const skipAndContinue = () => {
        setEnableAllActive(false);
        setLoading(false);
        navigation.navigate('Onboarding');
    };

    // Check if all critical permissions are granted
    const allCriticalGranted =
        permissions.notifications.granted === true &&
        permissions.camera.granted === true &&
        foregroundStatus === 'granted';

    // Render permission card
    const PermissionCard = ({
        icon,
        titleKey,
        descKey,
        granted,
        requesting = false,
        onEnable,
        onManage,
        hidden = false
    }: {
        icon: string;
        titleKey: string;
        descKey: string;
        granted: boolean | null;
        requesting?: boolean;
        onEnable: () => void;
        onManage?: () => void;
        hidden?: boolean;
    }) => {
        if (hidden) return null;

        // Determine button state
        const isGranted = granted === true;
        const isWaiting = requesting === true;
        const handlePress = isGranted ? (onManage || onEnable) : onEnable;
        const buttonLabel = isGranted
            ? t('permissions.blocked.open_settings')
            : t('permissions.enable');

        return (
            <View style={styles.permissionCard}>
                <View style={styles.cardContent}>
                    <Text style={styles.cardIcon}>{icon}</Text>
                    <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>{t(titleKey)}</Text>
                        <Text style={styles.cardDesc}>{t(descKey)}</Text>
                    </View>
                </View>
                <TouchableOpacity
                    style={[styles.enableButton, isGranted && styles.enabledButton]}
                    onPress={handlePress}
                    disabled={isWaiting}
                >
                    {isWaiting ? (
                        <ActivityIndicator size="small" color="#06b6d4" />
                    ) : (
                        <Text style={[styles.enableButtonText, isGranted && styles.enabledButtonText]}>
                            {buttonLabel}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Background */}
            <View style={styles.backgroundGradient}>
                <View style={styles.gradientOrb1} />
                <View style={styles.gradientOrb2} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerIcon}>🔔</Text>
                    <Text style={styles.title}>{t('permissions.title')}</Text>
                    <Text style={styles.subtitle}>{t('permissions.subtitle')}</Text>
                </View>

                {/* Permission Cards */}
                <View style={styles.cardsContainer}>
                    <PermissionCard
                        icon="📱"
                        titleKey="permissions.notifications.title"
                        descKey="permissions.notifications.desc"
                        granted={permissions.notifications.granted}
                        onEnable={() => handleRequestPermission('notifications')}
                        onManage={() => openSettingsForPermission('notifications')}
                    />

                    <PermissionCard
                        icon="📷"
                        titleKey="permissions.camera.title"
                        descKey="permissions.camera.desc"
                        granted={permissions.camera.granted}
                        onEnable={() => handleRequestPermission('camera')}
                        onManage={() => openSettingsForPermission('camera')}
                    />

                    <PermissionCard
                        icon="📍"
                        titleKey="permissions.location.title"
                        descKey="permissions.location.desc"
                        granted={foregroundStatus === 'granted'}
                        requesting={isLocationRequesting && foregroundStatus !== 'granted'}
                        onEnable={openForegroundFlow}
                        onManage={() => openSettingsForPermission('location')}
                    />

                    {/* Background Location - Only show when foreground is granted (Google Play compliance) */}
                    <PermissionCard
                        icon="🌙"
                        titleKey="permissions.backgroundLocation.title"
                        descKey="permissions.backgroundLocation.desc"
                        granted={backgroundStatus === 'granted'}
                        requesting={isLocationRequesting && backgroundStatus !== 'granted'}
                        onEnable={() => {
                            if (foregroundStatus !== 'granted') {
                                openForegroundFlow();
                                return;
                            }
                            openBackgroundFlow();
                        }}
                        onManage={() => openSettingsForPermission('backgroundLocation')}
                    />

                    <PermissionCard
                        icon="🪟"
                        titleKey="permissions.overlay.title"
                        descKey="permissions.overlay.desc"
                        granted={permissions.overlay.granted}
                        requesting={permissions.overlay.requesting}
                        onEnable={() => handleRequestPermission('overlay')}
                        hidden={Platform.OS !== 'android'}
                        onManage={() => openSettingsForPermission('overlay')}
                    />

                    <PermissionCard
                        icon="🔋"
                        titleKey="permissions.battery.title"
                        descKey="permissions.battery.desc"
                        granted={permissions.batteryOptimization.granted}
                        requesting={permissions.batteryOptimization.requesting}
                        onEnable={() => handleRequestPermission('batteryOptimization')}
                        hidden={Platform.OS !== 'android'}
                        onManage={() => openSettingsForPermission('batteryOptimization')}
                    />

                    <PermissionCard
                        icon="⏰"
                        titleKey="permissions.exactAlarm.title"
                        descKey="permissions.exactAlarm.desc"
                        granted={permissions.exactAlarm.granted}
                        requesting={permissions.exactAlarm.requesting}
                        onEnable={() => handleRequestPermission('exactAlarm')}
                        hidden={Platform.OS !== 'android'}
                        onManage={() => openSettingsForPermission('exactAlarm')}
                    />

                    <PermissionCard
                        icon="🎤"
                        titleKey="permissions.microphone.title"
                        descKey="permissions.microphone.desc"
                        granted={permissions.microphone.granted}
                        requesting={permissions.microphone.requesting}
                        onEnable={() => handleRequestPermission('microphone')}
                        onManage={() => openSettingsForPermission('microphone')}
                    />

                    <PermissionCard
                        icon="🏃"
                        titleKey="permissions.activity.title"
                        descKey="permissions.activity.desc"
                        granted={permissions.activityRecognition.granted}
                        requesting={permissions.activityRecognition.requesting}
                        onEnable={() => handleRequestPermission('activityRecognition')}
                        hidden={Platform.OS !== 'android'}
                        onManage={() => openSettingsForPermission('activityRecognition')}
                    />

                </View>

                {/* Action Buttons */}
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={advanceEnableAll}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        {loading ? (
                            <ActivityIndicator color="#020617" />
                        ) : (
                            <Text style={styles.primaryButtonText}>
                                {enableAllActive || allCriticalGranted ? t('permissions.continue') : t('permissions.enableAll')}
                            </Text>
                        )}
                    </TouchableOpacity>
                    <Text style={styles.stepHint}>{t('permissions.step_hint')}</Text>

                    <TouchableOpacity
                        style={styles.skipButton}
                        onPress={skipAndContinue}
                        activeOpacity={0.6}
                    >
                        <Text style={styles.skipButtonText}>{t('permissions.skip')}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    backgroundGradient: {
        position: 'absolute',
        width: '100%',
        height: '100%',
    },
    gradientOrb1: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        top: -100,
        right: -100,
    },
    gradientOrb2: {
        position: 'absolute',
        width: 250,
        height: 250,
        borderRadius: 125,
        backgroundColor: 'rgba(20, 184, 166, 0.1)',
        bottom: 100,
        left: -80,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 40,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    headerIcon: {
        fontSize: 56,
        marginBottom: 16,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#ffffff',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        paddingHorizontal: 16,
    },
    cardsContainer: {
        flex: 1,
    },
    permissionCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    cardIcon: {
        fontSize: 28,
        marginRight: 14,
    },
    cardText: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 4,
    },
    cardDesc: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.6)',
        lineHeight: 18,
    },
    enableButton: {
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.3)',
        alignItems: 'center',
    },
    enabledButton: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: 'rgba(16, 185, 129, 0.4)',
    },
    enableButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#06b6d4',
    },
    enabledButtonText: {
        color: '#10b981',
    },
    buttonContainer: {
        marginTop: 24,
    },
    stepHint: {
        marginTop: 10,
        textAlign: 'center',
        color: 'rgba(226, 232, 240, 0.65)',
        fontSize: 12,
    },
    primaryButton: {
        backgroundColor: '#06b6d4',
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        shadowColor: '#06b6d4',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 6,
    },
    primaryButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#020617',
    },
    skipButton: {
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 12,
    },
    skipButtonText: {
        fontSize: 14,
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.5)',
    },
});

export default PermissionsScreen;
