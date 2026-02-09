import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator, Image, Alert } from 'react-native';
import { ScrollView, TouchableOpacity } from 'react-native-gesture-handler';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useLanguage } from '../contexts/LanguageContext';
import { useEnergy } from '../contexts/EnergyContext';
import { bodyProgressService } from '../services/bodyProgressService';
import { BodyScanEntry } from '../types';
import { JOB_ENERGY_COSTS } from '../services/energyService';

type RouteProps = RouteProp<RootStackParamList, 'BodyProgressReport'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'BodyProgressReport'>;

const energyCost = JOB_ENERGY_COSTS.ANALYZE_BODY_SCAN || 0;

const BodyProgressReportScreen: React.FC = () => {
    const route = useRoute<RouteProps>();
    const navigation = useNavigation<NavigationProp>();
    const { t } = useLanguage();
    const { canAfford, showAdRecharge, queueEnergyRetry, energy } = useEnergy();
    const [scan, setScan] = useState<BodyScanEntry | null>(null);
    const [loading, setLoading] = useState(true);

    const loadScan = useCallback(async () => {
        setLoading(true);
        try {
            const result = await bodyProgressService.getScanById(route.params.scanId);
            setScan(result);
        } finally {
            setLoading(false);
        }
    }, [route.params.scanId]);

    useFocusEffect(
        useCallback(() => {
            void loadScan();
        }, [loadScan])
    );

    const handleRetry = useCallback(async () => {
        if (!scan) return;
        if (energyCost > 0 && !canAfford(energyCost)) {
            Alert.alert(
                t('alert.low_energy'),
                t('body_progress.alert.low_energy', { cost: energyCost, energy })
            );
            queueEnergyRetry(() => handleRetry());
            showAdRecharge();
            return;
        }
        try {
            await bodyProgressService.queueAnalysis(scan.id);
            Alert.alert(t('body_progress.alert.queued_title'), t('body_progress.alert.queued_body'));
            await loadScan();
        } catch (error: any) {
            Alert.alert(t('alert.error'), error?.message || t('body_progress.alert.failed'));
        }
    }, [canAfford, energy, loadScan, queueEnergyRetry, scan, showAdRecharge, t]);

    const statusLabel = useMemo(() => {
        if (!scan) return '';
        switch (scan.status) {
            case 'analyzed':
                return t('body_progress.scan.status.complete');
            case 'processing':
                return t('body_progress.scan.status.processing');
            case 'failed':
                return t('body_progress.scan.status.failed');
            default:
                return t('body_progress.scan.status.pending');
        }
    }, [scan, t]);

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#38bdf8" />
            </SafeAreaView>
        );
    }

    if (!scan) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.errorText}>{t('errors.body_progress.not_found')}</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.primaryButtonText}>{t('body_progress.actions.back')}</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.title}>{t('body_progress.report.title')}</Text>
                <Text style={styles.subtitle}>
                    {new Date(scan.capturedAt).toLocaleDateString()} • {t('body_progress.scan.week', { week: scan.weekNumber })}
                </Text>

                <Image source={{ uri: scan.imageUri }} style={styles.image} />

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('body_progress.report.status')}</Text>
                    <Text style={styles.cardText}>{statusLabel}</Text>
                    {scan.lastError ? (
                        <Text style={styles.errorText}>{scan.lastError}</Text>
                    ) : null}
                </View>

                {scan.analysis ? (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{t('body_progress.report.overall')}</Text>
                        <Text style={styles.cardText}>{scan.analysis.overallAssessment}</Text>
                        <Text style={styles.sectionLabel}>{t('body_progress.report.composition')}</Text>
                        <Text style={styles.cardText}>{scan.analysis.bodyComposition}</Text>
                        <Text style={styles.sectionLabel}>{t('body_progress.report.visible_changes')}</Text>
                        <Text style={styles.cardText}>{scan.analysis.visibleChanges}</Text>
                        <Text style={styles.sectionLabel}>{t('body_progress.report.recommendations')}</Text>
                        <Text style={styles.cardText}>{scan.analysis.recommendations}</Text>
                        {scan.analysis.progressScore !== undefined && (
                            <Text style={styles.scoreText}>
                                {t('body_progress.scan.score', { score: scan.analysis.progressScore })}
                            </Text>
                        )}
                    </View>
                ) : (
                    <View style={styles.card}>
                        <Text style={styles.cardText}>{t('body_progress.report.pending')}</Text>
                    </View>
                )}

                {scan.status === 'failed' && (
                    <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
                        <Text style={styles.primaryButtonText}>{t('body_progress.scan.retry')}</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scroll: {
        padding: 20,
        paddingBottom: 40,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#ffffff',
    },
    subtitle: {
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 16,
        marginTop: 4,
    },
    image: {
        width: '100%',
        height: 280,
        borderRadius: 16,
        marginBottom: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    card: {
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginBottom: 16,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
    },
    cardText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 8,
    },
    sectionLabel: {
        marginTop: 8,
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    scoreText: {
        marginTop: 8,
        color: '#38bdf8',
        fontSize: 14,
        fontWeight: '600',
    },
    primaryButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        backgroundColor: '#38bdf8',
        alignItems: 'center',
        marginBottom: 20,
    },
    primaryButtonText: {
        color: '#020617',
        fontWeight: '700',
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 13,
        marginTop: 6,
    },
});

export default BodyProgressReportScreen;
