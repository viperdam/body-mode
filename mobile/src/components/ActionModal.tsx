// Action Modal Component - Plan reminders, food logging, activity tracking, favorites
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    Modal, ActivityIndicator, ScrollView, Vibration, KeyboardAvoidingView, Platform
} from 'react-native';
import { ActivityLogEntry, AppContext, DailyPlan, FoodAnalysisResult, FoodLogEntry, MoodLog, PlanItem, SavedMeal, UserProfile, WeightLogEntry } from '../types';
import { analyzeTextFood } from '../services/geminiService';
import storage, { getWaterAmountForDate } from '../services/storageService';
import sleepHoursService from '../services/sleepHoursService';
import { useLanguage } from '../contexts/LanguageContext';
import { getActiveDayKey } from '../services/dayBoundaryService';
import locationService from '../services/locationService';
import { getWeatherSnapshot } from '../services/weatherService';

interface ActionModalProps {
    visible: boolean;
    type: 'plan_reminder' | 'weight_check' | 'unplanned_activity' | 'log_water' | 'log_food';
    item?: PlanItem;
    userProfile?: UserProfile;
    currentWeight?: number;
    savedMeals?: SavedMeal[];
    onComplete: (reactionTime?: number) => void;
    onSnooze: (minutes: number) => void;
    onSkip?: () => void;
    onUpdateWeight?: (weight: number) => void;
    onLogFoodText?: (food: FoodAnalysisResult) => void;
    onNavigateToCamera?: () => void;
    onUpdateWater?: (amount: number) => void;
    onLogActivity?: (entry: ActivityLogEntry) => void;
    onClose: () => void;
}

type ModalMode = 'main' | 'snooze_select' | 'log_food_select' | 'log_food_text' | 'log_water_input' | 'log_activity_input' | 'unplanned_fork' | 'favorites';

export const ActionModal: React.FC<ActionModalProps> = ({
    visible,
    type,
    item,
    userProfile,
    currentWeight,
    savedMeals,
    onComplete,
    onSnooze,
    onSkip,
    onUpdateWeight,
    onLogFoodText,
    onNavigateToCamera,
    onUpdateWater,
    onLogActivity,
    onClose,
}) => {
    const { language, t } = useLanguage();
    const [mountTime] = useState(Date.now());
    const [mode, setMode] = useState<ModalMode>('main');

    // Weight state
    const [customWeight, setCustomWeight] = useState(currentWeight?.toString() || '');

    // Food text state
    const [foodDescription, setFoodDescription] = useState('');
    const [foodQuantity, setFoodQuantity] = useState('');
    const [isAnalyzingFood, setIsAnalyzingFood] = useState(false);

    // Activity state
    const [activityName, setActivityName] = useState(item?.title || '');
    const defaultActivityRef = useRef(t('action.activity.default'));
    const [activityDuration, setActivityDuration] = useState(60);
    const [activityIntensity, setActivityIntensity] = useState<'low' | 'moderate' | 'high'>('moderate');

    // Water state
    const [waterAmount, setWaterAmount] = useState(250);

    // Favorites state
    const [localFavorites, setLocalFavorites] = useState<SavedMeal[]>(savedMeals || []);
    const intensityLabels = {
        low: t('intensity.low'),
        moderate: t('intensity.moderate'),
        high: t('intensity.high'),
    };

    useEffect(() => {
        const nextDefault = t('action.activity.default');
        if (!activityName || activityName === defaultActivityRef.current) {
            setActivityName(item?.title || nextDefault);
        }
        defaultActivityRef.current = nextDefault;
    }, [language, item?.title]);

    useEffect(() => {
        if (visible) {
            Vibration.vibrate(50);
            if (type === 'unplanned_activity') {
                setMode('unplanned_fork');
                setActivityName('');
                setActivityDuration(30);
            } else if (type === 'log_food') {
                setMode('log_food_select');
            } else if (type === 'log_water') {
                setMode('log_water_input');
            } else {
                setMode('main');
            }
        }
    }, [visible, type]);

    // Load favorites from storage if not passed
    useEffect(() => {
        const loadFavorites = async () => {
            if (!savedMeals || savedMeals.length === 0) {
                const stored = await storage.get<SavedMeal[]>(storage.keys.SAVED_MEALS);
                if (stored) setLocalFavorites(stored);
            }
        };
        loadFavorites();
    }, [savedMeals]);

    const getReactionTime = () => Math.round((Date.now() - mountTime) / 1000);

    const handleCompleteWithTracking = () => {
        onComplete(getReactionTime());
    };

    const handleLogFavorite = (meal: SavedMeal) => {
        if (onLogFoodText) {
            const foodResult: FoodAnalysisResult = {
                foodName: meal.name,
                description: t('action.favorite.description', { meal: meal.name }),
                ingredients: [],
                macros: meal.macros,
                healthGrade: meal.healthGrade,
                confidence: t('food_analyzer.confidence_level.high'),
                advice: t('action.favorite.advice')
            };
            onLogFoodText(foodResult);
        }
        onClose();
    };

    const handleMainAction = () => {
        if (item?.linkedAction === 'log_food') {
            setMode('log_food_select');
        } else if (item?.linkedAction === 'log_water') {
            setMode('log_water_input');
        } else {
            handleCompleteWithTracking();
        }
    };

    const handleModifyAction = () => {
        if (item?.type === 'meal') {
            setMode('log_food_select');
        } else if (item?.type === 'workout') {
            setMode('log_activity_input');
        }
    };

    const submitFoodText = async () => {
        if (!foodDescription || !userProfile) return;
        setIsAnalyzingFood(true);
        try {
            const quantityPart = foodQuantity
                ? t('action.log_food_text.quantity_prefix', { quantity: foodQuantity })
                : '';
            const fullText = foodQuantity ? `${foodDescription}, ${quantityPart}` : foodDescription;

            const activeDayKey = await getActiveDayKey();
            const planStorageKey = `${storage.keys.DAILY_PLAN}_${activeDayKey}`;

            const [
                foodHistory,
                activityHistory,
                moodHistory,
                weightHistory,
                waterLog,
                sleepHistory,
                datedPlan,
                legacyPlan,
                historySummary,
            ] = await Promise.all([
                storage.get<FoodLogEntry[]>(storage.keys.FOOD),
                storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY),
                storage.get<MoodLog[]>(storage.keys.MOOD),
                storage.get<WeightLogEntry[]>(storage.keys.WEIGHT),
                storage.get<{ date: string; amount: number }>(storage.keys.WATER),
                sleepHoursService.getHistory(),
                storage.get<DailyPlan>(planStorageKey),
                storage.get<DailyPlan>(storage.keys.DAILY_PLAN),
                storage.get<string>('history_summary'),
            ]);

            const deepContext = {
                foodHistory: foodHistory || [],
                activityHistory: activityHistory || [],
                moodHistory: moodHistory || [],
                weightHistory: weightHistory || [],
                waterLog: waterLog || { date: activeDayKey, amount: await getWaterAmountForDate(activeDayKey) },
                sleepHistory: sleepHistory || [],
                appContext: await (async () => {
                    try {
                        const coords = await locationService.getLastKnownLocation();
                        const weatherSnapshot = await getWeatherSnapshot({ coords: coords || undefined });
                        return {
                            weather: weatherSnapshot?.weather || { temp: 20, condition: 'Unknown', code: 0 },
                            currentLocation: weatherSnapshot?.locationName || 'Unknown',
                        } as AppContext;
                    } catch (error) {
                        console.warn('[ActionModal] Failed to load weather snapshot:', error);
                        return { weather: { temp: 20, condition: 'Unknown', code: 0 }, currentLocation: 'Unknown' } as AppContext;
                    }
                })(),
                currentPlan: datedPlan || legacyPlan || null,
                historySummary: historySummary || undefined,
            };

            const result = await analyzeTextFood(fullText, userProfile, language, deepContext);
            if (onLogFoodText) onLogFoodText(result);
            onClose();
        } catch (e) {
            console.error(e);
            setIsAnalyzingFood(false);
        }
    };

    const submitActivity = () => {
        if (!onLogActivity) return;

        let met = activityIntensity === 'low' ? 3 : activityIntensity === 'moderate' ? 6 : 9;
        const weight = userProfile?.weight || 70;
        const durationHours = activityDuration / 60;
        const calories = Math.round(met * weight * durationHours);

        const entry: ActivityLogEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            name: activityName || t('action.activity.default'),
            durationMinutes: activityDuration,
            intensity: activityIntensity,
            caloriesBurned: calories,
        };
        onLogActivity(entry);
        onClose();
    };

    const submitWater = () => {
        if (onUpdateWater) {
            onUpdateWater(waterAmount);
            handleCompleteWithTracking();
        }
    };

    const handleWeightUpdate = () => {
        const weight = parseFloat(customWeight);
        if (!isNaN(weight) && onUpdateWeight) {
            onUpdateWeight(weight);
            onClose();
        }
    };

    // Weight Check Modal
    if (type === 'weight_check') {
        return (
            <Modal visible={visible} animationType="fade" transparent>
                <KeyboardAvoidingView
                    style={styles.overlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
                >
                    <ScrollView
                        style={styles.modalScroll}
                        contentContainerStyle={styles.modalScrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.modal}>
                        <View style={styles.iconContainer}>
                            <Text style={styles.modalIcon}>⚖️</Text>
                        </View>
                        <Text style={styles.modalTitle}>{t('action.weight.weekly_title')}</Text>
                        <Text style={styles.modalSubtitle}>{t('action.weight.weekly_subtitle')}</Text>

                        <TextInput
                            style={styles.weightInput}
                            value={customWeight}
                            onChangeText={setCustomWeight}
                            keyboardType="numeric"
                            placeholder={t('units.kg')}
                            placeholderTextColor="rgba(255,255,255,0.3)"
                            autoFocus
                        />

                        <TouchableOpacity style={styles.primaryBtn} onPress={handleWeightUpdate}>
                            <Text style={styles.primaryBtnText}>{t('action.weight.update')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={onClose}>
                            <Text style={styles.skipText}>{t('action.weight.skip')}</Text>
                        </TouchableOpacity>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
            >
                <ScrollView
                    style={styles.modalScroll}
                    contentContainerStyle={styles.modalScrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.modal}>
                    {/* Main Mode */}
                    {mode === 'main' && (
                        <>
                            <View style={styles.modalHeader}>
                                <View style={styles.reminderBadge}>
                                    <View style={styles.pulsingDot} />
                                    <Text style={styles.reminderText}>{t('reminder')}</Text>
                                </View>
                                <Text style={styles.iconLarge}>
                                    {item?.type === 'meal' ? '🍔' :
                                        item?.type === 'workout' ? '💪' :
                                            item?.type === 'hydration' ? '💧' : '⏰'}
                                </Text>
                            </View>

                            <Text style={styles.modalTitle}>{item?.title}</Text>
                            <Text style={styles.modalSubtitle}>{item?.description}</Text>

                            <View style={styles.buttonGroup}>
                                <TouchableOpacity
                                    style={[styles.primaryBtn, { backgroundColor: '#22c55e' }]}
                                    onPress={handleMainAction}
                                >
                                    <Text style={styles.primaryBtnText}>{`✓ ${t('yes_did_it')}`}</Text>
                                </TouchableOpacity>

                                {(item?.type === 'meal' || item?.type === 'workout') && (
                                    <TouchableOpacity style={styles.outlineBtn} onPress={handleModifyAction}>
                                        <Text style={styles.outlineBtnText}>
                                            {item.type === 'meal'
                                                ? t('action.modify.meal_alt')
                                                : t('action.modify.workout_alt')}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                <View style={styles.buttonRow}>
                                    <TouchableOpacity
                                        style={[styles.halfBtn, styles.outlineBtn]}
                                        onPress={() => setMode('snooze_select')}
                                    >
                                        <Text style={styles.outlineBtnText}>{t('action.snooze')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.halfBtn, styles.ghostBtn]}
                                        onPress={onSkip}
                                    >
                                        <Text style={styles.ghostBtnText}>{t('action.skip')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </>
                    )}

                    {/* Snooze Select */}
                    {mode === 'snooze_select' && (
                        <>
                            <Text style={styles.modalTitle}>{t('action.snooze.title')}</Text>
                            <View style={styles.snoozeGrid}>
                                {[15, 30, 45, 60].map(mins => (
                                    <TouchableOpacity
                                        key={mins}
                                        style={styles.snoozeBtn}
                                        onPress={() => onSnooze(mins)}
                                    >
                                        <Text style={styles.snoozeBtnText}>{t('action.snooze.minutes', { minutes: mins })}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TouchableOpacity onPress={() => setMode('main')}>
                                <Text style={styles.cancelText}>{t('cancel')}</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {/* Unplanned Activity Fork */}
                    {mode === 'unplanned_fork' && (
                        <>
                            <Text style={styles.modalTitle}>{t('action.unplanned.reality_title')}</Text>
                            <Text style={styles.modalSubtitle}>{t('action.unplanned.reality_subtitle')}</Text>

                            <View style={styles.forkOptions}>
                                <TouchableOpacity
                                    style={[styles.forkBtn, { backgroundColor: 'rgba(249, 115, 22, 0.2)', borderColor: '#f97316' }]}
                                    onPress={() => setMode('log_food_select')}
                                >
                                    <Text style={styles.forkIcon}>🍫</Text>
                                    <Text style={styles.forkTitle}>{t('action.unplanned.fork_food_title')}</Text>
                                    <Text style={styles.forkDesc}>{t('action.unplanned.fork_food_desc')}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.forkBtn, { backgroundColor: 'rgba(6, 182, 212, 0.2)', borderColor: '#06b6d4' }]}
                                    onPress={() => setMode('log_activity_input')}
                                >
                                    <Text style={styles.forkIcon}>🏃‍♂️</Text>
                                    <Text style={styles.forkTitle}>{t('action.unplanned.fork_move_title')}</Text>
                                    <Text style={styles.forkDesc}>{t('action.unplanned.fork_move_desc')}</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity onPress={onClose}>
                                <Text style={styles.cancelText}>{t('cancel')}</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {/* Log Food Select */}
                    {mode === 'log_food_select' && (
                        <>
                            <Text style={styles.modalTitle}>{t('how_log_food')}</Text>

                            <View style={styles.logOptions}>
                                <TouchableOpacity
                                    style={[styles.logOptionBtn, { backgroundColor: 'rgba(6, 182, 212, 0.2)' }]}
                                    onPress={() => { onClose(); onNavigateToCamera?.(); }}
                                >
                                    <Text style={styles.logOptionIcon}>📸</Text>
                                    <Text style={styles.logOptionText}>{t('camera')}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.logOptionBtn, { backgroundColor: 'rgba(34, 197, 94, 0.2)' }]}
                                    onPress={() => setMode('log_food_text')}
                                >
                                    <Text style={styles.logOptionIcon}>📝</Text>
                                    <Text style={styles.logOptionText}>{t('action.log_food.describe')}</Text>
                                </TouchableOpacity>

                                {localFavorites.length > 0 && (
                                    <TouchableOpacity
                                        style={[styles.logOptionBtn, { backgroundColor: 'rgba(234, 179, 8, 0.2)' }]}
                                        onPress={() => setMode('favorites')}
                                    >
                                        <Text style={styles.logOptionIcon}>⭐</Text>
                                        <Text style={styles.logOptionText}>{t('favorites')}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            <TouchableOpacity onPress={() => setMode('main')}>
                                <Text style={styles.cancelText}>{t('cancel')}</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {/* Favorites Mode */}
                    {mode === 'favorites' && (
                        <>
                            <Text style={styles.modalTitle}>{t('action.favorites.quick_title')}</Text>
                            <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
                                {localFavorites.map((meal) => (
                                    <TouchableOpacity
                                        key={meal.id}
                                        style={styles.favoriteItem}
                                        onPress={() => handleLogFavorite(meal)}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.favoriteName}>{meal.name}</Text>
                                            <Text style={styles.favoriteMacros}>
                                                {t('action.favorites.macros', {
                                                    calories: meal.macros.calories,
                                                    protein: meal.macros.protein,
                                                })}
                                            </Text>
                                        </View>
                                        <View style={[styles.favoriteGrade, {
                                            backgroundColor:
                                                meal.healthGrade === 'A' ? '#22c55e' :
                                                    meal.healthGrade === 'B' ? '#84cc16' :
                                                        meal.healthGrade === 'C' ? '#eab308' : '#f97316'
                                        }]}>
                                            <Text style={styles.favoriteGradeText}>{meal.healthGrade}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                            <TouchableOpacity onPress={() => setMode('log_food_select')}>
                                <Text style={styles.cancelText}>{t('back')}</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {/* Log Food Text */}
                    {mode === 'log_food_text' && (
                        <>
                            <Text style={styles.modalTitle}>{t('what_did_eat')}</Text>

                            <TextInput
                                style={styles.textArea}
                                value={foodDescription}
                                onChangeText={setFoodDescription}
                                placeholder={t('action.log_food_text.placeholder')}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                multiline
                                numberOfLines={2}
                            />

                            <TextInput
                                style={styles.input}
                                value={foodQuantity}
                                onChangeText={setFoodQuantity}
                                placeholder={t('action.log_food_text.quantity_placeholder')}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />

                            <TouchableOpacity
                                style={[styles.primaryBtn, !foodDescription && styles.disabledBtn]}
                                onPress={submitFoodText}
                                disabled={!foodDescription || isAnalyzingFood}
                            >
                                {isAnalyzingFood ? (
                                    <ActivityIndicator color="#ffffff" />
                                ) : (
                                    <Text style={styles.primaryBtnText}>{t('log_meal')}</Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => setMode('log_food_select')}>
                                <Text style={styles.cancelText}>{t('cancel')}</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {/* Log Activity */}
                    {mode === 'log_activity_input' && (
                        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            <Text style={styles.modalTitle}>{t('action.log_activity.title')}</Text>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>{t('action.log_activity.name_label')}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={activityName}
                                    onChangeText={setActivityName}
                                    placeholder={t('action.log_activity.name_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>{t('action.log_activity.duration_label')}</Text>
                                <View style={styles.durationRow}>
                                    <TouchableOpacity
                                        style={styles.durationBtn}
                                        onPress={() => setActivityDuration(Math.max(10, activityDuration - 10))}
                                    >
                                        <Text style={styles.durationBtnText}>-</Text>
                                    </TouchableOpacity>
                                    <TextInput
                                        style={styles.durationInput}
                                        value={activityDuration.toString()}
                                        onChangeText={(v) => setActivityDuration(parseInt(v) || 0)}
                                        keyboardType="numeric"
                                    />
                                    <TouchableOpacity
                                        style={styles.durationBtn}
                                        onPress={() => setActivityDuration(activityDuration + 10)}
                                    >
                                        <Text style={styles.durationBtnText}>+</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>{t('action.log_activity.intensity_label')}</Text>
                                <View style={styles.intensityRow}>
                                    {(['low', 'moderate', 'high'] as const).map(level => (
                                        <TouchableOpacity
                                            key={level}
                                            style={[
                                                styles.intensityBtn,
                                                activityIntensity === level && styles.intensityBtnActive
                                            ]}
                                            onPress={() => setActivityIntensity(level)}
                                        >
                                            <Text style={[
                                                styles.intensityBtnText,
                                                activityIntensity === level && styles.intensityBtnTextActive
                                            ]}>
                                                {intensityLabels[level]}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <TouchableOpacity style={styles.primaryBtn} onPress={submitActivity}>
                                <Text style={styles.primaryBtnText}>{t('action.log_activity.save')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={onClose}>
                                <Text style={styles.cancelText}>{t('cancel')}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    )}

                    {/* Log Water */}
                    {mode === 'log_water_input' && (
                        <>
                            <Text style={styles.modalTitle}>{t('action.log_water.title')}</Text>

                            <View style={styles.waterGrid}>
                                {[250, 500].map(amount => (
                                    <TouchableOpacity
                                        key={amount}
                                        style={[
                                            styles.waterBtn,
                                            waterAmount === amount && styles.waterBtnActive
                                        ]}
                                        onPress={() => setWaterAmount(amount)}
                                    >
                                        <Text style={styles.waterBtnText}>{t('action.log_water.amount', { amount, unit: t('units.ml') })}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.inputLabel}>{t('action.log_water.custom_label')}</Text>
                            <TextInput
                                style={styles.input}
                                value={waterAmount.toString()}
                                onChangeText={(v) => setWaterAmount(parseInt(v) || 0)}
                                keyboardType="numeric"
                            />

                            <TouchableOpacity
                                style={[styles.primaryBtn, { backgroundColor: '#0ea5e9' }]}
                                onPress={submitWater}
                            >
                                <Text style={styles.primaryBtnText}>
                                    {t('action.log_water.submit', { amount: waterAmount, unit: t('units.ml') })}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={onClose}>
                                <Text style={styles.cancelText}>{t('cancel')}</Text>
                            </TouchableOpacity>
                        </>
                    )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: '#0b1220',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalScroll: {
        width: '100%',
    },
    modalScrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modal: {
        backgroundColor: '#0f172a',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        maxHeight: '90%',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    reminderBadge: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    pulsingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#06b6d4',
        marginRight: 6,
    },
    reminderText: {
        color: '#06b6d4',
        fontSize: 11,
        fontWeight: '700',
    },
    iconLarge: {
        fontSize: 36,
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    modalIcon: {
        fontSize: 48,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 24,
    },
    buttonGroup: {
        gap: 12,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    primaryBtn: {
        backgroundColor: '#06b6d4',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 12,
    },
    primaryBtnText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    outlineBtn: {
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 12,
    },
    outlineBtnText: {
        color: '#ffffff',
        fontSize: 14,
    },
    halfBtn: {
        flex: 1,
    },
    ghostBtn: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 12,
    },
    ghostBtnText: {
        color: '#ef4444',
        fontSize: 14,
    },
    disabledBtn: {
        opacity: 0.5,
    },
    cancelText: {
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        paddingVertical: 12,
    },
    skipText: {
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        paddingVertical: 12,
    },
    snoozeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
    },
    snoozeBtn: {
        width: '47%',
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
    },
    snoozeBtnText: {
        color: '#ffffff',
        fontWeight: '600',
        fontSize: 16,
    },
    forkOptions: {
        gap: 12,
        marginBottom: 16,
    },
    forkBtn: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    forkIcon: {
        fontSize: 28,
        marginBottom: 8,
    },
    forkTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
    forkDesc: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 12,
        marginTop: 4,
    },
    logOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
    },
    logOptionBtn: {
        flexGrow: 1,
        flexBasis: '48%',
        minWidth: 140,
        padding: 20,
        borderRadius: 16,
        alignItems: 'center',
    },
    logOptionIcon: {
        fontSize: 32,
        marginBottom: 8,
    },
    logOptionText: {
        color: '#ffffff',
        fontWeight: '600',
    },
    textArea: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 14,
        color: '#ffffff',
        fontSize: 16,
        marginBottom: 12,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    input: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 14,
        color: '#ffffff',
        fontSize: 16,
        marginBottom: 12,
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputLabel: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 8,
    },
    durationRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    durationBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    durationBtnText: {
        color: '#ffffff',
        fontSize: 20,
        fontWeight: '600',
    },
    durationInput: {
        flex: 1,
        marginHorizontal: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 12,
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
    },
    intensityRow: {
        flexDirection: 'row',
        gap: 8,
    },
    intensityBtn: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
    },
    intensityBtnActive: {
        backgroundColor: '#06b6d4',
    },
    intensityBtnText: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontWeight: '500',
    },
    intensityBtnTextActive: {
        color: '#ffffff',
        fontWeight: '700',
    },
    waterGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    waterBtn: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
    },
    waterBtnActive: {
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.2)',
    },
    waterBtnText: {
        color: '#ffffff',
        fontWeight: '600',
    },
    weightInput: {
        backgroundColor: 'transparent',
        borderBottomWidth: 2,
        borderBottomColor: 'rgba(255, 255, 255, 0.3)',
        fontSize: 48,
        fontWeight: '700',
        color: '#ffffff',
        textAlign: 'center',
        paddingVertical: 12,
        marginBottom: 24,
    },
    // Favorites styles
    favoriteItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
    },
    favoriteName: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    favoriteMacros: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 13,
        marginTop: 2,
    },
    favoriteGrade: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    favoriteGradeText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '700',
    },
});

export default ActionModal;
