// Complete Onboarding Screen - Multi-step profile wizard
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    ScrollView, SafeAreaView, Alert, ActivityIndicator,
    KeyboardAvoidingView, Platform, AppState, AppStateStatus, Modal
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
    UserProfile,
    DailyPlan,
    FoodLogEntry,
    ActivityLogEntry,
    MoodLog,
    WeightLogEntry,
    DietaryRestriction,
    FitnessActivity,
    EquipmentAccess,
    ExperienceLevel,
    SleepIssue,
} from '../types';
import { llmQueueService } from '../services/llmQueueService';
import storage from '../services/storageService';
import userProfileService from '../services/userProfileService';
import { AVAILABLE_LANGUAGES, useLanguage } from '../contexts/LanguageContext';
import { analytics } from '../services/analyticsService';
import { getLocalDateKey } from '../utils/dateUtils';
import { queuePlanRetry } from '../services/planRetryService';
import { getHealthContextData, getBioContextForAppContext } from '../services/healthContextService';
import healthSyncService from '../services/healthSyncService';
import { healthService } from '../services/healthService';
import { bioSnapshotService } from '../services/bioSnapshotService';
import { healthConsentService } from '../services/healthConsentService';
import { healthConnectService } from '../services/healthConnectService';
import locationService from '../services/locationService';
import { getWeatherSnapshot } from '../services/weatherService';
import { validateOnboardingStep, sanitizeNumericInput } from '../utils/validation';
import { refreshTargetsForProfile } from '../services/targetService';
import AvatarPicker from '../components/AvatarPicker';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

const STEPS = ['basics', 'body', 'goals', 'diet', 'fitness', 'lifestyle', 'routine', 'sleep', 'health', 'medical', 'complete'] as const;
type Step = typeof STEPS[number];
type CalculatingMessageKey =
    | 'onboarding.calculating.profile'
    | 'onboarding.calculating.goals'
    | 'onboarding.calculating.plan';

type OnboardingFormData = {
    name: string;
    age: string;
    gender: 'male' | 'female';
    avatarId: string;
    height: string;
    weight: string;
    goalWeight: string;
    goal: 'lose' | 'maintain' | 'gain';
    planIntensity: 'slow' | 'normal' | 'aggressive';
    activityLevel: 'sedentary' | 'light' | 'moderate' | 'active';
    origin: string;
    residence: string;
    workType: 'fixed_9_5' | 'night_shift' | 'rotating' | 'flexible' | 'unemployed';
    workIntensity: 'desk' | 'standing' | 'heavy_labor';
    jobTitle: string;
    industry: string;
    commuteType: 'none' | 'car' | 'public_transit' | 'walking' | 'cycling' | 'mixed';
    mealsPerDay: string;
    mealTimes: string[];
    typicalMeals: string[];
    lateNightEating: boolean;
    smoking: 'none' | 'occasional' | 'weekly' | 'daily';
    alcohol: 'none' | 'occasional' | 'weekly' | 'daily';
    vaping: 'none' | 'occasional' | 'weekly' | 'daily';
    sugarCravings: 'low' | 'moderate' | 'high';
    caffeine: 'none' | '1_2' | '3_4' | '5_plus';
    otherHabits: string[];
    conditions: string[];
    medications: string[];
    injuries: string[];
    maritalStatus: 'single' | 'married' | 'partner';
    childrenCount: string;
    dietaryRestrictions: DietaryRestriction[];
    dietaryAllergies: string[];
    dietaryDislikes: string[];
    fitnessExperience: ExperienceLevel;
    fitnessActivities: FitnessActivity[];
    fitnessEquipment: EquipmentAccess;
    fitnessMinutesPerDay: string;
    sleepQuality: 1 | 2 | 3 | 4 | 5;
    sleepIssues: SleepIssue[];
    sleepWakeWindowMinutes: number;
    sleepConsistent: boolean;
};

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

const OnboardingScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const { t, language, setLanguage } = useLanguage();
    const [currentStep, setCurrentStep] = useState<Step>('basics');
    const [isCalculating, setIsCalculating] = useState(false);
    const [calculatingMessageKey, setCalculatingMessageKey] = useState<CalculatingMessageKey>('onboarding.calculating.profile');

    // Form state
    const [formData, setFormData] = useState<OnboardingFormData>({
        name: '',
        age: '',
        gender: 'male',
        avatarId: 'default',
        height: '',
        weight: '',
        goalWeight: '',
        goal: 'lose',
        planIntensity: 'normal',
        activityLevel: 'moderate',
        origin: '',
        residence: '',
        workType: 'flexible',
        workIntensity: 'desk',
        jobTitle: '',
        industry: '',
        commuteType: 'none',
        mealsPerDay: '3',
        mealTimes: [],
        typicalMeals: [],
        lateNightEating: false,
        smoking: 'none',
        alcohol: 'none',
        vaping: 'none',
        sugarCravings: 'moderate',
        caffeine: '1_2',
        otherHabits: [],
        conditions: [],
        medications: [],
        injuries: [],
        maritalStatus: 'single',
        childrenCount: '0',
        dietaryRestrictions: ['none'],
        dietaryAllergies: [],
        dietaryDislikes: [],
        fitnessExperience: 'beginner',
        fitnessActivities: [],
        fitnessEquipment: 'none',
        fitnessMinutesPerDay: '',
        sleepQuality: 3,
        sleepIssues: ['none'],
        sleepWakeWindowMinutes: 30,
        sleepConsistent: true,
    });
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [draftReady, setDraftReady] = useState(false);
    const draftSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    const updateField = <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (fieldErrors[field]) {
            setFieldErrors(prev => {
                const next = { ...prev };
                delete next[field];
                return next;
            });
        }
    };

    // ========== ONBOARDING ANALYTICS ==========
    const startTimeRef = useRef<number>(Date.now());
    const stepStartTimeRef = useRef<number>(Date.now());
    const hasLoggedStartRef = useRef<boolean>(false);

    // Track onboarding started (once)
    useEffect(() => {
        if (!hasLoggedStartRef.current) {
            hasLoggedStartRef.current = true;
            analytics.logEvent('onboarding_started', {
                timestamp: Date.now(),
            });
            analytics.logScreenView('OnboardingScreen', 'Onboarding');
        }
    }, []);

    // Track step views and time spent
    useEffect(() => {
        const stepIndex = STEPS.indexOf(currentStep);
        const previousStepTime = Date.now() - stepStartTimeRef.current;

        // Log step viewed
        analytics.logEvent('onboarding_step_viewed', {
            step: currentStep,
            step_index: stepIndex,
            step_number: stepIndex + 1,
            total_steps: STEPS.length,
        });

        // Reset step timer
        stepStartTimeRef.current = Date.now();

        // If not the first step, log previous step completion
        if (stepIndex > 0) {
            const previousStep = STEPS[stepIndex - 1];
            analytics.logEvent('onboarding_step_completed', {
                step: previousStep,
                step_index: stepIndex - 1,
                time_spent_ms: previousStepTime,
            });
        }
    }, [currentStep]);

    // Track abandonment when user leaves the app or navigates away
    useEffect(() => {
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                const totalTime = Date.now() - startTimeRef.current;
                analytics.logEvent('onboarding_abandoned', {
                    last_step: currentStep,
                    last_step_index: STEPS.indexOf(currentStep),
                    total_time_ms: totalTime,
                    steps_completed: STEPS.indexOf(currentStep),
                });
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
        };
    }, [currentStep]);
    // ========== END ONBOARDING ANALYTICS ==========

    const saveDraft = React.useCallback(
        async (stepOverride?: Step) => {
            if (!draftReady) return;
            const draft = {
                currentStep: stepOverride ?? currentStep,
                formData,
                language,
                updatedAt: Date.now(),
            };
            await storage.set(storage.keys.ONBOARDING_DRAFT, draft);
        },
        [currentStep, draftReady, formData, language]
    );

    useEffect(() => {
        let isMounted = true;
        const loadDraft = async () => {
            const saved = await storage.get<any>(storage.keys.ONBOARDING_DRAFT);
            if (!isMounted) return;
            if (!saved?.formData) {
                setDraftReady(true);
                return;
            }

            Alert.alert(
                t('onboarding.draft.title'),
                t('onboarding.draft.body'),
                [
                    {
                        text: t('onboarding.draft.start_over'),
                        style: 'destructive',
                        onPress: async () => {
                            await storage.remove(storage.keys.ONBOARDING_DRAFT);
                            setDraftReady(true);
                        },
                    },
                    {
                        text: t('onboarding.draft.resume'),
                        onPress: () => {
                            setFormData(prev => ({ ...prev, ...saved.formData, language }));
                            if (saved.currentStep && STEPS.includes(saved.currentStep)) {
                                setCurrentStep(saved.currentStep as Step);
                            }
                            setDraftReady(true);
                        },
                    },
                ]
            );
        };

        loadDraft();
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!draftReady) return;
        if (draftSaveTimerRef.current) {
            clearTimeout(draftSaveTimerRef.current);
        }
        draftSaveTimerRef.current = setTimeout(() => {
            void saveDraft();
        }, 400);
        return () => {
            if (draftSaveTimerRef.current) {
                clearTimeout(draftSaveTimerRef.current);
                draftSaveTimerRef.current = null;
            }
        };
    }, [currentStep, draftReady, formData, language, saveDraft]);

    useEffect(() => {
        if (!draftReady) return;
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'background' || state === 'inactive') {
                void saveDraft();
            }
        });
        return () => subscription.remove();
    }, [draftReady, saveDraft]);

    const [hasChronicConditions, setHasChronicConditions] = useState(false);
    const [hasMedications, setHasMedications] = useState(false);
    const [hasInjuries, setHasInjuries] = useState(false);

    const [conditionDraft, setConditionDraft] = useState('');
    const [medicationDraft, setMedicationDraft] = useState('');
    const [injuryDraft, setInjuryDraft] = useState('');
    const [allergyDraft, setAllergyDraft] = useState('');
    const [dislikeDraft, setDislikeDraft] = useState('');
    const [mealTimeDraft, setMealTimeDraft] = useState('');
    const [typicalMealDraft, setTypicalMealDraft] = useState('');
    const [otherHabitDraft, setOtherHabitDraft] = useState('');

    type ListField =
        | 'conditions'
        | 'medications'
        | 'injuries'
        | 'dietaryAllergies'
        | 'dietaryDislikes'
        | 'mealTimes'
        | 'typicalMeals'
        | 'otherHabits';

    const addListItem = (field: ListField, value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;

        setFormData(prev => {
            const existing = prev[field] as string[];
            const normalized = trimmed.toLowerCase();
            if (existing.some(v => v.toLowerCase() === normalized)) return prev;
            return { ...prev, [field]: [...existing, trimmed] };
        });
    };

    const removeListItem = (field: ListField, value: string) => {
        setFormData(prev => {
            const existing = prev[field] as string[];
            return { ...prev, [field]: existing.filter(v => v !== value) };
        });
    };

    const toggleDietaryRestriction = (value: DietaryRestriction) => {
        setFormData(prev => {
            const current = prev.dietaryRestrictions || [];
            if (value === 'none') {
                return { ...prev, dietaryRestrictions: ['none'] };
            }
            const next = current.filter(item => item !== 'none');
            const exists = next.includes(value);
            return { ...prev, dietaryRestrictions: exists ? next.filter(item => item !== value) : [...next, value] };
        });
    };

    const toggleFitnessActivity = (value: FitnessActivity) => {
        setFormData(prev => {
            const current = prev.fitnessActivities || [];
            const exists = current.includes(value);
            return { ...prev, fitnessActivities: exists ? current.filter(item => item !== value) : [...current, value] };
        });
    };

    const toggleSleepIssue = (value: SleepIssue) => {
        setFormData(prev => {
            const current = prev.sleepIssues || [];
            if (value === 'none') {
                return { ...prev, sleepIssues: ['none'] };
            }
            const next = current.filter(item => item !== 'none');
            const exists = next.includes(value);
            return { ...prev, sleepIssues: exists ? next.filter(item => item !== value) : [...next, value] };
        });
    };

    const applyStepValidation = (step: Step): boolean => {
        const result = validateOnboardingStep(step, formData);
        if (result.isValid) {
            setFieldErrors({});
            return true;
        }

        const mapped: Record<string, string> = {};
        result.errors.forEach((error) => {
            mapped[error.field] = error.messageKey;
        });
        setFieldErrors(mapped);
        Alert.alert(t('onboarding.validation.title'), t('onboarding.validation.body'), [
            { text: t('alert.ok') },
        ]);
        return false;
    };

    const nextStep = () => {
        if (!applyStepValidation(currentStep)) return;
        const currentIndex = STEPS.indexOf(currentStep);
        if (currentIndex < STEPS.length - 1) {
            setCurrentStep(STEPS[currentIndex + 1]);
        }
    };

    const prevStep = () => {
        const currentIndex = STEPS.indexOf(currentStep);
        if (currentIndex > 0) {
            setCurrentStep(STEPS[currentIndex - 1]);
        }
    };

    const handleHealthConnectSetup = async () => {
        await healthConsentService.grantConsent('onboarding');
        await bioSnapshotService.initialize();

        if (Platform.OS === 'android') {
            try {
                const sdkStatus = await healthConnectService.getSdkStatus();
                if (sdkStatus === 2) {
                    void healthConnectService.openHealthConnectUpdate();
                    Alert.alert(
                        t('onboarding.health.update_required_title'),
                        t('onboarding.health.update_required_body'),
                        [
                            { text: t('cancel'), style: 'cancel' },
                            {
                                text: t('onboarding.health.update_required_action'),
                                onPress: () => { void healthConnectService.openHealthConnectUpdate(); },
                            },
                        ]
                    );
                    return;
                }
                if (sdkStatus === 1) {
                    void healthConnectService.openHealthConnectUpdate();
                    Alert.alert(
                        t('onboarding.health.not_available_title'),
                        t('onboarding.health.not_available_body'),
                        [
                            { text: t('cancel'), style: 'cancel' },
                            {
                                text: t('onboarding.health.not_available_action'),
                                onPress: () => { void healthConnectService.openHealthConnectUpdate(); },
                            },
                        ]
                    );
                    return;
                }
            } catch (error) {
                console.warn('[Onboarding] Failed to check Health Connect status:', error);
            }
        }

        const granted = await healthSyncService.enable();
        if (!granted) {
            Alert.alert(
                t('onboarding.health.connect_failed_title'),
                t('onboarding.health.connect_failed_body'),
                [
                    { text: t('cancel'), style: 'cancel' },
                    {
                        text: t('onboarding.health.connect_failed_action'),
                        onPress: () => { void handleOpenHealthConnectShortcut(); },
                    },
                ]
            );
            return;
        }
        if (Platform.OS === 'android') {
            try {
                const hasAny = await healthConnectService.hasAnyPermission(true);
                if (hasAny) {
                    await healthService.setPreferredProvider('healthConnect');
                }
            } catch (error) {
                console.warn('[Onboarding] Failed to persist Health Connect provider:', error);
            }
        }
        nextStep();
    };

    const handleOpenHealthConnectShortcut = async () => {
        if (Platform.OS !== 'android') return;
        try {
            const sdkStatus = await healthConnectService.getSdkStatus();
            if (sdkStatus === 2) {
                await healthConnectService.openHealthConnectUpdate();
            } else {
                await healthConnectService.openHealthConnectSettings();
            }
        } catch (error) {
            console.warn('[Onboarding] Failed to open Health Connect:', error);
        }
    };

    const handleComplete = async () => {
        const stepsToValidate: Step[] = ['basics', 'body', 'routine', 'medical'];
        for (const step of stepsToValidate) {
            if (!applyStepValidation(step)) {
                setCurrentStep(step);
                return;
            }
        }

        setIsCalculating(true);
        setCalculatingMessageKey('onboarding.calculating.profile');
        try {
            // Build initial profile
            const dietRestrictions = formData.dietaryRestrictions.filter(item => item !== 'none');
            const sleepIssues = formData.sleepIssues.filter(item => item !== 'none');
            const dietaryPreferences = (dietRestrictions.length > 0 || formData.dietaryAllergies.length > 0 || formData.dietaryDislikes.length > 0)
                ? {
                    restrictions: dietRestrictions,
                    allergies: formData.dietaryAllergies,
                    dislikedFoods: formData.dietaryDislikes,
                }
                : undefined;

            const fitnessMinutes = parseInt(formData.fitnessMinutesPerDay, 10);
            const fitnessProfile = {
                experienceLevel: formData.fitnessExperience,
                preferredActivities: formData.fitnessActivities,
                equipmentAccess: formData.fitnessEquipment,
                availableMinutesPerDay: Number.isFinite(fitnessMinutes) ? fitnessMinutes : undefined,
            };
            const mealsPerDay = parseInt(formData.mealsPerDay, 10);
            const nowTs = Date.now();

            const partialProfile: Partial<UserProfile> = {
                name: formData.name,
                avatarId: formData.avatarId || 'default',
                age: parseInt(formData.age) || 25,
                gender: formData.gender,
                height: parseInt(formData.height) || 170,
                weight: parseInt(formData.weight) || 70,
                goalWeight: formData.goalWeight ? parseInt(formData.goalWeight) : undefined,
                goal: formData.goal,
                planIntensity: formData.planIntensity,
                activityLevel: formData.activityLevel,
                dietaryPreferences,
                fitnessProfile,
                culinaryIdentity: {
                    origin: formData.origin || t('onboarding.lifestyle.default_origin'),
                    residence: formData.residence || t('onboarding.lifestyle.default_residence'),
                },
                maritalStatus: formData.maritalStatus,
                childrenCount: parseInt(formData.childrenCount) || 0,
                medicalProfile: {
                    conditions: formData.conditions,
                    medications: formData.medications,
                    injuries: formData.injuries,
                    currentStatus: 'healthy',
                },
                workProfile: {
                    type: formData.workType,
                    intensity: formData.workIntensity,
                    role: formData.jobTitle?.trim() || undefined,
                    industry: formData.industry?.trim() || undefined,
                    commuteType: formData.commuteType,
                },
                mealPattern: {
                    mealsPerDay: Number.isFinite(mealsPerDay) ? mealsPerDay : undefined,
                    mealTimes: formData.mealTimes,
                    typicalMeals: formData.typicalMeals,
                    lateNightEating: formData.lateNightEating,
                    lastUpdatedAt: nowTs,
                },
                habits: {
                    smoking: formData.smoking,
                    alcohol: formData.alcohol,
                    vaping: formData.vaping,
                    sugarCravings: formData.sugarCravings,
                    caffeine: formData.caffeine,
                    otherHabits: formData.otherHabits,
                    lastUpdatedAt: nowTs,
                },
                sleepRoutine: {
                    isConsistent: formData.sleepConsistent,
                    targetWakeTime: '07:00',
                    targetBedTime: '23:00',
                    targetDurationHours: 8,
                    wakeWindowMinutes: formData.sleepWakeWindowMinutes,
                    qualityRating: formData.sleepQuality,
                    sleepIssues: sleepIssues.length > 0 ? sleepIssues : undefined,
                },
            };

            // Calculate AI metrics via queue (rate limit protected)
            setCalculatingMessageKey('onboarding.calculating.goals');
            const aiCalculated = await llmQueueService.addJobAndWait<Partial<UserProfile>>('CALCULATE_PROFILE', {
                formData: partialProfile
            }, 'critical');

            const fullProfile: UserProfile = {
                ...partialProfile as UserProfile,
                dailyCalorieTarget: aiCalculated.dailyCalorieTarget || 2000,
                calculatedIdealWeight: aiCalculated.calculatedIdealWeight || 70,
                projectedWeeks: aiCalculated.projectedWeeks || 12,
                weeklyGoalSummary: aiCalculated.weeklyGoalSummary,
                monthlyGoalSummary: aiCalculated.monthlyGoalSummary,
            };

            const today = getLocalDateKey(new Date());
            const targetRefresh = refreshTargetsForProfile(fullProfile, { dateKey: today, force: true });
            const profileWithTargets = targetRefresh.profile;

            // Save profile to storage
            await userProfileService.saveUserProfile(profileWithTargets, { source: 'onboarding' });
            await storage.remove(storage.keys.ONBOARDING_DRAFT);

            // Now generate the first daily plan
            setCalculatingMessageKey('onboarding.calculating.plan');

            // Build initial context for first plan generation
            const initialHistory = {
                food: [] as FoodLogEntry[],
                activity: [] as ActivityLogEntry[],
                mood: [] as MoodLog[],
                weight: [] as WeightLogEntry[],
                water: { date: today, amount: 0 },
                sleep: [] as { date: string, hours: number }[],
            };
            const healthData = await getHealthContextData();
            const bioContext = await getBioContextForAppContext();
            let weatherSnapshot = null;
            try {
                const coords = await locationService.getLastKnownLocation();
                weatherSnapshot = await getWeatherSnapshot({ coords: coords || undefined });
            } catch (error) {
                console.warn('[Onboarding] Failed to load weather snapshot:', error);
            }
            const initialAppContext = {
                weather: weatherSnapshot?.weather || { temp: 20, condition: t('dashboard.weather_clear'), code: 0 },
                currentLocation: weatherSnapshot?.locationName || t('onboarding.location_unknown'),
                ...(healthData ? { healthData } : {}),
                ...(bioContext.bioSnapshot ? { bioSnapshot: bioContext.bioSnapshot } : {}),
                ...(bioContext.bioTrends ? { bioTrends: bioContext.bioTrends } : {}),
                ...(bioContext.bioHistorySummary ? { bioHistorySummary: bioContext.bioHistorySummary } : {}),
            };

            try {
                // Generate plan via queue - will retry on rate limit until done
                const plan = await llmQueueService.addJobAndWait<DailyPlan>('GENERATE_PLAN', {
                    dateKey: today,
                    userProfile: profileWithTargets,
                    foodHistory: initialHistory.food,
                    activityHistory: initialHistory.activity,
                    moodHistory: initialHistory.mood,
                    weightHistory: initialHistory.weight,
                    waterLog: initialHistory.water,
                    sleepHistory: initialHistory.sleep,
                    appContext: initialAppContext,
                    language,
                    currentPlan: null,
                }, 'critical');

                if (plan && plan.items?.length) {
                    // Save plan to storage
                    await storage.set(`${storage.keys.DAILY_PLAN}_${today}`, plan);
                    await storage.set(storage.keys.DAILY_PLAN, plan);

                    // Log analytics
                    analytics.logEvent('onboarding_completed', {
                        total_time_ms: Date.now() - startTimeRef.current,
                        steps_completed: STEPS.length,
                        plan_items_count: plan.items.length,
                    });

                    Alert.alert(
                        t('onboarding.alert.plan_ready_title'),
                        t('onboarding.alert.plan_ready_body', { name: formData.name }),
                        [{ text: t('onboarding.alert.plan_ready_action'), onPress: () => navigation.navigate('MainTabs') }]
                    );
                } else {
                    throw new Error('Empty plan returned');
                }
            } catch (planError) {
                console.warn('First plan generation failed, queueing retry:', planError);

                // Queue background retry
                const history = {
                    food: [],
                    activity: [],
                    mood: [],
                    weight: [],
                    water: { date: today, amount: 0 },
                    sleep: [],
                };
                const appContext = {
                    weather: weatherSnapshot?.weather || { temp: 20, condition: t('dashboard.weather_clear'), code: 0 },
                    currentLocation: weatherSnapshot?.locationName || t('onboarding.location_unknown'),
                    ...(healthData ? { healthData } : {}),
                    ...(bioContext.bioSnapshot ? { bioSnapshot: bioContext.bioSnapshot } : {}),
                    ...(bioContext.bioTrends ? { bioTrends: bioContext.bioTrends } : {}),
                    ...(bioContext.bioHistorySummary ? { bioHistorySummary: bioContext.bioHistorySummary } : {}),
                };
                await queuePlanRetry(profileWithTargets, history, appContext, language, null);

                // Mark that plan is being generated in background
                await storage.set('plan_generation_pending', true);

                Alert.alert(
                    t('onboarding.alert.background_title'),
                    t('onboarding.alert.background_body', { name: formData.name }),
                    [{ text: t('onboarding.alert.background_action'), onPress: () => navigation.navigate('MainTabs') }]
                );
            }
        } catch (error) {
            console.error('Profile creation failed:', error);
            Alert.alert(t('onboarding.alert.profile_failed_title'), t('onboarding.alert.profile_failed_body'));
        } finally {
            setIsCalculating(false);
        }
    };

    const renderFieldError = (field: keyof OnboardingFormData) => {
        const messageKey = fieldErrors[field];
        if (!messageKey) return null;
        return <Text style={styles.errorText}>{t(messageKey)}</Text>;
    };

    const getDietaryLabel = (value: DietaryRestriction) => {
        const option = DIETARY_OPTIONS.find(item => item.value === value);
        return option ? t(option.labelKey) : value;
    };

    const getFitnessActivityLabel = (value: FitnessActivity) => {
        const option = FITNESS_ACTIVITY_OPTIONS.find(item => item.value === value);
        return option ? t(option.labelKey) : value;
    };

    const renderStep = () => {
        switch (currentStep) {
            case 'basics':
                return (
                    <View style={styles.stepContent}>
                        <View style={styles.languageCard}>
                            <Text style={styles.languageLabel}>{t('select_language')}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {AVAILABLE_LANGUAGES.map((langOption) => {
                                    const selected = langOption.code === language;
                                    return (
                                        <TouchableOpacity
                                            key={langOption.code}
                                            style={[styles.langPill, selected && styles.langPillSelected]}
                                            onPress={() => setLanguage(langOption.code)}
                                        >
                                            <Text style={[styles.langText, selected && styles.langTextSelected]}>
                                                {langOption.nativeName}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>

                        <AvatarPicker
                            value={formData.avatarId}
                            onChange={(value) => updateField('avatarId', value)}
                            showTitle
                        />

                        <Text style={styles.stepTitle}>👋 {t('onboarding.basics.title')}</Text>
                        <Text style={styles.stepSubtitle}>{t('onboarding.basics.subtitle')}</Text>

                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.basics.placeholder_name')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={formData.name}
                            onChangeText={(v) => updateField('name', v)}
                        />
                        {renderFieldError('name')}

                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.basics.placeholder_age')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            keyboardType="numeric"
                            value={formData.age}
                            onChangeText={(v) => updateField('age', sanitizeNumericInput(v))}
                        />
                        {renderFieldError('age')}

                        <Text style={styles.label}>{t('onboarding.basics.gender')}</Text>
                        <View style={styles.optionRow}>
                            <OptionButton
                                label={t('onboarding.basics.male')}
                                selected={formData.gender === 'male'}
                                onPress={() => updateField('gender', 'male')}
                            />
                            <OptionButton
                                label={t('onboarding.basics.female')}
                                selected={formData.gender === 'female'}
                                onPress={() => updateField('gender', 'female')}
                            />
                        </View>
                    </View>
                );

            case 'body':
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>📏 {t('onboarding.body.title')}</Text>
                        <Text style={styles.stepSubtitle}>{t('onboarding.body.subtitle')}</Text>

                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.body.placeholder_height')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            keyboardType="numeric"
                            value={formData.height}
                            onChangeText={(v) => updateField('height', sanitizeNumericInput(v))}
                        />
                        {renderFieldError('height')}

                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.body.placeholder_weight')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            keyboardType="numeric"
                            value={formData.weight}
                            onChangeText={(v) => updateField('weight', sanitizeNumericInput(v))}
                        />
                        {renderFieldError('weight')}

                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.body.placeholder_goal_weight')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            keyboardType="numeric"
                            value={formData.goalWeight}
                            onChangeText={(v) => updateField('goalWeight', sanitizeNumericInput(v))}
                        />
                        {renderFieldError('goalWeight')}
                    </View>
                );

            case 'goals':
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>🎯 {t('onboarding.goals.title')}</Text>
                        <Text style={styles.stepSubtitle}>{t('onboarding.goals.subtitle')}</Text>

                        <Text style={styles.label}>{t('onboarding.goals.primary_goal')}</Text>
                        <View style={styles.optionColumn}>
                            <OptionButton
                                label={`🔥 ${t('onboarding.goals.goal_lose')}`}
                                selected={formData.goal === 'lose'}
                                onPress={() => updateField('goal', 'lose')}
                                fullWidth
                            />
                            <OptionButton
                                label={`⚖️ ${t('onboarding.goals.goal_maintain')}`}
                                selected={formData.goal === 'maintain'}
                                onPress={() => updateField('goal', 'maintain')}
                                fullWidth
                            />
                            <OptionButton
                                label={`💪 ${t('onboarding.goals.goal_gain')}`}
                                selected={formData.goal === 'gain'}
                                onPress={() => updateField('goal', 'gain')}
                                fullWidth
                            />
                        </View>

                        <Text style={styles.label}>{t('onboarding.goals.plan_intensity')}</Text>
                        <View style={styles.optionRow}>
                            <OptionButton
                                label={`🐢 ${t('onboarding.goals.intensity_slow')}`}
                                selected={formData.planIntensity === 'slow'}
                                onPress={() => updateField('planIntensity', 'slow')}
                            />
                            <OptionButton
                                label={`🚶 ${t('onboarding.goals.intensity_normal')}`}
                                selected={formData.planIntensity === 'normal'}
                                onPress={() => updateField('planIntensity', 'normal')}
                            />
                            <OptionButton
                                label={`🏃 ${t('onboarding.goals.intensity_fast')}`}
                                selected={formData.planIntensity === 'aggressive'}
                                onPress={() => updateField('planIntensity', 'aggressive')}
                            />
                        </View>
                    </View>
                );

            case 'diet':
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>🥗 {t('onboarding.diet.title')}</Text>
                        <Text style={styles.stepSubtitle}>{t('onboarding.diet.subtitle')}</Text>

                        <Text style={styles.label}>{t('onboarding.diet.restrictions')}</Text>
                        <View style={styles.optionRow}>
                            {DIETARY_OPTIONS.map(option => (
                                <OptionButton
                                    key={option.value}
                                    label={t(option.labelKey)}
                                    selected={formData.dietaryRestrictions.includes(option.value)}
                                    onPress={() => toggleDietaryRestriction(option.value)}
                                />
                            ))}
                        </View>

                        <Text style={styles.label}>{t('onboarding.diet.allergies')}</Text>
                        <View style={styles.tagSection}>
                            <View style={styles.tagRow}>
                                <TextInput
                                    style={[styles.input, styles.tagInput]}
                                    placeholder={t('onboarding.diet.allergies_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={allergyDraft}
                                    onChangeText={setAllergyDraft}
                                />
                                <TouchableOpacity
                                    style={styles.tagAddBtn}
                                    onPress={() => {
                                        addListItem('dietaryAllergies', allergyDraft);
                                        setAllergyDraft('');
                                    }}
                                >
                                    <Text style={styles.tagAddText}>{t('add')}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.chipRow}>
                                {formData.dietaryAllergies.map((allergy) => (
                                    <TouchableOpacity
                                        key={allergy}
                                        style={styles.chip}
                                        onPress={() => removeListItem('dietaryAllergies', allergy)}
                                    >
                                        <Text style={styles.chipText}>{allergy}  ×</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <Text style={styles.label}>{t('onboarding.diet.dislikes')}</Text>
                        <View style={styles.tagSection}>
                            <View style={styles.tagRow}>
                                <TextInput
                                    style={[styles.input, styles.tagInput]}
                                    placeholder={t('onboarding.diet.dislikes_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={dislikeDraft}
                                    onChangeText={setDislikeDraft}
                                />
                                <TouchableOpacity
                                    style={styles.tagAddBtn}
                                    onPress={() => {
                                        addListItem('dietaryDislikes', dislikeDraft);
                                        setDislikeDraft('');
                                    }}
                                >
                                    <Text style={styles.tagAddText}>{t('add')}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.chipRow}>
                                {formData.dietaryDislikes.map((food) => (
                                    <TouchableOpacity
                                        key={food}
                                        style={styles.chip}
                                        onPress={() => removeListItem('dietaryDislikes', food)}
                                    >
                                        <Text style={styles.chipText}>{food}  ×</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>
                );

            case 'fitness':
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>🏃 {t('onboarding.fitness.title')}</Text>
                        <Text style={styles.stepSubtitle}>{t('onboarding.fitness.subtitle')}</Text>

                        <Text style={styles.label}>{t('onboarding.fitness.experience')}</Text>
                        <View style={styles.optionColumn}>
                            <OptionButton
                                label={`${t('onboarding.fitness.beginner')} · ${t('onboarding.fitness.beginner_desc')}`}
                                selected={formData.fitnessExperience === 'beginner'}
                                onPress={() => updateField('fitnessExperience', 'beginner')}
                                fullWidth
                            />
                            <OptionButton
                                label={`${t('onboarding.fitness.intermediate')} · ${t('onboarding.fitness.intermediate_desc')}`}
                                selected={formData.fitnessExperience === 'intermediate'}
                                onPress={() => updateField('fitnessExperience', 'intermediate')}
                                fullWidth
                            />
                            <OptionButton
                                label={`${t('onboarding.fitness.advanced')} · ${t('onboarding.fitness.advanced_desc')}`}
                                selected={formData.fitnessExperience === 'advanced'}
                                onPress={() => updateField('fitnessExperience', 'advanced')}
                                fullWidth
                            />
                        </View>

                        <Text style={styles.label}>{t('onboarding.fitness.activities')}</Text>
                        <View style={styles.optionRow}>
                            {FITNESS_ACTIVITY_OPTIONS.map(option => (
                                <OptionButton
                                    key={option.value}
                                    label={t(option.labelKey)}
                                    selected={formData.fitnessActivities.includes(option.value)}
                                    onPress={() => toggleFitnessActivity(option.value)}
                                />
                            ))}
                        </View>

                        <Text style={styles.label}>{t('onboarding.fitness.equipment')}</Text>
                        <View style={styles.optionRow}>
                            <OptionButton
                                label={t('onboarding.fitness.equipment_none')}
                                selected={formData.fitnessEquipment === 'none'}
                                onPress={() => updateField('fitnessEquipment', 'none')}
                            />
                            <OptionButton
                                label={t('onboarding.fitness.equipment_home')}
                                selected={formData.fitnessEquipment === 'basic_home'}
                                onPress={() => updateField('fitnessEquipment', 'basic_home')}
                            />
                            <OptionButton
                                label={t('onboarding.fitness.equipment_gym')}
                                selected={formData.fitnessEquipment === 'full_gym'}
                                onPress={() => updateField('fitnessEquipment', 'full_gym')}
                            />
                        </View>

                        <Text style={styles.label}>{t('onboarding.fitness.time')}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.fitness.time_minutes', { minutes: 45 })}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            keyboardType="numeric"
                            value={formData.fitnessMinutesPerDay}
                            onChangeText={(v) => updateField('fitnessMinutesPerDay', sanitizeNumericInput(v))}
                        />
                    </View>
                );

            case 'lifestyle':
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>🌍 {t('onboarding.lifestyle.title')}</Text>
                        <Text style={styles.stepSubtitle}>{t('onboarding.lifestyle.subtitle')}</Text>

                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.lifestyle.placeholder_origin')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={formData.origin}
                            onChangeText={(v) => updateField('origin', v)}
                        />

                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.lifestyle.placeholder_residence')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={formData.residence}
                            onChangeText={(v) => updateField('residence', v)}
                        />

                        <Text style={styles.label}>{t('onboarding.lifestyle.activity_level')}</Text>
                        <View style={styles.optionColumn}>
                            <OptionButton
                                label={`🪑 ${t('onboarding.lifestyle.activity_sedentary')}`}
                                selected={formData.activityLevel === 'sedentary'}
                                onPress={() => updateField('activityLevel', 'sedentary')}
                                fullWidth
                            />
                            <OptionButton
                                label={`🚶 ${t('onboarding.lifestyle.activity_light')}`}
                                selected={formData.activityLevel === 'light'}
                                onPress={() => updateField('activityLevel', 'light')}
                                fullWidth
                            />
                            <OptionButton
                                label={`🏃 ${t('onboarding.lifestyle.activity_moderate')}`}
                                selected={formData.activityLevel === 'moderate'}
                                onPress={() => updateField('activityLevel', 'moderate')}
                                fullWidth
                            />
                            <OptionButton
                                label={`🏋️ ${t('onboarding.lifestyle.activity_active')}`}
                                selected={formData.activityLevel === 'active'}
                                onPress={() => updateField('activityLevel', 'active')}
                                fullWidth
                            />
                        </View>
                    </View>
                );

            case 'routine':
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>🧭 {t('onboarding.routine.title')}</Text>
                        <Text style={styles.stepSubtitle}>{t('onboarding.routine.subtitle')}</Text>

                        <Text style={styles.label}>{t('onboarding.routine.work_role_label')}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.routine.work_role_placeholder')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={formData.jobTitle}
                            onChangeText={(v) => updateField('jobTitle', v)}
                        />

                        <Text style={styles.label}>{t('onboarding.routine.work_industry_label')}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.routine.work_industry_placeholder')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={formData.industry}
                            onChangeText={(v) => updateField('industry', v)}
                        />

                        <Text style={styles.label}>{t('onboarding.routine.work_intensity_label')}</Text>
                        <View style={styles.optionRow}>
                            <OptionButton
                                label={t('profile.work_intensity.desk')}
                                selected={formData.workIntensity === 'desk'}
                                onPress={() => updateField('workIntensity', 'desk')}
                            />
                            <OptionButton
                                label={t('profile.work_intensity.standing')}
                                selected={formData.workIntensity === 'standing'}
                                onPress={() => updateField('workIntensity', 'standing')}
                            />
                            <OptionButton
                                label={t('profile.work_intensity.heavy_labor')}
                                selected={formData.workIntensity === 'heavy_labor'}
                                onPress={() => updateField('workIntensity', 'heavy_labor')}
                            />
                        </View>

                        <Text style={styles.label}>{t('onboarding.routine.work_commute_label')}</Text>
                        <View style={styles.optionRow}>
                            <OptionButton
                                label={t('onboarding.routine.commute_none')}
                                selected={formData.commuteType === 'none'}
                                onPress={() => updateField('commuteType', 'none')}
                            />
                            <OptionButton
                                label={t('onboarding.routine.commute_car')}
                                selected={formData.commuteType === 'car'}
                                onPress={() => updateField('commuteType', 'car')}
                            />
                            <OptionButton
                                label={t('onboarding.routine.commute_public')}
                                selected={formData.commuteType === 'public_transit'}
                                onPress={() => updateField('commuteType', 'public_transit')}
                            />
                            <OptionButton
                                label={t('onboarding.routine.commute_walk')}
                                selected={formData.commuteType === 'walking'}
                                onPress={() => updateField('commuteType', 'walking')}
                            />
                            <OptionButton
                                label={t('onboarding.routine.commute_cycle')}
                                selected={formData.commuteType === 'cycling'}
                                onPress={() => updateField('commuteType', 'cycling')}
                            />
                            <OptionButton
                                label={t('onboarding.routine.commute_mixed')}
                                selected={formData.commuteType === 'mixed'}
                                onPress={() => updateField('commuteType', 'mixed')}
                            />
                        </View>

                        <Text style={styles.label}>{t('onboarding.routine.meals_per_day_label')}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.routine.meals_per_day_placeholder')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            keyboardType="numeric"
                            value={formData.mealsPerDay}
                            onChangeText={(v) => updateField('mealsPerDay', sanitizeNumericInput(v))}
                        />
                        {renderFieldError('mealsPerDay')}

                        <Text style={styles.label}>{t('onboarding.routine.meal_times_label')}</Text>
                        <View style={styles.tagSection}>
                            <View style={styles.tagRow}>
                                <TextInput
                                    style={[styles.input, styles.tagInput]}
                                    placeholder={t('onboarding.routine.meal_times_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={mealTimeDraft}
                                    onChangeText={setMealTimeDraft}
                                />
                                <TouchableOpacity
                                    style={styles.tagAddBtn}
                                    onPress={() => {
                                        addListItem('mealTimes', mealTimeDraft);
                                        setMealTimeDraft('');
                                    }}
                                >
                                    <Text style={styles.tagAddText}>{t('add')}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.chipRow}>
                                {formData.mealTimes.map((time) => (
                                    <TouchableOpacity
                                        key={time}
                                        style={styles.chip}
                                        onPress={() => removeListItem('mealTimes', time)}
                                    >
                                        <Text style={styles.chipText}>{time}  ×</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <Text style={styles.label}>{t('onboarding.routine.typical_meals_label')}</Text>
                        <View style={styles.tagSection}>
                            <View style={styles.tagRow}>
                                <TextInput
                                    style={[styles.input, styles.tagInput]}
                                    placeholder={t('onboarding.routine.typical_meals_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={typicalMealDraft}
                                    onChangeText={setTypicalMealDraft}
                                />
                                <TouchableOpacity
                                    style={styles.tagAddBtn}
                                    onPress={() => {
                                        addListItem('typicalMeals', typicalMealDraft);
                                        setTypicalMealDraft('');
                                    }}
                                >
                                    <Text style={styles.tagAddText}>{t('add')}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.chipRow}>
                                {formData.typicalMeals.map((meal) => (
                                    <TouchableOpacity
                                        key={meal}
                                        style={styles.chip}
                                        onPress={() => removeListItem('typicalMeals', meal)}
                                    >
                                        <Text style={styles.chipText}>{meal}  ×</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <Text style={styles.label}>{t('onboarding.routine.late_night_label')}</Text>
                        <View style={styles.optionRow}>
                            <OptionButton
                                label={t('yes')}
                                selected={formData.lateNightEating}
                                onPress={() => updateField('lateNightEating', true)}
                            />
                            <OptionButton
                                label={t('no')}
                                selected={!formData.lateNightEating}
                                onPress={() => updateField('lateNightEating', false)}
                            />
                        </View>

                        <Text style={styles.label}>{t('onboarding.routine.habits_title')}</Text>

                        <Text style={styles.subLabel}>{t('onboarding.routine.habit_smoking')}</Text>
                        <View style={styles.optionRow}>
                            {(['none', 'occasional', 'weekly', 'daily'] as const).map(value => (
                                <OptionButton
                                    key={`smoking-${value}`}
                                    label={t(`onboarding.routine.habit_${value}`)}
                                    selected={formData.smoking === value}
                                    onPress={() => updateField('smoking', value)}
                                />
                            ))}
                        </View>

                        <Text style={styles.subLabel}>{t('onboarding.routine.habit_alcohol')}</Text>
                        <View style={styles.optionRow}>
                            {(['none', 'occasional', 'weekly', 'daily'] as const).map(value => (
                                <OptionButton
                                    key={`alcohol-${value}`}
                                    label={t(`onboarding.routine.habit_${value}`)}
                                    selected={formData.alcohol === value}
                                    onPress={() => updateField('alcohol', value)}
                                />
                            ))}
                        </View>

                        <Text style={styles.subLabel}>{t('onboarding.routine.habit_vaping')}</Text>
                        <View style={styles.optionRow}>
                            {(['none', 'occasional', 'weekly', 'daily'] as const).map(value => (
                                <OptionButton
                                    key={`vaping-${value}`}
                                    label={t(`onboarding.routine.habit_${value}`)}
                                    selected={formData.vaping === value}
                                    onPress={() => updateField('vaping', value)}
                                />
                            ))}
                        </View>

                        <Text style={styles.subLabel}>{t('onboarding.routine.habit_sugar')}</Text>
                        <View style={styles.optionRow}>
                            {(['low', 'moderate', 'high'] as const).map(value => (
                                <OptionButton
                                    key={`sugar-${value}`}
                                    label={t(`onboarding.routine.habit_sugar_${value}`)}
                                    selected={formData.sugarCravings === value}
                                    onPress={() => updateField('sugarCravings', value)}
                                />
                            ))}
                        </View>

                        <Text style={styles.subLabel}>{t('onboarding.routine.habit_caffeine')}</Text>
                        <View style={styles.optionRow}>
                            {(['none', '1_2', '3_4', '5_plus'] as const).map(value => (
                                <OptionButton
                                    key={`caffeine-${value}`}
                                    label={t(`onboarding.routine.habit_caffeine_${value}`)}
                                    selected={formData.caffeine === value}
                                    onPress={() => updateField('caffeine', value)}
                                />
                            ))}
                        </View>

                        <Text style={styles.subLabel}>{t('onboarding.routine.habit_other')}</Text>
                        <View style={styles.tagSection}>
                            <View style={styles.tagRow}>
                                <TextInput
                                    style={[styles.input, styles.tagInput]}
                                    placeholder={t('onboarding.routine.habit_other_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={otherHabitDraft}
                                    onChangeText={setOtherHabitDraft}
                                />
                                <TouchableOpacity
                                    style={styles.tagAddBtn}
                                    onPress={() => {
                                        addListItem('otherHabits', otherHabitDraft);
                                        setOtherHabitDraft('');
                                    }}
                                >
                                    <Text style={styles.tagAddText}>{t('add')}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.chipRow}>
                                {formData.otherHabits.map((habit) => (
                                    <TouchableOpacity
                                        key={habit}
                                        style={styles.chip}
                                        onPress={() => removeListItem('otherHabits', habit)}
                                    >
                                        <Text style={styles.chipText}>{habit}  ×</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>
                );

            case 'sleep':
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>😴 {t('onboarding.sleep.title')}</Text>
                        <Text style={styles.stepSubtitle}>{t('onboarding.sleep.subtitle')}</Text>

                        <Text style={styles.label}>{t('onboarding.sleep.quality')}</Text>
                        <View style={styles.optionRow}>
                            {[1, 2, 3, 4, 5].map((value) => (
                                <OptionButton
                                    key={value}
                                    label={t(`onboarding.sleep.quality_${value}`)}
                                    selected={formData.sleepQuality === value}
                                    onPress={() => updateField('sleepQuality', value as OnboardingFormData['sleepQuality'])}
                                />
                            ))}
                        </View>

                        <Text style={styles.label}>{t('onboarding.sleep.issues')}</Text>
                        <View style={styles.optionRow}>
                            {SLEEP_ISSUE_OPTIONS.map(option => (
                                <OptionButton
                                    key={option.value}
                                    label={t(option.labelKey)}
                                    selected={formData.sleepIssues.includes(option.value)}
                                    onPress={() => toggleSleepIssue(option.value)}
                                />
                            ))}
                        </View>

                        <Text style={styles.label}>{t('onboarding.sleep.wake_window')}</Text>
                        <View style={styles.optionRow}>
                            {[15, 30, 45, 60].map((minutes) => (
                                <OptionButton
                                    key={minutes}
                                    label={t('onboarding.sleep.wake_window_minutes', { minutes })}
                                    selected={formData.sleepWakeWindowMinutes === minutes}
                                    onPress={() => updateField('sleepWakeWindowMinutes', minutes)}
                                />
                            ))}
                        </View>

                        <Text style={styles.label}>{t('onboarding.sleep.consistency')}</Text>
                        <View style={styles.optionRow}>
                            <OptionButton
                                label={t('yes')}
                                selected={formData.sleepConsistent}
                                onPress={() => updateField('sleepConsistent', true)}
                            />
                            <OptionButton
                                label={t('no')}
                                selected={!formData.sleepConsistent}
                                onPress={() => updateField('sleepConsistent', false)}
                            />
                        </View>
                    </View>
                );

            case 'health':
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>{t('onboarding.health.title')}</Text>
                        <Text style={styles.stepSubtitle}>{t('onboarding.health.description')}</Text>
                        <Text style={styles.label}>{t('onboarding.health.privacy')}</Text>
                        <Text style={styles.label}>{t('onboarding.health.data_types_title')}</Text>
                        <Text style={styles.subLabel}>{t('onboarding.health.data_types_list')}</Text>
                        <Text style={styles.subLabel}>{t('onboarding.health.share_ai_note')}</Text>

                        <TouchableOpacity
                            style={styles.nextBtn}
                            onPress={handleHealthConnectSetup}
                        >
                            <Text style={styles.nextBtnText}>{t('onboarding.health.connect')}</Text>
                        </TouchableOpacity>
                        {Platform.OS === 'android' && (
                            <TouchableOpacity
                                style={styles.secondaryBtn}
                                onPress={handleOpenHealthConnectShortcut}
                            >
                                <Text style={styles.secondaryBtnText}>{t('onboarding.health.open_health_connect')}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.backBtn} onPress={nextStep}>
                            <Text style={styles.backBtnText}>{t('onboarding.health.skip')}</Text>
                        </TouchableOpacity>
                    </View>
                );

            case 'medical':
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>💊 {t('onboarding.medical.title')}</Text>
                        <Text style={styles.stepSubtitle}>{t('onboarding.medical.subtitle')}</Text>

                        <Text style={styles.label}>{t('onboarding.medical.work_type')}</Text>
                        <View style={styles.optionColumn}>
                            <OptionButton
                                label={`🏢 ${t('onboarding.medical.work_fixed')}`}
                                selected={formData.workType === 'fixed_9_5'}
                                onPress={() => updateField('workType', 'fixed_9_5')}
                                fullWidth
                            />
                            <OptionButton
                                label={`🌙 ${t('onboarding.medical.work_night')}`}
                                selected={formData.workType === 'night_shift'}
                                onPress={() => updateField('workType', 'night_shift')}
                                fullWidth
                            />
                            <OptionButton
                                label={`🔄 ${t('onboarding.medical.work_rotating')}`}
                                selected={formData.workType === 'rotating'}
                                onPress={() => updateField('workType', 'rotating')}
                                fullWidth
                            />
                            <OptionButton
                                label={`🏠 ${t('onboarding.medical.work_flexible')}`}
                                selected={formData.workType === 'flexible'}
                                onPress={() => updateField('workType', 'flexible')}
                                fullWidth
                            />
                        </View>

                        <Text style={styles.label}>{t('onboarding.medical.family_status')}</Text>
                        <View style={styles.optionRow}>
                            <OptionButton
                                label={t('onboarding.medical.single')}
                                selected={formData.maritalStatus === 'single'}
                                onPress={() => updateField('maritalStatus', 'single')}
                            />
                            <OptionButton
                                label={t('onboarding.medical.partner')}
                                selected={formData.maritalStatus === 'partner'}
                                onPress={() => updateField('maritalStatus', 'partner')}
                            />
                            <OptionButton
                                label={t('onboarding.medical.married')}
                                selected={formData.maritalStatus === 'married'}
                                onPress={() => updateField('maritalStatus', 'married')}
                            />
                        </View>

                        <TextInput
                            style={styles.input}
                            placeholder={t('onboarding.medical.children_placeholder')}
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            keyboardType="numeric"
                            value={formData.childrenCount}
                            onChangeText={(v) => updateField('childrenCount', sanitizeNumericInput(v))}
                        />
                        {renderFieldError('childrenCount')}

                        <Text style={styles.label}>{t('onboarding.medical.chronic_question')}</Text>
                        <View style={styles.optionRow}>
                            <OptionButton
                                label={t('yes')}
                                selected={hasChronicConditions}
                                onPress={() => setHasChronicConditions(true)}
                            />
                            <OptionButton
                                label={t('no')}
                                selected={!hasChronicConditions}
                                onPress={() => {
                                    setHasChronicConditions(false);
                                    setConditionDraft('');
                                    updateField('conditions', []);
                                }}
                            />
                        </View>
                        {hasChronicConditions && (
                            <View style={styles.tagSection}>
                                <View style={styles.tagRow}>
                                    <TextInput
                                        style={[styles.input, styles.tagInput]}
                                        placeholder={t('onboarding.medical.chronic_placeholder')}
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        value={conditionDraft}
                                        onChangeText={setConditionDraft}
                                    />
                                    <TouchableOpacity
                                        style={styles.tagAddBtn}
                                        onPress={() => {
                                            addListItem('conditions', conditionDraft);
                                            setConditionDraft('');
                                        }}
                                    >
                                        <Text style={styles.tagAddText}>{t('add')}</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.chipRow}>
                                    {formData.conditions.map((condition) => (
                                        <TouchableOpacity
                                            key={condition}
                                            style={styles.chip}
                                            onPress={() => removeListItem('conditions', condition)}
                                        >
                                            <Text style={styles.chipText}>{condition}  ×</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        <Text style={styles.label}>{t('onboarding.medical.medications_question')}</Text>
                        <View style={styles.optionRow}>
                            <OptionButton
                                label={t('yes')}
                                selected={hasMedications}
                                onPress={() => setHasMedications(true)}
                            />
                            <OptionButton
                                label={t('no')}
                                selected={!hasMedications}
                                onPress={() => {
                                    setHasMedications(false);
                                    setMedicationDraft('');
                                    updateField('medications', []);
                                }}
                            />
                        </View>
                        {hasMedications && (
                            <View style={styles.tagSection}>
                                <View style={styles.tagRow}>
                                    <TextInput
                                        style={[styles.input, styles.tagInput]}
                                        placeholder={t('onboarding.medical.medications_placeholder')}
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        value={medicationDraft}
                                        onChangeText={setMedicationDraft}
                                    />
                                    <TouchableOpacity
                                        style={styles.tagAddBtn}
                                        onPress={() => {
                                            addListItem('medications', medicationDraft);
                                            setMedicationDraft('');
                                        }}
                                    >
                                        <Text style={styles.tagAddText}>{t('add')}</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.chipRow}>
                                    {formData.medications.map((med) => (
                                        <TouchableOpacity
                                            key={med}
                                            style={styles.chip}
                                            onPress={() => removeListItem('medications', med)}
                                        >
                                            <Text style={styles.chipText}>{med}  ×</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        <Text style={styles.label}>{t('onboarding.medical.injuries_question')}</Text>
                        <View style={styles.optionRow}>
                            <OptionButton
                                label={t('yes')}
                                selected={hasInjuries}
                                onPress={() => setHasInjuries(true)}
                            />
                            <OptionButton
                                label={t('no')}
                                selected={!hasInjuries}
                                onPress={() => {
                                    setHasInjuries(false);
                                    setInjuryDraft('');
                                    updateField('injuries', []);
                                }}
                            />
                        </View>
                        {hasInjuries && (
                            <View style={styles.tagSection}>
                                <View style={styles.tagRow}>
                                    <TextInput
                                        style={[styles.input, styles.tagInput]}
                                        placeholder={t('onboarding.medical.injuries_placeholder')}
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        value={injuryDraft}
                                        onChangeText={setInjuryDraft}
                                    />
                                    <TouchableOpacity
                                        style={styles.tagAddBtn}
                                        onPress={() => {
                                            addListItem('injuries', injuryDraft);
                                            setInjuryDraft('');
                                        }}
                                    >
                                        <Text style={styles.tagAddText}>{t('add')}</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.chipRow}>
                                    {formData.injuries.map((injury) => (
                                        <TouchableOpacity
                                            key={injury}
                                            style={styles.chip}
                                            onPress={() => removeListItem('injuries', injury)}
                                        >
                                            <Text style={styles.chipText}>{injury}  ×</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                );

            case 'complete': {
                const dietSummary = formData.dietaryRestrictions.filter(item => item !== 'none');
                const fitnessSummary = formData.fitnessActivities;
                const sleepIssuesSummary = formData.sleepIssues.filter(item => item !== 'none');
                return (
                    <View style={[styles.stepContent, styles.completeContent]}>
                        <Text style={styles.completeEmoji}>🎉</Text>
                        <Text style={styles.stepTitle}>{t('onboarding.complete.title')}</Text>
                        <Text style={styles.stepSubtitle}>
                            {t('onboarding.complete.subtitle')}
                        </Text>

                        <View style={styles.summaryCard}>
                            <Text style={styles.summaryTitle}>{t('onboarding.complete.summary_title')}</Text>
                            <SummaryItem label={t('onboarding.complete.summary_name')} value={formData.name} />
                            <SummaryItem label={t('onboarding.complete.summary_age')} value={`${formData.age} ${t('onboarding.complete.years')}`} />
                            <SummaryItem label={t('onboarding.complete.summary_height')} value={`${formData.height} ${t('units.cm')}`} />
                            <SummaryItem label={t('onboarding.complete.summary_weight')} value={`${formData.weight} ${t('units.kg')}`} />
                            <SummaryItem
                                label={t('onboarding.complete.summary_goal')}
                                value={
                                    formData.goal === 'lose'
                                        ? t('onboarding.goals.goal_lose')
                                        : formData.goal === 'gain'
                                            ? t('onboarding.goals.goal_gain')
                                            : t('onboarding.goals.goal_maintain')
                                }
                            />
                            <SummaryItem
                                label={t('onboarding.complete.summary_activity')}
                                value={
                                    formData.activityLevel === 'sedentary'
                                        ? t('onboarding.lifestyle.activity_sedentary')
                                        : formData.activityLevel === 'light'
                                            ? t('onboarding.lifestyle.activity_light')
                                            : formData.activityLevel === 'active'
                                            ? t('onboarding.lifestyle.activity_active')
                                            : t('onboarding.lifestyle.activity_moderate')
                                }
                            />
                            {dietSummary.length > 0 && (
                                <SummaryItem
                                    label={t('onboarding.diet.restrictions')}
                                    value={dietSummary.map(getDietaryLabel).join(', ')}
                                />
                            )}
                            {fitnessSummary.length > 0 && (
                                <SummaryItem
                                    label={t('onboarding.fitness.activities')}
                                    value={fitnessSummary.map(getFitnessActivityLabel).join(', ')}
                                />
                            )}
                            {sleepIssuesSummary.length > 0 && (
                                <SummaryItem
                                    label={t('onboarding.sleep.issues')}
                                    value={sleepIssuesSummary.map(item => t(`onboarding.sleep.issue_${item}`)).join(', ')}
                                />
                            )}
                        </View>
                    </View>
                );
            }

        }
    };

    const canProceed = () => {
        switch (currentStep) {
            case 'basics': return formData.name.length > 0 && formData.age.length > 0;
            case 'body': return formData.height.length > 0 && formData.weight.length > 0;
            case 'goals': return true;
            case 'diet': return true;
            case 'fitness': return true;
            case 'lifestyle': return true;
            case 'routine': {
                const meals = parseInt(formData.mealsPerDay, 10);
                return Number.isFinite(meals) && meals > 0;
            }
            case 'sleep': return true;
            case 'health': return true;
            case 'medical': return true;
            case 'complete': return true;
            default: return false;
        }
    };

    const progress = ((STEPS.indexOf(currentStep) + 1) / STEPS.length) * 100;

    return (
        <SafeAreaView style={styles.container}>
            {/* Loading Overlay */}
            <Modal
                visible={isCalculating}
                transparent
                animationType="fade"
            >
                <View style={styles.loadingOverlay}>
                    <View style={styles.loadingCard}>
                        <ActivityIndicator size="large" color="#06b6d4" />
                        <Text style={styles.loadingTitle}>{t(calculatingMessageKey)}</Text>
                        <Text style={styles.loadingSubtitle}>{t('onboarding.calculating.subtitle')}</Text>
                    </View>
                </View>
            </Modal>

            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
            >
                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${progress}%` }]} />
                    </View>
                    <Text style={styles.progressText}>
                        {t('step')} {STEPS.indexOf(currentStep) + 1}/{STEPS.length}
                    </Text>
                </View>

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.stepWrapper}>
                        {renderStep()}
                    </View>
                </ScrollView>

                {/* Navigation Buttons */}
                <View style={styles.navButtons}>
                    {currentStep !== 'basics' && (
                        <TouchableOpacity
                            style={styles.backBtn}
                            onPress={prevStep}
                            accessibilityLabel={t('back')}
                            accessibilityRole="button"
                            accessibilityHint={t('onboarding.accessibility.prev_hint')}
                        >
                            <Text style={styles.backBtnText}>{t('back')}</Text>
                        </TouchableOpacity>
                    )}

                    {currentStep === 'complete' ? (
                        <TouchableOpacity
                            style={[styles.nextBtn, styles.completeBtn]}
                            onPress={handleComplete}
                            disabled={isCalculating}
                            accessibilityLabel={isCalculating ? t('onboarding.accessibility.creating_plan') : t('create_my_plan')}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: isCalculating, busy: isCalculating }}
                        >
                            {isCalculating ? (
                                <ActivityIndicator color="#020617" />
                            ) : (
                                <Text style={styles.nextBtnText}>{t('create_my_plan')}</Text>
                            )}
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
                            onPress={nextStep}
                            disabled={!canProceed()}
                            accessibilityLabel={t('next')}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !canProceed() }}
                            accessibilityHint={t('onboarding.accessibility.next_hint')}
                        >
                            <Text style={styles.nextBtnText}>{t('next')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

// Sub-components
const OptionButton: React.FC<{
    label: string;
    selected: boolean;
    onPress: () => void;
    fullWidth?: boolean;
}> = ({ label, selected, onPress, fullWidth }) => (
    <TouchableOpacity
        style={[
            styles.optionBtn,
            selected && styles.optionBtnSelected,
            fullWidth && styles.optionBtnFullWidth
        ]}
        onPress={onPress}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ selected }}
    >
        <Text style={[styles.optionBtnText, selected && styles.optionBtnTextSelected]}>
            {label}
        </Text>
    </TouchableOpacity>
);

const SummaryItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    loadingOverlay: {
        flex: 1,
        backgroundColor: 'rgba(2, 6, 23, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingCard: {
        backgroundColor: '#0f172a',
        borderRadius: 24,
        padding: 40,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.3)',
        maxWidth: 300,
    },
    loadingTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 20,
        textAlign: 'center',
    },
    loadingSubtitle: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
    },
    keyboardView: {
        flex: 1,
    },
    progressContainer: {
        padding: 20,
        paddingBottom: 0,
    },
    progressBar: {
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#06b6d4',
        borderRadius: 3,
    },
    progressText: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 12,
        marginTop: 8,
        textAlign: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 60,
        flexGrow: 1,
    },
    stepWrapper: {
        width: '100%',
        maxWidth: 640,
        alignSelf: 'center',
    },
    stepContent: {
        width: '100%',
    },
    stepTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
    },
    stepSubtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 32,
    },
    label: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        marginTop: 20,
        marginBottom: 12,
    },
    subLabel: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 10,
    },
    languageCard: {
        width: '100%',
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 18,
    },
    languageLabel: {
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: 10,
    },
    langPill: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        marginRight: 8,
    },
    langPillSelected: {
        backgroundColor: '#06b6d4',
        borderColor: '#06b6d4',
    },
    langText: {
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '600',
    },
    langTextSelected: {
        color: '#020617',
    },
    input: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#ffffff',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    errorText: {
        color: '#f87171',
        fontSize: 12,
        marginBottom: 10,
        marginTop: -6,
    },
    tagSection: {
        marginTop: 10,
    },
    tagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    tagInput: {
        flex: 1,
        marginBottom: 0,
    },
    tagAddBtn: {
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        borderWidth: 1,
        borderColor: '#06b6d4',
    },
    tagAddText: {
        color: '#06b6d4',
        fontWeight: '700',
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
    },
    chip: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    chipText: {
        color: 'rgba(255, 255, 255, 0.85)',
        fontWeight: '600',
    },
    optionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    optionColumn: {
        gap: 10,
    },
    optionBtn: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    optionBtnFullWidth: {
        width: '100%',
    },
    optionBtnSelected: {
        backgroundColor: 'rgba(6, 182, 212, 0.2)',
        borderColor: '#06b6d4',
    },
    optionBtnText: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 15,
    },
    optionBtnTextSelected: {
        color: '#06b6d4',
        fontWeight: '600',
    },
    navButtons: {
        flexDirection: 'row',
        padding: 20,
        gap: 12,
    },
    backBtn: {
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    secondaryBtn: {
        marginTop: 12,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.4)',
        backgroundColor: 'rgba(6, 182, 212, 0.12)',
    },
    backBtnText: {
        color: '#ffffff',
        fontSize: 16,
    },
    secondaryBtnText: {
        color: '#06b6d4',
        fontSize: 14,
        fontWeight: '600',
    },
    nextBtn: {
        flex: 1,
        paddingVertical: 18,
        borderRadius: 12,
        backgroundColor: '#06b6d4',
        alignItems: 'center',
    },
    nextBtnDisabled: {
        opacity: 0.5,
    },
    nextBtnText: {
        color: '#020617',
        fontSize: 16,
        fontWeight: '600',
    },
    completeBtn: {
        backgroundColor: '#22c55e',
    },
    completeContent: {
        alignItems: 'center',
    },
    completeEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    summaryCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 20,
        width: '100%',
        marginTop: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    summaryTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: 16,
    },
    summaryItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    summaryLabel: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 14,
    },
    summaryValue: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '500',
    },
});

export default OnboardingScreen;
