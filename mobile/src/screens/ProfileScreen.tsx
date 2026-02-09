// Full Profile Screen with Mood Tracking, Weight Charts, and Profile Editing
import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    ScrollView, SafeAreaView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
    UserProfile,
    MoodLog,
    MoodType,
    WeightLogEntry,
    DietaryRestriction,
    FitnessActivity,
    EquipmentAccess,
    ExperienceLevel,
    SleepIssue,
    MealPattern,
    LifestyleHabits,
} from '../types';
import { calculateUserProfile } from '../services/geminiService';
import { llmQueueService } from '../services/llmQueueService';
import storage from '../services/storageService';
import userProfileService from '../services/userProfileService';
import { refreshTargetsForProfile } from '../services/targetService';
import { useLanguage } from '../contexts/LanguageContext';
import AvatarPicker from '../components/AvatarPicker';
import { validateProfileUpdate } from '../utils/validation';
import { getLocalDateKey } from '../utils/dateUtils';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Profile'>;

const MOODS: { type: MoodType; labelKey: string; icon: string; score: number; color: string }[] = [
    { type: 'energetic', labelKey: 'profile.mood.energetic', icon: '⚡', score: 5, color: '#eab308' },
    { type: 'happy', labelKey: 'profile.mood.happy', icon: '😄', score: 4, color: '#22c55e' },
    { type: 'neutral', labelKey: 'profile.mood.neutral', icon: '😐', score: 3, color: '#64748b' },
    { type: 'stressed', labelKey: 'profile.mood.stressed', icon: '😓', score: 2, color: '#f97316' },
    { type: 'sad', labelKey: 'profile.mood.sad', icon: '😔', score: 1, color: '#6366f1' },
];

const DIETARY_OPTIONS: Array<{ value: DietaryRestriction; labelKey: string }> = [
    { value: 'vegetarian', labelKey: 'onboarding.diet.restriction_vegetarian' },
    { value: 'vegan', labelKey: 'onboarding.diet.restriction_vegan' },
    { value: 'pescatarian', labelKey: 'onboarding.diet.restriction_pescatarian' },
    { value: 'keto', labelKey: 'onboarding.diet.restriction_keto' },
    { value: 'paleo', labelKey: 'onboarding.diet.restriction_paleo' },
    { value: 'gluten_free', labelKey: 'onboarding.diet.restriction_gluten_free' },
    { value: 'dairy_free', labelKey: 'onboarding.diet.restriction_dairy_free' },
    { value: 'halal', labelKey: 'onboarding.diet.restriction_halal' },
    { value: 'kosher', labelKey: 'onboarding.diet.restriction_kosher' },
    { value: 'none', labelKey: 'onboarding.diet.restriction_none' },
];

const FITNESS_ACTIVITY_OPTIONS: Array<{ value: FitnessActivity; labelKey: string }> = [
    { value: 'walking', labelKey: 'onboarding.fitness.activity_walking' },
    { value: 'running', labelKey: 'onboarding.fitness.activity_running' },
    { value: 'weights', labelKey: 'onboarding.fitness.activity_weights' },
    { value: 'yoga', labelKey: 'onboarding.fitness.activity_yoga' },
    { value: 'swimming', labelKey: 'onboarding.fitness.activity_swimming' },
    { value: 'cycling', labelKey: 'onboarding.fitness.activity_cycling' },
    { value: 'hiit', labelKey: 'onboarding.fitness.activity_hiit' },
    { value: 'sports', labelKey: 'onboarding.fitness.activity_sports' },
    { value: 'dancing', labelKey: 'onboarding.fitness.activity_dancing' },
    { value: 'martial_arts', labelKey: 'onboarding.fitness.activity_martial_arts' },
];

const SLEEP_ISSUE_OPTIONS: Array<{ value: SleepIssue; labelKey: string }> = [
    { value: 'insomnia', labelKey: 'onboarding.sleep.issue_insomnia' },
    { value: 'apnea', labelKey: 'onboarding.sleep.issue_apnea' },
    { value: 'restless', labelKey: 'onboarding.sleep.issue_restless' },
    { value: 'snoring', labelKey: 'onboarding.sleep.issue_snoring' },
    { value: 'none', labelKey: 'onboarding.sleep.issue_none' },
];

const ProfileScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const { t } = useLanguage();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
    const [weightLogs, setWeightLogs] = useState<WeightLogEntry[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [todayMoodLogged, setTodayMoodLogged] = useState(false);
    const [showWeightInput, setShowWeightInput] = useState(false);
    const [newWeight, setNewWeight] = useState('');
    const [useMetric, setUseMetric] = useState(true);

    const weightUnit = t(useMetric ? 'units.kg' : 'units.lbs');

    // Edit form
    const [formData, setFormData] = useState<Partial<UserProfile>>({});
    const [hasChronicConditions, setHasChronicConditions] = useState(false);
    const [hasMedications, setHasMedications] = useState(false);
    const [hasInjuries, setHasInjuries] = useState(false);
    const [conditionsCsv, setConditionsCsv] = useState('');
    const [medicationsCsv, setMedicationsCsv] = useState('');
    const [injuriesCsv, setInjuriesCsv] = useState('');
    const [allergiesCsv, setAllergiesCsv] = useState('');
    const [dislikesCsv, setDislikesCsv] = useState('');
    const [mealTimesCsv, setMealTimesCsv] = useState('');
    const [typicalMealsCsv, setTypicalMealsCsv] = useState('');
    const [otherHabitsCsv, setOtherHabitsCsv] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        const unsubscribe = storage.subscribe((key, value, action) => {
            if (action !== 'set') return;
            if (key !== storage.keys.APP_PREFERENCES) return;
            const prefs = value as any;
            if (prefs?.useMetric !== undefined) {
                setUseMetric(!!prefs.useMetric);
            }
        });

        return unsubscribe;
    }, []);

    const loadData = async () => {
        const savedUser = await storage.get<UserProfile>(storage.keys.USER);
        const savedMoods = await storage.get<MoodLog[]>(storage.keys.MOOD) || [];
        const savedWeights = await storage.get<WeightLogEntry[]>(storage.keys.WEIGHT) || [];
        const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);

        if (prefs?.useMetric !== undefined) {
            setUseMetric(prefs.useMetric);
        }

        if (savedUser) {
            const { profile: refreshedProfile, updated } = refreshTargetsForProfile(savedUser, {
                dateKey: getLocalDateKey(new Date()),
                weightHistory: savedWeights,
            });
            if (updated) {
                await userProfileService.saveUserProfile(refreshedProfile, { source: 'profile_target_refresh' });
            }
            setUser(refreshedProfile);
            setFormData(refreshedProfile);
        }
        setMoodLogs(savedMoods);
        setWeightLogs(savedWeights);

        // Check if mood logged today
        const today = new Date().toDateString();
        const hasLog = savedMoods.some(l => new Date(l.timestamp).toDateString() === today);
        setTodayMoodLogged(hasLog);
    };

    // Helper for display
    const formatWeightValue = (kg: number) => {
        if (useMetric) return kg.toString();
        return (kg * 2.20462).toFixed(1);
    };

    const formatWeightDelta = (kgDelta: number) => {
        const delta = useMetric ? kgDelta : kgDelta * 2.20462;
        return delta.toFixed(1);
    };

    const formatWeight = (kg: number) => {
        if (useMetric) {
            return t('profile.weight_metric', { kg: formatWeightValue(kg), unit: t('units.kg') });
        }
        return t('profile.weight_imperial', { lbs: formatWeightValue(kg), unit: t('units.lbs') });
    };

    const formatHeight = (cm: number) => {
        if (useMetric) return t('profile.height_metric', { cm, unit: t('units.cm') });
        const totalInches = cm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        return t('profile.height_imperial', {
            feet,
            inches,
            ft: t('units.ft_short'),
            inch: t('units.in_short'),
        });
    };

    const handleMoodClick = async (mood: typeof MOODS[0]) => {
        const newLog: MoodLog = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            mood: mood.type,
            score: mood.score,
        };
        const updatedLogs = [...moodLogs, newLog];
        setMoodLogs(updatedLogs);
        setTodayMoodLogged(true);
        await storage.set(storage.keys.MOOD, updatedLogs);
    };

    const handleUpdateWeight = async () => {
        if (!newWeight || !user) return;

        let weight = parseFloat(newWeight);
        if (isNaN(weight)) {
            Alert.alert(t('alert.invalid_weight'), t('alert.enter_valid_number'));
            return;
        }

        // Convert input to kg if in imperial
        if (!useMetric) {
            weight = weight / 2.20462;
        }

        if (weight < 30 || weight > 300) {
            Alert.alert(t('alert.invalid_weight'), t('alert.enter_valid_number'));
            return;
        }

        const newEntry: WeightLogEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            weight,
        };

        const updatedLogs = [...weightLogs, newEntry];
        setWeightLogs(updatedLogs);
        await storage.set(storage.keys.WEIGHT, updatedLogs);

        // Update user weight
        const updatedUser = { ...user, weight } as UserProfile;
        const { profile: refreshedProfile } = refreshTargetsForProfile(updatedUser, {
            dateKey: getLocalDateKey(new Date()),
            weightHistory: updatedLogs,
            force: true,
        });
        setUser(refreshedProfile);
        await userProfileService.saveUserProfile(refreshedProfile, { source: 'profile_weight' });

        setShowWeightInput(false);
        setNewWeight('');
    };

    const handleSaveProfile = async () => {
        if (!formData.name || !user) return;

        const validation = validateProfileUpdate(formData as Record<string, any>);
        if (!validation.isValid) {
            const firstError = validation.errors[0];
            Alert.alert(t('alert.error'), t(firstError.messageKey));
            return;
        }

        setIsRecalculating(true);
        try {
            // Recalculate with AI via queue (rate limit protected)
            const calculated = await llmQueueService.addJobAndWait<Partial<UserProfile>>('CALCULATE_PROFILE', {
                formData
            }, 'critical');
            const finalUser: UserProfile = {
                ...user,
                ...formData,
                ...calculated,
            } as UserProfile;
            const { profile: refreshedProfile } = refreshTargetsForProfile(finalUser, {
                dateKey: getLocalDateKey(new Date()),
                force: true,
            });

            setUser(refreshedProfile);
            await userProfileService.saveUserProfile(refreshedProfile, { source: 'profile_edit' });
            setIsEditing(false);
            Alert.alert(t('alert.success'), t('alert.profile_updated'));
        } catch (error) {
            console.error('Profile update failed:', error);
            // Save without AI calculation
            const finalUser = { ...user, ...formData } as UserProfile;
            const { profile: refreshedProfile } = refreshTargetsForProfile(finalUser, {
                dateKey: getLocalDateKey(new Date()),
                force: true,
            });
            setUser(refreshedProfile);
            await userProfileService.saveUserProfile(refreshedProfile, { source: 'profile_edit_fallback' });
            setIsEditing(false);
        } finally {
            setIsRecalculating(false);
        }
    };

    const startEditing = () => {
        if (!user) return;
        setFormData(user);
        setHasChronicConditions((user.medicalProfile?.conditions || []).length > 0);
        setHasMedications((user.medicalProfile?.medications || []).length > 0);
        setHasInjuries((user.medicalProfile?.injuries || []).length > 0);
        setConditionsCsv((user.medicalProfile?.conditions || []).join(', '));
        setMedicationsCsv((user.medicalProfile?.medications || []).join(', '));
        setInjuriesCsv((user.medicalProfile?.injuries || []).join(', '));
        setAllergiesCsv((user.dietaryPreferences?.allergies || []).join(', '));
        setDislikesCsv((user.dietaryPreferences?.dislikedFoods || []).join(', '));
        setMealTimesCsv((user.mealPattern?.mealTimes || []).join(', '));
        setTypicalMealsCsv((user.mealPattern?.typicalMeals || []).join(', '));
        setOtherHabitsCsv((user.habits?.otherHabits || []).join(', '));
        setIsEditing(true);
    };

    const parseCsvList = (value: string) =>
        value
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);

    const getBaseMedicalProfile = (prev: Partial<UserProfile>): UserProfile['medicalProfile'] => ({
        conditions: prev.medicalProfile?.conditions ?? user?.medicalProfile.conditions ?? [],
        medications: prev.medicalProfile?.medications ?? user?.medicalProfile.medications ?? [],
        injuries: prev.medicalProfile?.injuries ?? user?.medicalProfile.injuries ?? [],
        currentStatus: prev.medicalProfile?.currentStatus ?? user?.medicalProfile.currentStatus ?? 'healthy',
    });

    const setMedicalProfile = (update: Partial<UserProfile['medicalProfile']>) => {
        setFormData(prev => ({
            ...prev,
            medicalProfile: { ...getBaseMedicalProfile(prev), ...update },
        }));
    };

    const getDietaryPreferences = (prev: Partial<UserProfile>) => ({
        restrictions: prev.dietaryPreferences?.restrictions ?? user?.dietaryPreferences?.restrictions ?? ['none'],
        allergies: prev.dietaryPreferences?.allergies ?? user?.dietaryPreferences?.allergies ?? [],
        dislikedFoods: prev.dietaryPreferences?.dislikedFoods ?? user?.dietaryPreferences?.dislikedFoods ?? [],
    });

    const setDietaryPreferences = (update: Partial<UserProfile['dietaryPreferences']>) => {
        setFormData(prev => ({
            ...prev,
            dietaryPreferences: { ...getDietaryPreferences(prev), ...update },
        }));
    };

    const toggleDietaryRestriction = (value: DietaryRestriction) => {
        setDietaryPreferences({
            restrictions: (() => {
                const current = getDietaryPreferences(formData).restrictions;
                if (value === 'none') return ['none'];
                const next = current.filter(item => item !== 'none');
                return next.includes(value) ? next.filter(item => item !== value) : [...next, value];
            })(),
        });
    };

    const getFitnessProfile = (prev: Partial<UserProfile>) => ({
        experienceLevel: prev.fitnessProfile?.experienceLevel ?? user?.fitnessProfile?.experienceLevel ?? 'beginner',
        preferredActivities: prev.fitnessProfile?.preferredActivities ?? user?.fitnessProfile?.preferredActivities ?? [],
        equipmentAccess: prev.fitnessProfile?.equipmentAccess ?? user?.fitnessProfile?.equipmentAccess ?? 'none',
        availableMinutesPerDay: prev.fitnessProfile?.availableMinutesPerDay ?? user?.fitnessProfile?.availableMinutesPerDay,
    });

    const setFitnessProfile = (update: Partial<UserProfile['fitnessProfile']>) => {
        setFormData(prev => ({
            ...prev,
            fitnessProfile: { ...getFitnessProfile(prev), ...update },
        }));
    };

    const toggleFitnessActivity = (value: FitnessActivity) => {
        const current = getFitnessProfile(formData).preferredActivities;
        const next = current.includes(value)
            ? current.filter(item => item !== value)
            : [...current, value];
        setFitnessProfile({ preferredActivities: next });
    };

    const getSleepRoutine = (prev: Partial<UserProfile>) => ({
        isConsistent: prev.sleepRoutine?.isConsistent ?? user?.sleepRoutine?.isConsistent ?? true,
        wakeWindowMinutes: prev.sleepRoutine?.wakeWindowMinutes ?? user?.sleepRoutine?.wakeWindowMinutes ?? 30,
        targetWakeTime: prev.sleepRoutine?.targetWakeTime ?? user?.sleepRoutine?.targetWakeTime,
        targetBedTime: prev.sleepRoutine?.targetBedTime ?? user?.sleepRoutine?.targetBedTime,
        targetDurationHours: prev.sleepRoutine?.targetDurationHours ?? user?.sleepRoutine?.targetDurationHours,
        qualityRating: prev.sleepRoutine?.qualityRating ?? user?.sleepRoutine?.qualityRating,
        sleepIssues: prev.sleepRoutine?.sleepIssues ?? user?.sleepRoutine?.sleepIssues ?? ['none'],
    });

    const setSleepRoutine = (update: Partial<UserProfile['sleepRoutine']>) => {
        setFormData(prev => ({
            ...prev,
            sleepRoutine: { ...getSleepRoutine(prev), ...update },
        }));
    };

    const toggleSleepIssue = (value: SleepIssue) => {
        const current = getSleepRoutine(formData).sleepIssues || [];
        if (value === 'none') {
            setSleepRoutine({ sleepIssues: ['none'] });
            return;
        }
        const next = current.filter(item => item !== 'none');
        setSleepRoutine({
            sleepIssues: next.includes(value)
                ? next.filter(item => item !== value)
                : [...next, value],
        });
    };

    const getMealPattern = (prev: Partial<UserProfile>): MealPattern => ({
        mealsPerDay: prev.mealPattern?.mealsPerDay ?? user?.mealPattern?.mealsPerDay,
        mealTimes: prev.mealPattern?.mealTimes ?? user?.mealPattern?.mealTimes ?? [],
        typicalMeals: prev.mealPattern?.typicalMeals ?? user?.mealPattern?.typicalMeals ?? [],
        lateNightEating: prev.mealPattern?.lateNightEating ?? user?.mealPattern?.lateNightEating ?? false,
        lastUpdatedAt: prev.mealPattern?.lastUpdatedAt ?? user?.mealPattern?.lastUpdatedAt,
    });

    const setMealPattern = (update: Partial<MealPattern>) => {
        setFormData(prev => ({
            ...prev,
            mealPattern: { ...getMealPattern(prev), ...update, lastUpdatedAt: Date.now() },
        }));
    };

    const getHabits = (prev: Partial<UserProfile>): LifestyleHabits => ({
        smoking: prev.habits?.smoking ?? user?.habits?.smoking ?? 'none',
        alcohol: prev.habits?.alcohol ?? user?.habits?.alcohol ?? 'none',
        vaping: prev.habits?.vaping ?? user?.habits?.vaping ?? 'none',
        sugarCravings: prev.habits?.sugarCravings ?? user?.habits?.sugarCravings ?? 'moderate',
        caffeine: prev.habits?.caffeine ?? user?.habits?.caffeine ?? '1_2',
        otherHabits: prev.habits?.otherHabits ?? user?.habits?.otherHabits ?? [],
        lastUpdatedAt: prev.habits?.lastUpdatedAt ?? user?.habits?.lastUpdatedAt,
    });

    const setHabits = (update: Partial<LifestyleHabits>) => {
        setFormData(prev => ({
            ...prev,
            habits: { ...getHabits(prev), ...update, lastUpdatedAt: Date.now() },
        }));
    };

    const getWorkProfile = (prev: Partial<UserProfile>) => ({
        type: prev.workProfile?.type ?? user?.workProfile?.type ?? 'flexible',
        intensity: prev.workProfile?.intensity ?? user?.workProfile?.intensity ?? 'desk',
        role: prev.workProfile?.role ?? user?.workProfile?.role ?? '',
        industry: prev.workProfile?.industry ?? user?.workProfile?.industry ?? '',
        commuteType: prev.workProfile?.commuteType ?? user?.workProfile?.commuteType ?? 'none',
        hours: prev.workProfile?.hours ?? user?.workProfile?.hours,
        durationHours: prev.workProfile?.durationHours ?? user?.workProfile?.durationHours,
    });

    const setWorkProfile = (update: Partial<UserProfile['workProfile']>) => {
        setFormData(prev => ({
            ...prev,
            workProfile: { ...getWorkProfile(prev), ...update },
        }));
    };

    const setWorkHours = (update: Partial<NonNullable<UserProfile['workProfile']['hours']>>) => {
        const current = getWorkProfile(formData).hours ?? {};
        setWorkProfile({ hours: { ...current, ...update } });
    };

    // Simple chart component for React Native
    const MiniChart: React.FC<{ data: number[]; color: string; height: number }> = ({ data, color, height }) => {
        if (data.length === 0) return null;
        const max = Math.max(...data);
        const min = Math.min(...data);
        const range = max - min || 1;

        return (
            <View style={[styles.chartContainer, { height }]}>
                {data.slice(-7).map((value, idx) => (
                    <View key={idx} style={styles.chartBarContainer}>
                        <View
                            style={[
                                styles.chartBar,
                                {
                                    height: `${((value - min) / range) * 80 + 20}%`,
                                    backgroundColor: color,
                                }
                            ]}
                        />
                    </View>
                ))}
            </View>
        );
    };

    if (!user) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#06b6d4" />
                    <Text style={styles.loadingText}>{t('profile.loading')}</Text>
                </View>
            </SafeAreaView>
        );
    }

    const mealPatternSummary = (() => {
        if (!user.mealPattern) return null;
        const parts: string[] = [];
        if (user.mealPattern.mealsPerDay) {
            parts.push(t('profile.field.meals_per_day') + `: ${user.mealPattern.mealsPerDay}`);
        }
        if (user.mealPattern.mealTimes?.length) {
            parts.push(t('profile.field.meal_times') + `: ${user.mealPattern.mealTimes.join(', ')}`);
        }
        if (user.mealPattern.typicalMeals?.length) {
            parts.push(t('profile.field.typical_meals') + `: ${user.mealPattern.typicalMeals.join(', ')}`);
        }
        if (user.mealPattern.lateNightEating !== undefined) {
            parts.push(t('profile.field.late_night') + `: ${user.mealPattern.lateNightEating ? t('yes') : t('no')}`);
        }
        return parts.length ? parts.join('\n') : null;
    })();

    const habitsSummary = (() => {
        if (!user.habits) return null;
        const parts: string[] = [];
        if (user.habits.smoking) parts.push(`${t('profile.field.habits_smoking')}: ${t(`profile.habit.${user.habits.smoking}`)}`);
        if (user.habits.alcohol) parts.push(`${t('profile.field.habits_alcohol')}: ${t(`profile.habit.${user.habits.alcohol}`)}`);
        if (user.habits.vaping) parts.push(`${t('profile.field.habits_vaping')}: ${t(`profile.habit.${user.habits.vaping}`)}`);
        if (user.habits.sugarCravings) parts.push(`${t('profile.field.habits_sugar')}: ${t(`profile.habit.sugar_${user.habits.sugarCravings}`)}`);
        if (user.habits.caffeine) parts.push(`${t('profile.field.habits_caffeine')}: ${t(`profile.habit.caffeine_${user.habits.caffeine}`)}`);
        if (user.habits.otherHabits?.length) parts.push(`${t('profile.field.habits_other')}: ${user.habits.otherHabits.join(', ')}`);
        return parts.length ? parts.join('\n') : null;
    })();

    if (isEditing) {
        const dietPrefs = getDietaryPreferences(formData);
        const fitnessProfile = getFitnessProfile(formData);
        const sleepRoutine = getSleepRoutine(formData);
        const mealPattern = getMealPattern(formData);
        const habits = getHabits(formData);
        const workProfile = getWorkProfile(formData);
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setIsEditing(false)}>
                        <Text style={styles.cancelBtn}>{t('cancel')}</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('edit_profile')}</Text>
                    <TouchableOpacity onPress={handleSaveProfile} disabled={isRecalculating}>
                        <Text style={[styles.saveBtn, isRecalculating && styles.disabled]}>
                            {isRecalculating ? t('profile.saving') : t('save')}
                        </Text>
                    </TouchableOpacity>
                </View>

                <KeyboardAvoidingView
                    style={styles.keyboardView}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
                >
                <ScrollView
                    style={styles.editScroll}
                    contentContainerStyle={styles.editContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{t('profile.section.avatar')}</Text>
                        <AvatarPicker
                            value={formData.avatarId || user.avatarId}
                            onChange={(value) => setFormData({ ...formData, avatarId: value })}
                        />
                    </View>

                    {/* Basic Info */}
                    <View style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{t('profile.section.basic')}</Text>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.name')}</Text>
                            <TextInput
                                style={styles.input}
                                value={formData.name}
                                onChangeText={(v) => setFormData({ ...formData, name: v })}
                                placeholder={t('onboarding.basics.placeholder_name')}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>
                        <View style={styles.inputRow}>
                            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                                <Text style={styles.inputLabel}>{t('label_weight')}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.weight?.toString()}
                                    onChangeText={(v) => setFormData({ ...formData, weight: parseFloat(v) || 0 })}
                                    keyboardType="numeric"
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            </View>
                            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                                <Text style={styles.inputLabel}>{t('label_height')}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.height?.toString()}
                                    onChangeText={(v) => setFormData({ ...formData, height: parseFloat(v) || 0 })}
                                    keyboardType="numeric"
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            </View>
                        </View>
                    </View>

                    {/* Goals */}
                    <View style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{t('goal_title')}</Text>
                        <View style={styles.optionRow}>
                            {(['lose', 'maintain', 'gain'] as const).map((g) => (
                                <TouchableOpacity
                                    key={g}
                                    style={[styles.optionBtn, formData.goal === g && styles.optionBtnActive]}
                                    onPress={() => setFormData({ ...formData, goal: g })}
                                >
                                    <Text style={[styles.optionBtnText, formData.goal === g && styles.optionBtnTextActive]}>
                                        {g === 'lose'
                                            ? `🔥 ${t('onboarding.goals.goal_lose')}`
                                            : g === 'gain'
                                                ? `💪 ${t('onboarding.goals.goal_gain')}`
                                                : `⚖️ ${t('onboarding.goals.goal_maintain')}`}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {formData.goal !== 'maintain' && (
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>{t('onboarding.body.placeholder_goal_weight')}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.goalWeight?.toString()}
                                    onChangeText={(v) => setFormData({ ...formData, goalWeight: parseFloat(v) || undefined })}
                                    keyboardType="numeric"
                                    placeholder={t('optional')}
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            </View>
                        )}
                    </View>

                    {/* Activity */}
                    <View style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{t('onboarding.lifestyle.activity_level')}</Text>
                        <View style={styles.optionColumn}>
                            {(['sedentary', 'light', 'moderate', 'active'] as const).map((level) => (
                                <TouchableOpacity
                                    key={level}
                                    style={[styles.optionBtnFull, formData.activityLevel === level && styles.optionBtnActive]}
                                    onPress={() => setFormData({ ...formData, activityLevel: level })}
                                >
                                    <Text style={[styles.optionBtnText, formData.activityLevel === level && styles.optionBtnTextActive]}>
                                        {level === 'sedentary' ? `🪑 ${t('onboarding.lifestyle.activity_sedentary')}` :
                                            level === 'light' ? `🚶 ${t('onboarding.lifestyle.activity_light')}` :
                                                level === 'moderate' ? `🏃 ${t('onboarding.lifestyle.activity_moderate')}` : `🏋️ ${t('onboarding.lifestyle.activity_active')}`}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{t('profile.section.diet')}</Text>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.diet.restrictions')}</Text>
                            <View style={styles.optionRow}>
                                {DIETARY_OPTIONS.map((option) => (
                                    <TouchableOpacity
                                        key={option.value}
                                        style={[styles.optionBtn, dietPrefs.restrictions.includes(option.value) && styles.optionBtnActive]}
                                        onPress={() => toggleDietaryRestriction(option.value)}
                                    >
                                        <Text style={[styles.optionBtnText, dietPrefs.restrictions.includes(option.value) && styles.optionBtnTextActive]}>
                                            {t(option.labelKey)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.diet.allergies')}</Text>
                            <TextInput
                                style={styles.input}
                                value={allergiesCsv}
                                onChangeText={(v) => {
                                    setAllergiesCsv(v);
                                    setDietaryPreferences({ allergies: parseCsvList(v) });
                                }}
                                placeholder={t('onboarding.diet.allergies_placeholder')}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.diet.dislikes')}</Text>
                            <TextInput
                                style={styles.input}
                                value={dislikesCsv}
                                onChangeText={(v) => {
                                    setDislikesCsv(v);
                                    setDietaryPreferences({ dislikedFoods: parseCsvList(v) });
                                }}
                                placeholder={t('onboarding.diet.dislikes_placeholder')}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>
                    </View>

                    <View style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{t('profile.section.fitness')}</Text>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.fitness.experience')}</Text>
                            <View style={styles.optionColumn}>
                                {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map((level) => (
                                    <TouchableOpacity
                                        key={level}
                                        style={[styles.optionBtnFull, fitnessProfile.experienceLevel === level && styles.optionBtnActive]}
                                        onPress={() => setFitnessProfile({ experienceLevel: level })}
                                    >
                                        <Text style={[styles.optionBtnText, fitnessProfile.experienceLevel === level && styles.optionBtnTextActive]}>
                                            {level === 'beginner'
                                                ? t('onboarding.fitness.beginner')
                                                : level === 'intermediate'
                                                    ? t('onboarding.fitness.intermediate')
                                                    : t('onboarding.fitness.advanced')}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.fitness.activities')}</Text>
                            <View style={styles.optionRow}>
                                {FITNESS_ACTIVITY_OPTIONS.map((option) => (
                                    <TouchableOpacity
                                        key={option.value}
                                        style={[styles.optionBtn, fitnessProfile.preferredActivities.includes(option.value) && styles.optionBtnActive]}
                                        onPress={() => toggleFitnessActivity(option.value)}
                                    >
                                        <Text style={[styles.optionBtnText, fitnessProfile.preferredActivities.includes(option.value) && styles.optionBtnTextActive]}>
                                            {t(option.labelKey)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.fitness.equipment')}</Text>
                            <View style={styles.optionRow}>
                                {(['none', 'basic_home', 'full_gym'] as EquipmentAccess[]).map((level) => (
                                    <TouchableOpacity
                                        key={level}
                                        style={[styles.optionBtn, fitnessProfile.equipmentAccess === level && styles.optionBtnActive]}
                                        onPress={() => setFitnessProfile({ equipmentAccess: level })}
                                    >
                                        <Text style={[styles.optionBtnText, fitnessProfile.equipmentAccess === level && styles.optionBtnTextActive]}>
                                            {level === 'none'
                                                ? t('onboarding.fitness.equipment_none')
                                                : level === 'basic_home'
                                                    ? t('onboarding.fitness.equipment_home')
                                                    : t('onboarding.fitness.equipment_gym')}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.fitness.time')}</Text>
                            <TextInput
                                style={styles.input}
                                value={fitnessProfile.availableMinutesPerDay?.toString() ?? ''}
                                onChangeText={(v) => {
                                    const parsed = parseInt(v, 10);
                                    setFitnessProfile({ availableMinutesPerDay: Number.isFinite(parsed) ? parsed : undefined });
                                }}
                                keyboardType="numeric"
                                placeholder={t('onboarding.fitness.time_minutes', { minutes: 45 })}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>
                    </View>

                    <View style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{t('profile.section.sleep')}</Text>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.sleep.consistency')}</Text>
                            <View style={styles.optionRow}>
                                <TouchableOpacity
                                    style={[styles.optionBtn, sleepRoutine.isConsistent && styles.optionBtnActive]}
                                    onPress={() => setSleepRoutine({ isConsistent: true })}
                                >
                                    <Text style={[styles.optionBtnText, sleepRoutine.isConsistent && styles.optionBtnTextActive]}>
                                        {t('yes')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.optionBtn, !sleepRoutine.isConsistent && styles.optionBtnActive]}
                                    onPress={() => setSleepRoutine({ isConsistent: false })}
                                >
                                    <Text style={[styles.optionBtnText, !sleepRoutine.isConsistent && styles.optionBtnTextActive]}>
                                        {t('no')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.sleep.wake_window')}</Text>
                            <View style={styles.optionRow}>
                                {[15, 30, 45, 60].map((minutes) => (
                                    <TouchableOpacity
                                        key={minutes}
                                        style={[styles.optionBtn, sleepRoutine.wakeWindowMinutes === minutes && styles.optionBtnActive]}
                                        onPress={() => setSleepRoutine({ wakeWindowMinutes: minutes })}
                                    >
                                        <Text style={[styles.optionBtnText, sleepRoutine.wakeWindowMinutes === minutes && styles.optionBtnTextActive]}>
                                            {t('onboarding.sleep.wake_window_minutes', { minutes })}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.sleep.quality')}</Text>
                            <View style={styles.optionRow}>
                                {[1, 2, 3, 4, 5].map((value) => (
                                    <TouchableOpacity
                                        key={value}
                                        style={[styles.optionBtn, sleepRoutine.qualityRating === value && styles.optionBtnActive]}
                                        onPress={() => setSleepRoutine({ qualityRating: value as 1 | 2 | 3 | 4 | 5 })}
                                    >
                                        <Text style={[styles.optionBtnText, sleepRoutine.qualityRating === value && styles.optionBtnTextActive]}>
                                            {t(`onboarding.sleep.quality_${value}`)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.sleep.issues')}</Text>
                            <View style={styles.optionRow}>
                                {SLEEP_ISSUE_OPTIONS.map((option) => (
                                    <TouchableOpacity
                                        key={option.value}
                                        style={[styles.optionBtn, (sleepRoutine.sleepIssues || []).includes(option.value) && styles.optionBtnActive]}
                                        onPress={() => toggleSleepIssue(option.value)}
                                    >
                                        <Text style={[styles.optionBtnText, (sleepRoutine.sleepIssues || []).includes(option.value) && styles.optionBtnTextActive]}>
                                            {t(option.labelKey)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>

                    <View style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{t('profile.section.work')}</Text>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.work_type')}</Text>
                            <View style={styles.optionColumn}>
                                {(['fixed_9_5', 'night_shift', 'rotating', 'flexible', 'unemployed'] as UserProfile['workProfile']['type'][]).map((type) => (
                                    <TouchableOpacity
                                        key={type}
                                        style={[styles.optionBtnFull, workProfile.type === type && styles.optionBtnActive]}
                                        onPress={() => setWorkProfile({ type })}
                                    >
                                        <Text style={[styles.optionBtnText, workProfile.type === type && styles.optionBtnTextActive]}>
                                            {type === 'fixed_9_5'
                                                ? t('onboarding.medical.work_fixed')
                                                : type === 'night_shift'
                                                    ? t('onboarding.medical.work_night')
                                                    : type === 'rotating'
                                                        ? t('onboarding.medical.work_rotating')
                                                        : type === 'flexible'
                                                            ? t('onboarding.medical.work_flexible')
                                                            : t('onboarding.medical.work_flexible')}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.work_intensity')}</Text>
                            <View style={styles.optionRow}>
                                {(['desk', 'standing', 'heavy_labor'] as UserProfile['workProfile']['intensity'][]).map((level) => (
                                    <TouchableOpacity
                                        key={level}
                                        style={[styles.optionBtn, workProfile.intensity === level && styles.optionBtnActive]}
                                        onPress={() => setWorkProfile({ intensity: level })}
                                    >
                                        <Text style={[styles.optionBtnText, workProfile.intensity === level && styles.optionBtnTextActive]}>
                                            {level === 'desk'
                                                ? t('profile.work_intensity.desk')
                                                : level === 'standing'
                                                    ? t('profile.work_intensity.standing')
                                                    : t('profile.work_intensity.heavy_labor')}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputRow}>
                            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                                <Text style={styles.inputLabel}>{t('profile.field.work_role')}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={workProfile.role || ''}
                                    onChangeText={(v) => setWorkProfile({ role: v })}
                                    placeholder={t('onboarding.routine.work_role_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            </View>
                            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                                <Text style={styles.inputLabel}>{t('profile.field.work_industry')}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={workProfile.industry || ''}
                                    onChangeText={(v) => setWorkProfile({ industry: v })}
                                    placeholder={t('onboarding.routine.work_industry_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.work_commute')}</Text>
                            <View style={styles.optionRow}>
                                {(['none', 'car', 'public_transit', 'walking', 'cycling', 'mixed'] as NonNullable<UserProfile['workProfile']['commuteType']>[]).map((commute) => (
                                    <TouchableOpacity
                                        key={commute}
                                        style={[styles.optionBtn, workProfile.commuteType === commute && styles.optionBtnActive]}
                                        onPress={() => setWorkProfile({ commuteType: commute })}
                                    >
                                        <Text style={[styles.optionBtnText, workProfile.commuteType === commute && styles.optionBtnTextActive]}>
                                            {commute === 'none'
                                                ? t('onboarding.routine.commute_none')
                                                : commute === 'car'
                                                    ? t('onboarding.routine.commute_car')
                                                    : commute === 'public_transit'
                                                        ? t('onboarding.routine.commute_public')
                                                        : commute === 'walking'
                                                            ? t('onboarding.routine.commute_walk')
                                                            : commute === 'cycling'
                                                                ? t('onboarding.routine.commute_cycle')
                                                                : t('onboarding.routine.commute_mixed')}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputRow}>
                            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                                <Text style={styles.inputLabel}>{t('profile.field.work_start')}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={workProfile.hours?.start || ''}
                                    onChangeText={(v) => setWorkHours({ start: v })}
                                    placeholder="09:00"
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            </View>
                            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                                <Text style={styles.inputLabel}>{t('profile.field.work_end')}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={workProfile.hours?.end || ''}
                                    onChangeText={(v) => setWorkHours({ end: v })}
                                    placeholder="17:00"
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            </View>
                        </View>
                    </View>

                    <View style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{t('profile.section.meal_pattern')}</Text>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.meals_per_day')}</Text>
                            <TextInput
                                style={styles.input}
                                value={mealPattern.mealsPerDay?.toString() || ''}
                                onChangeText={(v) => {
                                    const parsed = parseInt(v, 10);
                                    setMealPattern({ mealsPerDay: Number.isFinite(parsed) ? parsed : undefined });
                                }}
                                keyboardType="numeric"
                                placeholder={t('onboarding.routine.meals_per_day_placeholder')}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.meal_times')}</Text>
                            <TextInput
                                style={styles.input}
                                value={mealTimesCsv}
                                onChangeText={(v) => {
                                    setMealTimesCsv(v);
                                    setMealPattern({ mealTimes: parseCsvList(v) });
                                }}
                                placeholder={t('onboarding.routine.meal_times_placeholder')}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.typical_meals')}</Text>
                            <TextInput
                                style={styles.input}
                                value={typicalMealsCsv}
                                onChangeText={(v) => {
                                    setTypicalMealsCsv(v);
                                    setMealPattern({ typicalMeals: parseCsvList(v) });
                                }}
                                placeholder={t('onboarding.routine.typical_meals_placeholder')}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.late_night')}</Text>
                            <View style={styles.optionRow}>
                                <TouchableOpacity
                                    style={[styles.optionBtn, mealPattern.lateNightEating && styles.optionBtnActive]}
                                    onPress={() => setMealPattern({ lateNightEating: true })}
                                >
                                    <Text style={[styles.optionBtnText, mealPattern.lateNightEating && styles.optionBtnTextActive]}>
                                        {t('yes')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.optionBtn, !mealPattern.lateNightEating && styles.optionBtnActive]}
                                    onPress={() => setMealPattern({ lateNightEating: false })}
                                >
                                    <Text style={[styles.optionBtnText, !mealPattern.lateNightEating && styles.optionBtnTextActive]}>
                                        {t('no')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    <View style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{t('profile.section.habits')}</Text>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.habits_smoking')}</Text>
                            <View style={styles.optionRow}>
                                {(['none', 'occasional', 'weekly', 'daily'] as const).map((value) => (
                                    <TouchableOpacity
                                        key={`smoking-${value}`}
                                        style={[styles.optionBtn, habits.smoking === value && styles.optionBtnActive]}
                                        onPress={() => setHabits({ smoking: value })}
                                    >
                                        <Text style={[styles.optionBtnText, habits.smoking === value && styles.optionBtnTextActive]}>
                                            {t(`profile.habit.${value}`)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.habits_alcohol')}</Text>
                            <View style={styles.optionRow}>
                                {(['none', 'occasional', 'weekly', 'daily'] as const).map((value) => (
                                    <TouchableOpacity
                                        key={`alcohol-${value}`}
                                        style={[styles.optionBtn, habits.alcohol === value && styles.optionBtnActive]}
                                        onPress={() => setHabits({ alcohol: value })}
                                    >
                                        <Text style={[styles.optionBtnText, habits.alcohol === value && styles.optionBtnTextActive]}>
                                            {t(`profile.habit.${value}`)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.habits_vaping')}</Text>
                            <View style={styles.optionRow}>
                                {(['none', 'occasional', 'weekly', 'daily'] as const).map((value) => (
                                    <TouchableOpacity
                                        key={`vaping-${value}`}
                                        style={[styles.optionBtn, habits.vaping === value && styles.optionBtnActive]}
                                        onPress={() => setHabits({ vaping: value })}
                                    >
                                        <Text style={[styles.optionBtnText, habits.vaping === value && styles.optionBtnTextActive]}>
                                            {t(`profile.habit.${value}`)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.habits_sugar')}</Text>
                            <View style={styles.optionRow}>
                                {(['low', 'moderate', 'high'] as const).map((value) => (
                                    <TouchableOpacity
                                        key={`sugar-${value}`}
                                        style={[styles.optionBtn, habits.sugarCravings === value && styles.optionBtnActive]}
                                        onPress={() => setHabits({ sugarCravings: value })}
                                    >
                                        <Text style={[styles.optionBtnText, habits.sugarCravings === value && styles.optionBtnTextActive]}>
                                            {t(`profile.habit.sugar_${value}`)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.habits_caffeine')}</Text>
                            <View style={styles.optionRow}>
                                {(['none', '1_2', '3_4', '5_plus'] as const).map((value) => (
                                    <TouchableOpacity
                                        key={`caffeine-${value}`}
                                        style={[styles.optionBtn, habits.caffeine === value && styles.optionBtnActive]}
                                        onPress={() => setHabits({ caffeine: value })}
                                    >
                                        <Text style={[styles.optionBtnText, habits.caffeine === value && styles.optionBtnTextActive]}>
                                            {t(`profile.habit.caffeine_${value}`)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('profile.field.habits_other')}</Text>
                            <TextInput
                                style={styles.input}
                                value={otherHabitsCsv}
                                onChangeText={(v) => {
                                    setOtherHabitsCsv(v);
                                    setHabits({ otherHabits: parseCsvList(v) });
                                }}
                                placeholder={t('onboarding.routine.habit_other_placeholder')}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>
                    </View>

                    {/* Medical */}
                    <View style={styles.editSection}>
                        <Text style={styles.editSectionTitle}>{t('onboarding.medical.title')}</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.medical.chronic_question')}</Text>
                            <View style={styles.optionRow}>
                                <TouchableOpacity
                                    style={[styles.optionBtn, hasChronicConditions && styles.optionBtnActive]}
                                    onPress={() => setHasChronicConditions(true)}
                                >
                                    <Text style={[styles.optionBtnText, hasChronicConditions && styles.optionBtnTextActive]}>
                                        {t('yes')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.optionBtn, !hasChronicConditions && styles.optionBtnActive]}
                                    onPress={() => {
                                        setHasChronicConditions(false);
                                        setConditionsCsv('');
                                        setMedicalProfile({ conditions: [] });
                                    }}
                                >
                                    <Text style={[styles.optionBtnText, !hasChronicConditions && styles.optionBtnTextActive]}>
                                        {t('no')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            {hasChronicConditions && (
                                <TextInput
                                    style={styles.input}
                                    value={conditionsCsv}
                                    onChangeText={(v) => {
                                        setConditionsCsv(v);
                                        setMedicalProfile({ conditions: parseCsvList(v) });
                                    }}
                                    placeholder={t('onboarding.medical.chronic_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            )}
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.medical.medications_question')}</Text>
                            <View style={styles.optionRow}>
                                <TouchableOpacity
                                    style={[styles.optionBtn, hasMedications && styles.optionBtnActive]}
                                    onPress={() => setHasMedications(true)}
                                >
                                    <Text style={[styles.optionBtnText, hasMedications && styles.optionBtnTextActive]}>
                                        {t('yes')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.optionBtn, !hasMedications && styles.optionBtnActive]}
                                    onPress={() => {
                                        setHasMedications(false);
                                        setMedicationsCsv('');
                                        setMedicalProfile({ medications: [] });
                                    }}
                                >
                                    <Text style={[styles.optionBtnText, !hasMedications && styles.optionBtnTextActive]}>
                                        {t('no')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            {hasMedications && (
                                <TextInput
                                    style={styles.input}
                                    value={medicationsCsv}
                                    onChangeText={(v) => {
                                        setMedicationsCsv(v);
                                        setMedicalProfile({ medications: parseCsvList(v) });
                                    }}
                                    placeholder={t('onboarding.medical.medications_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            )}
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>{t('onboarding.medical.injuries_question')}</Text>
                            <View style={styles.optionRow}>
                                <TouchableOpacity
                                    style={[styles.optionBtn, hasInjuries && styles.optionBtnActive]}
                                    onPress={() => setHasInjuries(true)}
                                >
                                    <Text style={[styles.optionBtnText, hasInjuries && styles.optionBtnTextActive]}>
                                        {t('yes')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.optionBtn, !hasInjuries && styles.optionBtnActive]}
                                    onPress={() => {
                                        setHasInjuries(false);
                                        setInjuriesCsv('');
                                        setMedicalProfile({ injuries: [] });
                                    }}
                                >
                                    <Text style={[styles.optionBtnText, !hasInjuries && styles.optionBtnTextActive]}>
                                        {t('no')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            {hasInjuries && (
                                <TextInput
                                    style={styles.input}
                                    value={injuriesCsv}
                                    onChangeText={(v) => {
                                        setInjuriesCsv(v);
                                        setMedicalProfile({ injuries: parseCsvList(v) });
                                    }}
                                    placeholder={t('onboarding.medical.injuries_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                            )}
                        </View>
                    </View>
                </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    accessibilityLabel={t('accessibility.go_back')}
                    accessibilityRole="button"
                >
                    <Text style={styles.backBtn}>← {t('back')}</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle} accessibilityRole="header">{t('nav.profile')}</Text>
                <TouchableOpacity
                    onPress={startEditing}
                    accessibilityLabel={t('accessibility.edit_profile')}
                    accessibilityRole="button"
                >
                    <Text style={styles.editBtn}>{t('edit')}</Text>
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
            >
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                {/* Profile Card */}
                <View style={styles.profileCard}>
                    <View style={styles.avatarContainer}>
                        <Text style={styles.avatar}>
                            {user.avatarId === 'titan' ? '🦾' :
                                user.avatarId === 'zen' ? '🧘' :
                                    user.avatarId === 'sprinter' ? '⚡' : '🤖'}
                        </Text>
                    </View>
                    <View style={styles.profileInfo}>
                        <Text style={styles.userName}>{user.name}</Text>
                        <View style={styles.statsRow}>
                            <Text style={styles.statText}>{t('profile.age_short', { age: user.age })}</Text>
                            <View style={styles.dot} />
                            <Text style={styles.statText}>{formatHeight(user.height)}</Text>
                            <View style={styles.dot} />
                            <Text style={styles.statText}>{formatWeight(user.weight)}</Text>
                        </View>
                        <View style={styles.tagsRow}>
                            <View style={[styles.tag, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
                                <Text style={[styles.tagText, { color: '#818cf8' }]}>
                                    {user.goal === 'lose' ? `🔥 ${t('lose_weight')}` :
                                        user.goal === 'gain' ? `💪 ${t('build_muscle')}` : `⚖️ ${t('maintain')}`}
                                </Text>
                            </View>
                            {user.goalWeight && (
                                <View style={[styles.tag, { backgroundColor: 'rgba(34, 197, 94, 0.2)' }]}>
                                    <Text style={[styles.tagText, { color: '#22c55e' }]}>
                                        {t('profile.goal_weight_label', { weight: formatWeightValue(user.goalWeight), unit: weightUnit })}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                {/* Mood Tracker */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>{t('profile.mood.title')}</Text>
                        {todayMoodLogged && (
                            <Text style={styles.loggedBadge}>{t('profile.mood.logged_today')}</Text>
                        )}
                    </View>
                    <View style={styles.moodRow} accessibilityRole="radiogroup" accessibilityLabel={t('profile.mood.accessibility_group')}>
                    {MOODS.map((mood) => {
                        const moodLabel = t(mood.labelKey);
                        return (
                            <TouchableOpacity
                                key={mood.type}
                                style={[styles.moodBtn, { borderColor: mood.color }]}
                                onPress={() => handleMoodClick(mood)}
                                accessibilityLabel={t('profile.mood.accessibility_label', { mood: moodLabel })}
                                accessibilityRole="button"
                                accessibilityHint={t('profile.mood.accessibility_hint', { mood: moodLabel })}
                            >
                                <Text style={styles.moodIcon} accessibilityElementsHidden>{mood.icon}</Text>
                                <Text style={styles.moodLabel}>{moodLabel}</Text>
                            </TouchableOpacity>
                        );
                    })}
                    </View>

                    {/* Mood Chart */}
                    {moodLogs.length > 0 && (
                        <View style={styles.chartSection}>
                            <Text style={styles.chartLabel}>{t('profile.mood.last_7_days')}</Text>
                            <MiniChart
                                data={moodLogs.slice(-7).map(l => l.score)}
                                color="#6366f1"
                                height={60}
                            />
                        </View>
                    )}
                </View>

                {/* Weight History */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>{t('profile.weight.title')}</Text>
                        <TouchableOpacity onPress={() => setShowWeightInput(true)}>
                            <Text style={styles.addBtn}>{t('profile.weight.log_cta')}</Text>
                        </TouchableOpacity>
                    </View>

                    {showWeightInput && (
                        <View style={styles.weightInputRow}>
                            <TextInput
                                style={styles.weightInput}
                                value={newWeight}
                                onChangeText={setNewWeight}
                                keyboardType="numeric"
                                placeholder={weightUnit}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                autoFocus
                            />
                            <TouchableOpacity style={styles.weightSaveBtn} onPress={handleUpdateWeight}>
                                <Text style={styles.weightSaveBtnText}>{t('save')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setShowWeightInput(false)}>
                                <Text style={styles.cancelText}>{t('cancel')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {weightLogs.length > 0 ? (
                        <>
                            <View style={styles.weightStats}>
                                <View style={styles.weightStatItem}>
                                    <Text style={styles.weightStatValue}>
                                        {formatWeightValue(weightLogs[weightLogs.length - 1].weight)}
                                    </Text>
                                    <Text style={styles.weightStatLabel}>{t('profile.weight.current_label', { unit: weightUnit })}</Text>
                                </View>
                                {user.goalWeight && (
                                    <View style={styles.weightStatItem}>
                                        <Text style={styles.weightStatValue}>
                                            {formatWeightValue(user.goalWeight)}
                                        </Text>
                                        <Text style={styles.weightStatLabel}>{t('profile.weight.goal_label', { unit: weightUnit })}</Text>
                                    </View>
                                )}
                                <View style={styles.weightStatItem}>
                                    <Text style={[
                                        styles.weightStatValue,
                                        { color: (weightLogs[weightLogs.length - 1].weight - weightLogs[0].weight) < 0 ? '#22c55e' : '#f97316' }
                                    ]}>
                                        {formatWeightDelta(weightLogs[weightLogs.length - 1].weight - weightLogs[0].weight)}
                                    </Text>
                                    <Text style={styles.weightStatLabel}>{t('profile.weight.change_label', { unit: weightUnit })}</Text>
                                </View>
                            </View>
                            <MiniChart
                                data={weightLogs.slice(-10).map(l => l.weight)}
                                color="#22c55e"
                                height={80}
                            />
                        </>
                    ) : (
                        <Text style={styles.emptyText}>{t('profile.weight.empty')}</Text>
                    )}
                </View>

                {/* Daily Targets */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('profile.targets.title')}</Text>
                    <View style={styles.targetRow}>
                        <View style={styles.targetItem}>
                            <Text style={styles.targetValue}>{user.dailyCalorieTarget || 2000}</Text>
                            <Text style={styles.targetLabel}>{t('profile.targets.calories')}</Text>
                        </View>
                        <View style={styles.targetItem}>
                            <Text style={styles.targetValue}>{user.dailyProteinTarget || Math.round((user.weight || 70) * 1.6)}</Text>
                            <Text style={styles.targetLabel}>{t('profile.targets.protein')}</Text>
                        </View>
                        <View style={styles.targetItem}>
                            <Text style={styles.targetValue}>{user.dailyWaterTargetMl || 2500}</Text>
                            <Text style={styles.targetLabel}>{t('profile.targets.water')}</Text>
                        </View>
                    </View>
                </View>

                {(mealPatternSummary || habitsSummary) && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{t('profile.section.meal_pattern')}</Text>
                        {mealPatternSummary ? (
                            <Text style={styles.detailText}>{mealPatternSummary}</Text>
                        ) : (
                            <Text style={styles.emptyText}>{t('common.not_applicable')}</Text>
                        )}
                        <View style={{ marginTop: 12 }} />
                        <Text style={styles.cardTitle}>{t('profile.section.habits')}</Text>
                        {habitsSummary ? (
                            <Text style={styles.detailText}>{habitsSummary}</Text>
                        ) : (
                            <Text style={styles.emptyText}>{t('common.not_applicable')}</Text>
                        )}
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
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: 'rgba(255,255,255,0.5)',
        marginTop: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    backBtn: {
        color: '#06b6d4',
        fontSize: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#ffffff',
    },
    editBtn: {
        color: '#06b6d4',
        fontSize: 16,
        fontWeight: '500',
    },
    cancelBtn: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 16,
    },
    saveBtn: {
        color: '#22c55e',
        fontSize: 16,
        fontWeight: '600',
    },
    disabled: {
        opacity: 0.5,
    },
    scrollView: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 80,
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
    },
    profileCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 20,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    avatarContainer: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    avatar: {
        fontSize: 36,
    },
    profileInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 22,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 4,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    statText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.3)',
        marginHorizontal: 8,
    },
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    tag: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    tagText: {
        fontSize: 12,
        fontWeight: '600',
    },
    card: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    loggedBadge: {
        color: '#22c55e',
        fontSize: 12,
        fontWeight: '600',
    },
    addBtn: {
        color: '#06b6d4',
        fontSize: 14,
        fontWeight: '600',
    },
    moodRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    moodBtn: {
        alignItems: 'center',
        padding: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        minWidth: 58,
    },
    moodIcon: {
        fontSize: 24,
        marginBottom: 4,
    },
    moodLabel: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.6)',
    },
    chartSection: {
        marginTop: 16,
    },
    chartLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 8,
    },
    chartContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    chartBarContainer: {
        flex: 1,
        alignItems: 'center',
        marginHorizontal: 2,
    },
    chartBar: {
        width: '80%',
        borderRadius: 4,
        minHeight: 10,
    },
    weightInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 10,
    },
    weightInput: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: 12,
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
    },
    weightSaveBtn: {
        backgroundColor: '#22c55e',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
    },
    weightSaveBtnText: {
        color: '#ffffff',
        fontWeight: '600',
    },
    cancelText: {
        color: 'rgba(255,255,255,0.5)',
        paddingHorizontal: 10,
    },
    weightStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 16,
    },
    weightStatItem: {
        alignItems: 'center',
    },
    weightStatValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
    },
    weightStatLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 4,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        fontSize: 14,
    },
    detailText: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 13,
        lineHeight: 18,
    },
    targetRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 12,
    },
    targetItem: {
        alignItems: 'center',
    },
    targetValue: {
        fontSize: 28,
        fontWeight: '700',
        color: '#06b6d4',
    },
    targetLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 4,
    },
    // Edit mode styles
    editScroll: {
        flex: 1,
    },
    editContent: {
        padding: 20,
        paddingBottom: 40,
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
    },
    editSection: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    editSectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    inputGroup: {
        marginBottom: 12,
    },
    inputRow: {
        flexDirection: 'row',
    },
    inputLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 6,
    },
    input: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 12,
        padding: 14,
        color: '#ffffff',
        fontSize: 16,
    },
    optionRow: {
        flexDirection: 'row',
        gap: 8,
    },
    optionColumn: {
        gap: 8,
    },
    optionBtn: {
        flex: 1,
        padding: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
    },
    optionBtnFull: {
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    optionBtnActive: {
        backgroundColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        borderColor: '#6366f1',
    },
    optionBtnText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
    },
    optionBtnTextActive: {
        color: '#ffffff',
        fontWeight: '600',
    },
});

export default ProfileScreen;
