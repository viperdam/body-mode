import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { BioSnapshot, BioTrend } from '../types';
import { bioSnapshotService } from '../services/bioSnapshotService';
import { bioTrendsAccessService } from '../services/bioTrendsAccessService';
import { computeBioTrends } from '../services/bioAlgorithms';
import { useLanguage } from '../contexts/LanguageContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { formatNumber } from '../utils/numberFormat';

interface BioWidgetProps {
    onPress?: () => void;
    compact?: boolean;
}

const getFreshnessLabel = (
    freshness: BioSnapshot['freshness'] | undefined,
    t: (key: string, options?: Record<string, any>) => string
) => {
    if (freshness === 'live') return t('bio.freshness.live');
    if (freshness === 'cached') return t('bio.freshness.cached');
    if (freshness === 'stale') return t('bio.freshness.stale');
    return '';
};

const getTrendLabel = (
    metric: BioTrend['metric'],
    t: (key: string, options?: Record<string, any>) => string,
    useShort?: boolean
): string => {
    if (useShort) {
        switch (metric) {
            case 'hrv': return t('bio.short.hrv');
            case 'restingHR': return t('bio.short.resting_hr');
            case 'spo2': return t('bio.short.spo2');
            case 'stressIndex': return t('bio.short.stress');
            case 'readinessScore': return t('bio.short.readiness');
            case 'sleepScore': return t('bio.short.sleep_score');
            case 'vo2Max': return t('bio.short.vo2max');
            case 'respiratoryRate': return t('bio.short.respiratory_rate');
            default: break;
        }
    }
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

const getTrendDirectionLabel = (
    direction: BioTrend['direction'],
    t: (key: string, options?: Record<string, any>) => string
): string => {
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

const pickPrimaryTrend = (trends: BioTrend[]): BioTrend | null => {
    const priority: BioTrend['metric'][] = [
        'sleepScore',
        'readinessScore',
        'stressIndex',
        'hrv',
        'spo2',
        'vo2Max',
        'respiratoryRate',
        'restingHR',
    ];

    for (const metric of priority) {
        const trend = trends.find(t => t.metric === metric && t.direction !== 'stable');
        if (trend) return trend;
    }

    return null;
};

const pickTopTrends = (trends: BioTrend[], max: number = 3): BioTrend[] => {
    const priority: BioTrend['metric'][] = [
        'sleepScore',
        'readinessScore',
        'stressIndex',
        'hrv',
        'spo2',
        'vo2Max',
        'respiratoryRate',
        'restingHR',
    ];

    const result: BioTrend[] = [];
    for (const metric of priority) {
        const trend = trends.find(t => t.metric === metric && t.direction !== 'stable');
        if (trend) {
            result.push(trend);
        }
        if (result.length >= max) break;
    }

    return result;
};

export const BioWidget: React.FC<BioWidgetProps> = ({ onPress, compact }) => {
    const { t, language } = useLanguage();
    const { isPremium } = useSubscription();
    const [snapshot, setSnapshot] = useState<BioSnapshot | null>(null);
    const [trends, setTrends] = useState<BioTrend[]>([]);

    useEffect(() => {
        let mounted = true;
        const loadBioData = async () => {
            try {
                const snap = await bioSnapshotService.getSnapshot();
                if (!mounted) return;
                setSnapshot(snap);
                let canShowTrends = isPremium;
                if (!canShowTrends) {
                    canShowTrends = await bioTrendsAccessService.isUnlocked();
                }
                if (!canShowTrends) {
                    if (mounted) setTrends([]);
                    return;
                }
                const history = await bioSnapshotService.getHistory(7);
                if (!mounted) return;
                setTrends(computeBioTrends(history));
            } catch (e) {
                if (mounted) setSnapshot(null);
            }
        };

        loadBioData();
        const interval = setInterval(loadBioData, 5 * 60 * 1000);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [isPremium]);

    if (!snapshot || snapshot.source === 'fallback') return null;

    const stress = snapshot.stressIndex ?? null;
    const readiness = snapshot.readinessScore ?? null;
    const hrv = snapshot.hrv ?? null;
    const spo2 = snapshot.spo2 ?? null;
    const macros = snapshot.nutritionCarbsG !== undefined
        || snapshot.nutritionProteinG !== undefined
        || snapshot.nutritionFatG !== undefined;
    const primaryTrend = pickPrimaryTrend(trends);
    const topTrends = pickTopTrends(trends);
    const trendComparison = primaryTrend
        ? (primaryTrend.average7dPrior !== undefined
            ? t('bio.widget.trend_compare', {
                current: formatNumber(primaryTrend.average7d, language),
                prior: formatNumber(primaryTrend.average7dPrior, language)
            })
            : `${formatNumber(primaryTrend.average7d, language)}`)
        : '';

    const stressColor = stress !== null && stress > 70 ? '#ef4444'
        : stress !== null && stress > 40 ? '#eab308' : '#22c55e';
    const readinessColor = readiness !== null && readiness > 70 ? '#22c55e'
        : readiness !== null && readiness > 40 ? '#eab308' : '#ef4444';

    const content = (
        <View style={[styles.card, compact && styles.cardCompact]}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>{t('bio.widget.stress')}</Text>
                <Text style={styles.freshness}>{getFreshnessLabel(snapshot.freshness, t)}</Text>
            </View>

            {stress !== null ? (
                <Text style={[styles.value, { color: stressColor }]}>{formatNumber(stress, language)}/100</Text>
            ) : (
                <Text style={styles.muted}>{t('bio.widget.no_data')}</Text>
            )}

            {!compact && (
                <View style={styles.grid}>
                    <View style={styles.metricBlock}>
                        <Text style={styles.metricLabel}>{t('bio.widget.readiness')}</Text>
                        <Text style={[styles.metricValue, { color: readinessColor }]}>
                            {readiness !== null ? `${formatNumber(readiness, language)}/100` : '—'}
                        </Text>
                    </View>
                    <View style={styles.metricBlock}>
                        <Text style={styles.metricLabel}>{t('bio.widget.hrv')}</Text>
                        <Text style={styles.metricValue}>
                            {hrv !== null ? `${formatNumber(hrv, language)}ms` : '—'}
                        </Text>
                    </View>
                    <View style={styles.metricBlock}>
                        <Text style={styles.metricLabel}>{t('bio.widget.spo2')}</Text>
                        <Text style={styles.metricValue}>
                            {spo2 !== null ? `${formatNumber(spo2, language)}%` : '—'}
                        </Text>
                    </View>
                </View>
            )}

            {!compact && macros && (
                <View style={styles.macroRow}>
                    <Text style={styles.metricLabel}>{t('bio.widget.macros')}</Text>
                    <Text style={styles.metricValue}>
                        {snapshot.nutritionCarbsG !== undefined ? `C ${formatNumber(snapshot.nutritionCarbsG, language)}g ` : ''}
                        {snapshot.nutritionProteinG !== undefined ? `P ${formatNumber(snapshot.nutritionProteinG, language)}g ` : ''}
                        {snapshot.nutritionFatG !== undefined ? `F ${formatNumber(snapshot.nutritionFatG, language)}g` : ''}
                    </Text>
                </View>
            )}

            {!compact && topTrends.length > 0 && (
                <View style={styles.trendRow}>
                    {topTrends.map(trend => (
                        <View key={trend.metric} style={styles.trendChip}>
                            <Text style={styles.trendChipText}>
                                {getTrendLabel(trend.metric, t, true)} · {getTrendDirectionLabel(trend.direction, t)}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
            {!compact && primaryTrend && (
                <Text style={styles.trendText}>
                    {t('bio.widget.trend_label')}: {getTrendLabel(primaryTrend.metric, t)} · {getTrendDirectionLabel(primaryTrend.direction, t)} · {trendComparison}
                </Text>
            )}

            {snapshot.freshness === 'stale' && (
                <Text style={styles.staleText}>{t('bio.widget.stale_data')}</Text>
            )}
        </View>
    );

    if (onPress) {
        return (
            <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
                {content}
            </TouchableOpacity>
        );
    }

    return content;
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    cardCompact: {
        padding: 12,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    title: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    freshness: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.6)',
    },
    value: {
        fontSize: 20,
        fontWeight: '700',
    },
    muted: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
    },
    grid: {
        marginTop: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    metricBlock: {
        flex: 1,
        marginRight: 8,
    },
    metricLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 4,
    },
    metricValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    staleText: {
        marginTop: 8,
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
    },
    trendText: {
        marginTop: 8,
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
    },
    macroRow: {
        marginTop: 10,
    },
    trendRow: {
        marginTop: 10,
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    trendChip: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginRight: 6,
        marginBottom: 6,
    },
    trendChipText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.85)',
    },
});
