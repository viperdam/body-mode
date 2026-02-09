import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    ActivityIndicator,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useLanguage } from '../contexts/LanguageContext';
import { healthConnectService } from '../services/healthConnectService';
import { healthConsentService } from '../services/healthConsentService';
import healthSyncService from '../services/healthSyncService';

type PermissionStatus = {
    recordType: string;
    granted: boolean;
};

const RECORD_TYPES: string[] = [
    'HeartRateVariabilityRmssd',
    'RestingHeartRate',
    'OxygenSaturation',
    'BodyTemperature',
    'BasalBodyTemperature',
    'RespiratoryRate',
    'Vo2Max',
    'BloodGlucose',
    'BasalMetabolicRate',
    'BodyFat',
    'Weight',
    'Hydration',
    'Nutrition',
    'ExerciseSession',
    'MenstruationFlow',
    'MenstruationPeriod',
    'SleepSession',
    'Steps',
    'Distance',
    'ActiveCaloriesBurned',
    'HeartRate',
];

const RECORD_TYPE_LABELS: Record<string, string> = {
    HeartRateVariabilityRmssd: 'HRV (RMSSD)',
    RestingHeartRate: 'Resting Heart Rate',
    OxygenSaturation: 'SpO2',
    BodyTemperature: 'Body Temperature',
    BasalBodyTemperature: 'Basal Body Temperature',
    RespiratoryRate: 'Respiratory Rate',
    Vo2Max: 'VO2 Max',
    BloodGlucose: 'Blood Glucose',
    BasalMetabolicRate: 'Basal Metabolic Rate',
    BodyFat: 'Body Fat',
    Weight: 'Weight',
    Hydration: 'Hydration',
    Nutrition: 'Nutrition',
    ExerciseSession: 'Exercise Sessions',
    MenstruationFlow: 'Menstruation Flow',
    MenstruationPeriod: 'Menstruation Period',
    SleepSession: 'Sleep',
    Steps: 'Steps',
    Distance: 'Distance',
    ActiveCaloriesBurned: 'Active Calories',
    HeartRate: 'Heart Rate',
};

const formatRecordLabel = (recordType: string): string => {
    return RECORD_TYPE_LABELS[recordType]
        || recordType.replace(/([a-z])([A-Z])/g, '$1 $2');
};

const HealthConnectDiagnosticsScreen: React.FC = () => {
    const navigation = useNavigation();
    const { t, language } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [reconnectLoading, setReconnectLoading] = useState(false);
    const [status, setStatus] = useState<{
        available: boolean;
        sdkStatus?: number | null;
        permissionsCount: number;
        lastCheckedAt?: number;
    } | null>(null);
    const [permissions, setPermissions] = useState<PermissionStatus[]>([]);

    const healthConnectNeedsUpdate = Platform.OS === 'android' && status?.sdkStatus === 2;

    const healthConnectStatusLabel = (() => {
        if (!status || Platform.OS !== 'android') return t('settings.health_connect.status_unknown');
        switch (status.sdkStatus) {
            case 3:
                return t('settings.health_connect.status_available');
            case 2:
                return t('settings.health_connect.status_update');
            case 1:
                return t('settings.health_connect.status_unavailable');
            default:
                return t('settings.health_connect.status_unknown');
        }
    })();

    const loadStatus = useCallback(async () => {
        if (Platform.OS !== 'android') {
            setLoading(false);
            return;
        }

        try {
            const sdkStatus = await healthConnectService.getSdkStatus();
            const available = await healthConnectService.initialize();
            const granted = await healthConnectService.getGrantedPermissions();
            const grantedSet = new Set(
                Array.isArray(granted)
                    ? granted
                        .filter((perm: any) => perm?.accessType === 'read' && typeof perm?.recordType === 'string')
                        .map((perm: any) => perm.recordType)
                    : []
            );

            const permissionStates = RECORD_TYPES.map((recordType) => ({
                recordType,
                granted: grantedSet.has(recordType),
            }));

            setPermissions(permissionStates);
            setStatus({
                available,
                sdkStatus,
                permissionsCount: grantedSet.size,
                lastCheckedAt: Date.now(),
            });
        } catch (error) {
            console.warn('[HealthConnectDiagnostics] Failed to load status:', error);
            setStatus({
                available: false,
                sdkStatus: healthConnectService.getCachedSdkStatus?.() ?? null,
                permissionsCount: 0,
                lastCheckedAt: Date.now(),
            });
            setPermissions(RECORD_TYPES.map((recordType) => ({ recordType, granted: false })));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [language, t]);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    const handleOpenHealthConnect = useCallback(() => {
        if (Platform.OS !== 'android') return;
        void healthConnectService.openHealthConnectSettings();
    }, []);

    const handleUpdateHealthConnect = useCallback(() => {
        if (Platform.OS !== 'android') return;
        void healthConnectService.openHealthConnectUpdate();
    }, []);

    const handleReconnect = useCallback(async () => {
        if (Platform.OS !== 'android') return;
        if (reconnectLoading) return;
        setReconnectLoading(true);
        try {
            const hasConsent = await healthConsentService.hasConsent();
            if (!hasConsent) {
                Alert.alert(
                    t('settings.health_connect.consent_required_title'),
                    t('settings.health_connect.consent_required_body')
                );
                return;
            }

            const sdkStatus = await healthConnectService.getSdkStatus();
            if (sdkStatus === 2) {
                await healthConnectService.openHealthConnectUpdate();
                return;
            }

            const available = await healthConnectService.initialize();
            if (!available) {
                Alert.alert(t('alert.error'), t('errors.health_connect.not_available'));
                return;
            }

            const granted = await healthConnectService.requestPermissions();
            await loadStatus();

            if (granted) {
                try {
                    const { healthService } = require('../services/healthService');
                    const hasAny = await healthConnectService.hasAnyPermission(true);
                    if (hasAny) {
                        await healthService.setPreferredProvider('healthConnect');
                    }
                } catch (error) {
                    console.warn('[HealthConnectDiagnostics] Failed to persist provider:', error);
                }
                Alert.alert(
                    t('settings.health_connect.reconnect_success_title'),
                    t('settings.health_connect.reconnect_success_body')
                );

                if (!healthSyncService.isHealthSyncEnabled()) {
                    Alert.alert(
                        t('settings.health_connect.enable_sync_title'),
                        t('settings.health_connect.enable_sync_body'),
                        [
                            { text: t('cancel'), style: 'cancel' },
                            {
                                text: t('settings.health_connect.enable_sync_action'),
                                onPress: async () => {
                                    try {
                                        await healthSyncService.enable();
                                    } catch (error) {
                                        console.warn('[HealthConnectDiagnostics] Failed to enable health sync:', error);
                                    }
                                },
                            },
                        ]
                    );
                }
            } else {
                Alert.alert(
                    t('settings.health_connect.reconnect_failed_title'),
                    t('settings.health_connect.reconnect_failed_body')
                );
            }
        } catch (error) {
            console.warn('[HealthConnectDiagnostics] Reconnect failed:', error);
            Alert.alert(
                t('settings.health_connect.reconnect_failed_title'),
                t('settings.health_connect.reconnect_failed_body')
            );
        } finally {
            setReconnectLoading(false);
        }
    }, [reconnectLoading, loadStatus, t]);

    const permissionsSummary = status?.permissionsCount ?? 0;
    const connectionLabel = permissionsSummary > 0
        ? t('settings.health_connect.diagnostics_connected')
        : t('settings.health_connect.diagnostics_not_connected');

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{t('settings.health_connect.diagnostics_title')}</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            loadStatus();
                        }}
                        tintColor="#ffffff"
                    />
                }
            >
                <Text style={styles.subtitle}>{t('settings.health_connect.diagnostics_desc')}</Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('settings.health_connect.diagnostics_status_title')}</Text>
                    {loading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                        <>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.health_connect.diagnostics_sdk_label')}</Text>
                                <Text style={styles.value}>{healthConnectStatusLabel}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.health_connect.diagnostics_connection_label')}</Text>
                                <Text style={styles.value}>{connectionLabel}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.health_connect.permissions_label')}</Text>
                                <Text style={styles.value}>
                                    {t('settings.health_connect.permissions_count', { count: permissionsSummary })}
                                </Text>
                            </View>
                            {status?.lastCheckedAt && (
                                <Text style={styles.muted}>
                                    {t('settings.health_connect.diagnostics_updated', {
                                        date: new Date(status.lastCheckedAt).toLocaleString(language),
                                    })}
                                </Text>
                            )}
                        </>
                    )}
                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.button} onPress={handleOpenHealthConnect}>
                            <Text style={styles.buttonText}>{t('settings.health_connect.connect_button')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.button}
                            onPress={handleReconnect}
                            disabled={reconnectLoading}
                        >
                            {reconnectLoading ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <Text style={styles.buttonText}>{t('settings.health_connect.reconnect_button')}</Text>
                            )}
                        </TouchableOpacity>
                        {healthConnectNeedsUpdate && (
                            <TouchableOpacity style={[styles.button, styles.warningButton]} onPress={handleUpdateHealthConnect}>
                                <Text style={[styles.buttonText, styles.warningButtonText]}>
                                    {t('settings.health_connect.update_button')}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('settings.health_connect.diagnostics_permissions_title')}</Text>
                    {permissions.map((item) => (
                        <View key={item.recordType} style={styles.permissionRow}>
                            <Text style={styles.permissionLabel}>{formatRecordLabel(item.recordType)}</Text>
                            <Text style={item.granted ? styles.permissionGranted : styles.permissionMissing}>
                                {item.granted
                                    ? t('settings.health_connect.diagnostics_granted')
                                    : t('settings.health_connect.diagnostics_missing')}
                            </Text>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#0b0f1f',
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 6,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    backText: {
        fontSize: 22,
        color: '#ffffff',
        marginTop: -2,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ffffff',
        letterSpacing: 0.3,
    },
    headerSpacer: {
        width: 36,
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 32,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        marginBottom: 16,
    },
    card: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 12,
        letterSpacing: 0.3,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    label: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
    },
    value: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '600',
    },
    muted: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 11,
        marginTop: 4,
    },
    actions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
    },
    button: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    buttonText: {
        fontSize: 12,
        color: '#ffffff',
        fontWeight: '600',
    },
    warningButton: {
        backgroundColor: 'rgba(251,191,36,0.18)',
    },
    warningButtonText: {
        color: '#fbbf24',
    },
    permissionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    permissionLabel: {
        color: '#ffffff',
        fontSize: 12,
        flex: 1,
        paddingRight: 12,
    },
    permissionGranted: {
        color: '#22c55e',
        fontSize: 12,
        fontWeight: '600',
    },
    permissionMissing: {
        color: '#f97316',
        fontSize: 12,
        fontWeight: '600',
    },
});

export default HealthConnectDiagnosticsScreen;
