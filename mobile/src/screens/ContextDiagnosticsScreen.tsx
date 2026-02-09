import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useLanguage } from '../contexts/LanguageContext';
import contextDiagnosticsService, { type ContextDiagnostics } from '../services/contextDiagnosticsService';
import { updateContextPolicy } from '../services/contextPolicyService';
import { clearContextData } from '../services/contextDataService';

const ContextDiagnosticsScreen: React.FC = () => {
    const navigation = useNavigation();
    const { t, language } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [enabling, setEnabling] = useState(false);
    const [diagnostics, setDiagnostics] = useState<ContextDiagnostics | null>(null);

    const diagnosticsEnabled = diagnostics?.policy?.contextDiagnosticsEnabled ?? false;

    const formatTimestamp = (timestamp?: number | null): string => {
        if (!timestamp) return t('settings.context_diagnostics.none');
        return new Date(timestamp).toLocaleString(language);
    };

    const formatBoolean = (value?: boolean): string => {
        if (typeof value !== 'boolean') return t('settings.context_diagnostics.none');
        return value ? t('settings.context_diagnostics.enabled') : t('settings.context_diagnostics.disabled');
    };

    const loadDiagnostics = useCallback(async () => {
        try {
            const data = await contextDiagnosticsService.getContextDiagnostics();
            setDiagnostics(data);
        } catch (error) {
            console.warn('[ContextDiagnostics] Failed to load diagnostics:', error);
            setDiagnostics(null);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [language]);

    useEffect(() => {
        loadDiagnostics();
    }, [loadDiagnostics]);

    const handleRefresh = () => {
        setRefreshing(true);
        void loadDiagnostics();
    };

    const handleEnableDiagnostics = useCallback(async () => {
        if (enabling) return;
        setEnabling(true);
        try {
            await updateContextPolicy({ contextDiagnosticsEnabled: true });
            await loadDiagnostics();
        } catch (error) {
            console.warn('[ContextDiagnostics] Failed to enable diagnostics:', error);
            Alert.alert(t('alert.error'), t('settings.context_privacy.update_failed'));
        } finally {
            setEnabling(false);
        }
    }, [enabling, loadDiagnostics, t]);

    const handleExport = useCallback(async () => {
        try {
            const payload = await contextDiagnosticsService.exportContextDiagnostics();
            await Share.share({
                title: t('settings.context_diagnostics.export'),
                message: payload,
            });
        } catch (error) {
            console.warn('[ContextDiagnostics] Export failed:', error);
            Alert.alert(t('alert.error'), t('alert.export_failed'));
        }
    }, [t]);

    const handleClear = useCallback(() => {
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
                            await loadDiagnostics();
                        })();
                    },
                },
            ]
        );
    }, [loadDiagnostics, t]);

    const summary = diagnostics?.historySummary;
    const lastSnapshot = diagnostics?.lastSnapshot;
    const transitions = diagnostics?.recentTransitions ?? [];
    const sensors = diagnostics?.sensorHealth;
    const corrections = diagnostics?.corrections ?? [];
    const frequentPlaces = diagnostics?.frequentPlaces ?? [];
    const recentVisits = diagnostics?.recentVisits ?? [];
    const recentSignals = diagnostics?.recentSignals ?? [];
    const recentSnapshots = diagnostics?.recentSnapshots ?? [];

    const summaryStatesLabel = summary?.byState
        ? Object.entries(summary.byState)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([state, count]) => `${state} (${count})`)
            .join(', ')
        : t('settings.context_diagnostics.none');

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>{'<'}</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{t('settings.context_diagnostics.title')}</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            >
                <Text style={styles.subtitle}>{t('settings.context_diagnostics.desc')}</Text>

                {loading ? (
                    <ActivityIndicator size="large" color="#06b6d4" style={{ marginTop: 24 }} />
                ) : (
                    <>
                        <View style={styles.actions}>
                            <TouchableOpacity style={styles.button} onPress={handleRefresh}>
                                <Text style={styles.buttonText}>{t('settings.context_diagnostics.refresh')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.button} onPress={handleExport}>
                                <Text style={styles.buttonText}>{t('settings.context_diagnostics.export')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.button, styles.warningButton]} onPress={handleClear}>
                                <Text style={[styles.buttonText, styles.warningButtonText]}>
                                    {t('settings.context_diagnostics.clear')}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {!diagnosticsEnabled && (
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>{t('settings.context_diagnostics.disabled_title')}</Text>
                                <Text style={styles.muted}>{t('settings.context_diagnostics.disabled_body')}</Text>
                                <View style={styles.actions}>
                                    <TouchableOpacity
                                        style={[styles.button, enabling && styles.buttonDisabled]}
                                        onPress={handleEnableDiagnostics}
                                        disabled={enabling}
                                    >
                                        {enabling ? (
                                            <ActivityIndicator size="small" color="#ffffff" />
                                        ) : (
                                            <Text style={styles.buttonText}>{t('settings.context_diagnostics.enable_button')}</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>{t('settings.context_diagnostics.section_policy')}</Text>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_privacy.history_label')}</Text>
                                <Text style={styles.value}>
                                    {formatBoolean(diagnostics?.policy?.contextHistoryEnabled)}
                                </Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_privacy.signal_label')}</Text>
                                <Text style={styles.value}>
                                    {formatBoolean(diagnostics?.policy?.contextSignalHistoryEnabled)}
                                </Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_privacy.learning_label')}</Text>
                                <Text style={styles.value}>
                                    {formatBoolean(diagnostics?.policy?.contextLearningEnabled)}
                                </Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_privacy.diagnostics_label')}</Text>
                                <Text style={styles.value}>
                                    {formatBoolean(diagnostics?.policy?.contextDiagnosticsEnabled)}
                                </Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_diagnostics.value_history_days')}</Text>
                                <Text style={styles.value}>
                                    {diagnostics?.policy?.contextHistoryDays ?? 'n/a'}
                                </Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_diagnostics.value_signal_hours')}</Text>
                                <Text style={styles.value}>
                                    {diagnostics?.policy?.contextSignalHistoryHours ?? 'n/a'}
                                </Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_diagnostics.privacy_mode')}</Text>
                                <Text style={styles.value}>
                                    {diagnostics?.policy?.contextPrivacyMode ?? 'n/a'}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>{t('settings.context_diagnostics.section_snapshot')}</Text>
                            {lastSnapshot ? (
                                <>
                                    <View style={styles.row}>
                                        <Text style={styles.label}>{t('settings.context_status.state')}</Text>
                                        <Text style={styles.value}>{lastSnapshot.state}</Text>
                                    </View>
                                    <View style={styles.row}>
                                        <Text style={styles.label}>{t('settings.context_status.environment')}</Text>
                                        <Text style={styles.value}>{lastSnapshot.environment ?? 'n/a'}</Text>
                                    </View>
                                    <View style={styles.row}>
                                        <Text style={styles.label}>{t('settings.context_status.confidence')}</Text>
                                        <Text style={styles.value}>
                                            {typeof lastSnapshot.confidence === 'number'
                                                ? `${Math.round(lastSnapshot.confidence * 100)}%`
                                                : 'n/a'}
                                        </Text>
                                    </View>
                                    <View style={styles.row}>
                                        <Text style={styles.label}>{t('settings.context_status.poll_tier')}</Text>
                                        <Text style={styles.value}>{lastSnapshot.pollTier ?? 'n/a'}</Text>
                                    </View>
                                    <View style={styles.row}>
                                        <Text style={styles.label}>{t('settings.context_diagnostics.location_label')}</Text>
                                        <Text style={styles.value}>{lastSnapshot.locationLabel ?? 'n/a'}</Text>
                                    </View>
                                    <Text style={styles.muted}>
                                        {t('settings.context_status.last_update')}: {formatTimestamp(lastSnapshot.updatedAt)}
                                    </Text>
                                </>
                            ) : (
                                <Text style={styles.muted}>{t('settings.context_diagnostics.none')}</Text>
                            )}
                        </View>

                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>{t('settings.context_diagnostics.section_history')}</Text>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_diagnostics.total_samples')}</Text>
                                <Text style={styles.value}>{summary?.total ?? 0}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_status.avg_confidence')}</Text>
                                <Text style={styles.value}>
                                    {typeof summary?.avgConfidence === 'number'
                                        ? `${Math.round(summary.avgConfidence * 100)}%`
                                        : 'n/a'}
                                </Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_status.conflict_rate')}</Text>
                                <Text style={styles.value}>
                                    {typeof summary?.conflictRate === 'number'
                                        ? `${Math.round(summary.conflictRate * 100)}%`
                                        : 'n/a'}
                                </Text>
                            </View>
                            <Text style={styles.muted}>
                                {t('settings.context_diagnostics.top_states')}: {summaryStatesLabel}
                            </Text>
                        </View>

                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>{t('settings.context_diagnostics.section_transitions')}</Text>
                            {transitions.length > 0 ? (
                                transitions.map((item, index) => (
                                    <Text style={styles.muted} key={`${item.from}-${item.to}-${item.at}-${index}`}>
                                        {formatTimestamp(item.at)} • {item.from} → {item.to}
                                        {item.location ? ` @ ${item.location}` : ''}
                                    </Text>
                                ))
                            ) : (
                                <Text style={styles.muted}>{t('settings.context_diagnostics.none')}</Text>
                            )}
                        </View>

                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>{t('settings.context_diagnostics.section_sensors')}</Text>
                            {sensors ? (
                                Object.entries(sensors).map(([key, value]) => (
                                    <View style={styles.row} key={key}>
                                        <Text style={styles.label}>{key}</Text>
                                        <Text style={styles.value}>
                                            {value.state} • {value.successes}/{value.failures}
                                        </Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.muted}>{t('settings.context_diagnostics.none')}</Text>
                            )}
                        </View>

                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>{t('settings.context_diagnostics.section_learning')}</Text>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_diagnostics.wifi_count')}</Text>
                                <Text style={styles.value}>{diagnostics?.wifiDbCount ?? 0}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_diagnostics.corrections')}</Text>
                                <Text style={styles.value}>{corrections.length}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_diagnostics.frequent_places')}</Text>
                                <Text style={styles.value}>{frequentPlaces.length}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_diagnostics.recent_visits')}</Text>
                                <Text style={styles.value}>{recentVisits.length}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_diagnostics.recent_signals')}</Text>
                                <Text style={styles.value}>{recentSignals.length}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('settings.context_diagnostics.recent_snapshots')}</Text>
                                <Text style={styles.value}>{recentSnapshots.length}</Text>
                            </View>
                        </View>
                    </>
                )}
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
        paddingRight: 10,
        flex: 1,
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
        marginBottom: 16,
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
    buttonDisabled: {
        opacity: 0.6,
    },
});

export default ContextDiagnosticsScreen;
