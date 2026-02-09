// Action Screen - Full screen version of ActionModal for overlay deep links
// This replaces the modal approach with a dedicated screen that can be deep-linked from native overlay
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    SafeAreaView, ActivityIndicator, ScrollView, Vibration, Alert,
    Platform, NativeModules, KeyboardAvoidingView
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
    ActivityLogEntry, AppContext, DailyPlan, FoodAnalysisResult,
    FoodLogEntry, MoodLog, PlanItem, SavedMeal, UserProfile, WeightLogEntry
} from '../types';
import { analyzeTextFood } from '../services/geminiService';
import { llmQueueService } from '../services/llmQueueService';
import storage, { addWaterForDate } from '../services/storageService';
import userProfileService from '../services/userProfileService';
import { refreshTargetsForProfile } from '../services/targetService';
import {
    completeItemWithSync,
    skipItemWithSync,
    snoozeItemWithSync,
} from '../services/actionSyncService';
import { useLanguage } from '../contexts/LanguageContext';
import { getLocalDateKey } from '../utils/dateUtils';
import { planRefinementService } from '../services/planRefinementService';
import { notifyFoodLogged } from '../services/planEventService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ActionRouteProp = RouteProp<RootStackParamList, 'Action'>;

type ScreenMode = 'main' | 'snooze_select' | 'log_food_select' | 'log_food_text'
    | 'log_water_input' | 'log_activity_input' | 'unplanned_fork' | 'favorites' | 'weight_check';

/**
 * ActionScreen - Handles plan item actions from overlay deep links
 * 
 * Deep link format: bodymode://action?id=xxx&type=xxx&planDate=xxx&planItemId=xxx
 */
const ActionScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<ActionRouteProp>();
    const { language, t } = useLanguage();
    const waterUnit = t('units.ml');

    // Route params from deep link
    const { id, type, planDate, planItemId, initialMode } = route.params || {};
    const effectivePlanItemId = planItemId || id;

    // Core state
    const [mode, setMode] = useState<ScreenMode>(initialMode || 'main');
    const [mountTime] = useState(Date.now());
    const [item, setItem] = useState<PlanItem | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // Weight state
    const [currentWeight, setCurrentWeight] = useState('');

    // Food text state
    const [foodDescription, setFoodDescription] = useState('');
    const [foodQuantity, setFoodQuantity] = useState('');
    const [isAnalyzingFood, setIsAnalyzingFood] = useState(false);

    // Activity state
    const [activityName, setActivityName] = useState('');
    const [activityDuration, setActivityDuration] = useState(30);
    const [activityIntensity, setActivityIntensity] = useState<'low' | 'moderate' | 'high'>('moderate');

    // Water state
    const [waterAmount, setWaterAmount] = useState(250);

    // Favorites state
    const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);

    // Load data on mount
    useFocusEffect(
        useCallback(() => {
            const loadData = async () => {
                setLoading(true);
                try {
                    // Load user profile
                    const user = await storage.get<UserProfile>(storage.keys.USER);
                    setUserProfile(user);
                    if (user?.weight) setCurrentWeight(user.weight.toString());

                    // Load plan item if we have planItemId and planDate
                    if (effectivePlanItemId && planDate) {
                        const planKey = `${storage.keys.DAILY_PLAN}_${planDate}`;
                        let plan = await storage.get<DailyPlan>(planKey);
                        if (!plan) {
                            const legacyPlan = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
                            const legacyDate = (legacyPlan as any)?.date;
                            if (legacyPlan && (!legacyDate || legacyDate === planDate)) {
                                plan = legacyPlan;
                                await storage.set(planKey, legacyPlan);
                            }
                        }
                        const foundItem = plan?.items.find(i => i.id === effectivePlanItemId);
                        if (foundItem) {
                            setItem(foundItem);
                            setActivityName(foundItem.title || t('action.activity.default'));
                        }
                    }

                    // Load saved meals for favorites
                    const meals = await storage.get<SavedMeal[]>(storage.keys.SAVED_MEALS);
                    if (meals) setSavedMeals(meals);

                    // Set initial mode based on type
                    if (!initialMode) {
                        if (type === 'weight_check') {
                            setMode('weight_check');
                        } else if (type === 'unplanned_activity') {
                            setMode('unplanned_fork');
                        } else if (type === 'log_water' || type === 'hydration') {
                            setMode('log_water_input');
                        } else {
                            setMode('main');
                        }
                    }

                    Vibration.vibrate(50);
                } catch (error) {
                    console.error('Failed to load action data:', error);
                } finally {
                    setLoading(false);
                }
            };
            loadData();
        }, [effectivePlanItemId, planDate, type, initialMode])
    );

    const getReactionTime = () => Math.round((Date.now() - mountTime) / 1000);

    const goBack = () => {
        if (navigation.canGoBack()) {
            navigation.goBack();
        } else {
            navigation.navigate('MainTabs');
        }
    };

    // ============ ACTION HANDLERS ============

    const handleComplete = async (options?: { skipSmartLogging?: boolean }) => {
        if (!effectivePlanItemId || !planDate) {
            goBack();
            return;
        }

        try {
            await completeItemWithSync(planDate, effectivePlanItemId, options);
        } catch (error) {
            console.error('Failed to mark complete:', error);
        }
        goBack();
    };

    const handleSnooze = async (minutes: number) => {
        if (!effectivePlanItemId || !planDate) {
            goBack();
            return;
        }

        try {
            const success = await snoozeItemWithSync(planDate, effectivePlanItemId, minutes);
            if (success && Platform.OS === 'android') {
                const { ReconcileBridge } = NativeModules;
                ReconcileBridge?.triggerReconcile?.();
            }
        } catch (error) {
            console.error('Failed to snooze:', error);
        }
        goBack();
    };

    const handleSkip = async () => {
        if (!effectivePlanItemId || !planDate) {
            goBack();
            return;
        }

        try {
            await skipItemWithSync(planDate, effectivePlanItemId);
        } catch (error) {
            console.error('Failed to skip:', error);
        }
        goBack();
    };

    const handleMainAction = () => {
        if (item?.linkedAction === 'log_food' || item?.type === 'meal') {
            setMode('log_food_select');
        } else if (item?.linkedAction === 'log_water' || item?.type === 'hydration') {
            setMode('log_water_input');
        } else {
            handleComplete();
        }
    };

    const handleModifyAction = () => {
        if (item?.type === 'meal') {
            setMode('log_food_select');
        } else if (item?.type === 'workout') {
            setMode('log_activity_input');
        }
    };

    // ============ FOOD LOGGING ============

    const submitFoodText = async () => {
        if (!foodDescription || !userProfile) return;
        setIsAnalyzingFood(true);
        try {
            const quantityText = t('action.log_food_text.quantity_prefix', { quantity: foodQuantity });
            const fullText = foodQuantity ? `${foodDescription}, ${quantityText}` : foodDescription;

            // Use queue for rate limit protection
            const result = await llmQueueService.addJobAndWait<FoodAnalysisResult>('ANALYZE_TEXT_FOOD', {
                text: fullText,
                language,
            }, 'high');

            await logFoodEntry(result, 'action_text');
            await handleComplete({ skipSmartLogging: true });
        } catch (e) {
            console.error(e);
            Alert.alert(t('alert.error'), t('action.error.analyze_food'));
            setIsAnalyzingFood(false);
        }
    };

    const logFoodEntry = async (food: FoodAnalysisResult, source: string = 'action') => {
        const existing = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
        const entry: FoodLogEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            source,
            food,
        };
        await storage.set(storage.keys.FOOD, [...existing, entry]);
        await notifyFoodLogged(entry);

        // Record deviation for LLM plan refinement
        if (item) {
            // Estimate original calories from plan item (from description or default)
            const originalCals = item.description?.match(/(\d+)\s*cal/i)?.[1]
                ? parseInt(item.description.match(/(\d+)\s*cal/i)![1])
                : 500;
            const originalProtein = item.description?.match(/(\d+)\s*g?\s*protein/i)?.[1]
                ? parseInt(item.description.match(/(\d+)\s*g?\s*protein/i)![1])
                : 30;

            const actualCals = food.macros?.calories || 0;
            const actualProtein = food.macros?.protein || 0;

            await planRefinementService.recordDeviation({
                originalItem: item,
                actualMeal: {
                name: food.foodName || t('action.food.unknown'),
                calories: actualCals,
                protein: actualProtein,
            },
                caloriesDiff: actualCals - originalCals,
                proteinDiff: actualProtein - originalProtein,
            });
        }
    };

    const handleLogFavorite = async (meal: SavedMeal) => {
        const foodResult: FoodAnalysisResult = {
            foodName: meal.name,
            description: t('action.favorite.description', { meal: meal.name }),
            ingredients: [],
            macros: meal.macros,
            healthGrade: meal.healthGrade,
            confidence: t('food_analyzer.confidence_level.high'),
            advice: t('action.favorite.advice')
        };
        await logFoodEntry(foodResult, 'favorite');
        await handleComplete({ skipSmartLogging: true });
    };

    const navigateToCamera = () => {
        if (effectivePlanItemId && planDate) {
            navigation.navigate('FoodAnalyzer', {
                replacePlanItemId: effectivePlanItemId,
                replacePlanDateKey: planDate,
                sourceMealTitle: item?.title,
            });
            return;
        }
        navigation.navigate('FoodAnalyzer');
    };

    // ============ ACTIVITY LOGGING ============

    const submitActivity = async () => {
        const met = activityIntensity === 'low' ? 3 : activityIntensity === 'moderate' ? 6 : 9;
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

        const existing = await storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY) || [];
        await storage.set(storage.keys.ACTIVITY, [...existing, entry]);

        // Record deviation for LLM plan refinement
        if (item) {
            await planRefinementService.recordDeviation({
                originalItem: item,
                actualActivity: {
                    name: activityName || t('action.activity.default'),
                duration: activityDuration,
                calories,
            },
            activityTypeDiff: item.title !== activityName
                    ? t('action.activity.diff', { actual: activityName, planned: item.title })
                    : undefined,
            });
        }

        await handleComplete({ skipSmartLogging: true });
    };

    // ============ WATER LOGGING ============

    const submitWater = async () => {
        const todayKey = getLocalDateKey(new Date());
        await addWaterForDate(todayKey, waterAmount);
        await handleComplete({ skipSmartLogging: true });
    };

    // ============ WEIGHT CHECK ============

    const handleWeightUpdate = async () => {
        const weight = parseFloat(currentWeight);
        if (isNaN(weight)) return;

        // Update weight log
        const existing = await storage.get<WeightLogEntry[]>(storage.keys.WEIGHT) || [];
        const entry: WeightLogEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            weight,
        };
        const updatedHistory = [...existing, entry];
        await storage.set(storage.keys.WEIGHT, updatedHistory);

        // Update user profile
        if (userProfile) {
            const baseProfile = { ...userProfile, weight, lastWeightCheck: Date.now() } as UserProfile;
            const { profile: refreshedProfile } = refreshTargetsForProfile(baseProfile, {
                dateKey: getLocalDateKey(new Date()),
                weightHistory: updatedHistory,
                force: true,
            });
            await userProfileService.saveUserProfile(refreshedProfile, { source: 'weight_check' });
        }
        goBack();
    };

    // ============ RENDER ============

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#06b6d4" />
                </View>
            </SafeAreaView>
        );
    }

    const getTypeIconName = () => {
        switch (item?.type || type) {
            case 'meal': return 'restaurant';
            case 'workout': return 'fitness';
            case 'hydration': return 'water';
            case 'sleep': return 'moon';
            case 'weight_check': return 'scale';
            default: return 'alarm';
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
            >
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {/* Weight Check Mode */}
                {mode === 'weight_check' && (
                    <View style={styles.centeredView}>
                        <View style={styles.iconContainer}>
                            <Ionicons name="scale" size={64} color="#ffffff" style={styles.bigIcon} />
                        </View>
                        <Text style={styles.title}>{t('action.weight.title')}</Text>
                        <Text style={styles.subtitle}>{t('action.weight.subtitle')}</Text>

                        <TextInput
                            style={styles.weightInput}
                            value={currentWeight}
                            onChangeText={setCurrentWeight}
                            keyboardType="numeric"
                            placeholder={t('action.weight.placeholder')}
                            placeholderTextColor="rgba(255,255,255,0.3)"
                            autoFocus
                        />

                        <TouchableOpacity style={styles.primaryBtn} onPress={handleWeightUpdate}>
                            <Text style={styles.primaryBtnText}>{t('action.weight.update')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={goBack}>
                            <Text style={styles.skipText}>{t('action.weight.skip')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Main Mode */}
                {mode === 'main' && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View style={styles.reminderBadge}>
                                <View style={styles.pulsingDot} />
                                <Text style={styles.reminderText}>{t('action.reminder.badge')}</Text>
                            </View>
                            <Ionicons name={getTypeIconName()} size={36} color="#e2e8f0" style={styles.iconLarge} />
                        </View>

                        <Text style={styles.title}>{item?.title || t('action.default.title')}</Text>
                        <Text style={styles.subtitle}>{item?.description || t('action.default.subtitle')}</Text>

                        <View style={styles.buttonGroup}>
                            <TouchableOpacity
                                style={[styles.primaryBtn, { backgroundColor: '#22c55e' }]}
                                onPress={handleMainAction}
                            >
                                <View style={styles.buttonContent}>
                                    <Ionicons name="checkmark" size={18} color="#ffffff" />
                                    <Text style={styles.primaryBtnText}>{t('action.confirm_done')}</Text>
                                </View>
                            </TouchableOpacity>

                            {(item?.type === 'meal' || item?.type === 'workout') && (
                                <TouchableOpacity style={styles.outlineBtn} onPress={handleModifyAction}>
                                    <Text style={styles.outlineBtnText}>
                                        {item.type === 'meal' ? t('action.modify.meal') : t('action.modify.workout')}
                                    </Text>
                                </TouchableOpacity>
                            )}

                            <View style={styles.buttonRow}>
                                <TouchableOpacity
                                    style={[styles.halfBtn, styles.outlineBtn]}
                                    onPress={() => setMode('snooze_select')}
                                >
                                    <View style={styles.buttonContent}>
                                        <Ionicons name="alarm" size={16} color="#ffffff" />
                                        <Text style={styles.outlineBtnText}>{t('action.snooze')}</Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.halfBtn, styles.ghostBtn]}
                                    onPress={handleSkip}
                                >
                                    <Text style={styles.ghostBtnText}>{t('action.skip')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

                {/* Snooze Select */}
                {mode === 'snooze_select' && (
                    <View style={styles.card}>
                        <Text style={styles.title}>{t('action.snooze.title')}</Text>
                        <View style={styles.snoozeGrid}>
                            {[15, 30, 45, 60].map(mins => (
                                <TouchableOpacity
                                    key={mins}
                                    style={styles.snoozeBtn}
                                    onPress={() => handleSnooze(mins)}
                                >
                                    <Text style={styles.snoozeBtnText}>{t('action.snooze.minutes', { minutes: mins })}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity onPress={() => setMode('main')}>
                            <Text style={styles.cancelText}>{t('cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Unplanned Fork */}
                {mode === 'unplanned_fork' && (
                    <View style={styles.card}>
                        <Text style={styles.title}>{t('action.unplanned.title')}</Text>
                        <Text style={styles.subtitle}>{t('action.unplanned.subtitle')}</Text>

                        <View style={styles.forkOptions}>
                            <TouchableOpacity
                                style={[styles.forkBtn, { backgroundColor: 'rgba(249, 115, 22, 0.2)', borderColor: '#f97316' }]}
                                onPress={() => setMode('log_food_select')}
                            >
                                <Ionicons name="fast-food" size={28} color="#ffffff" style={styles.forkIcon} />
                                <Text style={styles.forkTitle}>{t('action.unplanned.food.title')}</Text>
                                <Text style={styles.forkDesc}>{t('action.unplanned.food.desc')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.forkBtn, { backgroundColor: 'rgba(6, 182, 212, 0.2)', borderColor: '#06b6d4' }]}
                                onPress={() => setMode('log_activity_input')}
                            >
                                <Ionicons name="fitness" size={28} color="#ffffff" style={styles.forkIcon} />
                                <Text style={styles.forkTitle}>{t('action.unplanned.move.title')}</Text>
                                <Text style={styles.forkDesc}>{t('action.unplanned.move.desc')}</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity onPress={goBack}>
                            <Text style={styles.cancelText}>{t('cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Log Food Select */}
                {mode === 'log_food_select' && (
                    <View style={styles.card}>
                        <Text style={styles.title}>{t('action.log_food.title')}</Text>

                        <View style={styles.logOptions}>
                            <TouchableOpacity
                                style={[styles.logOptionBtn, { backgroundColor: 'rgba(6, 182, 212, 0.2)' }]}
                                onPress={navigateToCamera}
                            >
                                <Ionicons name="camera" size={32} color="#ffffff" style={styles.logOptionIcon} />
                                <Text style={styles.logOptionText}>{t('action.log_food.camera')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.logOptionBtn, { backgroundColor: 'rgba(34, 197, 94, 0.2)' }]}
                                onPress={() => setMode('log_food_text')}
                            >
                                <Ionicons name="create" size={32} color="#ffffff" style={styles.logOptionIcon} />
                                <Text style={styles.logOptionText}>{t('action.log_food.describe')}</Text>
                            </TouchableOpacity>

                            {savedMeals.length > 0 && (
                                <TouchableOpacity
                                    style={[styles.logOptionBtn, { backgroundColor: 'rgba(234, 179, 8, 0.2)' }]}
                                    onPress={() => setMode('favorites')}
                                >
                                    <Ionicons name="star" size={32} color="#ffffff" style={styles.logOptionIcon} />
                                    <Text style={styles.logOptionText}>{t('action.log_food.favorites')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <TouchableOpacity onPress={() => setMode('main')}>
                            <Text style={styles.cancelText}>{t('cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Favorites Mode */}
                {mode === 'favorites' && (
                    <View style={styles.card}>
                        <View style={styles.titleRow}>
                        <Ionicons name="star" size={20} color="#fbbf24" />
                        <Text style={styles.title}>{t('action.favorites.title')}</Text>
                    </View>
                        <ScrollView style={{ maxHeight: 400 }}>
                            {savedMeals.map((meal) => (
                                <TouchableOpacity
                                    key={meal.id}
                                    style={styles.favoriteItem}
                                    onPress={() => handleLogFavorite(meal)}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.favoriteName}>{meal.name}</Text>
                                        <Text style={styles.favoriteMacros}>{t('action.favorites.macros', { calories: meal.macros.calories, protein: meal.macros.protein })}</Text>
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
                    </View>
                )}

                {/* Log Food Text */}
                {mode === 'log_food_text' && (
                    <View style={styles.card}>
                        <Text style={styles.title}>{t('action.log_food_text.title')}</Text>

                        <TextInput
                            style={styles.textArea}
                            value={foodDescription}
                            onChangeText={setFoodDescription}
                            placeholder={t('action.log_food_text.placeholder')}
                            placeholderTextColor="rgba(255,255,255,0.3)"
                            multiline
                            numberOfLines={2}
                            autoFocus
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
                                <Text style={styles.primaryBtnText}>{t('action.log_food_text.submit')}</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setMode('log_food_select')}>
                            <Text style={styles.cancelText}>{t('cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Log Activity */}
                {mode === 'log_activity_input' && (
                    <View style={styles.card}>
                        <Text style={styles.title}>{t('action.log_activity.title')}</Text>

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
                                            {t(`action.log_activity.intensity.${level}`)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <TouchableOpacity style={styles.primaryBtn} onPress={submitActivity}>
                            <Text style={styles.primaryBtnText}>{t('action.log_activity.save')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={goBack}>
                            <Text style={styles.cancelText}>{t('cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Log Water */}
                {mode === 'log_water_input' && (
                    <View style={styles.card}>
                        <Text style={styles.title}>{t('action.log_water.title')}</Text>

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
                                <Text style={styles.waterBtnText}>{t('action.log_water.amount', { amount, unit: waterUnit })}</Text>
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
                            <Text style={styles.primaryBtnText}>{t('action.log_water.submit', { amount: waterAmount, unit: waterUnit })}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={goBack}>
                            <Text style={styles.cancelText}>{t('cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    keyboardView: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
        paddingBottom: 80,
    },
    centeredView: {
        alignItems: 'center',
    },
    card: {
        backgroundColor: '#0f172a',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    cardHeader: {
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
    iconContainer: {
        marginBottom: 16,
    },
    bigIcon: {
        marginBottom: 0,
    },
    iconLarge: {
        marginBottom: 0,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 24,
        textAlign: 'center',
    },
    buttonGroup: {
        gap: 12,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
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
        width: 200,
    },
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

export default ActionScreen;
