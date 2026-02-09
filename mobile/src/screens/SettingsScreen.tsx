// Full Settings Screen with data export/import and configuration
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet,
    SafeAreaView, Alert, Share, Switch, ActivityIndicator, Platform, AppState, Linking, Modal
} from 'react-native';
import { TouchableOpacity, ScrollView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import storage, { isDateKey, setWaterAmountForDate } from '../services/storageService';
import userProfileService from '../services/userProfileService';
import authService from '../services/authService';
import cloudSyncService, { type CloudSyncStatus } from '../services/cloudSyncService';
import { analytics } from '../services/analyticsService';
import settingsSyncService from '../services/settingsSyncService';
import firestoreService from '../services/firestoreService';
import firebaseService from '../services/firebaseService';
import accountService from '../services/accountService';
import {
    UserProfile, FoodLogEntry, MoodLog, WeightLogEntry, ActivityLogEntry,
    DailyPlan, Language, NotificationPlanMode,
    OverlaySettings, DEFAULT_OVERLAY_SETTINGS, OVERLAY_MODE_PRESETS, OverlayReminderTypes,
    AutoSleepSettings, DEFAULT_AUTO_SLEEP_SETTINGS, AUTO_SLEEP_SENSITIVITY_PRESETS,
    BioContextConfig, DEFAULT_BIO_CONTEXT_CONFIG, BodyProgressSettings
} from '../types';
import * as Clipboard from 'expo-clipboard';
import { useLanguage, AVAILABLE_LANGUAGES } from '../contexts/LanguageContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { clearNotificationType, requestNotificationPermission, scheduleNightlyWrapUpReminder, schedulePlanNotifications } from '../services/notificationService';
import { getLocalDateKey } from '../utils/dateUtils';
import locationService from '../services/locationService';
import { getPendingLocationSave, savePendingLocationAs, clearPendingLocationSave } from '../services/locationOverlayService';
import * as Location from 'expo-location';
import * as overlayService from '../services/overlayService';
import { sleepService } from '../services/sleepService';
import { userAdaptiveService } from '../services/userAdaptiveService';
import healthSyncService from '../services/healthSyncService';
import { healthIngestService } from '../services/healthIngestService';
import { healthService } from '../services/healthService';
import { healthConsentService, type HealthConsentRecord } from '../services/healthConsentService';
import { healthConnectService } from '../services/healthConnectService';
import { bioSnapshotService } from '../services/bioSnapshotService';
import { bodyProgressService } from '../services/bodyProgressService';
import bodyPhotoConsentService, { type BodyPhotoConsentRecord } from '../services/bodyPhotoConsentService';
import { permissionManager } from '../services/permissions/PermissionManager';
import { getHistorySummary as getContextHistorySummary, pruneHistoryNow } from '../services/contextHistoryService';
import { getRecentSignalSnapshots, pruneSignalHistoryNow } from '../services/contextSignalHistoryService';
import { getSensorHealth } from '../services/contextReliabilityService';
import type { ContextSnapshot } from '../services/contextTypes';
import contextCorrectionService from '../services/contextCorrectionService';
import { getContextPolicy, updateContextPolicy, type ContextPolicy } from '../services/contextPolicyService';
import { exportContextDiagnostics } from '../services/contextDiagnosticsService';
import { clearContextData } from '../services/contextDataService';
import { LEGAL_LINKS } from '../constants/legal';
import { clearLegalAcceptance, getStoredLegalAcceptance, subscribeLegalAcceptance, type LegalAcceptance } from '../services/legalService';
import PermissionSettingsSection from '../components/PermissionSettingsSection';
import { openLocationSettings } from '../services/permissionSettingsService';

// Background location disclosure flow (Google Play compliance)
import useLocationPermission from '../hooks/useLocationPermission';
import backgroundLocationService from '../services/backgroundLocationService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;
type PendingLocationSave = { coords: { lat: number; lng: number }; timestamp?: number };
type AdaptivePolicy = {
    suppressedTypes: string[];
    suppressedHours: number[];
    preferredHours: number[];
};
type LocationLabel = 'home' | 'work' | 'gym' | 'custom' | 'other';

const createEmptyAdaptivePolicy = (): AdaptivePolicy => ({
    suppressedTypes: [],
    suppressedHours: [],
    preferredHours: [],
});

const SettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const { language, setLanguage, t } = useLanguage();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [authSnapshot, setAuthSnapshot] = useState({
        isAnonymous: authService.isAnonymous(),
        email: authService.getEmail(),
        providers: authService.getProviderIds(),
    });
    const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus | null>(null);
    const [cloudSyncing, setCloudSyncing] = useState(false);
    const [cloudRestoring, setCloudRestoring] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [pendingAuthDelete, setPendingAuthDelete] = useState(false);
    const [dataStats, setDataStats] = useState({
        foodLogs: 0,
        moodLogs: 0,
        weightLogs: 0,
        activityLogs: 0,
    });
    const [showLanguagePicker, setShowLanguagePicker] = useState(false);
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        account: true,
        premium: true,
        preferences: true,
        health: false,
        location: false,
        permissions: false,
        overlay: true,
        autoSleep: true,
        adaptive: false,
        data: false,
        about: false,
        developer: false,
        danger: false,
    });

    // Settings state
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [notificationPlanMode, setNotificationPlanMode] = useState<NotificationPlanMode>('high');
    const [darkMode, setDarkMode] = useState(true);
    const [useMetric, setUseMetric] = useState(true);
    const [contextSensingEnabled, setContextSensingEnabled] = useState(true);
    const [environmentSensingEnabled, setEnvironmentSensingEnabled] = useState(true);
    const [networkMonitoringEnabled, setNetworkMonitoringEnabled] = useState(true);
    const [adRechargeOnWake, setAdRechargeOnWake] = useState(false);
    const [adRechargeOnBackground, setAdRechargeOnBackground] = useState(false);
    const [healthEnabled, setHealthEnabled] = useState(false);
    const [healthAvailable, setHealthAvailable] = useState(true);
    const [healthSyncLoading, setHealthSyncLoading] = useState(false);
    const [healthReconnectLoading, setHealthReconnectLoading] = useState(false);
    const [healthConsent, setHealthConsent] = useState<HealthConsentRecord | null>(null);
    const [healthPreferredProvider, setHealthPreferredProvider] = useState<'healthConnect' | 'googleFit' | null>(null);
    const [healthConnectStatus, setHealthConnectStatus] = useState<{
        available: boolean;
        sdkStatus?: number | null;
        permissionsCount: number;
        lastCheckedAt?: number;
    } | null>(null);
    const [healthIngestStatus, setHealthIngestStatus] = useState<{
        lastAttemptAt?: number;
        lastSuccessAt?: number;
        lastSnapshotAt?: number;
        lastError?: string;
        lastErrorAt?: number;
        lastTrigger?: string;
        lastSampleCount?: number;
        consecutiveFailures?: number;
    } | null>(null);
    const [healthIngestLoading, setHealthIngestLoading] = useState(false);
    const [contextStatusLoading, setContextStatusLoading] = useState(false);
    const [contextStatus, setContextStatus] = useState<{
        lastUpdatedAt?: number;
        state?: string;
        environment?: string;
        confidence?: number;
        pollTier?: string;
        conflicts?: string[];
        avgConfidence?: number;
        conflictRate?: number;
        sensorHealth?: Record<string, { state: string; failures: number; successes: number }>;
    } | null>(null);
    const [contextPolicy, setContextPolicy] = useState<ContextPolicy | null>(null);
    const [contextPolicyLoading, setContextPolicyLoading] = useState(false);
    const [showContextCorrection, setShowContextCorrection] = useState(false);
    const [contextCorrectionState, setContextCorrectionState] = useState<ContextSnapshot['state'] | null>(null);
    const [contextCorrectionLocation, setContextCorrectionLocation] = useState<string | null>(null);
    const [bioConfig, setBioConfig] = useState<BioContextConfig>(DEFAULT_BIO_CONTEXT_CONFIG);
    const [bodyProgressSettings, setBodyProgressSettings] = useState<BodyProgressSettings | null>(null);
    const [bodyPhotoConsent, setBodyPhotoConsent] = useState<BodyPhotoConsentRecord | null>(null);
    const [bodyProgressLoading, setBodyProgressLoading] = useState(false);

    // Location state
    const [savedLocations, setSavedLocations] = useState<Record<string, any>>({});
    const [pendingLocationSave, setPendingLocationSave] = useState<PendingLocationSave | null>(null);
    const [pendingLocationLabel, setPendingLocationLabel] = useState<LocationLabel | null>(null);
    const [legalAcceptance, setLegalAcceptance] = useState<LegalAcceptance | null>(null);

    // Overlay settings state
    const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(DEFAULT_OVERLAY_SETTINGS);
    const [showOverlayDetails, setShowOverlayDetails] = useState(false);
    const overlaySettingsRef = React.useRef(overlaySettings);
    const isAndroid = Platform.OS === 'android';
    const overlayTypes = overlaySettings.types ?? DEFAULT_OVERLAY_SETTINGS.types;
    const resolvedHealthProvider = Platform.OS === 'ios'
        ? 'appleHealth'
        : (healthPreferredProvider ?? 'healthConnect');
    const healthProviderLabel = Platform.OS === 'ios'
        ? t('settings.health.provider.apple')
        : resolvedHealthProvider === 'googleFit'
            ? t('settings.health.provider.google_fit')
            : t('settings.health.provider.health_connect');
    const healthConnectNeedsUpdate = isAndroid && healthConnectStatus?.sdkStatus === 2;
    const healthConnectStatusLabel = (() => {
        if (!healthConnectStatus || !isAndroid) return t('settings.health_connect.status_unknown');
        switch (healthConnectStatus.sdkStatus) {
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
    const healthConnectPermissionsLabel = healthConnectStatus
        ? t('settings.health_connect.permissions_count', { count: healthConnectStatus.permissionsCount })
        : t('settings.health_connect.permissions_unknown');
    const healthConnectStatusValueStyle = healthConnectNeedsUpdate
        ? [styles.valueText, styles.healthConnectStatusWarning]
        : styles.valueText;
    const healthIngestPermissionsLabel = isAndroid
        ? healthConnectPermissionsLabel
        : t('settings.health_sync_status.permissions_na');
    const healthIngestLastTriggerLabel = healthIngestStatus?.lastTrigger
        ? String(healthIngestStatus.lastTrigger)
        : t('settings.health_sync_status.no_data');
    const healthIngestSampleLabel = typeof healthIngestStatus?.lastSampleCount === 'number'
        ? String(healthIngestStatus?.lastSampleCount)
        : t('settings.health_sync_status.no_data');
    const effectiveContextPolicy: ContextPolicy = contextPolicy || {
        contextHistoryEnabled: true,
        contextSignalHistoryEnabled: true,
        contextLearningEnabled: true,
        contextDiagnosticsEnabled: true,
        contextHistoryDays: 2,
        contextSignalHistoryHours: 48,
        contextPrivacyMode: 'standard',
    };
    const contextPrivacyLabel = effectiveContextPolicy.contextPrivacyMode === 'minimal'
        ? t('settings.context_privacy.mode_minimal')
        : t('settings.context_privacy.mode_standard');
    const bodyProgressNextScanLabel = bodyProgressSettings?.nextScanDue
        ? new Date(bodyProgressSettings.nextScanDue).toLocaleDateString(language)
        : t('body_progress.next_scan_unknown');
    const bodyProgressConsentLabel = bodyPhotoConsent?.granted
        ? t('body_progress.consent.granted_title')
        : t('body_progress.consent.required_title');
    const formatContextTokenFallback = (raw: string): string =>
        raw
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
    const translateContextValue = (prefix: string, raw?: string): string | null => {
        if (!raw) return null;
        const normalized = raw.trim().toLowerCase();
        if (!normalized) return null;
        const key = `${prefix}.${normalized}`;
        const translated = t(key);
        return translated !== key ? translated : formatContextTokenFallback(normalized);
    };
    const translateContextState = (raw?: string): string => {
        if (!raw) return t('settings.context_status.no_data');
        return translateContextValue('settings.context_correction', raw) ?? t('settings.context_status.no_data');
    };
    const translateContextEnvironment = (raw?: string): string => {
        if (!raw) return t('settings.context_status.no_data');
        return (
            translateContextValue('settings.context_status.environment', raw) ??
            t('settings.context_status.no_data')
        );
    };
    const translateContextPollTier = (raw?: string): string => {
        if (!raw) return t('settings.context_status.no_data');
        return (
            translateContextValue('settings.context_status.poll_tier', raw) ??
            t('settings.context_status.no_data')
        );
    };
    const translateContextConflict = (raw: string): string =>
        translateContextValue('settings.context_status.conflict', raw) ?? formatContextTokenFallback(raw);
    const translateContextSensor = (raw: string): string =>
        translateContextValue('settings.context_status.sensor', raw) ?? formatContextTokenFallback(raw);
    const translateContextSensorState = (raw: string): string =>
        translateContextValue('settings.context_status.sensor_state', raw) ?? formatContextTokenFallback(raw);
    const contextStateLabel = contextStatus?.state
        ? translateContextState(contextStatus.state)
        : t('settings.context_status.no_data');
    const contextEnvironmentLabel = contextStatus?.environment
        ? translateContextEnvironment(contextStatus.environment)
        : t('settings.context_status.no_data');
    const contextConfidenceLabel = typeof contextStatus?.confidence === 'number'
        ? `${Math.round(contextStatus.confidence * 100)}%`
        : t('settings.context_status.no_data');
    const contextAvgConfidenceLabel = typeof contextStatus?.avgConfidence === 'number'
        ? `${Math.round(contextStatus.avgConfidence * 100)}%`
        : t('settings.context_status.no_data');
    const contextConflictRateLabel = typeof contextStatus?.conflictRate === 'number'
        ? `${Math.round(contextStatus.conflictRate * 100)}%`
        : t('settings.context_status.no_data');
    const contextPollTierLabel = contextStatus?.pollTier
        ? translateContextPollTier(contextStatus.pollTier)
        : t('settings.context_status.no_data');
    const contextConflictLabel = contextStatus?.conflicts?.length
        ? contextStatus.conflicts.map(translateContextConflict).join(', ')
        : t('settings.context_status.no_conflicts');
    const contextSensorLabel = contextStatus?.sensorHealth
        ? Object.entries(contextStatus.sensorHealth)
            .map(([key, value]) => `${translateContextSensor(key)}: ${translateContextSensorState(value.state)}`)
            .join(' • ')
        : t('settings.context_status.no_data');

    // Auto Sleep settings state
    const [autoSleepSettings, setAutoSleepSettings] = useState<AutoSleepSettings>(DEFAULT_AUTO_SLEEP_SETTINGS);
    const [showAutoSleepDetails, setShowAutoSleepDetails] = useState(false);

    // Background location for sleep context (Google Play compliance)
    const [backgroundLocationEnabled, setBackgroundLocationEnabled] = useState(false);
    const [pendingBackgroundEnable, setPendingBackgroundEnable] = useState(false);
    const {
        foregroundStatus,
        backgroundStatus,
        canUseSleepContext,
        openBackgroundDisclosure,
        openForegroundDisclosure,
        refreshStatus: refreshLocationStatus,
        isRequesting: isLocationPermissionRequesting = false,
    } = useLocationPermission();
    const isBackgroundLocationRequesting = pendingBackgroundEnable || isLocationPermissionRequesting;

    const {
        isPremium,
        priceLabel,
        ready: subscriptionReady,
        processing: subscriptionProcessing,
        restoring: subscriptionRestoring,
        manageUrl,
        lastError: subscriptionError,
        restorePremium,
    } = useSubscription();

    const loadHealthConnectStatus = useCallback(async () => {
        if (Platform.OS !== 'android') {
            setHealthConnectStatus(null);
            return;
        }
        try {
            const sdkStatus = await healthConnectService.getSdkStatus();
            const available = await healthConnectService.initialize();
            const permissions = await healthConnectService.getGrantedPermissions();
            setHealthConnectStatus({
                available,
                sdkStatus,
                permissionsCount: permissions.length,
                lastCheckedAt: Date.now(),
            });
        } catch (error) {
            console.warn('[Settings] Failed to load Health Connect status:', error);
            setHealthConnectStatus({
                available: false,
                sdkStatus: healthConnectService.getCachedSdkStatus?.() ?? null,
                permissionsCount: 0,
                lastCheckedAt: Date.now(),
            });
        }
    }, []);

    const loadHealthIngestStatus = useCallback(async () => {
        try {
            setHealthIngestLoading(true);
            const status = await healthIngestService.getStatus();
            setHealthIngestStatus(status);
        } catch (error) {
            console.warn('[Settings] Failed to load health ingest status:', error);
            setHealthIngestStatus(null);
        } finally {
            setHealthIngestLoading(false);
        }
    }, []);

    const loadContextStatus = useCallback(async () => {
        try {
            setContextStatusLoading(true);
            const [lastSnapshot, summary, sensorHealth] = await Promise.all([
                storage.get<ContextSnapshot>(storage.keys.LAST_CONTEXT_SNAPSHOT),
                getContextHistorySummary(),
                getSensorHealth(),
            ]);
            setContextStatus({
                lastUpdatedAt: lastSnapshot?.updatedAt,
                state: lastSnapshot?.state,
                environment: lastSnapshot?.environment,
                confidence: lastSnapshot?.confidence,
                pollTier: lastSnapshot?.pollTier,
                conflicts: lastSnapshot?.conflicts,
                avgConfidence: summary.avgConfidence,
                conflictRate: summary.conflictRate,
                sensorHealth: Object.entries(sensorHealth).reduce((acc, [key, value]) => {
                    acc[key] = {
                        state: value.state,
                        failures: value.failures,
                        successes: value.successes,
                    };
                    return acc;
                }, {} as Record<string, { state: string; failures: number; successes: number }>),
            });
        } catch (error) {
            console.warn('[Settings] Failed to load context status:', error);
            setContextStatus(null);
        } finally {
            setContextStatusLoading(false);
        }
    }, []);

    const loadContextPolicy = useCallback(async () => {
        try {
            setContextPolicyLoading(true);
            const policy = await getContextPolicy();
            setContextPolicy(policy);
        } catch (error) {
            console.warn('[Settings] Failed to load context policy:', error);
            setContextPolicy(null);
        } finally {
            setContextPolicyLoading(false);
        }
    }, []);

    const handleExportContextDiagnostics = useCallback(async () => {
        try {
            await Share.share({
                title: t('settings.export.title'),
                message: await exportContextDiagnostics(),
            });
        } catch (error) {
            console.warn('[Settings] Failed to export context diagnostics:', error);
            Alert.alert(t('alert.error'), t('alert.export_failed'));
        }
    }, [t]);

    const loadBodyProgressInfo = useCallback(async () => {
        try {
            setBodyProgressLoading(true);
            const [settings, consent] = await Promise.all([
                bodyProgressService.getSettings(),
                bodyPhotoConsentService.getConsent(),
            ]);
            setBodyProgressSettings(settings);
            setBodyPhotoConsent(consent);
        } catch (error) {
            console.warn('[Settings] Failed to load body progress info:', error);
        } finally {
            setBodyProgressLoading(false);
        }
    }, []);

    const openExternalLink = useCallback((url: string) => {
        Linking.openURL(url).catch((error) => {
            console.warn('[Settings] Failed to open link:', error);
            Alert.alert(t('settings.alert.open_link_title'), t('settings.alert.open_link_body'));
        });
    }, [t]);

    const handleSubscribePremium = useCallback(() => {
        navigation.navigate('Paywall', { source: 'settings' });
    }, [navigation]);

    const handleRestorePremium = useCallback(async () => {
        try {
            await restorePremium();
        } catch (error) {
            console.warn('[Settings] Restore purchases failed:', error);
            Alert.alert(t('settings.alert.restore_failed_title'), t('settings.alert.restore_failed_body'));
        }
    }, [restorePremium, t]);

    const handleLegalReview = useCallback(() => {
        Alert.alert(
            t('legal.accept_title'),
            t('legal.accept_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('legal.accept_button'),
                    onPress: () => {
                        void clearLegalAcceptance();
                    },
                },
            ]
        );
    }, [t]);

    const handleTestCrash = useCallback(() => {
        Alert.alert(
            t('settings.alert.test_crash_title'),
            t('settings.alert.test_crash_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                { text: t('settings.alert.test_crash_action'), style: 'destructive', onPress: () => firebaseService.testCrash() },
            ]
        );
    }, [t]);

    const handleOpenHealthConnect = useCallback(() => {
        if (Platform.OS !== 'android') return;
        void healthConnectService.openHealthConnectSettings();
    }, []);

    const handleUpdateHealthConnect = useCallback(() => {
        if (Platform.OS !== 'android') return;
        void healthConnectService.openHealthConnectUpdate();
    }, []);

    const handleReconnectHealthConnect = useCallback(async () => {
        if (Platform.OS !== 'android') return;
        if (healthReconnectLoading) return;
        setHealthReconnectLoading(true);
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
            await permissionManager.checkPermission('healthConnect');
            await loadHealthConnectStatus();
                  await loadHealthIngestStatus();
                  await loadContextStatus();

            if (granted) {
                try {
                    const hasAny = await healthConnectService.hasAnyPermission(true);
                    if (hasAny) {
                        await healthService.setPreferredProvider('healthConnect');
                        setHealthPreferredProvider('healthConnect');
                    }
                } catch (error) {
                    console.warn('[Settings] Failed to persist Health Connect provider:', error);
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
                                        const enabled = await healthSyncService.enable();
                                        setHealthEnabled(enabled);
                                    } catch (error) {
                                        console.warn('[Settings] Failed to enable health sync:', error);
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
            console.warn('[Settings] Health Connect reconnect failed:', error);
            Alert.alert(
                t('settings.health_connect.reconnect_failed_title'),
                t('settings.health_connect.reconnect_failed_body')
            );
        } finally {
            setHealthReconnectLoading(false);
        }
    }, [healthReconnectLoading, loadHealthConnectStatus, loadHealthIngestStatus, t]);

    const handleOpenHealthConnectDiagnostics = useCallback(() => {
        if (Platform.OS !== 'android') return;
        navigation.navigate('HealthConnectDiagnostics');
    }, [navigation]);

    const handleOpenBodyProgress = useCallback(() => {
        navigation.navigate('BodyProgress');
    }, [navigation]);

    const handleToggleBodyReminder = useCallback(async (enabled: boolean) => {
        try {
            const updated = await bodyProgressService.updateSettings({ reminderEnabled: enabled });
            setBodyProgressSettings(updated);
        } catch (error) {
            console.warn('[Settings] Failed to update body progress settings:', error);
            Alert.alert(t('alert.error'), t('alert.failed'));
        }
    }, [t]);

    const handleRevokeBodyConsent = useCallback(() => {
        Alert.alert(
            t('body_progress.settings.revoke_consent'),
            t('body_progress.consent.body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('body_progress.settings.revoke_consent'),
                    style: 'destructive',
                    onPress: async () => {
                        await bodyPhotoConsentService.revokeConsent();
                        await loadBodyProgressInfo();
                    },
                },
            ]
        );
    }, [loadBodyProgressInfo, t]);

    const handleClearBodyProgress = useCallback(() => {
        Alert.alert(
            t('body_progress.settings.clear_title'),
            t('body_progress.settings.clear_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('body_progress.settings.clear_scans'),
                    style: 'destructive',
                    onPress: async () => {
                        await bodyProgressService.clearAllScans();
                        await loadBodyProgressInfo();
                    },
                },
            ]
        );
    }, [loadBodyProgressInfo, t]);

    const legalAcceptanceValue = legalAcceptance?.acceptedAt
        ? `${t('legal.accepted_on')}: ${new Date(legalAcceptance.acceptedAt).toLocaleDateString(language)}${legalAcceptance.version ? ` (v${legalAcceptance.version})` : ''}`
        : t('legal.not_accepted');
    const providerLabel = (authSnapshot.providers?.length ?? 0) > 0
        ? t('settings.account_linked', {
            providers: authSnapshot.providers
                .map((provider) => {
                    if (provider === 'google.com') return t('auth.provider.google');
                    if (provider === 'password') return t('auth.provider.email');
                    return provider;
                })
                .join(', ')
        })
        : t('settings.account_guest');
    const cloudSyncLabel = cloudStatus?.lastSyncAt
        ? t('settings.cloud.last_sync', { date: new Date(cloudStatus.lastSyncAt).toLocaleString() })
        : t('settings.cloud.not_synced');
    const cloudSyncError = cloudStatus?.lastErrorCode === 'permission_denied'
        ? t('settings.cloud.permission_denied')
        : cloudStatus?.lastError;
    const cloudSyncDesc = cloudSyncError
        ? t('settings.cloud.last_error', { error: cloudSyncError })
        : cloudSyncLabel;
    const cloudRestoreLabel = cloudStatus?.lastRestoreAt
        ? t('settings.cloud.last_restore', { date: new Date(cloudStatus.lastRestoreAt).toLocaleString() })
        : t('settings.cloud.restore_desc');
    const cloudRestoreError = cloudStatus?.lastRestoreErrorCode === 'permission_denied'
        ? t('settings.cloud.permission_denied')
        : cloudStatus?.lastRestoreError;
    const cloudRestoreDesc = cloudRestoreError
        ? t('settings.cloud.last_restore_error', { error: cloudRestoreError })
        : cloudRestoreLabel;
    const getLocationLabel = useCallback((label: string) => {
        const key = `settings.location.label.${label}`;
        const translated = t(key);
        return translated === key ? label : translated;
    }, [t]);

    // Adaptive insights state
    const [adaptiveSummary, setAdaptiveSummary] = useState('');
    const [adaptivePolicy, setAdaptivePolicy] = useState<AdaptivePolicy>(createEmptyAdaptivePolicy);

    const loadAdaptiveInsights = useCallback(async () => {
        try {
            const [summary, policy] = await Promise.all([
                userAdaptiveService.getAdaptationSummary(),
                userAdaptiveService.getOverlayPolicy(),
            ]);
            setAdaptiveSummary(summary);
            setAdaptivePolicy(policy);
        } catch (error) {
            console.warn('[Settings] Failed to load adaptive insights:', error);
            setAdaptiveSummary('');
            setAdaptivePolicy(createEmptyAdaptivePolicy());
        }
    }, []);

    const loadHealthStatus = useCallback(async () => {
        try {
            if (!healthService.isAvailable()) {
                setHealthAvailable(false);
                setHealthEnabled(false);
                return;
            }

            await healthSyncService.initialize();
            setHealthAvailable(true);
            setHealthEnabled(healthSyncService.isHealthSyncEnabled());
        } catch (error) {
            console.warn('[Settings] Failed to load health status:', error);
            setHealthAvailable(false);
            setHealthEnabled(false);
        }
    }, []);

    const loadPreferences = async () => {
        const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
        if (prefs) {
            if (prefs.notificationsEnabled !== undefined) setNotificationsEnabled(prefs.notificationsEnabled);
            if (prefs.notificationPlanMode) setNotificationPlanMode(prefs.notificationPlanMode);
            if (prefs.darkMode !== undefined) setDarkMode(prefs.darkMode);
            if (prefs.useMetric !== undefined) setUseMetric(prefs.useMetric);
            if (prefs.contextSensingEnabled !== undefined) setContextSensingEnabled(prefs.contextSensingEnabled);
            if (prefs.environmentSensingEnabled !== undefined) setEnvironmentSensingEnabled(prefs.environmentSensingEnabled);
            if (prefs.networkMonitoringEnabled !== undefined) setNetworkMonitoringEnabled(prefs.networkMonitoringEnabled);
            setAdRechargeOnWake(prefs.adRechargeOnWake === true);
            setAdRechargeOnBackground(prefs.adRechargeOnBackground === true);
        }

        const pendingDelete = await storage.get(storage.keys.PENDING_AUTH_DELETE);
        setPendingAuthDelete(!!pendingDelete);

        // Load saved locations
        const locations = await locationService.getSavedLocations();
        setSavedLocations(locations);

        const pendingSave = await getPendingLocationSave();
        setPendingLocationSave(pendingSave);

        // Load overlay settings
        const overlay = await overlayService.getOverlaySettings();
        setOverlaySettings(overlay);
        // Load auto sleep settings
        const autoSleep = await storage.get<AutoSleepSettings>(storage.keys.AUTO_SLEEP_SETTINGS);
        if (autoSleep) setAutoSleepSettings(autoSleep);

        // Check if background location service is running
        const bgLocationEnabled = await storage.get<boolean>('settings:backgroundLocation:enabled');
        setBackgroundLocationEnabled(!!bgLocationEnabled);

        await loadAdaptiveInsights();
        await loadHealthStatus();
        await loadHealthConnectStatus();
        await loadHealthIngestStatus();
        if (Platform.OS === 'android') {
            try {
                const preferred = await healthService.getPreferredProvider();
                setHealthPreferredProvider(preferred === 'googleFit' ? 'googleFit' : 'healthConnect');
            } catch (error) {
                console.warn('[Settings] Failed to load preferred health provider:', error);
            }
        }
        try {
            await bioSnapshotService.initialize();
            setBioConfig(bioSnapshotService.getConfig());
        } catch (error) {
            console.warn('[Settings] Failed to load bio config:', error);
        }
        await loadContextPolicy();
    };

    const handleSavePendingLocation = async (label: 'home' | 'work' | 'gym') => {
        try {
            const saved = await savePendingLocationAs(label);
            if (!saved) return;
            const updated = await locationService.getSavedLocations();
            setSavedLocations(updated);
            setPendingLocationSave(null);
            Alert.alert(
                t('settings.location.saved_title'),
                t('settings.location.saved_body', { label: getLocationLabel(label) })
            );
        } catch (error) {
            console.warn('[Settings] Failed to save pending location:', error);
            Alert.alert(t('alert.error'), t('settings.location.save_failed'));
        }
    };

    const handleDismissPendingLocation = async () => {
        await clearPendingLocationSave();
        setPendingLocationSave(null);
    };

    const savePreferences = async (newPrefs: any) => {
        const current = await storage.get<any>(storage.keys.APP_PREFERENCES) || {};
        await storage.set(storage.keys.APP_PREFERENCES, { ...current, ...newPrefs });
        void settingsSyncService.syncPreferences('settings');
    };

    const toggleAdRechargeOnWake = async (enabled: boolean) => {
        setAdRechargeOnWake(enabled);
        await savePreferences({ adRechargeOnWake: enabled });
    };

    const toggleAdRechargeOnBackground = async (enabled: boolean) => {
        setAdRechargeOnBackground(enabled);
        await savePreferences({ adRechargeOnBackground: enabled });
    };

    const updateBioConfig = async (partial: Partial<BioContextConfig>) => {
        try {
            await bioSnapshotService.updateConfig(partial);
            setBioConfig(bioSnapshotService.getConfig());
        } catch (error) {
            console.warn('[Settings] Failed to update bio config:', error);
        }
    };

    const handleExportBioData = async () => {
        try {
            const payload = await bioSnapshotService.exportData();
            const json = JSON.stringify(payload, null, 2);
            await Share.share({ message: json });
        } catch (error) {
            console.warn('[Settings] Bio export failed:', error);
            Alert.alert(t('alert.error'), t('errors.bio.unavailable'));
        }
    };

    const handleClearBioData = async () => {
        Alert.alert(
            t('settings.bio.clear_data'),
            t('settings.bio.clear_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('settings.bio.clear_data'),
                    style: 'destructive',
                    onPress: async () => {
                        await bioSnapshotService.clearAllData();
                        setBioConfig(bioSnapshotService.getConfig());
                    },
                },
            ]
        );
    };

    // Location handlers
    const saveLocationWithLabel = useCallback(async (label: LocationLabel) => {
        try {
            const resolvedLabel: 'home' | 'work' | 'gym' | 'custom' = label === 'other' ? 'custom' : label;
            Alert.alert(
                t('settings.location.save_title'),
                t('settings.location.save_confirm', { label: getLocationLabel(label) }),
                [
                    { text: t('cancel'), style: 'cancel' },
                    {
                        text: t('save'),
                        onPress: async () => {
                            const servicesEnabled = await Location.hasServicesEnabledAsync();
                            if (!servicesEnabled) {
                                Alert.alert(
                                    t('settings.location.services_disabled_title'),
                                    t('settings.location.services_disabled_body'),
                                    [
                                        { text: t('cancel'), style: 'cancel' },
                                        {
                                            text: t('settings.alert.open_settings'),
                                            onPress: () => { void openLocationSettings(); },
                                        },
                                    ]
                                );
                                return;
                            }

                            let location: Location.LocationObject | null = null;
                            try {
                                location = await Location.getCurrentPositionAsync({
                                    accuracy: Location.Accuracy.Balanced,
                                });
                            } catch (error) {
                                try {
                                    location = await Location.getLastKnownPositionAsync({});
                                } catch (fallbackError) {
                                    console.warn('[Settings] Failed to get last known location:', fallbackError);
                                }
                            }

                            if (!location) {
                                Alert.alert(t('alert.error'), t('settings.location.current_failed'));
                                return;
                            }
                            let address = t('settings.location.unknown_address');
                            try {
                                const addresses = await Location.reverseGeocodeAsync({
                                    latitude: location.coords.latitude,
                                    longitude: location.coords.longitude
                                });
                                if (addresses && addresses.length > 0) {
                                    const a = addresses[0];
                                    address = [a.name, a.street, a.city].filter(Boolean).join(', ');
                                }
                            } catch (e) {
                                console.warn('Reverse geocoding failed', e);
                            }

                            await locationService.saveLocation(resolvedLabel, {
                                lat: location.coords.latitude,
                                lng: location.coords.longitude,
                                address,
                                label: resolvedLabel,
                            });

                            const updated = await locationService.getSavedLocations();
                            setSavedLocations(updated);
                            Alert.alert(
                                t('alert.success'),
                                t('settings.location.saved_body', { label: getLocationLabel(label) })
                            );
                        }
                    }
                ]
            );
        } catch (error) {
            console.error('Failed to set location:', error);
            Alert.alert(t('alert.error'), t('settings.location.current_failed'));
        }
    }, [getLocationLabel, t]);

    const handleSetLocation = async (label: LocationLabel) => {
        if (foregroundStatus === 'blocked') {
            Alert.alert(
                t('permissions.blocked.title'),
                t('permissions.blocked.body_foreground'),
                [
                    { text: t('cancel'), style: 'cancel' },
                    {
                        text: t('permissions.blocked.open_settings'),
                        onPress: () => { void openLocationSettings(); },
                    },
                ]
            );
            return;
        }

        if (foregroundStatus !== 'granted') {
            setPendingLocationLabel(label);
            openForegroundDisclosure();
            return;
        }

        await saveLocationWithLabel(label);
    };

    useEffect(() => {
        if (!pendingLocationLabel) return;

        if (foregroundStatus === 'granted') {
            const label = pendingLocationLabel;
            setPendingLocationLabel(null);
            void saveLocationWithLabel(label);
            return;
        }

        if (foregroundStatus === 'denied' || foregroundStatus === 'blocked') {
            setPendingLocationLabel(null);
        }
    }, [pendingLocationLabel, foregroundStatus, saveLocationWithLabel]);

    const handleRemoveLocation = async (label: string) => {
        Alert.alert(
            t('settings.location.remove_title'),
            t('settings.location.remove_confirm', { label: getLocationLabel(label) }),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('remove'),
                    style: 'destructive',
                    onPress: async () => {
                        await locationService.removeLocation(label);
                        const updated = await locationService.getSavedLocations();
                        setSavedLocations(updated);
                    }
                }
            ]
        );
    };


    const applyNotificationSettings = async (enabled: boolean, mode: NotificationPlanMode) => {
        if (!enabled) {
            await Promise.all([
                clearNotificationType('plan'),
                clearNotificationType('hydration'),
                clearNotificationType('hydration_snooze'),
                clearNotificationType('wrapup'),
                clearNotificationType('wrapup_snooze'),
            ]);
            return;
        }

        const granted = await requestNotificationPermission();
        if (!granted) {
            Alert.alert(t('alert.notifications_disabled'), t('alert.try_again'));
            setNotificationsEnabled(false);
            await savePreferences({ notificationsEnabled: false });
            return;
        }

        const todayKey = getLocalDateKey(new Date());
        const planKey = `${storage.keys.DAILY_PLAN}_${todayKey}`;
        const plan = (await storage.get<DailyPlan>(planKey)) || (await storage.get<DailyPlan>(storage.keys.DAILY_PLAN));
        if (plan) {
            await schedulePlanNotifications(plan, { mode });
        }
        await scheduleNightlyWrapUpReminder();
    };

    const updateNotification = async (val: boolean) => {
        setNotificationsEnabled(val);
        await savePreferences({ notificationsEnabled: val });
        await applyNotificationSettings(val, notificationPlanMode);
    };

    const updateNotificationPlanMode = async (mode: NotificationPlanMode) => {
        setNotificationPlanMode(mode);
        await savePreferences({ notificationPlanMode: mode });
        await applyNotificationSettings(notificationsEnabled, mode);
    };

    const updateDarkMode = (val: boolean) => {
        setDarkMode(val);
        savePreferences({ darkMode: val });
    };

    const updateMetric = (val: boolean) => {
        setUseMetric(val);
        savePreferences({ useMetric: val });
    };

    const updateContextSensing = (val: boolean) => {
        setContextSensingEnabled(val);
        savePreferences({ contextSensingEnabled: val });
    };

    const updateEnvironmentSensing = (val: boolean) => {
        setEnvironmentSensingEnabled(val);
        savePreferences({ environmentSensingEnabled: val });
    };

    const updateNetworkMonitoring = (val: boolean) => {
        setNetworkMonitoringEnabled(val);
        savePreferences({ networkMonitoringEnabled: val });
    };

    const updateContextPolicySetting = async (partial: Partial<ContextPolicy>) => {
        try {
            setContextPolicyLoading(true);
            const next = await updateContextPolicy(partial);
            setContextPolicy(next);
            if (
                partial.contextHistoryDays !== undefined ||
                partial.contextHistoryEnabled !== undefined
            ) {
                await pruneHistoryNow();
            }
            if (
                partial.contextSignalHistoryHours !== undefined ||
                partial.contextSignalHistoryEnabled !== undefined
            ) {
                await pruneSignalHistoryNow();
            }
        } catch (error) {
            console.warn('[Settings] Failed to update context policy:', error);
            Alert.alert(t('alert.error'), t('settings.context_privacy.update_failed'));
        } finally {
            setContextPolicyLoading(false);
        }
    };

    const handleClearContextData = async () => {
        Alert.alert(
            t('settings.context_privacy.clear_title'),
            t('settings.context_privacy.clear_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('settings.context_privacy.clear_confirm'),
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            await clearContextData();
                            await loadContextStatus();
                            await loadContextPolicy();
                        })();
                    },
                },
            ]
        );
    };

    const handleOpenContextDiagnostics = () => {
        navigation.navigate('ContextDiagnostics');
    };

    const renderStepper = (
        value: number,
        onChange: (next: number) => void,
        config: { min: number; max: number; step: number; suffix?: string }
    ) => (
        <View style={styles.stepper}>
            <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => onChange(Math.max(config.min, value - config.step))}
            >
                <Text style={styles.stepperButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>
                {value}{config.suffix ?? ''}
            </Text>
            <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => onChange(Math.min(config.max, value + config.step))}
            >
                <Text style={styles.stepperButtonText}>+</Text>
            </TouchableOpacity>
        </View>
    );

    const ensureHealthConsent = async (): Promise<boolean> => {
        const hasConsent = await healthConsentService.hasConsent();
        if (hasConsent) return true;

        return await new Promise((resolve) => {
            Alert.alert(
                t('settings.alert.health_consent_title'),
                t('settings.alert.health_consent_body'),
                [
                    { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
                    {
                        text: t('settings.alert.health_consent_accept'),
                        onPress: () => {
                            void (async () => {
                                await healthConsentService.grantConsent('settings');
                                const consent = await healthConsentService.getConsent();
                                setHealthConsent(consent);
                                resolve(true);
                            })();
                        },
                    },
                ]
            );
        });
    };

    const formatConsentTimestamp = (timestamp?: number | null): string => {
        if (!timestamp) return t('settings.health.consent_never');
        return new Date(timestamp).toLocaleString(language);
    };

    const formatIngestTimestamp = (timestamp?: number | null): string => {
        if (!timestamp) return t('settings.health_sync_status.no_data');
        return new Date(timestamp).toLocaleString(language);
    };

    const formatContextTimestamp = (timestamp?: number | null): string => {
        if (!timestamp) return t('settings.context_status.no_data');
        return new Date(timestamp).toLocaleString(language);
    };

    const openContextCorrection = () => {
        setContextCorrectionState(null);
        setContextCorrectionLocation(null);
        setShowContextCorrection(true);
    };

    const applyContextCorrection = async () => {
        try {
            await contextCorrectionService.recordCorrection({
                actualState: contextCorrectionState ?? undefined,
                actualLocation: contextCorrectionLocation ?? undefined,
            });
        } catch (error) {
            console.warn('[Settings] Failed to apply context correction:', error);
        } finally {
            setShowContextCorrection(false);
        }
    };

    const formatConsentSource = (source?: HealthConsentRecord['source'] | null): string => {
        if (source === 'onboarding') return t('settings.health.consent_source.onboarding');
        if (source === 'settings') return t('settings.health.consent_source.settings');
        if (source === 'permissions') return t('settings.health.consent_source.permissions');
        return t('settings.health.consent_source.unknown');
    };

    const handleRevokeHealthConsent = () => {
        Alert.alert(
            t('settings.health.consent_revoke_title'),
            t('settings.health.consent_revoke_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('settings.health.consent_revoke'),
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            await healthConsentService.revokeConsent();
                            await healthSyncService.disable();
                            setHealthEnabled(false);
                            await bioSnapshotService.clearAllData();
                            const consent = await healthConsentService.getConsent();
                            setHealthConsent(consent);
                        })();
                    },
                },
            ]
        );
    };

    const handleExportHealthConsent = async () => {
        try {
            const consent = await healthConsentService.getConsent();
            if (!consent) {
                Alert.alert(t('alert.no_data'), t('settings.health.consent_export_empty'));
                return;
            }
            const payload = JSON.stringify(consent, null, 2);
            await Share.share({
                title: t('settings.health.consent_export_title'),
                message: payload,
            });
        } catch (error) {
            console.warn('[Settings] Failed to export health consent:', error);
            Alert.alert(t('alert.error'), t('settings.health.consent_export_failed'));
        }
    };

    const updateHealthSync = async (enabled: boolean) => {
        if (!healthService.isAvailable()) {
            Alert.alert(t('settings.alert.health_unavailable_title'), t('settings.alert.health_unavailable_body'));
            setHealthAvailable(false);
            return;
        }

        if (enabled) {
            const consented = await ensureHealthConsent();
            if (!consented) {
                setHealthEnabled(false);
                return;
            }
        }

        setHealthSyncLoading(true);
        try {
            await healthSyncService.initialize();
            if (enabled) {
                const granted = await healthSyncService.enable();
                if (!granted) {
                    Alert.alert(t('settings.alert.health_permission_title'), t('settings.alert.health_permission_body'));
                    setHealthEnabled(false);
                    return;
                }
                setHealthEnabled(true);
            } else {
                await healthSyncService.disable();
                setHealthEnabled(false);
            }
            await loadHealthConnectStatus();
        } catch (error) {
            console.warn('[Settings] Failed to update health sync:', error);
            Alert.alert(t('settings.alert.health_sync_error_title'), t('settings.alert.health_sync_error_body'));
            setHealthEnabled(false);
        } finally {
            setHealthSyncLoading(false);
        }
    };

    const handleHealthProviderChange = async (provider: 'healthConnect' | 'googleFit') => {
        if (Platform.OS !== 'android') return;
        if (healthPreferredProvider === provider) return;
        setHealthPreferredProvider(provider);
        await healthService.setPreferredProvider(provider);
        if (healthEnabled) {
            await healthSyncService.disable();
            setHealthEnabled(false);
        }
        await loadHealthConnectStatus();
        Alert.alert(
            t('settings.health.provider_choice_updated_title'),
            t('settings.health.provider_choice_updated_body')
        );
    };

    // Overlay settings handlers
    const toggleOverlayEnabled = async (enabled: boolean) => {
        if (enabled) {
            const hasPermission = await overlayService.checkOverlayPermission();
            if (!hasPermission) {
                Alert.alert(
                    t('settings.alert.overlay_permission_title'),
                    t('settings.alert.overlay_permission_body'),
                    [
                        { text: t('cancel'), style: 'cancel' },
                        {
                            text: t('settings.alert.open_settings'),
                            onPress: () => overlayService.requestOverlayPermission()
                        },
                    ]
                );
                return;
            }
        }
        if (enabled) {
            await overlayService.enableOverlays();
        } else {
            await overlayService.disableOverlays();
        }
        const refreshed = await overlayService.getOverlaySettings();
        setOverlaySettings(refreshed);
        await overlayService.syncSettingsToNative();
    };

    const updateOverlayMode = async (mode: NotificationPlanMode) => {
        const types = OVERLAY_MODE_PRESETS[mode];
        const newSettings = { ...overlaySettings, mode, types };
        setOverlaySettings(newSettings);
        await overlayService.saveOverlaySettings(newSettings);
        await overlayService.syncSettingsToNative();
    };

    const toggleOverlayType = async (type: keyof OverlayReminderTypes, enabled: boolean) => {
        const baseTypes = overlaySettings.types ?? DEFAULT_OVERLAY_SETTINGS.types;
        const newTypes = { ...baseTypes, [type]: enabled };
        const newSettings = { ...overlaySettings, types: newTypes };
        setOverlaySettings(newSettings);
        await overlayService.saveOverlaySettings(newSettings);
        await overlayService.syncSettingsToNative();
    };

    const enableAllOverlayTypes = async () => {
        const newSettings = { ...overlaySettings, types: OVERLAY_MODE_PRESETS.high };
        setOverlaySettings(newSettings);
        await overlayService.saveOverlaySettings(newSettings);
        await overlayService.syncSettingsToNative();
    };

    const disableAllOverlayTypes = async () => {
        const allDisabled: OverlayReminderTypes = {
            meal: false,
            hydration: false,
            workout: false,
            sleep: false,
            workBreak: false,
            wrapUp: false,
            weightCheck: false,
        };
        const newSettings = { ...overlaySettings, types: allDisabled };
        setOverlaySettings(newSettings);
        await overlayService.saveOverlaySettings(newSettings);
        await overlayService.syncSettingsToNative();
    };

    const checkOverlayPermissionStatus = async () => {
        const granted = await overlayService.checkOverlayPermission();
        if (granted !== overlaySettings.permissionGranted) {
            const newSettings = { ...overlaySettings, permissionGranted: granted };
            setOverlaySettings(newSettings);
            await overlayService.saveOverlaySettings(newSettings);
        }
    };

    // Auto Sleep settings handlers
    const saveAutoSleepSettings = async (settings: AutoSleepSettings) => {
        setAutoSleepSettings(settings);
        await storage.set(storage.keys.AUTO_SLEEP_SETTINGS, settings);
    };

    const toggleAutoSleepEnabled = async (enabled: boolean) => {
        const newSettings = { ...autoSleepSettings, enabled };
        await saveAutoSleepSettings(newSettings);
        // Call native module to schedule/cancel WorkManager
        await sleepService.setAutoSleepEnabled(enabled);
        await sleepService.syncSettingsToNative(newSettings);

        // Check battery optimization when enabling
        if (enabled) {
            const isWhitelisted = await sleepService.isIgnoringBatteryOptimizations();
            const isAggressiveDevice = await sleepService.isAggressiveOEM();

            if (!isWhitelisted) {
                // Prompt user to whitelist app
                Alert.alert(
                    t('settings.alert.battery_optimization_title'),
                    isAggressiveDevice
                        ? t('settings.alert.battery_optimization_body_aggressive')
                        : t('settings.alert.battery_optimization_body'),
                    [
                        { text: t('later'), style: 'cancel' },
                        {
                            text: t('settings.alert.open_settings'),
                            onPress: () => { void sleepService.requestIgnoreBatteryOptimizations(); }
                        }
                    ]
                );
            }
        }
    };

    const updateAutoSleepSensitivity = async (level: 'low' | 'medium' | 'high') => {
        const preset = AUTO_SLEEP_SENSITIVITY_PRESETS[level];
        const newSettings = {
            ...autoSleepSettings,
            sensitivityLevel: level,
            stillnessThresholdMinutes: preset.stillnessThresholdMinutes,
            sleepProbeSnoozeMinutes: preset.sleepProbeSnoozeMinutes,
        };
        await saveAutoSleepSettings(newSettings);
        await sleepService.syncSettingsToNative(newSettings);
    };

    const updateAutoSleepNightHours = async (start: number, end: number) => {
        const newSettings = { ...autoSleepSettings, nightStartHour: start, nightEndHour: end };
        await saveAutoSleepSettings(newSettings);
        await sleepService.syncSettingsToNative(newSettings);
    };

    const toggleAutoSleepRequireCharging = async (requireCharging: boolean) => {
        const newSettings = { ...autoSleepSettings, requireCharging };
        await saveAutoSleepSettings(newSettings);
        await sleepService.syncSettingsToNative(newSettings);
    };

    const toggleAnytimeMode = async (anytimeMode: boolean) => {
        const newSettings = { ...autoSleepSettings, anytimeMode };
        await saveAutoSleepSettings(newSettings);
        await sleepService.syncSettingsToNative(newSettings);
    };

    const backgroundDisclosureRequestedRef = React.useRef(false);

    // Background location toggle handler (Google Play compliant)
    const handleBackgroundLocationToggle = async (enabled: boolean) => {
        if (enabled) {
            backgroundDisclosureRequestedRef.current = false;
            setPendingBackgroundEnable(true);

            // Check if we already have permission
            if (backgroundStatus === 'granted') {
                setPendingBackgroundEnable(false);
                setBackgroundLocationEnabled(true);
                await storage.set('settings:backgroundLocation:enabled', true);
                await backgroundLocationService.ensureRunning();
                return;
            }

            if (foregroundStatus !== 'granted') {
                openForegroundDisclosure();
                return;
            }

            backgroundDisclosureRequestedRef.current = true;
            openBackgroundDisclosure();
            return;
        }

        backgroundDisclosureRequestedRef.current = false;
        setPendingBackgroundEnable(false);
        setBackgroundLocationEnabled(false);
        await storage.set('settings:backgroundLocation:enabled', false);
        await backgroundLocationService.stop();
    };

    useEffect(() => {
        if (!pendingBackgroundEnable) return;

        if (foregroundStatus === 'granted' && backgroundStatus !== 'granted') {
            if (!backgroundDisclosureRequestedRef.current) {
                backgroundDisclosureRequestedRef.current = true;
                openBackgroundDisclosure();
            }
            return;
        }

        if (backgroundStatus === 'granted') {
            setPendingBackgroundEnable(false);
            setBackgroundLocationEnabled(true);
            storage.set('settings:backgroundLocation:enabled', true).catch(() => { });
            backgroundLocationService.ensureRunning().catch(() => { });
            return;
        }

        if (backgroundStatus === 'denied' || backgroundStatus === 'blocked') {
            setPendingBackgroundEnable(false);
            backgroundDisclosureRequestedRef.current = false;
        }
    }, [pendingBackgroundEnable, foregroundStatus, backgroundStatus, openBackgroundDisclosure]);

    const resetAdaptiveInsights = async () => {
        try {
            await userAdaptiveService.resetAdaptation();
            await loadAdaptiveInsights();
            Alert.alert(t('settings.alert.adaptive_reset_title'), t('settings.alert.adaptive_reset_body'));
        } catch (error) {
            console.warn('[Settings] Failed to reset adaptation:', error);
            Alert.alert(t('alert.error'), t('settings.alert.adaptive_reset_failed'));
        }
    };

    const handleResetAdaptation = () => {
        Alert.alert(
            t('settings.alert.adaptive_confirm_title'),
            t('settings.alert.adaptive_confirm_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('reset'),
                    style: 'destructive',
                    onPress: () => { void resetAdaptiveInsights(); },
                },
            ]
        );
    };

    const loadData = async () => {
        const savedUser = await storage.get<UserProfile>(storage.keys.USER);
        const foodLogs = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
        const moodLogs = await storage.get<MoodLog[]>(storage.keys.MOOD) || [];
        const weightLogs = await storage.get<WeightLogEntry[]>(storage.keys.WEIGHT) || [];
        const activityLogs = await storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY) || [];
        const acceptance = await getStoredLegalAcceptance();

        if (savedUser) setUser(savedUser);
        if (acceptance) setLegalAcceptance(acceptance);
        setDataStats({
            foodLogs: foodLogs.length,
            moodLogs: moodLogs.length,
            weightLogs: weightLogs.length,
            activityLogs: activityLogs.length,
        });
    };

    const loadCloudStatus = useCallback(async () => {
        const status = await cloudSyncService.getStatus();
        setCloudStatus(status);
    }, []);

    const loadHealthConsent = async () => {
        try {
            const consent = await healthConsentService.getConsent();
            setHealthConsent(consent);
        } catch (error) {
            console.warn('[Settings] Failed to load health consent:', error);
        }
    };

    useEffect(() => {
        overlaySettingsRef.current = overlaySettings;
    }, [overlaySettings]);

    useEffect(() => {
        loadData();
        loadCloudStatus();
        loadPreferences();
        loadHealthConsent();
        loadBodyProgressInfo();
        loadContextStatus();
        loadContextPolicy();
        const unsubscribe = subscribeLegalAcceptance((value) => {
            setLegalAcceptance(value);
        });
        const unsubscribeAuth = authService.onAuthStateChange((user) => {
            setAuthSnapshot({
                isAnonymous: user?.isAnonymous === true,
                email: user?.email ?? null,
                providers: authService.getProviderIds(),
            });
        });
        return () => {
            unsubscribe();
            unsubscribeAuth();
        };
    }, []);

    // Re-check overlay permission when screen gains focus (user returns from settings)
    useFocusEffect(
        useCallback(() => {
            const checkAndUpdateOverlayPermission = async () => {
                const granted = await overlayService.checkOverlayPermission();
                let refreshed = await overlayService.getOverlaySettings();
                // If permission was just granted, auto-enable overlays
                const previous = overlaySettingsRef.current;
                if (granted && !refreshed.enabled && !previous.enabled) {
                    await overlayService.enableOverlays();
                    refreshed = await overlayService.getOverlaySettings();
                }
                setOverlaySettings(refreshed);
                if (
                    previous.enabled !== refreshed.enabled ||
                    previous.permissionGranted !== refreshed.permissionGranted ||
                    previous.mode !== refreshed.mode ||
                    JSON.stringify(previous.types) !== JSON.stringify(refreshed.types)
                ) {
                    await overlayService.syncSettingsToNative();
                }

                const pendingSave = await getPendingLocationSave();
                setPendingLocationSave(pendingSave);

                const pendingDelete = await storage.get(storage.keys.PENDING_AUTH_DELETE);
                setPendingAuthDelete(!!pendingDelete);

                await loadAdaptiveInsights();
                await loadCloudStatus();
                await loadHealthConnectStatus();
                await loadHealthIngestStatus();
                await loadContextStatus();
                await loadContextPolicy();
                await loadBodyProgressInfo();
                await refreshLocationStatus();
            };
            checkAndUpdateOverlayPermission();
        }, [loadAdaptiveInsights, loadBodyProgressInfo, loadCloudStatus, loadContextPolicy, loadContextStatus, loadHealthConnectStatus, loadHealthIngestStatus, refreshLocationStatus])
    );


    const handleExportData = async () => {
        setIsExporting(true);
        try {
            const allKeys = await AsyncStorage.getAllKeys();
            const waterKeys = allKeys.filter((key) => /^ls_water_\d{4}-\d{2}-\d{2}$/.test(key));
            const planKeys = allKeys.filter((key) => /^ls_daily_plan_\d{4}-\d{2}-\d{2}$/.test(key));
            const nutritionSnapshotKeys = allKeys.filter((key) => /^ls_nutrient_snapshot_\d{4}-\d{2}-\d{2}$/.test(key));
            const healthKeys = allKeys.filter((key) => /^ls_health_data_\d{4}-\d{2}-\d{2}$/.test(key));

            const [waterPairs, planPairs, nutritionPairs, healthPairs] = await Promise.all([
                waterKeys.length ? AsyncStorage.multiGet(waterKeys) : Promise.resolve([] as [string, string | null][]),
                planKeys.length ? AsyncStorage.multiGet(planKeys) : Promise.resolve([] as [string, string | null][]),
                nutritionSnapshotKeys.length ? AsyncStorage.multiGet(nutritionSnapshotKeys) : Promise.resolve([] as [string, string | null][]),
                healthKeys.length ? AsyncStorage.multiGet(healthKeys) : Promise.resolve([] as [string, string | null][]),
            ]);

            const waterByDate: Record<string, number> = {};
            for (const [key, raw] of waterPairs) {
                const dateKey = key.replace(/^ls_water_/, '');
                if (!isDateKey(dateKey) || raw == null) continue;
                try {
                    const parsed = JSON.parse(raw);
                    if (typeof parsed === 'number' && Number.isFinite(parsed)) {
                        waterByDate[dateKey] = Math.max(0, Math.round(parsed));
                    } else if (parsed && typeof parsed.amount === 'number' && Number.isFinite(parsed.amount)) {
                        waterByDate[dateKey] = Math.max(0, Math.round(parsed.amount));
                    }
                } catch { }
            }

            const plansByDate: Record<string, DailyPlan> = {};
            for (const [key, raw] of planPairs) {
                const dateKey = key.replace(/^ls_daily_plan_/, '');
                if (!isDateKey(dateKey) || raw == null) continue;
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        plansByDate[dateKey] = parsed as DailyPlan;
                    }
                } catch { }
            }

            const nutrientSnapshots: Record<string, any> = {};
            for (const [key, raw] of nutritionPairs) {
                const dateKey = key.replace(/^ls_nutrient_snapshot_/, '');
                if (!isDateKey(dateKey) || raw == null) continue;
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        nutrientSnapshots[dateKey] = parsed;
                    }
                } catch { }
            }

            const healthByDate: Record<string, any> = {};
            for (const [key, raw] of healthPairs) {
                const dateKey = key.replace(/^ls_health_data_/, '');
                if (!isDateKey(dateKey) || raw == null) continue;
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        healthByDate[dateKey] = parsed;
                    }
                } catch { }
            }

            const exportData = {
                exportedAt: new Date().toISOString(),
                version: '1.2.0',
                user: await storage.get(storage.keys.USER),
                foodLogs: await storage.get(storage.keys.FOOD),
                moodLogs: await storage.get(storage.keys.MOOD),
                weightLogs: await storage.get(storage.keys.WEIGHT),
                activityLogs: await storage.get(storage.keys.ACTIVITY),
                dailyPlan: await storage.get(storage.keys.DAILY_PLAN),
                plansByDate,
                sleepHistory: await storage.get(storage.keys.SLEEP_HISTORY),
                waterLog: await storage.get(storage.keys.WATER),
                waterByDate,
                nutrientSnapshots,
                nutritionDb: await storage.get(storage.keys.NUTRITION_DB),
                healthByDate,
                healthSettings: await storage.get('ls_health_settings'),
            };

            const jsonString = JSON.stringify(exportData, null, 2);

            // Try to share
            try {
                await Share.share({
                    message: jsonString,
                    title: t('settings.export.title'),
                });
            } catch (shareError) {
                // Fallback to clipboard
                await Clipboard.setStringAsync(jsonString);
                Alert.alert(
                    t('settings.export.copied_title'),
                    t('settings.export.copied_body')
                );
            }
        } catch (error) {
            console.error('Export failed:', error);
            Alert.alert(t('alert.export_failed'), t('alert.try_again'));
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportData = async () => {
        try {
            const clipboardContent = await Clipboard.getStringAsync();
            if (!clipboardContent) {
                Alert.alert(t('alert.no_data'), t('alert.try_again'));
                return;
            }

            try {
                const data = JSON.parse(clipboardContent);

                if (!data.exportedAt && !data.user && !data.foodLogs) {
                    Alert.alert(t('settings.import.invalid_data_title'), t('settings.import.invalid_data_body'));
                    return;
                }

                if (data.user) await userProfileService.saveUserProfile(data.user, { source: 'import' });
                if (data.foodLogs) await storage.set(storage.keys.FOOD, data.foodLogs);
                if (data.moodLogs) await storage.set(storage.keys.MOOD, data.moodLogs);
                if (data.weightLogs) await storage.set(storage.keys.WEIGHT, data.weightLogs);
                if (data.activityLogs) await storage.set(storage.keys.ACTIVITY, data.activityLogs);

                if (data.plansByDate && typeof data.plansByDate === 'object') {
                    for (const [dateKey, plan] of Object.entries(data.plansByDate as Record<string, any>)) {
                        if (!isDateKey(dateKey) || !plan) continue;
                        await storage.set(`${storage.keys.DAILY_PLAN}_${dateKey}`, plan);
                    }

                    const todayKeyNow = getLocalDateKey(new Date());
                    const todayPlan = (data.plansByDate as Record<string, any>)[todayKeyNow];
                    if (todayPlan) {
                        await storage.set(storage.keys.DAILY_PLAN, todayPlan);
                    } else if (data.dailyPlan && data.dailyPlan.date === todayKeyNow) {
                        await storage.set(storage.keys.DAILY_PLAN, data.dailyPlan);
                    }
                } else if (data.dailyPlan) {
                    await storage.set(storage.keys.DAILY_PLAN, data.dailyPlan);
                }
                if (data.sleepHistory) await storage.set(storage.keys.SLEEP_HISTORY, data.sleepHistory);

                if (data.waterByDate && typeof data.waterByDate === 'object') {
                    for (const [dateKey, amount] of Object.entries(data.waterByDate as Record<string, any>)) {
                        if (!isDateKey(dateKey)) continue;
                        const num = typeof amount === 'number' ? amount : Number(amount);
                        if (!Number.isFinite(num)) continue;
                        await setWaterAmountForDate(dateKey, num);
                    }
                } else if (data.waterLog) {
                    await storage.set(storage.keys.WATER, data.waterLog);
                }

                if (data.nutrientSnapshots && typeof data.nutrientSnapshots === 'object') {
                    for (const [dateKey, snapshot] of Object.entries(data.nutrientSnapshots as Record<string, any>)) {
                        if (!isDateKey(dateKey) || !snapshot) continue;
                        await storage.set(`ls_nutrient_snapshot_${dateKey}`, snapshot);
                    }
                }

                if (data.nutritionDb) {
                    await storage.set(storage.keys.NUTRITION_DB, data.nutritionDb);
                }

                if (data.healthByDate && typeof data.healthByDate === 'object') {
                    for (const [dateKey, entry] of Object.entries(data.healthByDate as Record<string, any>)) {
                        if (!isDateKey(dateKey) || !entry) continue;
                        await storage.set(`ls_health_data_${dateKey}`, entry);
                    }
                }

                if (data.healthSettings) {
                    await storage.set('ls_health_settings', data.healthSettings);
                }

                storage.clearCache();
                Alert.alert(t('settings.import.success_title'), t('settings.import.success_body'));
                loadData();
                loadPreferences();
            } catch (parseError) {
                Alert.alert(t('settings.import.invalid_format_title'), t('settings.import.invalid_format_body'));
            }
        } catch (error) {
            Alert.alert(t('settings.import.failed_title'), t('settings.import.failed_body'));
        }
    };

    const handleCloudSync = async () => {
        setCloudSyncing(true);
        try {
            await cloudSyncService.syncAllNow('manual');
            analytics.logEvent('cloud_sync_manual', {});
            await loadCloudStatus();
            Alert.alert(t('settings.cloud.sync_title'), t('settings.cloud.sync_success_body'));
        } catch (error) {
            console.warn('[Settings] Cloud sync failed:', error);
            Alert.alert(t('settings.cloud.sync_failed_title'), t('settings.cloud.sync_failed_body'));
        } finally {
            setCloudSyncing(false);
        }
    };

    const promptRestoreMode = (): Promise<'merge' | 'replace' | 'cancel'> => {
        return new Promise((resolve) => {
            Alert.alert(
                t('settings.cloud.restore_prompt_title'),
                t('settings.cloud.restore_prompt_body'),
                [
                    { text: t('cancel'), style: 'cancel', onPress: () => resolve('cancel') },
                    { text: t('settings.cloud.restore_merge'), onPress: () => resolve('merge') },
                    { text: t('settings.cloud.restore_replace'), style: 'destructive', onPress: () => resolve('replace') },
                ]
            );
        });
    };

    const performCloudRestore = async () => {
        const modeChoice = await promptRestoreMode();
        if (modeChoice === 'cancel') return;

        setCloudRestoring(true);
        try {
            const result = await cloudSyncService.restoreFromCloud({ source: 'manual', mode: modeChoice });
            analytics.logEvent('cloud_restore_manual', { mode: modeChoice });
            await settingsSyncService.restorePreferences({ source: 'manual', mode: modeChoice });

            const localProfile = await userProfileService.loadUserProfile();
            const hasLocalProfile = !!localProfile?.name;

            if (modeChoice === 'replace' || !hasLocalProfile) {
                const cloudProfile = await firestoreService.fetchUserProfile();
                if (cloudProfile) {
                    await userProfileService.saveUserProfile(cloudProfile, { source: 'cloud_restore', sync: false });
                } else {
                    await userProfileService.clearUserProfile({ source: 'cloud_restore', sync: false });
                }
            } else if (localProfile) {
                await firestoreService.syncUserProfile(localProfile, { source: 'manual_restore' });
            }

            await cloudSyncService.syncAllNow('manual');
            await loadCloudStatus();
            await loadData();
            await loadPreferences();

            const totalLogs = Object.values(result.totals.logs).reduce((sum, count) => sum + count, 0);
            Alert.alert(
                t('settings.cloud.restore_result_title'),
                t('settings.cloud.restore_result_body', {
                    plans: result.totals.plans,
                    wrapups: result.totals.wrapups,
                    logs: totalLogs,
                })
            );
        } catch (error) {
            console.warn('[Settings] Cloud restore failed:', error);
            Alert.alert(t('settings.cloud.restore_failed_title'), t('settings.cloud.restore_failed_body'));
        } finally {
            setCloudRestoring(false);
        }
    };

    const handleCloudRestore = () => {
        Alert.alert(
            t('settings.cloud.restore_confirm_title'),
            t('settings.cloud.restore_confirm_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                { text: t('settings.cloud.restore_action'), onPress: () => void performCloudRestore() },
            ]
        );
    };

    const handleClearAllData = () => {
        Alert.alert(
            t('settings.alert.clear_data_title'),
            t('settings.alert.clear_data_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('settings.alert.delete_everything'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await storage.clear();
                            await storage.remove(storage.keys.APP_PREFERENCES);
                            await storage.remove(storage.keys.CHAT_HISTORY);
                            await storage.remove(storage.keys.USER);
                            storage.clearCache();
                            setPendingAuthDelete(false);
                            Alert.alert(t('alert.data_cleared'), t('alert.all_data_deleted'));
                            navigation.reset({
                                index: 0,
                                routes: [{ name: 'Welcome' }],
                            });
                        } catch (error) {
                            Alert.alert(t('alert.error'), t('alert.try_again'));
                        }
                    },
                },
            ]
        );
    };

    const handleLogout = () => {
        Alert.alert(
            t('settings.alert.logout_title'),
            t('settings.alert.logout_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('settings.alert.logout_action'),
                    onPress: async () => {
                        try {
                            await authService.signOut();
                            try {
                                await GoogleSignin.signOut();
                            } catch {
                                // Ignore Google sign-out issues
                            }
                            const uid = authService.getUid();
                            if (uid) {
                                await storage.set(storage.keys.LAST_AUTH_UID, uid);
                            }
                        } catch (error) {
                            console.warn('[Settings] Failed to sign out:', error);
                        }
                        navigation.reset({
                            index: 0,
                            routes: [{ name: 'Welcome' }],
                        });
                    },
                },
            ]
        );
    };

    const handleResetOnboarding = () => {
        Alert.alert(
            t('settings.alert.reset_onboarding_title'),
            t('settings.alert.reset_onboarding_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('reset'),
                    onPress: async () => {
                        await userProfileService.clearUserProfile({ source: 'reset' });
                        navigation.reset({
                            index: 0,
                            routes: [{ name: 'Onboarding' }],
                        });
                    },
                },
            ]
        );
    };

    const handleDeleteAccount = () => {
        if (isDeletingAccount) return;

        if (pendingAuthDelete) {
            navigation.navigate('Auth', { source: 'settings', action: 'reauth_delete' });
            return;
        }

        Alert.alert(
            t('delete_account_confirm_title'),
            t('delete_account_confirm_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('delete_account_confirm_action'),
                    style: 'destructive',
                    onPress: async () => {
                        setIsDeletingAccount(true);
                        try {
                            const result = await accountService.deleteAccountAndData({ source: 'settings' });
                            try {
                                await GoogleSignin.signOut();
                            } catch {
                                // Ignore Google sign-out failures
                            }
                            if (result.requiresRecentLogin) {
                                setPendingAuthDelete(true);
                                Alert.alert(
                                    t('delete_account_partial_title'),
                                    t('delete_account_partial_body'),
                                    [
                                        { text: t('cancel'), style: 'cancel' },
                                        {
                                            text: t('delete_account_complete_action'),
                                            onPress: () => navigation.navigate('Auth', { source: 'settings', action: 'reauth_delete' }),
                                        },
                                    ]
                                );
                            } else {
                                setPendingAuthDelete(false);
                                Alert.alert(
                                    t('delete_account_success_title'),
                                    t('delete_account_success_body')
                                );
                                navigation.reset({
                                    index: 0,
                                    routes: [{ name: 'Welcome' }],
                                });
                            }
                        } catch (error) {
                            console.warn('[Settings] Delete account failed:', error);
                            analytics.logError(error, 'Settings.deleteAccount');
                            Alert.alert(t('alert.error'), t('delete_account_failed_body'));
                        } finally {
                            setIsDeletingAccount(false);
                        }
                    },
                },
            ]
        );
    };

    const formatHourList = (hours: number[]) =>
        hours
            .slice()
            .sort((a, b) => a - b)
            .map((hour) => `${String(hour).padStart(2, '0')}:00`)
            .join(', ');

    const formatTypeList = (types: string[]) =>
        types
            .map((type) => {
                const key = `settings.overlay.type.${type}`;
                const translated = t(key);
                if (translated !== key) return translated;
                const normalized = type.replace(/_/g, ' ');
                return normalized.charAt(0).toUpperCase() + normalized.slice(1);
            })
            .join(', ');

    const adaptiveSummaryText =
        adaptiveSummary.trim().length > 0
            ? adaptiveSummary
            : t('settings.adaptive.empty_summary');

    const hasAdaptiveDetails =
        adaptivePolicy.preferredHours.length > 0 ||
        adaptivePolicy.suppressedHours.length > 0 ||
        adaptivePolicy.suppressedTypes.length > 0;

    const preferredHoursLabel = adaptivePolicy.preferredHours.length > 0
        ? formatHourList(adaptivePolicy.preferredHours)
        : '';
    const suppressedHoursLabel = adaptivePolicy.suppressedHours.length > 0
        ? formatHourList(adaptivePolicy.suppressedHours)
        : '';
    const suppressedTypesLabel = adaptivePolicy.suppressedTypes.length > 0
        ? formatTypeList(adaptivePolicy.suppressedTypes)
        : '';

    const deleteAccountTitle = pendingAuthDelete
        ? t('delete_account_complete')
        : t('delete_account');
    const deleteAccountDesc = pendingAuthDelete
        ? t('delete_account_complete_desc')
        : t('delete_account_desc');

    const toggleSection = (key: string) => {
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const Section: React.FC<{
        id: string;
        title: string;
        subtitle?: string;
        titleStyle?: any;
        children: React.ReactNode;
    }> = ({ id, title, subtitle, titleStyle, children }) => {
        const isOpen = openSections[id] ?? true;
        return (
            <View style={styles.section}>
                <TouchableOpacity
                    style={styles.sectionHeader}
                    onPress={() => toggleSection(id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                >
                    <View style={styles.sectionHeaderText}>
                        <Text style={[styles.sectionTitle, titleStyle]}>{title}</Text>
                        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
                    </View>
                    <Text style={styles.sectionChevron}>{isOpen ? '▼' : '▶'}</Text>
                </TouchableOpacity>
                {isOpen && <View style={styles.sectionBody}>{children}</View>}
            </View>
        );
    };

    const correctionLocations = [
        { key: 'home', label: t('settings.context_correction.home') },
        { key: 'work', label: t('settings.context_correction.work') },
        { key: 'gym', label: t('settings.context_correction.gym') },
        { key: 'outside', label: t('settings.context_correction.outside') },
        { key: 'unknown', label: t('settings.context_correction.unknown') },
    ];

    const correctionStates: Array<{ key: ContextSnapshot['state']; label: string }> = [
        { key: 'resting', label: t('settings.context_correction.resting') },
        { key: 'home_active', label: t('settings.context_correction.home_active') },
        { key: 'working', label: t('settings.context_correction.working') },
        { key: 'walking', label: t('settings.context_correction.walking') },
        { key: 'running', label: t('settings.context_correction.running') },
        { key: 'commuting', label: t('settings.context_correction.commuting') },
        { key: 'driving', label: t('settings.context_correction.driving') },
        { key: 'gym_workout', label: t('settings.context_correction.gym_workout') },
        { key: 'sleeping', label: t('settings.context_correction.sleeping') },
        { key: 'idle', label: t('settings.context_correction.idle') },
        { key: 'unknown', label: t('settings.context_correction.unknown') },
    ];

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    accessibilityLabel={t('back')}
                    accessibilityRole="button"
                >
                    <Text style={styles.backBtn}>← {t('back')}</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle} accessibilityRole="header">{t('settings_title')}</Text>
                <View style={{ width: 50 }} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Account Section */}
                <Section id="account" title={t('account')}>

                    <View style={styles.card}>
                        <View style={styles.profileRow}>
                            <View style={styles.avatarSmall}>
                                <Text style={styles.avatarText}>
                                    {user?.avatarId === 'titan' ? '🦾' : '🤖'}
                                </Text>
                            </View>
                            <View style={styles.profileInfo}>
                                <Text style={styles.profileName}>{user?.name || t('profile_guest')}</Text>
                                <Text style={styles.profileEmail}>
                                    {t('settings.profile.calorie_target', { calories: user?.dailyCalorieTarget || 2000 })}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab' })}>
                                <Text style={styles.editLink}>{t('edit')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.card}>
                        <TouchableOpacity
                            style={styles.settingRowBtn}
                            onPress={() => navigation.navigate('Auth')}
                        >
                            <Text style={styles.settingIcon}>??</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.settingLabel}>{t('settings.account.sign_in')}</Text>
                                <Text style={styles.settingDesc}>
                                    {authSnapshot.isAnonymous
                                        ? providerLabel
                                        : authSnapshot.email
                                            ? `${authSnapshot.email} · ${providerLabel}`
                                            : providerLabel}
                                </Text>
                            </View>
                            <Text style={styles.editLink}>{t('settings.manage')}</Text>
                        </TouchableOpacity>
                    </View>
                </Section>

                {/* Premium Section */}
                <Section id="premium" title={t('settings.premium.title')}>

                    <View style={styles.card}>
                        <View style={styles.premiumHeader}>
                            <View style={styles.premiumInfo}>
                                <Text style={styles.premiumTitle}>
                                    {isPremium ? t('settings.premium.active') : t('settings.premium.upgrade')}
                                </Text>
                                <Text style={styles.premiumSubtitle}>
                                    {isPremium
                                        ? t('settings.premium.active_desc')
                                        : t('settings.premium.upgrade_desc')}
                                </Text>
                            </View>
                            <View style={styles.premiumPriceBadge}>
                                <Text style={styles.premiumPriceText}>{priceLabel}</Text>
                            </View>
                        </View>

                        {!subscriptionReady && (
                            <View style={styles.premiumLoadingRow}>
                                <ActivityIndicator color="#38bdf8" />
                                <Text style={styles.premiumLoadingText}>{t('settings.premium.loading')}</Text>
                            </View>
                        )}
                        {subscriptionError && (
                            <View style={styles.premiumErrorRow}>
                                <Text style={styles.premiumErrorText}>{subscriptionError}</Text>
                            </View>
                        )}

                        <View style={styles.premiumButtonsRow}>
                            {!isPremium && (
                                <TouchableOpacity
                                    style={[
                                        styles.premiumButton,
                                        (!subscriptionReady || subscriptionProcessing) && styles.premiumButtonDisabled,
                                    ]}
                                    onPress={handleSubscribePremium}
                                    disabled={!subscriptionReady || subscriptionProcessing}
                                >
                                    {subscriptionProcessing ? (
                                        <ActivityIndicator color="#0f172a" />
                                    ) : (
                                        <Text style={styles.premiumButtonText}>{t('settings.premium.upgrade')}</Text>
                                    )}
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[
                                    styles.premiumButtonSecondary,
                                    (!subscriptionReady || subscriptionRestoring) && styles.premiumButtonDisabled,
                                ]}
                                onPress={handleRestorePremium}
                                disabled={!subscriptionReady || subscriptionRestoring}
                            >
                                {subscriptionRestoring ? (
                                    <ActivityIndicator color="#38bdf8" />
                                ) : (
                                    <Text style={styles.premiumButtonSecondaryText}>{t('settings.premium.restore')}</Text>
                                )}
                            </TouchableOpacity>
                            {isPremium && manageUrl && (
                                <TouchableOpacity
                                    style={styles.premiumButtonGhost}
                                    onPress={() => openExternalLink(manageUrl)}
                                >
                                    <Text style={styles.premiumButtonGhostText}>{t('settings.manage')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </Section>

                {/* Preferences Section */}
                <Section id="preferences" title={t('preferences')}>

                    <View style={styles.card}>
                        <SettingRow
                            icon="🔔"
                            label={t("notifications")}
                            description={t("notifications_desc")}
                            value={<Switch
                                value={notificationsEnabled}
                                onValueChange={(val) => { void updateNotification(val); }}
                                trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                thumbColor="#ffffff"
                            />}
                        />

                        {notificationsEnabled && (
                            <View style={styles.notificationModeCard}>
                                <Text style={styles.notificationModeLabel}>{t('settings.notifications.level_title')}</Text>
                                <Text style={styles.notificationModeDesc}>
                                    {t('settings.notifications.level_desc')}
                                </Text>
                                <View style={styles.notificationModeRow}>
                                    {(['low', 'medium', 'high'] as NotificationPlanMode[]).map(mode => {
                                        const selected = notificationPlanMode === mode;
                                        const label = mode === 'low'
                                            ? t('settings.notifications.level_low')
                                            : mode === 'medium'
                                                ? t('settings.notifications.level_medium')
                                                : t('settings.notifications.level_high');
                                        return (
                                            <TouchableOpacity
                                                key={mode}
                                                style={[styles.notificationModePill, selected && styles.notificationModePillSelected]}
                                                onPress={() => { void updateNotificationPlanMode(mode); }}
                                            >
                                                <Text style={[styles.notificationModePillText, selected && styles.notificationModePillTextSelected]}>
                                                    {label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        <SettingRow
                            icon="🌙"
                            label={t("dark_mode")}
                            description={t("dark_mode")}
                            value={<Switch
                                value={darkMode}
                                onValueChange={updateDarkMode}
                                trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                thumbColor="#ffffff"
                                disabled={false}
                            />}
                        />

                        <SettingRow
                            icon="📏"
                            label={t("metric_units")}
                            description={t("metric_units_desc")}
                            value={<Switch
                                value={useMetric}
                                onValueChange={updateMetric}
                                trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                thumbColor="#ffffff"
                            />}
                        />

                        <SettingRow
                            icon="🧠"
                            label={t('settings.sensors.context_label')}
                            description={t('settings.sensors.context_desc')}
                            value={<Switch
                                value={contextSensingEnabled}
                                onValueChange={updateContextSensing}
                                trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                thumbColor="#ffffff"
                            />}
                        />

                        <SettingRow
                            icon="🧭"
                            label={t('settings.sensors.environment_label')}
                            description={t('settings.sensors.environment_desc')}
                            value={<Switch
                                value={environmentSensingEnabled}
                                onValueChange={updateEnvironmentSensing}
                                trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                thumbColor="#ffffff"
                            />}
                        />

                        <SettingRow
                            icon="📡"
                            label={t('settings.connectivity.label')}
                            description={t('settings.connectivity.desc')}
                            value={<Switch
                                value={networkMonitoringEnabled}
                                onValueChange={updateNetworkMonitoring}
                                trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                thumbColor="#ffffff"
                            />}
                        />

                        {/* Language Picker */}
                        <TouchableOpacity
                            style={styles.settingRowBtn}
                            onPress={() => setShowLanguagePicker(!showLanguagePicker)}
                        >
                            <Text style={styles.settingIcon}>🌐</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.settingLabel}>{t('language')}</Text>
                                <Text style={styles.settingDesc}>
                                    {AVAILABLE_LANGUAGES.find(l => l.code === language)?.name || t('settings.language.default')}
                                </Text>
                            </View>
                            <Text style={styles.chevron}>{showLanguagePicker ? '▼' : '▶'}</Text>
                        </TouchableOpacity>

                        {showLanguagePicker && (
                            <View style={styles.languageList}>
                                {AVAILABLE_LANGUAGES.map((lang) => (
                                    <TouchableOpacity
                                        key={lang.code}
                                        style={[
                                            styles.languageOption,
                                            language === lang.code && styles.languageOptionActive
                                        ]}
                                        onPress={() => {
                                            setLanguage(lang.code);
                                            setShowLanguagePicker(false);
                                        }}
                                    >
                                        <Text style={styles.languageFlag}>{lang.flag}</Text>
                                        <Text style={[
                                            styles.languageName,
                                            language === lang.code && styles.languageNameActive
                                        ]}>{lang.name}</Text>
                                        {language === lang.code && (
                                            <Text style={styles.checkmark}>✓</Text>
                                        )}
                                    </TouchableOpacity>
                                ))}
                                <Text style={styles.languageNote}>
                                    {t('restart_note')}
                                </Text>
                            </View>
                        )}
                    </View>
                </Section>


                {/* Health Integration Section */}
                <Section id="health" title={t('settings.health.section_title')}>

                    <View style={styles.card}>
                        <SettingRow
                            icon="H"
                            label={t('settings.health.sync_label', { provider: healthProviderLabel })}
                            description={healthAvailable
                                ? t('settings.health.sync_desc')
                                : t('settings.health.unavailable_desc')}
                            value={healthSyncLoading ? (
                                <ActivityIndicator size="small" color="#06b6d4" />
                            ) : (
                                <Switch
                                    value={healthEnabled}
                                    onValueChange={(val) => { void updateHealthSync(val); }}
                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                    thumbColor="#ffffff"
                                    disabled={!healthAvailable}
                                />
                            )}
                        />
                    </View>
                    {isAndroid && (
                        <View style={styles.card}>
                            <Text style={styles.settingLabel}>{t('settings.health.provider_choice_title')}</Text>
                            <Text style={styles.settingDesc}>{t('settings.health.provider_choice_desc')}</Text>
                            <View style={styles.providerChoiceRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.providerChoicePill,
                                        resolvedHealthProvider === 'healthConnect' && styles.providerChoicePillActive,
                                    ]}
                                    onPress={() => { void handleHealthProviderChange('healthConnect'); }}
                                >
                                    <Text
                                        style={[
                                            styles.providerChoiceText,
                                            resolvedHealthProvider === 'healthConnect' && styles.providerChoiceTextActive,
                                        ]}
                                    >
                                        {t('settings.health.provider.health_connect')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.providerChoicePill,
                                        resolvedHealthProvider === 'googleFit' && styles.providerChoicePillActive,
                                    ]}
                                    onPress={() => { void handleHealthProviderChange('googleFit'); }}
                                >
                                    <Text
                                        style={[
                                            styles.providerChoiceText,
                                            resolvedHealthProvider === 'googleFit' && styles.providerChoiceTextActive,
                                        ]}
                                    >
                                        {t('settings.health.provider.google_fit')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.settingHint}>{t('settings.health.provider_choice_hint')}</Text>
                        </View>
                    )}
                    {isAndroid && (
                        <View style={styles.card}>
                            <Text style={styles.settingLabel}>{t('settings.health_connect.title')}</Text>
                            <Text style={styles.settingDesc}>{t('settings.health_connect.desc')}</Text>
                            <View style={styles.healthConnectRow}>
                                <View style={styles.healthConnectMeta}>
                                    <Text style={styles.healthConnectLabel}>{t('settings.health_connect.status_label')}</Text>
                                    <Text style={healthConnectStatusValueStyle}>{healthConnectStatusLabel}</Text>
                                </View>
                                <View style={styles.healthConnectMeta}>
                                    <Text style={styles.healthConnectLabel}>{t('settings.health_connect.permissions_label')}</Text>
                                    <Text style={styles.valueText}>{healthConnectPermissionsLabel}</Text>
                                </View>
                            </View>
                            <View style={styles.healthConnectActions}>
                                <TouchableOpacity style={styles.linkButton} onPress={handleOpenHealthConnect}>
                                    <Text style={styles.linkButtonText}>{t('settings.health_connect.connect_button')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.linkButton}
                                    onPress={handleReconnectHealthConnect}
                                    disabled={healthReconnectLoading}
                                >
                                    {healthReconnectLoading ? (
                                        <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                        <Text style={styles.linkButtonText}>{t('settings.health_connect.reconnect_button')}</Text>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.linkButton} onPress={handleOpenHealthConnectDiagnostics}>
                                    <Text style={styles.linkButtonText}>{t('settings.health_connect.diagnostics_button')}</Text>
                                </TouchableOpacity>
                                {healthConnectNeedsUpdate && (
                                    <TouchableOpacity style={[styles.linkButton, styles.linkButtonWarning]} onPress={handleUpdateHealthConnect}>
                                        <Text style={[styles.linkButtonText, styles.linkButtonWarningText]}>
                                            {t('settings.health_connect.update_button')}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            {healthConnectStatus?.lastCheckedAt && (
                                <Text style={styles.healthConnectUpdated}>
                                    {t('settings.health_connect.last_checked', { date: new Date(healthConnectStatus.lastCheckedAt).toLocaleString(language) })}
                                </Text>
                            )}
                        </View>
                    )}
                    <View style={styles.card}>
                        <Text style={styles.settingLabel}>{t('settings.health_sync_status.title')}</Text>
                        <Text style={styles.settingDesc}>{t('settings.health_sync_status.desc')}</Text>
                        {healthIngestLoading ? (
                            <ActivityIndicator size="small" color="#06b6d4" style={styles.healthIngestLoading} />
                        ) : (
                            <>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.health_sync_status.last_ingest')}</Text>
                                    <Text style={styles.valueText}>
                                        {formatIngestTimestamp(healthIngestStatus?.lastSuccessAt)}
                                    </Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.health_sync_status.last_snapshot')}</Text>
                                    <Text style={styles.valueText}>
                                        {formatIngestTimestamp(healthIngestStatus?.lastSnapshotAt)}
                                    </Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.health_sync_status.permissions')}</Text>
                                    <Text style={styles.valueText}>{healthIngestPermissionsLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.health_sync_status.last_trigger')}</Text>
                                    <Text style={styles.valueText}>{healthIngestLastTriggerLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.health_sync_status.last_samples')}</Text>
                                    <Text style={styles.valueText}>{healthIngestSampleLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.health_sync_status.last_error')}</Text>
                                    <Text
                                        style={[
                                            styles.valueText,
                                            healthIngestStatus?.lastError ? styles.healthIngestErrorText : null,
                                        ]}
                                    >
                                        {healthIngestStatus?.lastError ?? t('settings.health_sync_status.no_error')}
                                    </Text>
                                </View>
                            </>
                        )}
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.settingLabel}>{t('settings.context_status.title')}</Text>
                        <Text style={styles.settingDesc}>{t('settings.context_status.desc')}</Text>
                        {contextStatusLoading ? (
                            <ActivityIndicator size="small" color="#06b6d4" style={styles.healthIngestLoading} />
                        ) : (
                            <>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.context_status.last_update')}</Text>
                                    <Text style={styles.valueText}>
                                        {formatContextTimestamp(contextStatus?.lastUpdatedAt)}
                                    </Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.context_status.state')}</Text>
                                    <Text style={styles.valueText}>{contextStateLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.context_status.environment')}</Text>
                                    <Text style={styles.valueText}>{contextEnvironmentLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.context_status.confidence')}</Text>
                                    <Text style={styles.valueText}>{contextConfidenceLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.context_status.poll_tier')}</Text>
                                    <Text style={styles.valueText}>{contextPollTierLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.context_status.avg_confidence')}</Text>
                                    <Text style={styles.valueText}>{contextAvgConfidenceLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.context_status.conflict_rate')}</Text>
                                    <Text style={styles.valueText}>{contextConflictRateLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.context_status.conflicts')}</Text>
                                    <Text style={styles.valueText}>{contextConflictLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('settings.context_status.sensors')}</Text>
                                    <Text style={styles.valueText}>{contextSensorLabel}</Text>
                                </View>
                                <View style={styles.healthConnectActions}>
                                    <TouchableOpacity style={styles.linkButton} onPress={openContextCorrection}>
                                        <Text style={styles.linkButtonText}>{t('settings.context_status.correct')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.linkButton} onPress={handleExportContextDiagnostics}>
                                        <Text style={styles.linkButtonText}>{t('export_data')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.settingLabel}>{t('body_progress.settings.title')}</Text>
                        <Text style={styles.settingDesc}>{t('body_progress.subtitle')}</Text>
                        {bodyProgressLoading ? (
                            <ActivityIndicator size="small" color="#06b6d4" style={styles.healthIngestLoading} />
                        ) : (
                            <>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('body_progress.settings.next_scan')}</Text>
                                    <Text style={styles.valueText}>{bodyProgressNextScanLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('body_progress.consent.title')}</Text>
                                    <Text style={styles.valueText}>{bodyProgressConsentLabel}</Text>
                                </View>
                                <View style={styles.healthIngestRow}>
                                    <Text style={styles.healthIngestLabel}>{t('body_progress.settings.reminder')}</Text>
                                    <Switch
                                        value={!!bodyProgressSettings?.reminderEnabled}
                                        onValueChange={(val) => { void handleToggleBodyReminder(val); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                </View>
                                <View style={styles.healthConnectActions}>
                                    <TouchableOpacity style={styles.linkButton} onPress={handleOpenBodyProgress}>
                                        <Text style={styles.linkButtonText}>{t('body_progress.settings.open_timeline')}</Text>
                                    </TouchableOpacity>
                                    {bodyPhotoConsent?.granted && (
                                        <TouchableOpacity style={styles.linkButton} onPress={handleRevokeBodyConsent}>
                                            <Text style={styles.linkButtonText}>{t('body_progress.settings.revoke_consent')}</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity style={[styles.linkButton, styles.linkButtonWarning]} onPress={handleClearBodyProgress}>
                                        <Text style={[styles.linkButtonText, styles.linkButtonWarningText]}>{t('body_progress.settings.clear_scans')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.settingLabel}>{t('settings.health.consent_title')}</Text>
                        <Text style={styles.settingDesc}>{t('settings.health.consent_desc')}</Text>
                        <View style={styles.consentRow}>
                            <Text style={styles.consentStatus}>
                                {healthConsent?.granted ? t('settings.health.consent_granted') : t('settings.health.consent_required')}
                            </Text>
                            <Text style={styles.valueText}>{formatConsentTimestamp(healthConsent?.timestamp)}</Text>
                        </View>
                        <View style={styles.consentMetaRow}>
                            <Text style={styles.consentMetaLabel}>{t('settings.health.consent_source_label')}</Text>
                            <Text style={styles.valueText}>{formatConsentSource(healthConsent?.source)}</Text>
                        </View>
                        <View style={styles.consentMetaRow}>
                            <Text style={styles.consentMetaLabel}>{t('settings.health.consent_version_label')}</Text>
                            <Text style={styles.valueText}>
                                {healthConsent?.version ? String(healthConsent.version) : '—'}
                            </Text>
                        </View>
                        {healthConsent?.granted ? (
                            <TouchableOpacity style={styles.consentButton} onPress={handleRevokeHealthConsent}>
                                <Text style={styles.consentButtonText}>{t('settings.health.consent_revoke')}</Text>
                            </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity style={styles.consentButtonSecondary} onPress={handleExportHealthConsent}>
                            <Text style={styles.consentButtonSecondaryText}>{t('settings.health.consent_export')}</Text>
                        </TouchableOpacity>
                    </View>
                    {isPremium ? (
                        <View style={styles.card}>
                            <Text style={styles.settingLabel}>{t('settings.bio.title')}</Text>
                            <Text style={styles.settingDesc}>{t('settings.bio.share_description')}</Text>

                            <SettingRow
                                icon="🫀"
                                label={t('settings.bio.enable_hrv')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableHRV}
                                        onValueChange={(val) => { void updateBioConfig({ enableHRV: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="❤️"
                                label={t('settings.bio.enable_resting_hr')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableRestingHR}
                                        onValueChange={(val) => { void updateBioConfig({ enableRestingHR: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🩸"
                                label={t('settings.bio.enable_spo2')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableSpO2}
                                        onValueChange={(val) => { void updateBioConfig({ enableSpO2: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🌡️"
                                label={t('settings.bio.enable_body_temp')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableBodyTemp}
                                        onValueChange={(val) => { void updateBioConfig({ enableBodyTemp: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🌡️"
                                label={t('settings.bio.enable_basal_body_temp')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableBasalBodyTemp}
                                        onValueChange={(val) => { void updateBioConfig({ enableBasalBodyTemp: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🫁"
                                label={t('settings.bio.enable_respiratory_rate')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableRespiratoryRate}
                                        onValueChange={(val) => { void updateBioConfig({ enableRespiratoryRate: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🏃"
                                label={t('settings.bio.enable_vo2max')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableVo2Max}
                                        onValueChange={(val) => { void updateBioConfig({ enableVo2Max: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🩸"
                                label={t('settings.bio.enable_blood_glucose')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableBloodGlucose}
                                        onValueChange={(val) => { void updateBioConfig({ enableBloodGlucose: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🔥"
                                label={t('settings.bio.enable_bmr')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableBasalMetabolicRate}
                                        onValueChange={(val) => { void updateBioConfig({ enableBasalMetabolicRate: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="⚖️"
                                label={t('settings.bio.enable_body_weight')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableBodyWeight}
                                        onValueChange={(val) => { void updateBioConfig({ enableBodyWeight: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="📊"
                                label={t('settings.bio.enable_body_fat')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableBodyFat}
                                        onValueChange={(val) => { void updateBioConfig({ enableBodyFat: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="💧"
                                label={t('settings.bio.enable_hydration')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableHydration}
                                        onValueChange={(val) => { void updateBioConfig({ enableHydration: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🍽️"
                                label={t('settings.bio.enable_nutrition')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableNutrition}
                                        onValueChange={(val) => { void updateBioConfig({ enableNutrition: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🏋️"
                                label={t('settings.bio.enable_exercise_sessions')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableExerciseSessions}
                                        onValueChange={(val) => { void updateBioConfig({ enableExerciseSessions: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🌸"
                                label={t('settings.bio.enable_menstruation')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableMenstruation}
                                        onValueChange={(val) => { void updateBioConfig({ enableMenstruation: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="👣"
                                label={t('settings.bio.enable_steps')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableSteps}
                                        onValueChange={(val) => { void updateBioConfig({ enableSteps: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🛣️"
                                label={t('settings.bio.enable_distance')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableDistance}
                                        onValueChange={(val) => { void updateBioConfig({ enableDistance: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🔥"
                                label={t('settings.bio.enable_active_calories')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableActiveCalories}
                                        onValueChange={(val) => { void updateBioConfig({ enableActiveCalories: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="❤️"
                                label={t('settings.bio.enable_current_hr')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableCurrentHR}
                                        onValueChange={(val) => { void updateBioConfig({ enableCurrentHR: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="😴"
                                label={t('settings.bio.enable_sleep_stages')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.enableSleepStages}
                                        onValueChange={(val) => { void updateBioConfig({ enableSleepStages: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />
                            <SettingRow
                                icon="🤖"
                                label={t('settings.bio.share_with_ai')}
                                value={(
                                    <Switch
                                        value={!!bioConfig.shareWithAI}
                                        onValueChange={(val) => { void updateBioConfig({ shareWithAI: val }); }}
                                        trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                        thumbColor="#ffffff"
                                    />
                                )}
                            />

                            <View style={styles.settingRow}>
                                <Text style={styles.settingIcon}>🗓️</Text>
                                <View style={styles.settingContent}>
                                    <Text style={styles.settingLabel}>{t('settings.bio.data_retention')}</Text>
                                </View>
                                <View style={styles.retentionButtons}>
                                    {[7, 30, 90].map((days) => {
                                        const active = bioConfig.dataRetentionDays === days;
                                        return (
                                            <TouchableOpacity
                                                key={days}
                                                style={[styles.retentionButton, active && styles.retentionButtonActive]}
                                                onPress={() => { void updateBioConfig({ dataRetentionDays: days }); }}
                                            >
                                                <Text style={[styles.retentionButtonText, active && styles.retentionButtonTextActive]}>
                                                    {days}d
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.bioActionRow}>
                                <TouchableOpacity style={styles.dataButton} onPress={handleExportBioData}>
                                    <Text style={styles.dataButtonIcon}>📤</Text>
                                    <Text style={styles.dataButtonText}>{t('settings.bio.export_data')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.dataButton} onPress={handleClearBioData}>
                                    <Text style={styles.dataButtonIcon}>🗑️</Text>
                                    <Text style={styles.dataButtonText}>{t('settings.bio.clear_data')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.card}>
                            <Text style={styles.settingLabel}>{t('settings.bio.title')}</Text>
                            <Text style={styles.settingDesc}>{t('settings.premium.upgrade_desc')}</Text>
                            <TouchableOpacity
                                style={[
                                    styles.premiumButton,
                                    (!subscriptionReady || subscriptionProcessing) && styles.premiumButtonDisabled,
                                ]}
                                onPress={handleSubscribePremium}
                                disabled={!subscriptionReady || subscriptionProcessing}
                            >
                                <Text style={styles.premiumButtonText}>{t('settings.premium.upgrade')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </Section>

                {/* Location Section */}
                <Section
                    id="location"
                    title={t('settings.location.section_title')}
                    subtitle={t('settings.location.section_subtitle')}
                >

                    {pendingLocationSave && (
                        <View style={styles.card}>
                            <Text style={styles.pendingLocationTitle}>{t('settings.location.pending_title')}</Text>
                            <Text style={styles.pendingLocationSubtitle}>
                                {t('settings.location.pending_subtitle')}
                            </Text>
                            <View style={styles.pendingLocationActions}>
                                <TouchableOpacity style={styles.setBtn} onPress={() => handleSavePendingLocation('home')}>
                                    <Text style={styles.setBtnText}>
                                        {t('settings.location.set_label', { label: getLocationLabel('home') })}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.setBtn} onPress={() => handleSavePendingLocation('work')}>
                                    <Text style={styles.setBtnText}>
                                        {t('settings.location.set_label', { label: getLocationLabel('work') })}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.setBtn} onPress={() => handleSavePendingLocation('gym')}>
                                    <Text style={styles.setBtnText}>
                                        {t('settings.location.set_label', { label: getLocationLabel('gym') })}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity style={styles.pendingLocationDismiss} onPress={handleDismissPendingLocation}>
                                <Text style={styles.pendingLocationDismissText}>{t('settings.location.dismiss')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={styles.card}>
                        {(['home', 'work', 'gym'] as LocationLabel[]).map((locType) => {
                            const saved = savedLocations[locType];
                            const emoji = locType === 'home' ? '🏠' : locType === 'work' ? '💼' : '💪';
                            const label = getLocationLabel(locType);

                            return (
                                <View key={locType} style={styles.locationRow}>
                                    <View style={styles.locationInfo}>
                                        <Text style={styles.locationLabel}>{emoji} {label}</Text>
                                        <Text style={styles.locationAddress} numberOfLines={1}>
                                            {saved ? saved.address : t('settings.location.not_set')}
                                        </Text>
                                    </View>
                                    {saved ? (
                                        <TouchableOpacity
                                            style={styles.removeBtn}
                                            onPress={() => handleRemoveLocation(locType)}
                                        >
                                            <Text style={styles.removeBtnText}>{t('remove')}</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity
                                            style={styles.setBtn}
                                            onPress={() => handleSetLocation(locType)}
                                        >
                                            <Text style={styles.setBtnText}>{t('settings.location.set_here')}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                </Section>

                <Section
                    id="permissions"
                    title={t('permissions.title')}
                    subtitle={t('permissions.subtitle')}
                >
                    <PermissionSettingsSection showHeader={false} />
                </Section>

                {/* Floating Reminders Section - Android Only */}
                {isAndroid && (
                    <Section
                        id="overlay"
                        title={t('settings.overlay.section_title')}
                        subtitle={t('settings.overlay.section_subtitle')}
                    >

                        <View style={styles.card}>
                            {/* Master Toggle */}
                            <SettingRow
                                icon="🔔"
                                label={t('settings.overlay.enable_title')}
                                description={overlaySettings.permissionGranted
                                    ? t('settings.overlay.enable_desc')
                                    : t('settings.overlay.enable_desc_permission')}
                                value={<Switch
                                    value={overlaySettings.enabled}
                                    onValueChange={(val) => { void toggleOverlayEnabled(val); }}
                                    trackColor={{ false: '#1e293b', true: '#22c55e' }}
                                    thumbColor="#ffffff"
                                />}
                            />

                            {overlaySettings.enabled && (
                                <>
                                    <SettingRow
                                        icon="⚡"
                                        label={t('settings.overlay.ad_recharge_after_wake_title')}
                                        description={t('settings.overlay.ad_recharge_after_wake_desc')}
                                        value={<Switch
                                            value={adRechargeOnWake}
                                            onValueChange={(val) => { void toggleAdRechargeOnWake(val); }}
                                            trackColor={{ false: '#1e293b', true: '#f59e0b' }}
                                            thumbColor="#ffffff"
                                            disabled={!overlaySettings.permissionGranted}
                                        />}
                                    />
                                    <SettingRow
                                        icon="🚪"
                                        label={t('settings.overlay.ad_recharge_background_title')}
                                        description={t('settings.overlay.ad_recharge_background_desc')}
                                        value={<Switch
                                            value={adRechargeOnBackground}
                                            onValueChange={(val) => { void toggleAdRechargeOnBackground(val); }}
                                            trackColor={{ false: '#1e293b', true: '#f97316' }}
                                            thumbColor="#ffffff"
                                            disabled={!overlaySettings.permissionGranted}
                                        />}
                                    />
                                    {/* Mode Selector */}
                                    <View style={styles.overlayModeCard}>
                                        <Text style={styles.overlayModeLabel}>{t('settings.overlay.mode_title')}</Text>
                                        <Text style={styles.overlayModeDesc}>
                                            {t('settings.overlay.mode_desc')}
                                        </Text>
                                        <View style={styles.overlayModeRow}>
                                            {(['low', 'medium', 'high'] as NotificationPlanMode[]).map(mode => {
                                                const selected = overlaySettings.mode === mode;
                                                const label = mode === 'low'
                                                    ? t('settings.overlay.mode_low')
                                                    : mode === 'medium'
                                                        ? t('settings.overlay.mode_medium')
                                                        : t('settings.overlay.mode_high');
                                                const emoji = mode === 'low' ? '🍔' : mode === 'medium' ? '💪' : '⚡';
                                                return (
                                                    <TouchableOpacity
                                                        key={mode}
                                                        style={[styles.overlayModePill, selected && styles.overlayModePillSelected]}
                                                        onPress={() => { void updateOverlayMode(mode); }}
                                                    >
                                                        <Text style={[styles.overlayModePillText, selected && styles.overlayModePillTextSelected]}>
                                                            {emoji} {label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>

                                    {/* Individual Type Toggles */}
                                    <TouchableOpacity
                                        style={styles.overlayDetailsToggle}
                                        onPress={() => setShowOverlayDetails(!showOverlayDetails)}
                                    >
                                        <Text style={styles.overlayDetailsToggleText}>
                                            {t('settings.overlay.controls_title')}
                                        </Text>
                                        <Text style={styles.chevron}>{showOverlayDetails ? '▼' : '▶'}</Text>
                                    </TouchableOpacity>

                                    {showOverlayDetails && (
                                        <View style={styles.overlayTypesContainer}>
                                            {/* Type Toggles */}
                                            <View style={styles.overlayTypeRow}>
                                                <Text style={styles.overlayTypeIcon}>🍔</Text>
                                                <Text style={styles.overlayTypeLabel}>{t('settings.overlay.type.meal')}</Text>
                                                <Switch
                                                    value={overlayTypes.meal}
                                                    onValueChange={(val) => { void toggleOverlayType('meal', val); }}
                                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                                    thumbColor="#ffffff"
                                                />
                                            </View>
                                            <View style={styles.overlayTypeRow}>
                                                <Text style={styles.overlayTypeIcon}>💧</Text>
                                                <Text style={styles.overlayTypeLabel}>{t('settings.overlay.type.hydration')}</Text>
                                                <Switch
                                                    value={overlayTypes.hydration}
                                                    onValueChange={(val) => { void toggleOverlayType('hydration', val); }}
                                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                                    thumbColor="#ffffff"
                                                />
                                            </View>
                                            <View style={styles.overlayTypeRow}>
                                                <Text style={styles.overlayTypeIcon}>💪</Text>
                                                <Text style={styles.overlayTypeLabel}>{t('settings.overlay.type.workout')}</Text>
                                                <Switch
                                                    value={overlayTypes.workout}
                                                    onValueChange={(val) => { void toggleOverlayType('workout', val); }}
                                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                                    thumbColor="#ffffff"
                                                />
                                            </View>
                                            <View style={styles.overlayTypeRow}>
                                                <Text style={styles.overlayTypeIcon}>😴</Text>
                                                <Text style={styles.overlayTypeLabel}>{t('settings.overlay.type.sleep')}</Text>
                                                <Switch
                                                    value={overlayTypes.sleep}
                                                    onValueChange={(val) => { void toggleOverlayType('sleep', val); }}
                                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                                    thumbColor="#ffffff"
                                                />
                                            </View>
                                            <View style={styles.overlayTypeRow}>
                                                <Text style={styles.overlayTypeIcon}>⏰</Text>
                                                <Text style={styles.overlayTypeLabel}>{t('settings.overlay.type.work_break')}</Text>
                                                <Switch
                                                    value={overlayTypes.workBreak}
                                                    onValueChange={(val) => { void toggleOverlayType('workBreak', val); }}
                                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                                    thumbColor="#ffffff"
                                                />
                                            </View>
                                            <View style={styles.overlayTypeRow}>
                                                <Text style={styles.overlayTypeIcon}>🌙</Text>
                                                <Text style={styles.overlayTypeLabel}>{t('settings.overlay.type.wrap_up')}</Text>
                                                <Switch
                                                    value={overlayTypes.wrapUp}
                                                    onValueChange={(val) => { void toggleOverlayType('wrapUp', val); }}
                                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                                    thumbColor="#ffffff"
                                                />
                                            </View>
                                            <View style={styles.overlayTypeRow}>
                                                <Text style={styles.overlayTypeIcon}>⚖️</Text>
                                                <Text style={styles.overlayTypeLabel}>{t('settings.overlay.type.weight_check')}</Text>
                                                <Switch
                                                    value={overlayTypes.weightCheck}
                                                    onValueChange={(val) => { void toggleOverlayType('weightCheck', val); }}
                                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                                    thumbColor="#ffffff"
                                                />
                                            </View>

                                            {/* Enable/Disable All Buttons */}
                                            <View style={styles.overlayBulkButtons}>
                                                <TouchableOpacity
                                                    style={styles.overlayBulkBtn}
                                                    onPress={() => { void enableAllOverlayTypes(); }}
                                                >
                                                    <Text style={styles.overlayBulkBtnText}>{t('settings.overlay.enable_all')}</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.overlayBulkBtn, styles.overlayBulkBtnDanger]}
                                                    onPress={() => { void disableAllOverlayTypes(); }}
                                                >
                                                    <Text style={styles.overlayBulkBtnText}>{t('settings.overlay.disable_all')}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    </Section>
                )}

                {/* Auto Sleep Tracking Section - Android Only */}
                {isAndroid && (
                    <Section
                        id="autoSleep"
                        title={t('settings.auto_sleep.section_title')}
                        subtitle={t('settings.auto_sleep.section_subtitle')}
                    >

                        <View style={styles.card}>
                            {/* Master Toggle */}
                            <SettingRow
                                icon="🌙"
                                label={t('settings.auto_sleep.enable_title')}
                                description={t('settings.auto_sleep.enable_desc')}
                                value={<Switch
                                    value={autoSleepSettings.enabled}
                                    onValueChange={(val) => { void toggleAutoSleepEnabled(val); }}
                                    trackColor={{ false: '#1e293b', true: '#8b5cf6' }}
                                    thumbColor="#ffffff"
                                />}
                            />

                            {autoSleepSettings.enabled && (
                                <>
                                    {/* Sensitivity Selector */}
                                    <View style={styles.overlayModeCard}>
                                        <Text style={styles.overlayModeLabel}>{t('settings.auto_sleep.sensitivity_title')}</Text>
                                        <Text style={styles.overlayModeDesc}>
                                            {t('settings.auto_sleep.sensitivity_desc')}
                                        </Text>
                                        <View style={styles.overlayModeRow}>
                                            {(['low', 'medium', 'high'] as const).map(level => {
                                                const selected = autoSleepSettings.sensitivityLevel === level;
                                                const label = level === 'low'
                                                    ? t('settings.auto_sleep.level_low')
                                                    : level === 'medium'
                                                        ? t('settings.auto_sleep.level_medium')
                                                        : t('settings.auto_sleep.level_high');
                                                const emoji = level === 'low' ? '🐢' : level === 'medium' ? '🎯' : '⚡';
                                                return (
                                                    <TouchableOpacity
                                                        key={level}
                                                        style={[styles.overlayModePill, selected && styles.autoSleepPillSelected]}
                                                        onPress={() => { void updateAutoSleepSensitivity(level); }}
                                                    >
                                                        <Text style={[styles.overlayModePillText, selected && styles.overlayModePillTextSelected]}>
                                                            {emoji} {label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>

                                    {/* Anytime Mode Toggle - Main feature */}
                                    <View style={styles.overlayTypeRow}>
                                        <Text style={styles.overlayTypeIcon}>🌐</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.overlayTypeLabel}>{t('settings.auto_sleep.anytime_title')}</Text>
                                            <Text style={[styles.settingDesc, { fontSize: 11, marginTop: 2 }]}>
                                                {t('settings.auto_sleep.anytime_desc')}
                                            </Text>
                                        </View>
                                        <Switch
                                            value={autoSleepSettings.anytimeMode ?? true}
                                            onValueChange={(val) => { void toggleAnytimeMode(val); }}
                                            trackColor={{ false: '#1e293b', true: '#8b5cf6' }}
                                            thumbColor="#ffffff"
                                        />
                                    </View>

                                    {/* Background Location for improved sleep context */}
                                    <View style={styles.overlayTypeRow}>
                                        <Text style={styles.overlayTypeIcon}>📍</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.overlayTypeLabel}>{t('settings.auto_sleep.location_title')}</Text>
                                            <Text style={[styles.settingDesc, { fontSize: 11, marginTop: 2 }]}>
                                                {t('settings.auto_sleep.location_desc')}
                                            </Text>
                                        </View>
                                        <Switch
                                            value={backgroundLocationEnabled && backgroundStatus === 'granted'}
                                            onValueChange={(val) => { void handleBackgroundLocationToggle(val); }}
                                            trackColor={{ false: '#1e293b', true: '#8b5cf6' }}
                                            thumbColor="#ffffff"
                                            disabled={isBackgroundLocationRequesting}
                                        />
                                    </View>

                                    {/* Scheduled Mode Settings - only show when NOT in anytime mode */}
                                    {!autoSleepSettings.anytimeMode && (
                                        <>
                                            {/* Require Charging Toggle */}
                                            <View style={styles.overlayTypeRow}>
                                                <Text style={styles.overlayTypeIcon}>🔌</Text>
                                                <Text style={styles.overlayTypeLabel}>{t('settings.auto_sleep.only_charging')}</Text>
                                                <Switch
                                                    value={autoSleepSettings.requireCharging}
                                                    onValueChange={(val) => { void toggleAutoSleepRequireCharging(val); }}
                                                    trackColor={{ false: '#1e293b', true: '#8b5cf6' }}
                                                    thumbColor="#ffffff"
                                                />
                                            </View>

                                            {/* Night Hours Info */}
                                            <View style={styles.autoSleepInfoRow}>
                                                <Text style={styles.autoSleepInfoLabel}>{t('settings.auto_sleep.night_hours')}</Text>
                                                <Text style={styles.autoSleepInfoValue}>
                                                    {t('settings.auto_sleep.night_hours_value', {
                                                        start: autoSleepSettings.nightStartHour,
                                                        end: autoSleepSettings.nightEndHour,
                                                    })}
                                                </Text>
                                            </View>
                                        </>
                                    )}

                                    {/* Advanced Settings Toggle */}
                                    <TouchableOpacity
                                        style={styles.overlayDetailsToggle}
                                        onPress={() => setShowAutoSleepDetails(!showAutoSleepDetails)}
                                    >
                                        <Text style={styles.overlayDetailsToggleText}>
                                            {t('settings.auto_sleep.advanced_title')}
                                        </Text>
                                        <Text style={styles.chevron}>{showAutoSleepDetails ? '▼' : '▶'}</Text>
                                    </TouchableOpacity>

                                    {showAutoSleepDetails && (
                                        <View style={styles.overlayTypesContainer}>
                                            <View style={styles.autoSleepInfoRow}>
                                                <Text style={styles.autoSleepInfoLabel}>{t('settings.auto_sleep.stillness_threshold')}</Text>
                                                <Text style={styles.autoSleepInfoValue}>
                                                    {t('settings.auto_sleep.minutes_value', { minutes: autoSleepSettings.stillnessThresholdMinutes })}
                                                </Text>
                                            </View>
                                            <View style={styles.autoSleepInfoRow}>
                                                <Text style={styles.autoSleepInfoLabel}>{t('settings.auto_sleep.sleep_probe_snooze')}</Text>
                                                <Text style={styles.autoSleepInfoValue}>
                                                    {t('settings.auto_sleep.minutes_value', { minutes: autoSleepSettings.sleepProbeSnoozeMinutes })}
                                                </Text>
                                            </View>
                                            <View style={styles.autoSleepInfoRow}>
                                                <Text style={styles.autoSleepInfoLabel}>{t('settings.auto_sleep.wake_snooze')}</Text>
                                                <Text style={styles.autoSleepInfoValue}>
                                                    {t('settings.auto_sleep.minutes_value', { minutes: autoSleepSettings.wakeSnoozeMinutes })}
                                                </Text>
                                            </View>
                                            <View style={styles.autoSleepInfoRow}>
                                                <Text style={styles.autoSleepInfoLabel}>{t('settings.auto_sleep.max_tracking')}</Text>
                                                <Text style={styles.autoSleepInfoValue}>
                                                    {t('settings.auto_sleep.hours_value', { hours: autoSleepSettings.maxTrackingHours })}
                                                </Text>
                                            </View>
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    </Section>
                )}

                {/* Adaptive Insights Section */}
                <Section
                    id="adaptive"
                    title={t('settings.adaptive.section_title')}
                    subtitle={t('settings.adaptive.section_subtitle')}
                >

                    <View style={styles.card}>
                        <Text style={styles.adaptiveSummary}>{adaptiveSummaryText}</Text>

                        {hasAdaptiveDetails && (
                            <View style={styles.adaptiveMetaList}>
                                {adaptivePolicy.preferredHours.length > 0 && (
                                    <Text style={styles.adaptiveMeta}>
                                        {t('settings.adaptive.preferred_hours', { hours: preferredHoursLabel })}
                                    </Text>
                                )}
                                {adaptivePolicy.suppressedHours.length > 0 && (
                                    <Text style={styles.adaptiveMeta}>
                                        {t('settings.adaptive.suppressed_hours', { hours: suppressedHoursLabel })}
                                    </Text>
                                )}
                                {adaptivePolicy.suppressedTypes.length > 0 && (
                                    <Text style={styles.adaptiveMeta}>
                                        {t('settings.adaptive.suppressed_types', { types: suppressedTypesLabel })}
                                    </Text>
                                )}
                            </View>
                        )}

                        <TouchableOpacity style={styles.adaptiveResetButton} onPress={handleResetAdaptation}>
                            <Text style={styles.adaptiveResetButtonText}>{t('settings.adaptive.reset_button')}</Text>
                        </TouchableOpacity>
                    </View>
                </Section>

                {/* Data Section */}
                <Section id="data" title={t('your_data')}>

                    <View style={styles.card}>
                        <View style={styles.dataStats}>
                            <DataStat label={t('food_logs')} value={dataStats.foodLogs} icon="🍔" />
                            <DataStat label={t('mood_logs')} value={dataStats.moodLogs} icon="😊" />
                            <DataStat label={t('weight_logs')} value={dataStats.weightLogs} icon="⚖️" />
                            <DataStat label={t('activities')} value={dataStats.activityLogs} icon="🏃" />
                        </View>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.settingLabel}>{t('settings.context_privacy.title')}</Text>
                        <Text style={styles.settingDesc}>{t('settings.context_privacy.desc')}</Text>

                        <SettingRow
                            icon="🧭"
                            label={t('settings.context_privacy.history_label')}
                            description={t('settings.context_privacy.history_desc')}
                            value={(
                                <Switch
                                    value={effectiveContextPolicy.contextHistoryEnabled}
                                    onValueChange={(val) => {
                                        if (contextPolicyLoading) return;
                                        void updateContextPolicySetting({ contextHistoryEnabled: val });
                                    }}
                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                    thumbColor="#ffffff"
                                    disabled={contextPolicyLoading}
                                />
                            )}
                        />
                        <SettingRow
                            icon="📡"
                            label={t('settings.context_privacy.signal_label')}
                            description={t('settings.context_privacy.signal_desc')}
                            value={(
                                <Switch
                                    value={effectiveContextPolicy.contextSignalHistoryEnabled}
                                    onValueChange={(val) => {
                                        if (contextPolicyLoading) return;
                                        void updateContextPolicySetting({ contextSignalHistoryEnabled: val });
                                    }}
                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                    thumbColor="#ffffff"
                                    disabled={contextPolicyLoading}
                                />
                            )}
                        />
                        <SettingRow
                            icon="✨"
                            label={t('settings.context_privacy.learning_label')}
                            description={t('settings.context_privacy.learning_desc')}
                            value={(
                                <Switch
                                    value={effectiveContextPolicy.contextLearningEnabled}
                                    onValueChange={(val) => {
                                        if (contextPolicyLoading) return;
                                        void updateContextPolicySetting({ contextLearningEnabled: val });
                                    }}
                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                    thumbColor="#ffffff"
                                    disabled={contextPolicyLoading}
                                />
                            )}
                        />
                        <SettingRow
                            icon="🧪"
                            label={t('settings.context_privacy.diagnostics_label')}
                            description={t('settings.context_privacy.diagnostics_desc')}
                            value={(
                                <Switch
                                    value={effectiveContextPolicy.contextDiagnosticsEnabled}
                                    onValueChange={(val) => {
                                        if (contextPolicyLoading) return;
                                        void updateContextPolicySetting({ contextDiagnosticsEnabled: val });
                                    }}
                                    trackColor={{ false: '#1e293b', true: '#06b6d4' }}
                                    thumbColor="#ffffff"
                                    disabled={contextPolicyLoading}
                                />
                            )}
                        />

                        <View style={styles.settingDivider} />

                        <Text style={styles.settingLabel}>{t('settings.context_privacy.mode_title')}</Text>
                        <Text style={styles.settingDesc}>{t('settings.context_privacy.mode_desc', { mode: contextPrivacyLabel })}</Text>
                        <View style={styles.providerChoiceRow}>
                            <TouchableOpacity
                                style={[
                                    styles.providerChoicePill,
                                    effectiveContextPolicy.contextPrivacyMode === 'standard' && styles.providerChoicePillActive,
                                    contextPolicyLoading && styles.buttonDisabled,
                                ]}
                                onPress={() => {
                                    if (contextPolicyLoading) return;
                                    void updateContextPolicySetting({ contextPrivacyMode: 'standard' });
                                }}
                                disabled={contextPolicyLoading}
                            >
                                <Text
                                    style={[
                                        styles.providerChoiceText,
                                        effectiveContextPolicy.contextPrivacyMode === 'standard' && styles.providerChoiceTextActive,
                                    ]}
                                >
                                    {t('settings.context_privacy.mode_standard')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.providerChoicePill,
                                    effectiveContextPolicy.contextPrivacyMode === 'minimal' && styles.providerChoicePillActive,
                                    contextPolicyLoading && styles.buttonDisabled,
                                ]}
                                onPress={() => {
                                    if (contextPolicyLoading) return;
                                    void updateContextPolicySetting({ contextPrivacyMode: 'minimal' });
                                }}
                                disabled={contextPolicyLoading}
                            >
                                <Text
                                    style={[
                                        styles.providerChoiceText,
                                        effectiveContextPolicy.contextPrivacyMode === 'minimal' && styles.providerChoiceTextActive,
                                    ]}
                                >
                                    {t('settings.context_privacy.mode_minimal')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.settingHint}>{t('settings.context_privacy.mode_hint')}</Text>

                        <SettingRow
                            icon="🗓️"
                            label={t('settings.context_privacy.history_retention')}
                            description={t('settings.context_privacy.history_retention_desc')}
                            value={renderStepper(
                                effectiveContextPolicy.contextHistoryDays,
                                (next) => {
                                    if (contextPolicyLoading) return;
                                    void updateContextPolicySetting({ contextHistoryDays: next });
                                },
                                { min: 1, max: 30, step: 1, suffix: t('settings.context_privacy.days_suffix') }
                            )}
                        />
                        <SettingRow
                            icon="⏱️"
                            label={t('settings.context_privacy.signal_retention')}
                            description={t('settings.context_privacy.signal_retention_desc')}
                            value={renderStepper(
                                effectiveContextPolicy.contextSignalHistoryHours,
                                (next) => {
                                    if (contextPolicyLoading) return;
                                    void updateContextPolicySetting({ contextSignalHistoryHours: next });
                                },
                                { min: 6, max: 168, step: 6, suffix: t('settings.context_privacy.hours_suffix') }
                            )}
                        />

                        <View style={styles.healthConnectActions}>
                            <TouchableOpacity style={styles.linkButton} onPress={handleOpenContextDiagnostics}>
                                <Text style={styles.linkButtonText}>{t('settings.context_privacy.diagnostics_button')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.linkButton, styles.linkButtonWarning]} onPress={handleClearContextData}>
                                <Text style={[styles.linkButtonText, styles.linkButtonWarningText]}>
                                    {t('settings.context_privacy.clear_button')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.card}>
                        <View style={styles.settingRow}>
                            <Text style={styles.settingIcon}>??</Text>
                            <View style={styles.settingContent}>
                                <Text style={styles.settingLabel}>{t('settings.cloud.backup_label')}</Text>
                                <Text style={styles.settingDesc}>{cloudSyncDesc}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleCloudSync}
                                disabled={cloudSyncing}
                            >
                                <Text style={styles.editLink}>
                                    {cloudSyncing ? t('settings.cloud.syncing') : t('settings.cloud.sync_now')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <View style={[styles.settingRow, styles.settingRowLast]}>
                            <Text style={styles.settingIcon}>??</Text>
                            <View style={styles.settingContent}>
                                <Text style={styles.settingLabel}>{t('settings.cloud.restore_label')}</Text>
                                <Text style={styles.settingDesc}>{cloudRestoreDesc}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleCloudRestore}
                                disabled={cloudRestoring}
                            >
                                <Text style={styles.editLink}>
                                    {cloudRestoring ? t('settings.cloud.restoring') : t('settings.cloud.restore_action')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.buttonGroup}>
                        <TouchableOpacity
                            style={styles.dataButton}
                            onPress={handleExportData}
                            disabled={isExporting}
                        >
                            {isExporting ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <>
                                    <Text style={styles.dataButtonIcon}>📤</Text>
                                    <Text style={styles.dataButtonText}>{t('export_data')}</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.dataButton} onPress={handleImportData}>
                            <Text style={styles.dataButtonIcon}>📥</Text>
                            <Text style={styles.dataButtonText}>{t('import_data')}</Text>
                        </TouchableOpacity>
                    </View>
                </Section>

                {/* About Section */}
                <Section id="about" title={t('about')}>

                    <View style={styles.card}>
                        <SettingRow
                            icon="📱"
                            label={t("version")}
                            value={<Text style={styles.valueText}>1.0.0</Text>}
                        />
                        <SettingRow
                            icon="📧"
                            label={t('settings.support_label')}
                            value={<Text style={styles.valueText}>viperotterdam@gmail.com</Text>}
                        />
                        <SettingRow
                            icon="✅"
                            label={t('legal.acceptance_label')}
                            value={<Text style={styles.valueText}>{legalAcceptanceValue}</Text>}
                        />
                        <TouchableOpacity
                            style={styles.settingRowBtn}
                            onPress={handleLegalReview}
                        >
                            <Text style={styles.settingIcon}>📝</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.settingLabel}>{t('legal.accept_title')}</Text>
                                <Text style={styles.settingDesc}>{t('legal.accept_body')}</Text>
                            </View>
                            <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.settingRowBtn}
                            onPress={() => openExternalLink(LEGAL_LINKS.privacy)}
                        >
                            <Text style={styles.settingIcon}>🔒</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.settingLabel}>{t('legal.privacy')}</Text>
                                <Text style={styles.settingDesc}>{t('legal.privacy_desc')}</Text>
                            </View>
                            <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.settingRowBtn}
                            onPress={() => openExternalLink(LEGAL_LINKS.terms)}
                        >
                            <Text style={styles.settingIcon}>📄</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.settingLabel}>{t('legal.terms')}</Text>
                                <Text style={styles.settingDesc}>{t('legal.terms_desc')}</Text>
                            </View>
                            <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>
                        {/* Background Health - Android only */}
                        {isAndroid && (
                            <TouchableOpacity
                                style={styles.settingRowBtn}
                                onPress={() => navigation.navigate('BackgroundHealth' as any)}
                            >
                                <Text style={styles.settingIcon}>🔧</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.settingLabel}>{t('settings.background_health_title')}</Text>
                                    <Text style={styles.settingDesc}>{t('settings.background_health_desc')}</Text>
                                </View>
                                <Text style={styles.chevron}>▶</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Section>

                {__DEV__ && (
                    <Section id="developer" title={t('settings.developer_title')}>

                        <View style={styles.card}>
                            <TouchableOpacity
                                style={styles.settingRowBtn}
                                onPress={handleTestCrash}
                            >
                                <Text style={styles.settingIcon}>🛠</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.settingLabel}>{t('settings.developer.crash_title')}</Text>
                                    <Text style={styles.settingDesc}>{t('settings.developer.crash_desc')}</Text>
                                </View>
                                <Text style={styles.chevron}>›</Text>
                            </TouchableOpacity>
                        </View>
                    </Section>
                )}

                {/* Danger Zone */}
                <Section id="danger" title={t('danger_zone')} titleStyle={{ color: '#ef4444' }}>

                    <TouchableOpacity style={styles.dangerButton} onPress={handleResetOnboarding}>
                        <Text style={styles.dangerButtonIcon}>🔄</Text>
                        <View style={styles.dangerButtonContent}>
                            <Text style={styles.dangerButtonText}>{t('reset_onboarding')}</Text>
                            <Text style={styles.dangerButtonDesc}>{t('settings.reset_onboarding_desc')}</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.dangerButton, { marginTop: 8 }]} onPress={handleClearAllData}>
                        <Text style={styles.dangerButtonIcon}>🗑️</Text>
                        <View style={styles.dangerButtonContent}>
                            <Text style={styles.dangerButtonText}>{t('clear_all_data')}</Text>
                            <Text style={styles.dangerButtonDesc}>{t('settings.clear_all_data_desc')}</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.dangerButton, { marginTop: 8 }, isDeletingAccount && styles.buttonDisabled]}
                        onPress={handleDeleteAccount}
                        disabled={isDeletingAccount}
                    >
                        <Text style={styles.dangerButtonIcon}>🚫</Text>
                        <View style={styles.dangerButtonContent}>
                            <Text style={styles.dangerButtonText}>
                                {isDeletingAccount ? t('delete_account_progress') : deleteAccountTitle}
                            </Text>
                            <Text style={styles.dangerButtonDesc}>{deleteAccountDesc}</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                        <Text style={styles.logoutButtonText}>{t('logout')}</Text>
                    </TouchableOpacity>
                </Section>

                <Text style={styles.footer}>
                    {t('settings.footer')}
                </Text>
            </ScrollView>
            <Modal visible={showContextCorrection} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{t('settings.context_correction.title')}</Text>
                        <Text style={styles.modalSubtitle}>{t('settings.context_correction.location')}</Text>
                        <View style={styles.modalOptionsRow}>
                            {correctionLocations.map((option) => {
                                const selected = contextCorrectionLocation === option.key;
                                return (
                                    <TouchableOpacity
                                        key={option.key}
                                        style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                        onPress={() => setContextCorrectionLocation(option.key)}
                                    >
                                        <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                                            {option.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <Text style={[styles.modalSubtitle, { marginTop: 12 }]}>
                            {t('settings.context_correction.activity')}
                        </Text>
                        <View style={styles.modalOptionsRow}>
                            {correctionStates.map((option) => {
                                const selected = contextCorrectionState === option.key;
                                return (
                                    <TouchableOpacity
                                        key={option.key}
                                        style={[styles.modalOption, selected && styles.modalOptionSelected]}
                                        onPress={() => setContextCorrectionState(option.key)}
                                    >
                                        <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                                            {option.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonSecondary]}
                                onPress={() => setShowContextCorrection(false)}
                            >
                                <Text style={styles.modalButtonText}>{t('cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalButton} onPress={applyContextCorrection}>
                                <Text style={styles.modalButtonText}>{t('settings.context_correction.apply')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

// Helper components
const SettingRow: React.FC<{
    icon: string;
    label: string;
    description?: string;
    value: React.ReactNode;
}> = ({ icon, label, description, value }) => (
    <View style={styles.settingRow}>
        <Text style={styles.settingIcon}>{icon}</Text>
        <View style={styles.settingContent}>
            <Text style={styles.settingLabel}>{label}</Text>
            {description && <Text style={styles.settingDesc}>{description}</Text>}
        </View>
        <View style={styles.settingValue}>{value}</View>
    </View>
);

const DataStat: React.FC<{ label: string; value: number; icon: string }> = ({ label, value, icon }) => (
    <View style={styles.dataStat}>
        <Text style={styles.dataStatIcon}>{icon}</Text>
        <Text style={styles.dataStatValue}>{value}</Text>
        <Text style={styles.dataStatLabel}>{label}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    backBtn: {
        color: '#06b6d4',
        fontSize: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#ffffff',
    },
    keyboardView: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        paddingVertical: 6,
    },
    sectionHeaderText: {
        flex: 1,
        paddingRight: 12,
    },
    sectionBody: {
        marginTop: 12,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        marginBottom: 0,
    },
    card: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    profileRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarSmall: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    avatarText: {
        fontSize: 24,
    },
    profileInfo: {
        flex: 1,
    },
    profileName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    profileEmail: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 2,
    },
    editLink: {
        color: '#06b6d4',
        fontSize: 14,
        fontWeight: '500',
    },
    premiumHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
    },
    premiumInfo: {
        flex: 1,
    },
    premiumTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
    },
    premiumSubtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 4,
    },
    premiumPriceBadge: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.4)',
    },
    premiumPriceText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#38bdf8',
    },
    premiumLoadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    premiumLoadingText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
    },
    premiumErrorRow: {
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        borderColor: 'rgba(239, 68, 68, 0.4)',
        borderWidth: 1,
        padding: 10,
        borderRadius: 12,
        marginBottom: 12,
    },
    premiumErrorText: {
        color: '#fecaca',
        fontSize: 12,
    },
    premiumButtonsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    premiumButton: {
        backgroundColor: '#38bdf8',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
    },
    premiumButtonText: {
        color: '#020617',
        fontWeight: '700',
        fontSize: 13,
    },
    premiumButtonSecondary: {
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.7)',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
    },
    premiumButtonSecondaryText: {
        color: '#38bdf8',
        fontWeight: '600',
        fontSize: 13,
    },
    premiumButtonGhost: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    premiumButtonGhostText: {
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '600',
        fontSize: 13,
    },
    premiumButtonDisabled: {
        opacity: 0.6,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    settingDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginVertical: 12,
    },
    settingRowLast: {
        borderBottomWidth: 0,
    },
    settingIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    settingContent: {
        flex: 1,
    },
    settingLabel: {
        fontSize: 15,
        color: '#ffffff',
    },
    settingDesc: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
    },
    settingHint: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 10,
    },
    settingValue: {},
    providerChoiceRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
    },
    providerChoicePill: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    providerChoicePillActive: {
        borderColor: 'rgba(56, 189, 248, 0.8)',
        backgroundColor: 'rgba(56, 189, 248, 0.2)',
    },
    providerChoiceText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '600',
    },
    providerChoiceTextActive: {
        color: '#e0f2fe',
    },
    notificationModeCard: {
        paddingVertical: 12,
        paddingLeft: 32,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    notificationModeLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
    },
    notificationModeDesc: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.45)',
        marginTop: 4,
    },
    notificationModeRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
    },
    notificationModePill: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    notificationModePillSelected: {
        backgroundColor: '#06b6d4',
        borderColor: '#06b6d4',
    },
    notificationModePillText: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
    },
    notificationModePillTextSelected: {
        color: '#020617',
    },
    valueText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
    },
    linkButton: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(6, 182, 212, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.35)',
    },
    linkButtonWarning: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderColor: 'rgba(245, 158, 11, 0.45)',
    },
    consentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
        gap: 8,
    },
    consentMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 6,
        gap: 8,
    },
    consentMetaLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    healthConnectRow: {
        marginTop: 10,
        gap: 8,
    },
    healthConnectActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 10,
    },
    healthConnectMeta: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    healthConnectLabel: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    healthConnectStatusWarning: {
        color: '#fbbf24',
        fontWeight: '700',
    },
    healthConnectUpdated: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        marginTop: 8,
    },
    healthIngestRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
        gap: 8,
    },
    healthIngestLabel: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    healthIngestErrorText: {
        color: '#fca5a5',
    },
    healthIngestLoading: {
        marginTop: 10,
        alignSelf: 'flex-start',
    },
    consentStatus: {
        color: '#e2e8f0',
        fontSize: 13,
        fontWeight: '600',
    },
    consentButton: {
        marginTop: 10,
        alignSelf: 'flex-start',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.5)',
    },
    consentButtonText: {
        color: '#fca5a5',
        fontWeight: '600',
        fontSize: 12,
    },
    consentButtonSecondary: {
        marginTop: 8,
        alignSelf: 'flex-start',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: 'rgba(56, 189, 248, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.45)',
    },
    consentButtonSecondaryText: {
        color: '#7dd3fc',
        fontWeight: '600',
        fontSize: 12,
    },
    linkButtonText: {
        color: '#06b6d4',
        fontSize: 12,
        fontWeight: '600',
    },
    linkButtonWarningText: {
        color: '#fbbf24',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(2, 6, 23, 0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: '#0f172a',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    modalTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 6,
    },
    modalSubtitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        marginBottom: 6,
    },
    modalOptionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    modalOption: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    modalOptionSelected: {
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.2)',
    },
    modalOptionText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '600',
    },
    modalOptionTextSelected: {
        color: '#06b6d4',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#06b6d4',
        alignItems: 'center',
        marginLeft: 8,
    },
    modalButtonSecondary: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginLeft: 0,
        marginRight: 8,
    },
    modalButtonText: {
        color: '#020617',
        fontWeight: '700',
        fontSize: 13,
    },
    dataStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    dataStat: {
        alignItems: 'center',
    },
    dataStatIcon: {
        fontSize: 24,
        marginBottom: 4,
    },
    dataStatValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#ffffff',
    },
    dataStatLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
    },
    buttonGroup: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
    },
    bioActionRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
    },
    retentionButtons: {
        flexDirection: 'row',
        gap: 6,
    },
    retentionButton: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.5)',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
    },
    retentionButtonActive: {
        backgroundColor: '#06b6d4',
        borderColor: '#06b6d4',
    },
    retentionButtonText: {
        color: '#06b6d4',
        fontSize: 12,
        fontWeight: '600',
    },
    retentionButtonTextActive: {
        color: '#020617',
    },
    stepper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    stepperButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    stepperButtonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '700',
    },
    stepperValue: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '600',
        minWidth: 36,
        textAlign: 'center',
    },
    dataButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(6, 182, 212, 0.2)',
        borderWidth: 1,
        borderColor: '#06b6d4',
        borderRadius: 12,
        paddingVertical: 14,
        gap: 8,
    },
    dataButtonIcon: {
        fontSize: 18,
    },
    dataButtonText: {
        color: '#06b6d4',
        fontWeight: '600',
        fontSize: 14,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    dangerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        borderRadius: 12,
        padding: 16,
    },
    dangerButtonIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    dangerButtonContent: {
        flex: 1,
    },
    dangerButtonText: {
        color: '#ef4444',
        fontWeight: '600',
        fontSize: 15,
    },
    dangerButtonDesc: {
        color: 'rgba(239, 68, 68, 0.6)',
        fontSize: 12,
        marginTop: 2,
    },
    logoutButton: {
        marginTop: 16,
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    logoutButtonText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 15,
        fontWeight: '500',
    },
    footer: {
        textAlign: 'center',
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        marginTop: 24,
    },
    // Language Picker Styles
    settingRowBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    chevron: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
    },
    languageList: {
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 12,
        padding: 8,
        marginTop: 8,
    },
    languageOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
    },
    languageOptionActive: {
        backgroundColor: 'rgba(6, 182, 212, 0.2)',
    },
    languageFlag: {
        fontSize: 20,
        marginRight: 12,
    },
    languageName: {
        flex: 1,
        color: '#ffffff',
        fontSize: 15,
    },
    languageNameActive: {
        color: '#06b6d4',
        fontWeight: '600',
    },
    checkmark: {
        color: '#06b6d4',
        fontSize: 18,
        fontWeight: '700',
    },
    languageNote: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 12,
        paddingHorizontal: 8,
    },
    // Overlay Settings Styles
    sectionSubtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 6,
    },
    sectionChevron: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
    },
    adaptiveSummary: {
        color: '#ffffff',
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 10,
    },
    adaptiveMetaList: {
        marginTop: 2,
        gap: 6,
    },
    adaptiveMeta: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
    },
    adaptiveResetButton: {
        marginTop: 12,
        alignSelf: 'flex-start',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    adaptiveResetButtonText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '600',
    },
    overlayModeCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        padding: 14,
        marginTop: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    overlayModeLabel: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    overlayModeDesc: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        marginBottom: 10,
    },
    overlayModeRow: {
        flexDirection: 'row',
        gap: 8,
    },
    overlayModePill: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
    },
    overlayModePillSelected: {
        backgroundColor: '#22c55e',
        borderColor: '#22c55e',
    },
    overlayModePillText: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
    },
    overlayModePillTextSelected: {
        color: '#020617',
    },
    overlayDetailsToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        marginTop: 12,
    },
    overlayDetailsToggleText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '500',
    },
    overlayTypesContainer: {
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
    },
    overlayTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.03)',
    },
    overlayTypeIcon: {
        fontSize: 20,
        marginRight: 12,
        width: 28,
    },
    overlayTypeLabel: {
        flex: 1,
        color: '#ffffff',
        fontSize: 14,
    },
    overlayBulkButtons: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 14,
    },
    overlayBulkBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(34, 197, 94, 0.3)',
        alignItems: 'center',
    },
    overlayBulkBtnDanger: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    overlayBulkBtnText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#ffffff',
    },
    // Auto Sleep Tracking Styles
    autoSleepPillSelected: {
        backgroundColor: '#8b5cf6',
        borderColor: '#a78bfa',
    },
    autoSleepInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    autoSleepInfoLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
    },
    autoSleepInfoValue: {
        color: '#8b5cf6',
        fontSize: 14,
        fontWeight: '600',
    },
    // Location Styles
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'space-between',
    },
    locationInfo: {
        flex: 1,
        marginRight: 16,
    },
    locationLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: 4,
    },
    locationAddress: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
    },
    pendingLocationTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 4,
    },
    pendingLocationSubtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 12,
    },
    pendingLocationActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    pendingLocationDismiss: {
        alignSelf: 'flex-start',
        paddingVertical: 4,
    },
    pendingLocationDismissText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    setBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(6, 182, 212, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.4)',
    },
    setBtnText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#06b6d4',
    },
    removeBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    removeBtnText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#ef4444',
    },
});

export default SettingsScreen;
