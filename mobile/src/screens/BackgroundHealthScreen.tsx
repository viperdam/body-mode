/**
 * Background Health Screen
 * 
 * Displays background system status and controls.
 * Allows users to:
 * - Switch between OFF/LIGHT/FULL modes
 * - View health diagnostics
 * - Trigger emergency stop
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Alert,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as BackgroundFetch from 'expo-background-fetch';
import { useLanguage } from '../contexts/LanguageContext';
import backgroundHealthService, {
    BackgroundMode,
    BackgroundHealthStatus,
    BackgroundHealthDiagnostics,
    BackpressureLevel,
} from '../services/backgroundHealthService';
import storage from '../services/storageService';
import backgroundLocationService from '../services/backgroundLocationService';
import contextBackgroundFetchService from '../services/contextBackgroundFetchService';
import { requestContextRefresh } from '../services/contextService';
import type { ContextSnapshot } from '../services/contextTypes';

type ContextEngineStatus = {
    backgroundLocationRunning: boolean | null;
    backgroundFetchStatus: BackgroundFetch.BackgroundFetchStatus | null;
    lastSnapshot: ContextSnapshot | null;
};

const BackgroundHealthScreen: React.FC = () => {
    const navigation = useNavigation();
    const { t, language } = useLanguage();
    const [status, setStatus] = useState<BackgroundHealthStatus | null>(null);
    const [diagnostics, setDiagnostics] = useState<BackgroundHealthDiagnostics | null>(null);
    const [contextEngine, setContextEngine] = useState<ContextEngineStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const modeKeyMap: Record<BackgroundMode, 'off' | 'light' | 'full'> = {
        OFF: 'off',
        LIGHT: 'light',
        FULL: 'full',
    };

    const backpressureKeyMap: Record<BackpressureLevel, 'none' | 'light' | 'moderate' | 'severe'> = {
        NONE: 'none',
        LIGHT: 'light',
        MODERATE: 'moderate',
        SEVERE: 'severe',
    };

    const getModeLabel = (mode: BackgroundMode) =>
        t(`background_health.mode.${modeKeyMap[mode]}`);

    const getModeDescription = (mode: BackgroundMode) =>
        t(`background_health.mode_desc.${modeKeyMap[mode]}`);

    const getBackpressureLabel = (level?: BackpressureLevel) =>
        level ? t(`background_health.backpressure.${backpressureKeyMap[level]}`) : '-';

    const getReconcileResultLabel = (result?: string) => {
        if (!result) return '-';
        if (result === 'FAILED') return t('background_health.reconcile_result.failed');
        if (result === 'SUCCESS') return t('background_health.reconcile_result.success');
        return result;
    };

    const getBackgroundFetchLabel = (statusValue?: BackgroundFetch.BackgroundFetchStatus | null) => {
        if (statusValue === BackgroundFetch.BackgroundFetchStatus.Available) {
            return t('background_health.context.fetch_status.available');
        }
        if (statusValue === BackgroundFetch.BackgroundFetchStatus.Denied) {
            return t('background_health.context.fetch_status.denied');
        }
        if (statusValue === BackgroundFetch.BackgroundFetchStatus.Restricted) {
            return t('background_health.context.fetch_status.restricted');
        }
        return t('background_health.context.fetch_status.unknown');
    };

    const safeJsonParse = <T,>(value?: string): T | null => {
        if (!value || value === 'None') return null;
        try {
            return JSON.parse(value) as T;
        } catch (error) {
            return null;
        }
    };

    const countJsonArray = (value?: string): number => {
        const parsed = safeJsonParse<unknown[]>(value);
        return Array.isArray(parsed) ? parsed.length : 0;
    };

    const formatBool = (value?: boolean): string => {
        if (typeof value !== 'boolean') return '-';
        return value ? t('yes') : t('no');
    };

    const summaryToken = (key: string, params?: Record<string, any>): string => {
        return t(`background_health.summary.${key}`, params || {});
    };

    const summarizeSleepSettings = (value?: string): string => {
        const parsed = safeJsonParse<Record<string, any>>(value);
        if (!parsed) return '-';
        const parts: string[] = [];
        if (typeof parsed.enabled === 'boolean') parts.push(summaryToken('enabled', { value: formatBool(parsed.enabled) }));
        if (typeof parsed.anytimeMode === 'boolean') parts.push(summaryToken('anytime', { value: formatBool(parsed.anytimeMode) }));
        if (typeof parsed.requireCharging === 'boolean') parts.push(summaryToken('charging', { value: formatBool(parsed.requireCharging) }));
        if (typeof parsed.stillnessThresholdMinutes === 'number') {
            parts.push(summaryToken('stillness', { minutes: parsed.stillnessThresholdMinutes }));
        }
        return parts.join(' | ') || summaryToken('present');
    };

    const summarizeOverlaySettings = (value?: string): string => {
        const parsed = safeJsonParse<Record<string, any>>(value);
        if (!parsed) return '-';
        const parts: string[] = [];
        if (typeof parsed.enabled === 'boolean') parts.push(summaryToken('enabled', { value: formatBool(parsed.enabled) }));
        if (typeof parsed.permissionGranted === 'boolean') parts.push(summaryToken('permission', { value: formatBool(parsed.permissionGranted) }));
        const types = parsed.types && typeof parsed.types === 'object' ? parsed.types : null;
        if (types) {
            if (typeof types.sleep === 'boolean') parts.push(summaryToken('sleep', { value: formatBool(types.sleep) }));
            if (typeof types.workout === 'boolean') parts.push(summaryToken('workout', { value: formatBool(types.workout) }));
            if (typeof types.meal === 'boolean') parts.push(summaryToken('meal', { value: formatBool(types.meal) }));
        }
        return parts.join(' | ') || summaryToken('present');
    };

    const summarizeSleepContext = (value?: string): string => {
        const parsed = safeJsonParse<Record<string, any>>(value);
        if (!parsed) return '-';
        const parts: string[] = [];
        if (typeof parsed.sleepConfidence === 'number') parts.push(summaryToken('confidence', { value: parsed.sleepConfidence }));
        if (parsed.audioPlaying === true) parts.push(summaryToken('audio'));
        if (parsed.screenOnAtSleep === true) parts.push(summaryToken('screen_on'));
        if (parsed.autoAssumed === true) parts.push(summaryToken('auto'));
        if (parsed.activityAtSleep) parts.push(summaryToken('activity', { value: parsed.activityAtSleep }));
        return parts.join(' | ') || summaryToken('present');
    };

    const loadStatus = useCallback(async () => {
        if (!backgroundHealthService.available()) {
            setLoading(false);
            return;
        }

        try {
            const [healthStatus, diagnosticsData, backgroundLocationRunning, backgroundFetchStatus, lastSnapshot] =
                await Promise.all([
                    backgroundHealthService.getHealthStatus(),
                    backgroundHealthService.getDiagnostics(),
                    backgroundLocationService.isRunning(),
                    contextBackgroundFetchService.getStatus(),
                    storage.get<ContextSnapshot>(storage.keys.LAST_CONTEXT_SNAPSHOT),
                ]);
            setStatus(healthStatus);
            setDiagnostics(diagnosticsData);
            setContextEngine({
                backgroundLocationRunning,
                backgroundFetchStatus,
                lastSnapshot: lastSnapshot ?? null,
            });
        } catch (error) {
            console.error('Failed to load health status:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    const handleModeChange = async (mode: BackgroundMode) => {
        Alert.alert(
            t('background_health.switch_title', { mode: getModeLabel(mode) }),
            getModeDescription(mode),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('background_health.switch_action'),
                    onPress: async () => {
                        await backgroundHealthService.setMode(mode);
                        loadStatus();
                    },
                },
            ]
        );
    };

    const handleEmergencyStop = () => {
        Alert.alert(
            t('background_health.emergency.title'),
            t('background_health.emergency.body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('background_health.emergency.stop_action'),
                    style: 'destructive',
                    onPress: async () => {
                        await backgroundHealthService.emergencyStop();
                        loadStatus();
                        Alert.alert(
                            t('background_health.emergency.done_title'),
                            t('background_health.emergency.done_body')
                        );
                    },
                },
            ]
        );
    };

    const handleContextRefresh = async () => {
        try {
            requestContextRefresh('background_health_manual');
            await new Promise((resolve) => setTimeout(resolve, 900));
            loadStatus();
        } catch (error) {
            console.warn('Failed to refresh context:', error);
        }
    };

    const handleRestartBackground = async () => {
        try {
            await backgroundLocationService.stop();
            await contextBackgroundFetchService.stop();
            await backgroundLocationService.ensureRunning();
            await contextBackgroundFetchService.start();
            loadStatus();
        } catch (error) {
            Alert.alert(t('alert.error'), t('background_health.context.restart_failed'));
        }
    };

    const handleOpenDiagnostics = () => {
        navigation.navigate('ContextDiagnostics' as never);
    };

    const formatTime = (timestamp: number): string => {
        if (!timestamp) return t('background_health.never');
        const date = new Date(timestamp);
        return date.toLocaleTimeString(language);
    };

    const formatDateTime = (timestamp?: number): string => {
        if (!timestamp) return t('background_health.never');
        return new Date(timestamp).toLocaleString(language);
    };

    const formatConfidence = (value?: number): string => {
        if (typeof value !== 'number') return '-';
        return `${Math.round(value)}%`;
    };

    const formatPollTier = (value?: string): string => {
        if (!value) return '-';
        return value.replace(/_/g, ' ');
    };

    if (Platform.OS !== 'android') {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.notAvailable}>
                    <Ionicons name="information-circle" size={48} color="#888" />
                    <Text style={styles.notAvailableText}>
                        {t('background_health.android_only')}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => {
                        setRefreshing(true);
                        loadStatus();
                    }} />
                }
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('background_health.title')}</Text>
                    <View style={{ width: 24 }} />
                </View>

                {/* Mode Selector */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('background_health.mode_section')}</Text>
                    <View style={styles.modeButtons}>
                        {(['OFF', 'LIGHT', 'FULL'] as BackgroundMode[]).map((mode) => (
                            <TouchableOpacity
                                key={mode}
                                style={[
                                    styles.modeButton,
                                    status?.mode === mode && styles.modeButtonActive,
                                ]}
                                onPress={() => handleModeChange(mode)}
                            >
                                <Ionicons
                                    name={
                                        mode === 'OFF'
                                            ? 'power'
                                            : mode === 'LIGHT'
                                                ? 'notifications-outline'
                                                : 'notifications'
                                    }
                                    size={24}
                                    color={status?.mode === mode ? '#fff' : '#888'}
                                />
                                <Text
                                    style={[
                                        styles.modeButtonText,
                                        status?.mode === mode && styles.modeButtonTextActive,
                                    ]}
                                >
                                    {getModeLabel(mode)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={styles.modeDescription}>
                        {status?.mode ? getModeDescription(status.mode) : ''}
                    </Text>
                </View>

                {/* Health Status */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('background_health.system_status')}</Text>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.status.battery')}</Text>
                        <Text style={styles.statusValue}>
                            {status?.batteryLevel ?? '-'}%
                            {status?.isCharging ? ' ⚡' : ''}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.status.backpressure')}</Text>
                        <Text style={[
                            styles.statusValue,
                            status?.backpressureLevel === 'SEVERE' && styles.statusDanger,
                            status?.backpressureLevel === 'MODERATE' && styles.statusWarning,
                        ]}>
                            {getBackpressureLabel(status?.backpressureLevel)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.status.power_save')}</Text>
                        <Text style={styles.statusValue}>
                            {status?.isPowerSaveMode ? t('yes') : t('no')}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.status.can_play_alarm')}</Text>
                        <Text style={[
                            styles.statusValue,
                            !status?.canPlayAlarm && styles.statusWarning,
                        ]}>
                            {status?.canPlayAlarm ? t('yes') : t('background_health.status.call_active')}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.status.battery_optimization')}</Text>
                        <Text style={styles.statusValue}>
                            {status?.batteryOptimizationDisabled ? t('yes') : t('no')}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.status.overlay_permission')}</Text>
                        <Text style={styles.statusValue}>
                            {status?.overlayPermissionGranted ? t('yes') : t('no')}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.status.exact_alarm_permission')}</Text>
                        <Text style={styles.statusValue}>
                            {status?.exactAlarmPermissionGranted ? t('yes') : t('no')}
                        </Text>
                    </View>
                </View>

                {/* Scheduler Status */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('background_health.scheduler_status')}</Text>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.scheduler.pending_actions')}</Text>
                        <Text style={styles.statusValue}>
                            {status?.pendingActionCount ?? '-'}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.scheduler.scheduled_alarms')}</Text>
                        <Text style={styles.statusValue}>
                            {status?.scheduledAlarmCount ?? '-'}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.scheduler.scheduled_overlays')}</Text>
                        <Text style={styles.statusValue}>
                            {status?.scheduledOverlayCount ?? '-'}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.scheduler.last_reconcile')}</Text>
                        <Text style={styles.statusValue}>
                            {formatTime(status?.lastReconcileTime ?? 0)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.scheduler.last_result')}</Text>
                        <Text style={[
                            styles.statusValue,
                            status?.lastReconcileResult === 'FAILED' && styles.statusDanger,
                        ]}>
                            {getReconcileResultLabel(status?.lastReconcileResult)}
                        </Text>
                    </View>
                </View>

                {/* Context Engine Status */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('background_health.context.title')}</Text>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.context.background_location')}</Text>
                        <Text style={styles.statusValue}>
                            {contextEngine?.backgroundLocationRunning == null
                                ? '-'
                                : contextEngine.backgroundLocationRunning
                                    ? t('background_health.context.running')
                                    : t('background_health.context.paused')}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.context.background_fetch')}</Text>
                        <Text style={styles.statusValue}>
                            {getBackgroundFetchLabel(contextEngine?.backgroundFetchStatus ?? null)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.context.last_update')}</Text>
                        <Text style={styles.statusValue}>
                            {formatDateTime(contextEngine?.lastSnapshot?.updatedAt)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.context.state')}</Text>
                        <Text style={styles.statusValue}>
                            {contextEngine?.lastSnapshot?.state ?? '-'}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.context.environment')}</Text>
                        <Text style={styles.statusValue}>
                            {contextEngine?.lastSnapshot?.environment ?? '-'}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.context.confidence')}</Text>
                        <Text style={styles.statusValue}>
                            {formatConfidence(contextEngine?.lastSnapshot?.confidence)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.context.poll_tier')}</Text>
                        <Text style={styles.statusValue}>
                            {formatPollTier(contextEngine?.lastSnapshot?.pollTier)}
                        </Text>
                    </View>

                    <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.actionButton} onPress={handleContextRefresh}>
                            <Ionicons name="refresh" size={18} color="#fff" />
                            <Text style={styles.actionButtonText}>{t('background_health.context.refresh')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionButton} onPress={handleRestartBackground}>
                            <Ionicons name="power" size={18} color="#fff" />
                            <Text style={styles.actionButtonText}>{t('background_health.context.restart')}</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.actionButtonSecondary} onPress={handleOpenDiagnostics}>
                        <Ionicons name="analytics" size={18} color="#fff" />
                        <Text style={styles.actionButtonText}>{t('background_health.context.diagnostics')}</Text>
                    </TouchableOpacity>
                </View>

                {/* Diagnostics */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('background_health.diagnostics.title')}</Text>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.sleep_state')}</Text>
                        <Text style={styles.statusValue}>{diagnostics?.sleepState ?? '-'}</Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.current_activity')}</Text>
                        <Text style={styles.statusValue}>{diagnostics?.currentUserActivity ?? '-'}</Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.activity_update')}</Text>
                        <Text style={styles.statusValue}>
                            {diagnostics?.activityUpdateType ?? '-'} ({diagnostics?.activityUpdateConfidence ?? 0})
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.last_interaction')}</Text>
                        <Text style={styles.statusValue}>
                            {formatDateTime(diagnostics?.lastInteractionTimestamp)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.orientation_stable')}</Text>
                        <Text style={styles.statusValue}>
                            {diagnostics?.orientationStable ? t('yes') : t('no')}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.last_orientation_change')}</Text>
                        <Text style={styles.statusValue}>
                            {formatDateTime(diagnostics?.lastOrientationChangeTimestamp)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.context_state')}</Text>
                        <Text style={styles.statusValue}>{diagnostics?.contextState ?? '-'}</Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.context_location')}</Text>
                        <Text style={styles.statusValue}>{diagnostics?.contextLocationLabel ?? '-'}</Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.context_updated')}</Text>
                        <Text style={styles.statusValue}>
                            {formatDateTime(diagnostics?.contextUpdatedAt)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.pending_sleep_events')}</Text>
                        <Text style={styles.statusValue}>
                            {countJsonArray(diagnostics?.pendingSleepEvents)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.pending_overlay_events')}</Text>
                        <Text style={styles.statusValue}>
                            {countJsonArray(diagnostics?.pendingEvents)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.sleep_settings')}</Text>
                        <Text style={styles.statusValue}>
                            {summarizeSleepSettings(diagnostics?.sleepSettings)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.overlay_settings')}</Text>
                        <Text style={styles.statusValue}>
                            {summarizeOverlaySettings(diagnostics?.overlaySettings)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.sleep_context')}</Text>
                        <Text style={styles.statusValue}>
                            {summarizeSleepContext(diagnostics?.sleepContext)}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.sleep_boot_pending')}</Text>
                        <Text style={styles.statusValue}>
                            {diagnostics?.sleepBootPending ? t('yes') : t('no')}
                        </Text>
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>{t('background_health.diagnostics.sleep_boot_time')}</Text>
                        <Text style={styles.statusValue}>
                            {formatDateTime(diagnostics?.sleepBootTime)}
                        </Text>
                    </View>
                </View>

                {/* Emergency Stop */}
                <View style={styles.section}>
                    <TouchableOpacity
                        style={styles.emergencyButton}
                        onPress={handleEmergencyStop}
                    >
                        <Ionicons name="warning" size={24} color="#fff" />
                        <Text style={styles.emergencyButtonText}>{t('background_health.emergency.button')}</Text>
                    </TouchableOpacity>
                    <Text style={styles.emergencyHint}>
                        {t('background_health.emergency.hint')}
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    scrollContent: {
        padding: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    section: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 12,
    },
    modeButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    modeButton: {
        flex: 1,
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#2a2a2a',
        marginHorizontal: 4,
    },
    modeButtonActive: {
        backgroundColor: '#4CAF50',
    },
    modeButtonText: {
        color: '#888',
        marginTop: 4,
        fontSize: 12,
    },
    modeButtonTextActive: {
        color: '#fff',
    },
    modeDescription: {
        color: '#888',
        fontSize: 12,
        textAlign: 'center',
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    statusLabel: {
        color: '#888',
        fontSize: 14,
    },
    statusValue: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2f6fed',
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    actionButtonSecondary: {
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2a2a2a',
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    statusWarning: {
        color: '#FFA726',
    },
    statusDanger: {
        color: '#EF5350',
    },
    emergencyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#d32f2f',
        padding: 16,
        borderRadius: 8,
    },
    emergencyButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    emergencyHint: {
        color: '#888',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 8,
    },
    notAvailable: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    notAvailableText: {
        color: '#888',
        fontSize: 16,
        marginTop: 12,
        textAlign: 'center',
    },
});

export default BackgroundHealthScreen;
