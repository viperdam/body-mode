// Progress Detail Modal - Shows detailed breakdown of daily progress
import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Dimensions
} from 'react-native';
import { FoodLogEntry, ActivityLogEntry, NutrientBalanceSnapshot, NutrientKey } from '../types';
import { getLocalDateKey } from '../utils/dateUtils';
import storage from '../services/storageService';
import { nutritionService, NUTRIENT_DISPLAY_NAMES, NUTRIENT_UNITS } from '../services/nutritionService';
import { useLanguage } from '../contexts/LanguageContext';

const { width } = Dimensions.get('window');

interface ProgressDetailModalProps {
    visible: boolean;
    onClose: () => void;
    foodLogs?: FoodLogEntry[]; // Optional - will self-load if empty
    activityLogs?: ActivityLogEntry[]; // Optional - will self-load if empty
    waterAmount: number;
    sleepHours: number;
    viewingDate: Date;
    useMetric: boolean;
    nutritionSnapshot?: NutrientBalanceSnapshot | null;
    onEditSleep?: () => void;
}

export const ProgressDetailModal: React.FC<ProgressDetailModalProps> = ({
    visible,
    onClose,
    foodLogs: propFoodLogs,
    activityLogs: propActivityLogs,
    waterAmount,
    sleepHours,
    viewingDate,
    useMetric,
    nutritionSnapshot: propNutritionSnapshot,
    onEditSleep,
}) => {
    const { t, language } = useLanguage();
    const viewingKey = getLocalDateKey(viewingDate);

    // State for self-loaded logs
    const [loadedFoodLogs, setLoadedFoodLogs] = useState<FoodLogEntry[]>([]);
    const [loadedActivityLogs, setLoadedActivityLogs] = useState<ActivityLogEntry[]>([]);
    const [loadedNutritionSnapshot, setLoadedNutritionSnapshot] = useState<NutrientBalanceSnapshot | null>(null);
    const [showAllMicronutrients, setShowAllMicronutrients] = useState(true);
    const [contentKey, setContentKey] = useState(0);

    // Load logs from storage when modal opens
    useEffect(() => {
        if (visible) {
            setShowAllMicronutrients(true);
            const loadLogs = async () => {
                try {
                    // Load food logs
                    const allFoods = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
                    setLoadedFoodLogs(allFoods);

                    // Load activity logs
                    const allActivities = await storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY) || [];
                    setLoadedActivityLogs(allActivities);
                } catch (e) {
                    console.warn('[ProgressDetailModal] Failed to load logs:', e);
                }
            };
            loadLogs();
        }
    }, [visible]);

    useEffect(() => {
        if (!visible) return;
        if (propNutritionSnapshot) {
            setLoadedNutritionSnapshot(propNutritionSnapshot);
            return;
        }

        const loadSnapshot = async () => {
            try {
                const snapshot = await nutritionService.getSnapshotForDate(viewingKey);
                setLoadedNutritionSnapshot(snapshot);
            } catch (e) {
                console.warn('[ProgressDetailModal] Failed to load nutrition snapshot:', e);
            }
        };

        loadSnapshot();
    }, [visible, viewingKey, propNutritionSnapshot]);

    // Use prop logs if provided, otherwise use self-loaded
    const foodLogs = (propFoodLogs && propFoodLogs.length > 0) ? propFoodLogs : loadedFoodLogs;
    const activityLogs = (propActivityLogs && propActivityLogs.length > 0) ? propActivityLogs : loadedActivityLogs;

    // Filter logs for viewing date
    const todayFoods = foodLogs.filter(f => getLocalDateKey(new Date(f.timestamp)) === viewingKey);
    const todayActivities = activityLogs.filter(a => getLocalDateKey(new Date(a.timestamp)) === viewingKey);

    const nutritionSnapshot = propNutritionSnapshot || loadedNutritionSnapshot;
    const nutritionScore =
        typeof nutritionSnapshot?.overallScore === 'number' ? nutritionSnapshot.overallScore : 0;
    const nutritionCoverage =
        typeof nutritionSnapshot?.coverage === 'number' ? nutritionSnapshot.coverage : 0;
    const nutritionLogCount =
        typeof nutritionSnapshot?.foodLogCount === 'number' ? nutritionSnapshot.foodLogCount : 0;
    const nutrientKeys = Object.keys(NUTRIENT_DISPLAY_NAMES) as NutrientKey[];
    const gapMap = new Map(
        (nutritionSnapshot?.gaps || []).map(gap => [gap.nutrient, gap])
    );
    const nutrientRows = nutritionSnapshot
        ? nutrientKeys.map(key => {
            const current = nutritionSnapshot.totals?.[key] ?? 0;
            const target = nutritionSnapshot.targets?.[key] ?? 0;
            const percent = target > 0 ? Math.round((current / target) * 100) : 0;
            const gap = gapMap.get(key);
            const nutrientLabelKey = `food_analyzer.micros.nutrient.${key}`;
            const localizedName = t(nutrientLabelKey);
            return {
                key,
                name: localizedName === nutrientLabelKey ? NUTRIENT_DISPLAY_NAMES[key] : localizedName,
                unit: NUTRIENT_UNITS[key],
                current,
                target,
                percent,
                severity: gap?.severity || 'unknown',
            };
        })
        : [];
    const deficiencyCount = nutrientRows.filter(row => row.severity === 'critical' || row.severity === 'low').length;

    useEffect(() => {
        if (!visible) return;
        setContentKey(prev => prev + 1);
    }, [visible, showAllMicronutrients, nutritionSnapshot?.updatedAt, nutrientRows.length]);

    const getSeverityColor = (severity: string) => {
        if (severity === 'critical') return '#ef4444';
        if (severity === 'low') return '#f97316';
        if (severity === 'adequate' || severity === 'good') return '#22c55e';
        if (severity === 'excess') return '#f59e0b';
        return 'rgba(255, 255, 255, 0.6)';
    };

    // Aggregate stats
    const totalCalories = todayFoods.reduce((sum, f) => sum + (f.food?.macros?.calories || 0), 0);
    const totalProtein = todayFoods.reduce((sum, f) => sum + (f.food?.macros?.protein || 0), 0);
    const totalCarbs = todayFoods.reduce((sum, f) => sum + (f.food?.macros?.carbs || 0), 0);
    const totalFat = todayFoods.reduce((sum, f) => sum + (f.food?.macros?.fat || 0), 0);

    const caloriesBurned = todayActivities.reduce((sum, a) => sum + (a.caloriesBurned || 0), 0);
    const hydrationUnit = useMetric ? t('units.ml') : t('units.oz');
    const hydrationValue = useMetric ? waterAmount : Math.round(waterAmount * 0.033814);
    const hydrationGoal = useMetric ? 2500 : 85;
    const hydrationBarValue = useMetric ? waterAmount : hydrationValue;
    const hydrationPercent = Math.min(100, (hydrationBarValue / hydrationGoal) * 100);
    const sleepGoalHours = 8;

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' });
    };

    const formattedDate = viewingDate.toLocaleDateString(language, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <View style={styles.headerTitle}>
                            <Text style={styles.title}>{t('progress_detail.title')}</Text>
                            <Text style={styles.dateLabel}>{formattedDate}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        key={`progress-${contentKey}`}
                        style={styles.content}
                        contentContainerStyle={styles.contentContainer}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                        removeClippedSubviews={false}
                    >
                        {/* Summary Stats */}
                        <View style={styles.summaryCard}>
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryValue}>{Math.round(totalCalories)}</Text>
                                    <Text style={styles.summaryLabel}>{t('progress_detail.summary.calories')}</Text>
                                </View>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryValue}>
                                        {Math.round(totalProtein)}{t('units.g')}
                                    </Text>
                                    <Text style={styles.summaryLabel}>{t('progress_detail.summary.protein')}</Text>
                                </View>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryValue}>
                                        {sleepHours.toFixed(1)}{t('units.h')}
                                    </Text>
                                    <Text style={styles.summaryLabel}>{t('progress_detail.summary.sleep')}</Text>
                                </View>
                            </View>
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryValue}>
                                        {Math.round(totalCarbs)}{t('units.g')}
                                    </Text>
                                    <Text style={styles.summaryLabel}>{t('progress_detail.summary.carbs')}</Text>
                                </View>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryValue}>
                                        {Math.round(totalFat)}{t('units.g')}
                                    </Text>
                                    <Text style={styles.summaryLabel}>{t('progress_detail.summary.fat')}</Text>
                                </View>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryValue}>{hydrationValue}</Text>
                                    <Text style={styles.summaryLabel}>{t('progress_detail.summary.hydration', { unit: hydrationUnit })}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Micronutrients Section */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t('progress_detail.section.micros')}</Text>
                            {nutritionSnapshot ? (
                                <View style={styles.nutrientCard}>
                                    <View style={styles.nutrientSummaryRow}>
                                        <Text style={styles.nutrientSummaryText}>
                                            {t('progress_detail.micros.score', { score: nutritionScore })}
                                        </Text>
                                        <Text style={styles.nutrientSummaryText}>
                                            {t('progress_detail.micros.coverage', { coverage: nutritionCoverage })}
                                        </Text>
                                    </View>
                                    <Text style={styles.nutrientSummarySubtext}>
                                        {t('progress_detail.micros.logged_foods', { count: nutritionLogCount })}
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.micronutrientToggle}
                                        onPress={() => setShowAllMicronutrients(prev => !prev)}
                                    >
                                        <Text style={styles.micronutrientToggleText}>
                                            {showAllMicronutrients
                                                ? t('progress_detail.micros.toggle_hide')
                                                : t('progress_detail.micros.toggle_show')}
                                        </Text>
                                    </TouchableOpacity>
                                    {!showAllMicronutrients && deficiencyCount > 0 && (
                                        <Text style={styles.nutrientSummarySubtext}>
                                            {t('progress_detail.micros.below_target', { count: deficiencyCount })}
                                        </Text>
                                    )}
                                    {showAllMicronutrients ? (
                                        nutrientRows.length > 0 ? (
                                            <View style={styles.nutrientGrid}>
                                                {nutrientRows.map((row) => (
                                                    <View key={row.key} style={styles.nutrientGridItem}>
                                                        <Text style={[styles.nutrientGapName, { color: getSeverityColor(row.severity) }]}>
                                                            {row.name}
                                                        </Text>
                                                        <Text style={styles.nutrientGapValue}>
                                                            {Math.round(row.current)} / {Math.round(row.target)} {row.unit}
                                                        </Text>
                                                        <Text style={styles.nutrientPercentText}>{row.percent}%</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        ) : (
                                            <Text style={styles.emptyText}>{t('progress_detail.micros.empty')}</Text>
                                        )
                                    ) : null}
                                    {nutritionSnapshot.insights?.summary && (
                                        <Text style={styles.nutritionInsightText}>
                                            {nutritionSnapshot.insights.summary}
                                        </Text>
                                    )}
                                </View>
                            ) : (
                                <Text style={styles.emptyText}>{t('progress_detail.micros.empty')}</Text>
                            )}
                        </View>

                        {/* Meals Section */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t('progress_detail.section.meals', { count: todayFoods.length })}</Text>
                            {todayFoods.length > 0 ? (
                                todayFoods.map((food, idx) => (
                                    <View key={food.id || idx} style={styles.logItem}>
                                        <View style={styles.logHeader}>
                                            <Text style={styles.logName}>{food.food?.foodName || t('progress_detail.meals.fallback')}</Text>
                                            <Text style={styles.logTime}>{formatTime(food.timestamp)}</Text>
                                        </View>
                                        <Text style={styles.logDetails}>
                                            {t('progress_detail.meals.macros', {
                                                calories: Math.round(food.food?.macros?.calories || 0),
                                                protein: Math.round(food.food?.macros?.protein || 0),
                                                carbs: Math.round(food.food?.macros?.carbs || 0),
                                                fat: Math.round(food.food?.macros?.fat || 0),
                                            })}
                                        </Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.emptyText}>{t('progress_detail.meals.empty')}</Text>
                            )}
                        </View>

                        {/* Activities Section */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t('progress_detail.section.activities', { count: todayActivities.length })}</Text>
                            {todayActivities.length > 0 ? (
                                todayActivities.map((activity, idx) => (
                                    <View key={activity.id || idx} style={styles.logItem}>
                                        <View style={styles.logHeader}>
                                            <Text style={styles.logName}>{activity.name || t('progress_detail.activities.fallback')}</Text>
                                            <Text style={styles.logTime}>{formatTime(activity.timestamp)}</Text>
                                        </View>
                                        <Text style={styles.logDetails}>
                                            {t('progress_detail.activities.detail', {
                                                minutes: activity.durationMinutes || 0,
                                                calories: activity.caloriesBurned || 0,
                                            })}
                                        </Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.emptyText}>{t('progress_detail.activities.empty')}</Text>
                            )}
                            {caloriesBurned > 0 && (
                                <View style={styles.totalBurned}>
                                    <Text style={styles.totalBurnedText}>
                                        {t('progress_detail.activities.total_burned', { calories: caloriesBurned })}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Sleep Section */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t('progress_detail.section.sleep')}</Text>
                            {sleepHours > 0 ? (
                                <View style={styles.sleepCard}>
                                    <Text style={styles.sleepValue}>
                                        {t('progress_detail.sleep.hours', { hours: sleepHours.toFixed(1) })}
                                    </Text>
                                    <View style={styles.sleepBar}>
                                        <View style={[styles.sleepBarFill, { width: `${Math.min(100, (sleepHours / sleepGoalHours) * 100)}%` }]} />
                                    </View>
                                    <Text style={styles.sleepGoal}>{t('progress_detail.sleep.goal', { hours: sleepGoalHours })}</Text>
                                    {onEditSleep && (
                                        <TouchableOpacity style={styles.sleepEditButton} onPress={onEditSleep}>
                                            <Text style={styles.sleepEditButtonText}>{t('progress_detail.sleep.edit_action')}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ) : (
                                <Text style={styles.emptyText}>{t('progress_detail.sleep.empty')}</Text>
                            )}
                        </View>

                        {/* Hydration Timeline */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t('progress_detail.section.hydration')}</Text>
                            <View style={styles.hydrationCard}>
                                <Text style={styles.hydrationValue}>
                                    {t('progress_detail.hydration.value', { amount: hydrationValue, unit: hydrationUnit })}
                                </Text>
                                <View style={styles.hydrationBar}>
                                    <View style={[styles.hydrationBarFill, { width: `${hydrationPercent}%` }]} />
                                </View>
                                <Text style={styles.hydrationGoal}>
                                    {t('progress_detail.hydration.goal', { amount: hydrationGoal, unit: hydrationUnit })}
                                </Text>
                            </View>
                        </View>

                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: '#1a1a2e',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '85%',
        maxHeight: '85%',
        paddingBottom: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    headerTitle: {
        flex: 1,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    dateLabel: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.65)',
        marginTop: 4,
    },
    closeBtn: {
        padding: 8,
    },
    closeBtnText: {
        fontSize: 20,
        color: '#888',
    },
    content: {
        paddingHorizontal: 20,
        flex: 1,
    },
    contentContainer: {
        paddingBottom: 32,
        flexGrow: 1,
    },
    summaryCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        padding: 16,
        marginTop: 16,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginVertical: 8,
    },
    summaryItem: {
        alignItems: 'center',
    },
    summaryValue: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
    },
    summaryLabel: {
        fontSize: 12,
        color: '#888',
        marginTop: 4,
    },
    nutrientCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 14,
        padding: 14,
    },
    nutrientSummaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    nutrientSummaryText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#e2e8f0',
    },
    nutrientSummarySubtext: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 8,
    },
    micronutrientToggle: {
        alignSelf: 'flex-start',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        marginBottom: 8,
    },
    micronutrientToggleText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.75)',
    },
    nutrientGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    nutrientGridItem: {
        width: '48%',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 10,
        padding: 8,
        marginBottom: 8,
    },
    nutrientGapName: {
        fontSize: 13,
        fontWeight: '600',
        flex: 1,
        marginRight: 8,
    },
    nutrientGapValue: {
        fontSize: 12,
        color: '#cbd5f5',
    },
    nutrientPercentText: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: 2,
    },
    nutritionInsightText: {
        marginTop: 8,
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 18,
    },
    section: {
        marginTop: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 12,
    },
    logItem: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    logName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        flex: 1,
    },
    logTime: {
        fontSize: 13,
        color: '#888',
    },
    logDetails: {
        fontSize: 13,
        color: '#aaa',
        marginTop: 6,
    },
    emptyText: {
        fontSize: 14,
        color: '#666',
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 16,
    },
    totalBurned: {
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        borderRadius: 10,
        padding: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    totalBurnedText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#f97316',
    },
    sleepCard: {
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
    },
    sleepValue: {
        fontSize: 32,
        fontWeight: '700',
        color: '#8b5cf6',
    },
    sleepBar: {
        width: '100%',
        height: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        marginTop: 12,
        overflow: 'hidden',
    },
    sleepBarFill: {
        height: '100%',
        backgroundColor: '#8b5cf6',
        borderRadius: 4,
    },
    sleepGoal: {
        fontSize: 12,
        color: '#888',
        marginTop: 8,
    },
    sleepEditButton: {
        marginTop: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
        backgroundColor: 'rgba(139, 92, 246, 0.18)',
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.4)',
    },
    sleepEditButtonText: {
        color: '#c4b5fd',
        fontWeight: '600',
        fontSize: 13,
    },
    hydrationCard: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
    },
    hydrationValue: {
        fontSize: 32,
        fontWeight: '700',
        color: '#3b82f6',
    },
    hydrationBar: {
        width: '100%',
        height: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        marginTop: 12,
        overflow: 'hidden',
    },
    hydrationBarFill: {
        height: '100%',
        backgroundColor: '#3b82f6',
        borderRadius: 4,
    },
    hydrationGoal: {
        fontSize: 12,
        color: '#888',
        marginTop: 8,
    },
});

export default ProgressDetailModal;
