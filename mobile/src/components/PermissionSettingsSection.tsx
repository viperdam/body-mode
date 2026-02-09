import React, { useCallback } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLanguage } from '../contexts/LanguageContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { usePermissionStore, useAllPermissions } from '../services/permissions/PermissionStore';
import { usePermissionLifecycle } from '../hooks/usePermissionLifecycle';
import useLocationPermission from '../hooks/useLocationPermission';
import { openAppSettings, openLocationSettings, openNotificationSettings } from '../services/permissionSettingsService';
import { BackgroundBridge } from '../services/nativeBridge/BackgroundBridge';
import { getPermissionImportance } from '../services/permissions/types';
import type { PermissionType } from '../services/permissions/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface PermissionSettingsSectionProps {
    showHeader?: boolean;
}

const PermissionSettingsSection: React.FC<PermissionSettingsSectionProps> = ({ showHeader = true }) => {
    const { t } = useLanguage();
    const navigation = useNavigation<NavigationProp>();
    const permissions = useAllPermissions();
    const { requestPermission } = usePermissionStore();

    usePermissionLifecycle(true, false);

    const {
        foregroundStatus,
        backgroundStatus,
        isRequesting: isLocationRequesting,
    } = useLocationPermission();

    const supportsExactAlarm = Platform.OS === 'android' && (
        typeof Platform.Version !== 'number' || Platform.Version >= 31
    );

    const openDisclosureScreen = useCallback(
        (type: 'foreground' | 'background') => {
            navigation.navigate('PermissionDisclosure', { type });
        },
        [navigation]
    );

    const handleRequestPermission = useCallback(
        async (type: PermissionType): Promise<void> => {
            try {
                await requestPermission(type);
            } catch (error) {
                console.warn(`[Permissions] Failed to request ${type}:`, error);
            }
        },
        [requestPermission]
    );

    const openSettingsForPermission = useCallback((type: PermissionType) => {
        if (type === 'location' || type === 'backgroundLocation') {
            void openLocationSettings();
            return;
        }
        if (type === 'notifications') {
            void openNotificationSettings();
            return;
        }
        if (type === 'exactAlarm') {
            void BackgroundBridge.requestExactAlarmPermission();
            return;
        }
        void openAppSettings();
    }, []);

    const PermissionCard = ({
        icon,
        titleKey,
        descKey,
        granted,
        requesting = false,
        onEnable,
        onManage,
        hidden = false,
        type,
    }: {
        icon: string;
        titleKey: string;
        descKey: string;
        granted: boolean | null;
        requesting?: boolean;
        onEnable: () => void;
        onManage?: () => void;
        hidden?: boolean;
        type: PermissionType;
    }) => {
        if (hidden) return null;

        const isGranted = granted === true;
        const isWaiting = requesting === true;
        const handlePress = isGranted ? (onManage || onEnable) : onEnable;
        const buttonLabel = isGranted ? t('permissions.blocked.open_settings') : t('permissions.enable');
        const importance = getPermissionImportance(type);
        const badgeKey = isGranted
            ? 'permissions.badge.enabled'
            : importance === 'critical'
                ? 'permissions.badge.required'
                : importance === 'recommended'
                    ? 'permissions.badge.recommended'
                    : 'permissions.badge.optional';
        const badgeStyle = isGranted
            ? styles.badgeEnabled
            : importance === 'critical'
                ? styles.badgeRequired
                : importance === 'recommended'
                    ? styles.badgeRecommended
                    : styles.badgeOptional;

        return (
            <View style={styles.permissionCard}>
                <View style={styles.cardContent}>
                    <Text style={styles.cardIcon}>{icon}</Text>
                    <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>{t(titleKey)}</Text>
                        <Text style={styles.cardDesc}>{t(descKey)}</Text>
                    </View>
                    <View style={[styles.badge, badgeStyle]}>
                        <Text style={styles.badgeText}>{t(badgeKey)}</Text>
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
        <View style={styles.section}>
            {showHeader && (
                <>
                    <Text style={styles.sectionTitle}>{t('permissions.title')}</Text>
                    <Text style={styles.sectionSubtitle}>{t('permissions.subtitle')}</Text>
                </>
            )}
            <View style={styles.legendContainer}>
                <Text style={styles.legendTitle}>{t('permissions.legend.title')}</Text>
                <View style={styles.legendRow}>
                    <View style={[styles.badge, styles.badgeRequired]}>
                        <Text style={styles.badgeText}>{t('permissions.legend.required')}</Text>
                    </View>
                    <View style={[styles.badge, styles.badgeRecommended]}>
                        <Text style={styles.badgeText}>{t('permissions.legend.recommended')}</Text>
                    </View>
                    <View style={[styles.badge, styles.badgeOptional]}>
                        <Text style={styles.badgeText}>{t('permissions.legend.optional')}</Text>
                    </View>
                    <View style={[styles.badge, styles.badgeEnabled]}>
                        <Text style={styles.badgeText}>{t('permissions.legend.enabled')}</Text>
                    </View>
                </View>
            </View>
            <View style={styles.cardsContainer}>
                <PermissionCard
                    icon="📱"
                    titleKey="permissions.notifications.title"
                    descKey="permissions.notifications.desc"
                    granted={permissions.notifications.granted}
                    onEnable={() => void handleRequestPermission('notifications')}
                    onManage={() => openSettingsForPermission('notifications')}
                    type="notifications"
                />
                <PermissionCard
                    icon="📷"
                    titleKey="permissions.camera.title"
                    descKey="permissions.camera.desc"
                    granted={permissions.camera.granted}
                    onEnable={() => void handleRequestPermission('camera')}
                    onManage={() => openSettingsForPermission('camera')}
                    type="camera"
                />
                <PermissionCard
                    icon="🎤"
                    titleKey="permissions.microphone.title"
                    descKey="permissions.microphone.desc"
                    granted={permissions.microphone.granted}
                    requesting={permissions.microphone.requesting}
                    onEnable={() => void handleRequestPermission('microphone')}
                    onManage={() => openSettingsForPermission('microphone')}
                    type="microphone"
                />
                <PermissionCard
                    icon="📍"
                    titleKey="permissions.location.title"
                    descKey="permissions.location.desc"
                    granted={foregroundStatus === 'granted'}
                    requesting={isLocationRequesting && foregroundStatus !== 'granted'}
                    onEnable={() => openDisclosureScreen('foreground')}
                    onManage={() => openSettingsForPermission('location')}
                    type="location"
                />
                <PermissionCard
                    icon="🌙"
                    titleKey="permissions.backgroundLocation.title"
                    descKey="permissions.backgroundLocation.desc"
                    granted={backgroundStatus === 'granted'}
                    requesting={isLocationRequesting && backgroundStatus !== 'granted'}
                    onEnable={() => {
                        if (foregroundStatus !== 'granted') {
                            openDisclosureScreen('foreground');
                            return;
                        }
                        openDisclosureScreen('background');
                    }}
                    onManage={() => openSettingsForPermission('backgroundLocation')}
                    type="backgroundLocation"
                />
                <PermissionCard
                    icon="🏃"
                    titleKey="permissions.activityRecognition.title"
                    descKey="permissions.activityRecognition.desc"
                    granted={permissions.activityRecognition.granted}
                    requesting={permissions.activityRecognition.requesting}
                    onEnable={() => void handleRequestPermission('activityRecognition')}
                    onManage={() => openSettingsForPermission('activityRecognition')}
                    hidden={Platform.OS !== 'android'}
                    type="activityRecognition"
                />
                <PermissionCard
                    icon="🪟"
                    titleKey="permissions.overlay.title"
                    descKey="permissions.overlay.desc"
                    granted={permissions.overlay.granted}
                    requesting={permissions.overlay.requesting}
                    onEnable={() => void handleRequestPermission('overlay')}
                    onManage={() => openSettingsForPermission('overlay')}
                    hidden={Platform.OS !== 'android'}
                    type="overlay"
                />
                <PermissionCard
                    icon="🔋"
                    titleKey="permissions.battery.title"
                    descKey="permissions.battery.desc"
                    granted={permissions.batteryOptimization.granted}
                    requesting={permissions.batteryOptimization.requesting}
                    onEnable={() => void handleRequestPermission('batteryOptimization')}
                    onManage={() => openSettingsForPermission('batteryOptimization')}
                    hidden={Platform.OS !== 'android'}
                    type="batteryOptimization"
                />
                <PermissionCard
                    icon="⏰"
                    titleKey="permissions.exactAlarm.title"
                    descKey="permissions.exactAlarm.desc"
                    granted={permissions.exactAlarm.granted}
                    requesting={permissions.exactAlarm.requesting}
                    onEnable={() => void handleRequestPermission('exactAlarm')}
                    onManage={() => openSettingsForPermission('exactAlarm')}
                    hidden={!supportsExactAlarm}
                    type="exactAlarm"
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#f8fafc',
        marginBottom: 6,
    },
    sectionSubtitle: {
        fontSize: 12,
        color: 'rgba(248, 250, 252, 0.6)',
        marginBottom: 12,
    },
    legendContainer: {
        marginBottom: 12,
        gap: 6,
    },
    legendTitle: {
        fontSize: 11,
        color: 'rgba(148, 163, 184, 0.8)',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    legendRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    cardsContainer: {
        gap: 12,
    },
    permissionCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.2)',
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    cardIcon: {
        fontSize: 22,
    },
    cardText: {
        flex: 1,
    },
    cardTitle: {
        color: '#f8fafc',
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 4,
    },
    cardDesc: {
        color: 'rgba(148, 163, 184, 0.9)',
        fontSize: 12,
        lineHeight: 16,
    },
    enableButton: {
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.4)',
    },
    badge: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 999,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: '#f8fafc',
    },
    badgeEnabled: {
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        borderColor: 'rgba(34, 197, 94, 0.5)',
    },
    badgeRequired: {
        backgroundColor: 'rgba(248, 113, 113, 0.15)',
        borderColor: 'rgba(248, 113, 113, 0.5)',
    },
    badgeRecommended: {
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        borderColor: 'rgba(56, 189, 248, 0.5)',
    },
    badgeOptional: {
        backgroundColor: 'rgba(148, 163, 184, 0.15)',
        borderColor: 'rgba(148, 163, 184, 0.5)',
    },
    enableButtonText: {
        color: '#06b6d4',
        fontWeight: '600',
        fontSize: 13,
    },
    enabledButton: {
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        borderColor: 'rgba(34, 197, 94, 0.4)',
    },
    enabledButtonText: {
        color: '#22c55e',
    },
});

export default PermissionSettingsSection;
