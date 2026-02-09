import React, { useCallback, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import type { BioSnapshot, BioTrend } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useEnergy } from '../contexts/EnergyContext';
import { bioSnapshotService } from '../services/bioSnapshotService';
import { bioTrendsAccessService } from '../services/bioTrendsAccessService';
import { computeBioTrends } from '../services/bioAlgorithms';
import { ExerciseType } from 'react-native-health-connect';
import { formatNumber } from '../utils/numberFormat';
import {
    formatBloodGlucoseMgDl,
    formatDistanceMeters,
    formatHydrationMl,
    formatTemperatureC,
    formatWeightKg,
} from '../utils/unitFormat';

const formatMetricLabel = (metric: BioTrend['metric'], t: (key: string) => string): string => {
    switch (metric) {
        case 'hrv':
            return t('bio.widget.hrv');
        case 'restingHR':
            return t('settings.bio.enable_resting_hr');
        case 'spo2':
            return t('bio.widget.spo2');
        case 'stressIndex':
            return t('bio.widget.stress');
        case 'readinessScore':
            return t('bio.widget.readiness');
        case 'sleepScore':
            return t('bio.widget.sleep_score');
        case 'vo2Max':
            return t('bio.detail.vo2max');
        case 'respiratoryRate':
            return t('bio.detail.respiratory_rate');
        default:
            return metric;
    }
};

const formatTrendDirection = (direction: BioTrend['direction'], t: (key: string) => string): string => {
    switch (direction) {
        case 'improving':
            return t('bio.trend.improving');
        case 'declining':
            return t('bio.trend.declining');
        case 'stable':
        default:
            return t('bio.trend.stable');
    }
};

const formatValue = (
    value: number | null | undefined,
    locale: string,
    suffix?: string,
    options?: Intl.NumberFormatOptions
): string => {
    if (value === undefined || value === null || Number.isNaN(value)) return '—';
    return `${formatNumber(value, locale, options)}${suffix ?? ''}`;
};

const humanizeExerciseKey = (key: string): string => {
    return key
        .split('_')
        .map(part => part.length <= 2
            ? part.toUpperCase()
            : part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');
};

const EXERCISE_TYPE_KEYS: Record<number, string> = Object.entries(ExerciseType)
    .reduce<Record<number, string>>((acc, [key, value]) => {
        if (typeof value === 'number') {
            acc[value] = key.toLowerCase();
        }
        return acc;
    }, {});

const formatExerciseType = (
    value: number | null | undefined,
    t: (key: string, options?: Record<string, any>) => string
): string => {
    if (value === undefined || value === null) return '—';
    const key = EXERCISE_TYPE_KEYS[value];
    if (!key) return `Type ${value}`;
    const i18nKey = `bio.exercise_type.${key}`;
    const translated = t(i18nKey);
    return translated !== i18nKey ? translated : humanizeExerciseKey(key);
};

const BioDetailScreen: React.FC = () => {
    const { t, language } = useLanguage();
    const { isPremium } = useSubscription();
    const { showAdRecharge } = useEnergy();
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

    const [snapshot, setSnapshot] = useState<BioSnapshot | null>(null);
    const [trends, setTrends] = useState<BioTrend[]>([]);
    const [loading, setLoading] = useState(false);
    const [accessState, setAccessState] = useState<{ unlocked: boolean; until?: number }>({ unlocked: false });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const snap = await bioSnapshotService.getSnapshot();
            setSnapshot(snap);
            const history = await bioSnapshotService.getHistory(7);
            setTrends(computeBioTrends(history));
            const unlocked = await bioTrendsAccessService.isUnlocked();
            const state = await bioTrendsAccessService.getAccessState();
            setAccessState({ unlocked, until: state?.unlockedUntil });
        } catch (e) {
            setSnapshot(null);
            setTrends([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load])
    );

    const showNoData = !snapshot || snapshot.source === 'fallback';
    const showTrendsGate = !isPremium && !accessState.unlocked;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{t('bio.detail.title')}</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={load}
                        tintColor="#ffffff"
                    />
                }
            >
                {showTrendsGate && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{t('bio.trends.unlock_title')}</Text>
                        <Text style={styles.muted}>{t('bio.trends.unlock_body')}</Text>
                        <TouchableOpacity style={styles.primaryButton} onPress={() => showAdRecharge()}>
                            <Text style={styles.primaryButtonText}>{t('bio.trends.unlock_ad')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={() => navigation.navigate('Paywall', { source: 'bio_detail' })}
                        >
                            <Text style={styles.secondaryButtonText}>{t('bio.detail.upgrade')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
                {!showTrendsGate && !isPremium && accessState.until && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{t('bio.trends.unlocked_title')}</Text>
                        <Text style={styles.muted}>
                            {t('bio.trends.unlocked_until', { date: new Date(accessState.until).toLocaleString(language) })}
                        </Text>
                    </View>
                )}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('bio.detail.metrics_title')}</Text>
                    {showNoData ? (
                        <Text style={styles.muted}>{t('bio.detail.no_data')}</Text>
                    ) : (
                        <>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.widget.stress')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.stressIndex, language, '/100')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.widget.readiness')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.readinessScore, language, '/100')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.widget.hrv')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.hrv, language, 'ms')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('settings.bio.enable_resting_hr')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.restingHR, language, ' bpm')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.current_hr')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.currentHR, language, ' bpm')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.widget.spo2')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.spo2, language, '%')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.respiratory_rate')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.respiratoryRate, language, ' br/min', { maximumFractionDigits: 1 })}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.vo2max')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.vo2Max, language, ' ml/min/kg', { maximumFractionDigits: 1 })}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.blood_glucose')}</Text>
                                <Text style={styles.metricValue}>{formatBloodGlucoseMgDl(snapshot?.bloodGlucoseMgDl, language)}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.widget.sleep_score')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.sleepScore, language, '/100')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.body_temp')}</Text>
                                <Text style={styles.metricValue}>{formatTemperatureC(snapshot?.bodyTemp, language)}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.basal_body_temp')}</Text>
                                <Text style={styles.metricValue}>{formatTemperatureC(snapshot?.basalBodyTemp, language)}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.bmr')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.basalMetabolicRateKcal, language, ' kcal/day')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.body_weight')}</Text>
                                <Text style={styles.metricValue}>{formatWeightKg(snapshot?.bodyWeightKg, language)}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.body_fat')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.bodyFatPct, language, '%', { maximumFractionDigits: 1 })}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.hydration')}</Text>
                                <Text style={styles.metricValue}>{formatHydrationMl(snapshot?.hydrationMl, language)}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.nutrition_kcal')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.nutritionKcal, language, ' kcal')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.nutrition_carbs')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.nutritionCarbsG, language, ' g')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.nutrition_protein')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.nutritionProteinG, language, ' g')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.nutrition_fat')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.nutritionFatG, language, ' g')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.exercise_minutes')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.exerciseMinutes24h, language, ' min')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.exercise_type')}</Text>
                                <Text style={styles.metricValue}>{formatExerciseType(snapshot?.lastExerciseType, t)}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.menstruation')}</Text>
                                <Text style={styles.metricValue}>
                                    {snapshot?.menstruationActive === undefined
                                        ? '—'
                                        : snapshot.menstruationActive
                                            ? t('bio.detail.active')
                                            : t('bio.detail.inactive')}
                                </Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.steps')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.steps, language, '')}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.distance')}</Text>
                                <Text style={styles.metricValue}>{formatDistanceMeters(snapshot?.distanceMeters, language)}</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{t('bio.detail.active_calories')}</Text>
                                <Text style={styles.metricValue}>{formatValue(snapshot?.activeCalories, language, ' kcal')}</Text>
                            </View>

                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>{t('bio.detail.source')}</Text>
                                <Text style={styles.metaValue}>{snapshot?.source || '—'}</Text>
                            </View>
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>{t('bio.detail.freshness')}</Text>
                                <Text style={styles.metaValue}>{snapshot?.freshness || '—'}</Text>
                            </View>
                        </>
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('bio.detail.trends_title')}</Text>
                    {!trends.length ? (
                        <Text style={styles.muted}>{t('bio.detail.no_data')}</Text>
                    ) : (
                        trends.map((trend) => (
                            <View key={trend.metric} style={styles.metricRow}>
                                <Text style={styles.metricLabel}>{formatMetricLabel(trend.metric, t)}</Text>
                                <Text style={styles.metricValue}>
                                    {formatTrendDirection(trend.direction, t)} ({trend.average7d})
                                </Text>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
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
        color: '#ffffff',
        fontSize: 22,
        fontWeight: '600',
    },
    title: {
        flex: 1,
        textAlign: 'center',
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '700',
    },
    headerSpacer: {
        width: 36,
    },
    content: {
        padding: 16,
        paddingBottom: 32,
    },
    card: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    cardTitle: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 12,
    },
    muted: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    metricLabel: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 13,
    },
    metricValue: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '600',
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 6,
    },
    metaLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
    },
    metaValue: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
    },
    primaryButton: {
        marginTop: 10,
        backgroundColor: '#38bdf8',
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#0f172a',
        fontWeight: '700',
    },
    secondaryButton: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.7)',
        backgroundColor: 'rgba(56, 189, 248, 0.08)',
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: '#7dd3fc',
        fontWeight: '700',
    },
});

export default BioDetailScreen;
