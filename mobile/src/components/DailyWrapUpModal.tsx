// Daily Wrap-Up Modal - End-of-day summary with AI score
import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Modal, ScrollView, Dimensions
} from 'react-native';
import { DailyWrapUp } from '../types';
import { ReviewService } from '../services/ReviewService';
import { useLanguage } from '../contexts/LanguageContext';
import { formatNumber } from '../utils/numberFormat';

const { width } = Dimensions.get('window');

interface DailyWrapUpModalProps {
    visible: boolean;
    data: DailyWrapUp;
    onClose: (rating?: number) => void;
}

export const DailyWrapUpModal: React.FC<DailyWrapUpModalProps> = ({
    visible,
    data,
    onClose,
}) => {
    const { t, language } = useLanguage();
    const [step, setStep] = useState(0);
    const [userRating, setUserRating] = useState(0);

    const handleRating = (stars: number) => {
        setUserRating(stars);

        // If high rating, log it and potentially ask for a review
        if (stars >= 4) {
            ReviewService.logPositiveInteraction();
            ReviewService.checkAndRequestReview();
        }

        setTimeout(() => {
            onClose(stars);
            setStep(0);
            setUserRating(0);
        }, 800);
    };

    // Step 0: Score & Celebration
    if (step === 0) {
        return (
            <Modal visible={visible} animationType="fade">
                <View style={styles.celebrationScreen}>
                    <View style={styles.glowContainer}>
                        <View style={styles.glow} />
                        <Text style={styles.scoreValue}>{data.aiScore}</Text>
                        <Text style={styles.scoreMax}>/10</Text>
                    </View>

                    <Text style={styles.celebrationTitle}>{t('dashboard.wrapup.complete_title')}</Text>
                    <Text style={styles.summaryText}>"{data.summary}"</Text>

                    <TouchableOpacity
                        style={styles.nextBtn}
                        onPress={() => setStep(1)}
                    >
                        <Text style={styles.nextBtnText}>{t('dashboard.wrapup.see_details')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.skipBtn}
                        onPress={() => onClose()}
                    >
                        <Text style={styles.skipBtnText}>{t('action.weight.skip')}</Text>
                    </TouchableOpacity>
                </View>
            </Modal >
        );
    }

    // Step 1: Plan vs Reality Comparison
    if (step === 1) {
        return (
            <Modal visible={visible} animationType="fade">
                <View style={styles.comparisonScreen}>
                    <View style={styles.comparisonHeader}>
                        <Text style={styles.comparisonTitle}>{t('dashboard.wrapup.plan_vs_reality')}</Text>
                        <Text style={styles.comparisonSubtitle}>{t('dashboard.wrapup.plan_vs_reality_subtitle')}</Text>
                    </View>

                    <ScrollView style={styles.comparisonScroll}>
                        {data.comparison.map((item, idx) => (
                            <View key={idx} style={styles.comparisonItem}>
                                <View style={styles.comparisonContent}>
                                    <Text style={styles.categoryLabel}>{item.category}</Text>
                                    <View style={styles.valuesContainer}>
                                        <Text style={styles.plannedValue}>{item.planned}</Text>
                                        <Text style={styles.actualValue}>→ {item.actual}</Text>
                                    </View>
                                </View>
                                <View style={[
                                    styles.statusBadge,
                                    item.status === 'hit' && styles.statusHit,
                                    item.status === 'partial' && styles.statusPartial,
                                    item.status === 'miss' && styles.statusMiss,
                                ]}>
                                    <Text style={styles.statusIcon}>
                                        {item.status === 'hit' ? '✓' : item.status === 'partial' ? '⚠️' : '✕'}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </ScrollView>

                    <View style={styles.tomorrowBox}>
                        <Text style={styles.tomorrowLabel}>{t('dashboard.wrapup.tomorrow_focus')}</Text>
                        <Text style={styles.tomorrowText}>{data.tomorrowFocus}</Text>
                    </View>
                    {data.bioSummary && (
                        <View style={styles.bioSummaryBox}>
                            <Text style={styles.bioSummaryTitle}>{t('wrapup.bio.title')}</Text>
                            <View style={styles.bioRow}>
                                <Text style={styles.bioLabel}>{t('wrapup.bio.stress_summary')}</Text>
                                <Text style={styles.bioValue}>{formatNumber(data.bioSummary.avgStress, language)}/100</Text>
                            </View>
                            <View style={styles.bioRow}>
                                <Text style={styles.bioLabel}>{t('wrapup.bio.readiness_summary')}</Text>
                                <Text style={styles.bioValue}>{formatNumber(data.bioSummary.avgReadiness, language)}/100</Text>
                            </View>
                            <View style={styles.bioRow}>
                                <Text style={styles.bioLabel}>{t('wrapup.bio.hrv_trend')}</Text>
                                <Text style={styles.bioValue}>{t(`bio.trend.${data.bioSummary.hrvTrend}`)}</Text>
                            </View>
                            <View style={styles.bioRow}>
                                <Text style={styles.bioLabel}>{t('wrapup.bio.sleep_score_summary')}</Text>
                                <Text style={styles.bioValue}>{formatNumber(data.bioSummary.sleepScoreAvg, language)}/100</Text>
                            </View>
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.primaryBtn}
                        onPress={() => setStep(2)}
                    >
                        <Text style={styles.primaryBtnText}>{t('next')}</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        );
    }

    // Step 2: User Rating
    return (
        <Modal visible={visible} animationType="fade">
            <View style={styles.ratingScreen}>
                <Text style={styles.ratingTitle}>{t('dashboard.wrapup.rating_title')}</Text>
                <Text style={styles.ratingSubtitle}>{t('dashboard.wrapup.rating_subtitle')}</Text>

                <View style={styles.starsContainer}>
                    {[1, 2, 3, 4, 5].map(star => (
                        <TouchableOpacity
                            key={star}
                            onPress={() => handleRating(star)}
                            style={styles.starBtn}
                        >
                            <Text style={[
                                styles.starIcon,
                                userRating >= star && styles.starActive
                            ]}>
                                ★
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {userRating > 0 && (
                    <Text style={styles.savedText}>{t('dashboard.wrapup.saved')}</Text>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    // Celebration Screen
    celebrationScreen: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    glowContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    glow: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: '#eab308',
        opacity: 0.1,
    },
    scoreValue: {
        fontSize: 96,
        fontWeight: '900',
        color: '#fbbf24',
    },
    scoreMax: {
        fontSize: 28,
        color: '#ffffff',
        marginTop: -10,
    },
    celebrationTitle: {
        fontSize: 32,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 16,
    },
    summaryText: {
        fontSize: 18,
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        fontStyle: 'italic',
        lineHeight: 26,
        maxWidth: 280,
    },
    nextBtn: {
        backgroundColor: '#ffffff',
        paddingVertical: 18,
        paddingHorizontal: 40,
        borderRadius: 28,
        marginTop: 48,
    },
    nextBtnText: {
        color: '#000000',
        fontSize: 18,
        fontWeight: '700',
    },
    skipBtn: {
        marginTop: 16,
        paddingVertical: 12,
        paddingHorizontal: 24,
    },
    skipBtnText: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 14,
    },

    // Comparison Screen
    comparisonScreen: {
        flex: 1,
        backgroundColor: '#020617',
        padding: 24,
        paddingTop: 60,
    },
    comparisonHeader: {
        marginBottom: 24,
    },
    comparisonTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
    },
    comparisonSubtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    comparisonScroll: {
        flex: 1,
    },
    comparisonItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    comparisonContent: {
        flex: 1,
    },
    categoryLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    valuesContainer: {},
    plannedValue: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.4)',
        textDecorationLine: 'line-through',
        marginBottom: 4,
    },
    actualValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ffffff',
    },
    statusBadge: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusHit: {
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
    },
    statusPartial: {
        backgroundColor: 'rgba(234, 179, 8, 0.2)',
    },
    statusMiss: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
    },
    statusIcon: {
        fontSize: 20,
    },
    tomorrowBox: {
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderRadius: 16,
        padding: 16,
        marginVertical: 16,
    },
    tomorrowLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#818cf8',
        marginBottom: 6,
    },
    tomorrowText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ffffff',
    },
    bioSummaryBox: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    bioSummaryTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 10,
    },
    bioRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    bioLabel: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    bioValue: {
        fontSize: 13,
        color: '#ffffff',
        fontWeight: '600',
    },
    primaryBtn: {
        backgroundColor: '#6366f1',
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
    },
    primaryBtnText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '700',
    },

    // Rating Screen
    ratingScreen: {
        flex: 1,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    ratingTitle: {
        fontSize: 32,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 12,
    },
    ratingSubtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 48,
    },
    starsContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    starBtn: {
        padding: 8,
    },
    starIcon: {
        fontSize: 48,
        color: 'rgba(255, 255, 255, 0.2)',
    },
    starActive: {
        color: '#fbbf24',
    },
    savedText: {
        color: '#22c55e',
        fontSize: 18,
        fontWeight: '700',
        marginTop: 32,
    },
});

export default DailyWrapUpModal;
