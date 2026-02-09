import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator, Alert, Image, Platform } from 'react-native';
import { ScrollView, TouchableOpacity } from 'react-native-gesture-handler';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useLanguage } from '../contexts/LanguageContext';
import { useEnergy } from '../contexts/EnergyContext';
import { JOB_ENERGY_COSTS } from '../services/energyService';
import { bodyProgressService } from '../services/bodyProgressService';
import bodyPhotoConsentService from '../services/bodyPhotoConsentService';
import { initBodyProgressStore, useBodyProgressStore } from '../stores/bodyProgressStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'BodyProgress'>;

const energyCost = JOB_ENERGY_COSTS.ANALYZE_BODY_SCAN || 0;

const BodyProgressScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const { t } = useLanguage();
    const { canAfford, showAdRecharge, queueEnergyRetry, energy } = useEnergy();
    const { scans, summary, settings, isLoading, lastError, refresh } = useBodyProgressStore();
    const [hasConsent, setHasConsent] = useState<boolean>(false);
    const [isRequestingConsent, setIsRequestingConsent] = useState(false);

    useEffect(() => {
        const unsubscribe = initBodyProgressStore();
        return () => unsubscribe();
    }, []);

    const loadConsent = useCallback(async () => {
        const consented = await bodyPhotoConsentService.hasConsent();
        setHasConsent(consented);
    }, []);

    useFocusEffect(
        useCallback(() => {
            void refresh();
            void loadConsent();
        }, [refresh, loadConsent])
    );

    const sortedScans = useMemo(() => {
        return [...scans].sort((a, b) => b.capturedAt - a.capturedAt);
    }, [scans]);

    const nextScanDueLabel = useMemo(() => {
        if (!settings?.nextScanDue) return t('body_progress.next_scan_unknown');
        return new Date(settings.nextScanDue).toLocaleDateString();
    }, [settings?.nextScanDue, t]);

    const handleConsent = useCallback(() => {
        if (isRequestingConsent) return;
        setIsRequestingConsent(true);
        Alert.alert(
            t('body_progress.consent.title'),
            t('body_progress.consent.body'),
            [
                { text: t('cancel'), style: 'cancel', onPress: () => setIsRequestingConsent(false) },
                {
                    text: t('body_progress.consent.allow'),
                    onPress: async () => {
                        await bodyPhotoConsentService.grantConsent('body_progress');
                        setHasConsent(true);
                        setIsRequestingConsent(false);
                    },
                },
            ]
        );
    }, [isRequestingConsent, t]);

    const handleStartScan = useCallback(() => {
        if (!hasConsent) {
            handleConsent();
            return;
        }
        navigation.navigate('BodyScanCamera');
    }, [handleConsent, hasConsent, navigation]);

    const handleRetryAnalysis = useCallback(async (scanId: string) => {
        if (energyCost > 0 && !canAfford(energyCost)) {
            Alert.alert(
                t('alert.low_energy'),
                t('body_progress.alert.low_energy', { cost: energyCost, energy })
            );
            queueEnergyRetry(() => handleRetryAnalysis(scanId));
            showAdRecharge();
            return;
        }
        try {
            await bodyProgressService.queueAnalysis(scanId);
            Alert.alert(t('body_progress.alert.queued_title'), t('body_progress.alert.queued_body'));
        } catch (error: any) {
            Alert.alert(t('alert.error'), error?.message || t('body_progress.alert.failed'));
        }
    }, [canAfford, energy, queueEnergyRetry, showAdRecharge, t]);

    const handleViewReport = useCallback((scanId: string) => {
        navigation.navigate('BodyProgressReport', { scanId });
    }, [navigation]);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.header}>
                    <Text style={styles.title}>{t('body_progress.title')}</Text>
                    <Text style={styles.subtitle}>{t('body_progress.subtitle')}</Text>
                </View>

                {!hasConsent && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{t('body_progress.consent.title')}</Text>
                        <Text style={styles.cardText}>{t('body_progress.consent.body')}</Text>
                        <TouchableOpacity style={styles.primaryButton} onPress={handleConsent}>
                            <Text style={styles.primaryButtonText}>{t('body_progress.consent.allow')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('body_progress.summary.title')}</Text>
                    <Text style={styles.cardText}>
                        {summary?.summary || t('body_progress.summary.empty')}
                    </Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>{t('body_progress.scans.title')}</Text>
                        <Text style={styles.metaValue}>{summary?.scanCount ?? 0}</Text>
                    </View>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>{t('body_progress.summary.next_scan')}</Text>
                        <Text style={styles.metaValue}>{nextScanDueLabel}</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                        <Text style={styles.cardTitle}>{t('body_progress.scans.title')}</Text>
                        <TouchableOpacity style={styles.secondaryButton} onPress={handleStartScan}>
                            <Text style={styles.secondaryButtonText}>{t('body_progress.camera.title')}</Text>
                        </TouchableOpacity>
                    </View>
                    {isLoading ? (
                        <ActivityIndicator size="small" color="#38bdf8" />
                    ) : sortedScans.length === 0 ? (
                        <Text style={styles.cardText}>{t('body_progress.scans.empty')}</Text>
                    ) : (
                        sortedScans.map(scan => (
                            <View key={scan.id} style={styles.scanRow}>
                                <Image source={{ uri: scan.imageUri }} style={styles.scanThumb} />
                                <View style={styles.scanInfo}>
                                    <Text style={styles.scanDate}>
                                        {new Date(scan.capturedAt).toLocaleDateString()} • {t('body_progress.scan.week', { week: scan.weekNumber })}
                                    </Text>
                                    <Text style={styles.scanStatus}>
                                        {scan.status === 'analyzed'
                                            ? t('body_progress.scan.status.complete')
                                            : scan.status === 'processing'
                                                ? t('body_progress.scan.status.processing')
                                                : scan.status === 'failed'
                                                    ? t('body_progress.scan.status.failed')
                                                    : t('body_progress.scan.status.pending')}
                                    </Text>
                                    {scan.progressScore !== undefined && (
                                        <Text style={styles.scanScore}>
                                            {t('body_progress.scan.score', { score: scan.progressScore })}
                                        </Text>
                                    )}
                                </View>
                                <View style={styles.scanActions}>
                                    <TouchableOpacity style={styles.linkButton} onPress={() => handleViewReport(scan.id)}>
                                        <Text style={styles.linkButtonText}>{t('body_progress.scan.view')}</Text>
                                    </TouchableOpacity>
                                    {scan.status === 'failed' && (
                                        <TouchableOpacity style={styles.linkButton} onPress={() => handleRetryAnalysis(scan.id)}>
                                            <Text style={styles.linkButtonText}>{t('body_progress.scan.retry')}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        ))
                    )}
                    {lastError && (
                        <Text style={styles.errorText}>{lastError}</Text>
                    )}
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
    scroll: {
        padding: 20,
        paddingBottom: 40,
    },
    header: {
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
    },
    subtitle: {
        color: 'rgba(255,255,255,0.6)',
        marginTop: 6,
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
    },
    primaryButton: {
        marginTop: 12,
        alignSelf: 'flex-start',
        backgroundColor: '#38bdf8',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
    },
    primaryButtonText: {
        color: '#020617',
        fontWeight: '700',
    },
    secondaryButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: 'rgba(56, 189, 248, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.4)',
    },
    secondaryButtonText: {
        color: '#7dd3fc',
        fontWeight: '600',
        fontSize: 12,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    metaLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    metaValue: {
        color: '#ffffff',
        fontWeight: '600',
    },
    scanRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    scanThumb: {
        width: 54,
        height: 54,
        borderRadius: 10,
        marginRight: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    scanInfo: {
        flex: 1,
    },
    scanDate: {
        color: '#ffffff',
        fontWeight: '600',
        fontSize: 13,
    },
    scanStatus: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        marginTop: 4,
    },
    scanScore: {
        color: '#38bdf8',
        fontSize: 12,
        marginTop: 4,
    },
    scanActions: {
        alignItems: 'flex-end',
        gap: 8,
    },
    linkButton: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    linkButtonText: {
        color: '#e2e8f0',
        fontSize: 12,
        fontWeight: '600',
    },
    errorText: {
        marginTop: 10,
        color: '#fca5a5',
        fontSize: 12,
    },
});

export default BodyProgressScreen;
