// Dashboard Screen - Main app screen with full functionality
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
    Dimensions, RefreshControl, SafeAreaView, Alert, ActivityIndicator, DeviceEventEmitter, AppState
} from 'react-native';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
    UserProfile, DailyPlan, AppContext, PlanItem,
    FoodLogEntry, ActivityLogEntry, MoodLog, WeightLogEntry, DailyWrapUp,
    FoodAnalysisResult, NotificationPlanMode, UserContextState, SavedMeal
} from '../types';
import storage, { addWaterForDate, getWaterAmountForDate, setWaterAmountForDate } from '../services/storageService';
import { fetchLocalWeather, fetchLocationName } from '../services/weatherService';
import { generateDailyPlan, generateDailyWrapUp, analyzeTextFood, generateRecipeForMeal } from '../services/geminiService';
import { llmQueueService } from '../services/llmQueueService';
import { OfflineProxyService, PlanGenerationError } from '../services/OfflineProxyService';
import { mergePlanPreservingCompletedAndPast } from '../services/planMerge';
import { logMealOnly, replaceAndLogMeal, buildFoodFromFavorite } from '../services/mealReplacementService';
import * as Location from 'expo-location';
import { getLocalDateKey, buildLocalDateTimeFromKey } from '../utils/dateUtils';
import { ActionModal, PermissionModal, QueueStatusBadge, PlanGenerationBanner } from '../components';
import { BatteryWidget } from '../components/BatteryWidget';
import { BioWidget } from '../components/BioWidget';
import { DailyWrapUpModal } from '../components/DailyWrapUpModal';
import { clearNotificationType, scheduleNotification, schedulePlanNotifications, scheduleNightlyWrapUpReminder, requestNotificationPermission } from '../services/notificationService';
import { useEnergy } from '../contexts/EnergyContext';
import { useLanguage } from '../contexts/LanguageContext';
import useLocationPermission from '../hooks/useLocationPermission';
import { ENERGY_COSTS } from '../types';
import { sleepService } from '../services/sleepService';
import sleepHoursService, { type SleepHoursEntry } from '../services/sleepHoursService';
import { sleepSessionService } from '../services/sleepSessionService';
import { getHealthContextData, getBioContextForAppContext } from '../services/healthContextService';
import { getSleepDrafts, confirmSleepDraft, discardSleepDraft, applyPendingSleepCompletion, updateSleepDraftTimes } from '../services/sleepEventService';
import type { SleepDraft } from '../services/sleepDraftService';
import type { ContextSnapshot } from '../services/contextTypes';
import { ReviewService } from '../services/ReviewService';
import { shareText, shareView } from '../services/ShareService';
import { ShareCard } from '../components/ShareCard';
import { captureRef } from 'react-native-view-shot';
import { reportColdStartComplete, createScreenTracker, timeAsync } from '../services/performanceService';
import { processPendingActions, setupOverlayActionListener } from '../services/overlayActionService';
import * as overlayService from '../services/overlayService';
import { ProgressDetailModal } from '../components/ProgressDetailModal';
import {
    completeItemWithSync,
    skipItemWithSync,
    cancelAllRemindersForItem,
    storeFailedAction,
    uncompleteItemWithSync,
} from '../services/actionSyncService';
import { getActiveDayKey, maybeAdvanceActiveDay } from '../services/dayBoundaryService';
import { energyService } from '../services/energyService';
import { WidgetService } from '../services/WidgetService';
import userProfileService from '../services/userProfileService';
import { refreshTargetsForProfile } from '../services/targetService';
 
const { width } = Dimensions.get('window');
 
type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
 
 
type DashboardRouteProp = RouteProp<RootStackParamList, 'Dashboard'>;
 
 
const DashboardScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const shareViewRef = React.useRef(null);
    const route = useRoute<DashboardRouteProp>();
    const { energy, canAfford, showAdRecharge } = useEnergy();
    const { t, language } = useLanguage();
    const { foregroundStatus, openForegroundDisclosure } = useLocationPermission();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [useMetric, setUseMetric] = useState(true);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [notificationPlanMode, setNotificationPlanMode] = useState<NotificationPlanMode>('high');
    const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
    const [viewingPlan, setViewingPlan] = useState<DailyPlan | null>(null);
    const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
    const [appContext, setAppContext] = useState<AppContext>({
        weather: { temp: 20, condition: t('dashboard.weather_clear'), code: 0 },
        currentLocation: t('dashboard.location_loading'),
        userContextState: 'resting' as UserContextState,
        contextDetails: {
            environment: 'unknown',
            locationType: 'unknown',
        },
    });
    const [refreshing, setRefreshing] = useState(false);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
    const [dailyStats, setDailyStats] = useState({
        calories: 0,
        protein: 0,
        water: 0,
        sleep: 0
    });
    const [dailyTargets, setDailyTargets] = useState({
        calories: 0,
        protein: 0,
        waterMl: 0,
    });
    const [sleepDrafts, setSleepDrafts] = useState<SleepDraft[]>([]);
 
    // Date navigation state
    const [viewingDate, setViewingDate] = useState(new Date());
    const [fallbackPlanDateKey, setFallbackPlanDateKey] = useState<string | null>(null);
    const [manualDateOverride, setManualDateOverride] = useState(false);
 
    // Plan refinement state  
    const [showRefinementInput, setShowRefinementInput] = useState(false);
    const [refinementFeedback, setRefinementFeedback] = useState('');
    const [isRefiningPlan, setIsRefiningPlan] = useState(false);
 
    // Modal states
    const [showActionModal, setShowActionModal] = useState(false);
    const [actionModalType, setActionModalType] = useState<'plan_reminder' | 'weight_check' | 'unplanned_activity' | 'log_water' | 'log_food'>('plan_reminder');
    const [pendingReminder, setPendingReminder] = useState<PlanItem | null>(null);
    const [showWrapUpModal, setShowWrapUpModal] = useState(false);
    const [wrapUpData, setWrapUpData] = useState<DailyWrapUp | null>(null);
    const [wrapUpShownToday, setWrapUpShownToday] = useState(false);
    const [mealDetailItem, setMealDetailItem] = useState<PlanItem | null>(null);
    const [mealDetailPlanDateKey, setMealDetailPlanDateKey] = useState<string | null>(null);
    const [recipeLoading, setRecipeLoading] = useState(false);
    const [altMealText, setAltMealText] = useState('');
    const [altMealResult, setAltMealResult] = useState<FoodAnalysisResult | null>(null);
    const [altMealLoading, setAltMealLoading] = useState(false);
    const [showProgressDetail, setShowProgressDetail] = useState(false);
    const [todayKey, setTodayKey] = useState(() => getLocalDateKey(new Date()));
    const viewingKey = useMemo(() => getLocalDateKey(viewingDate), [viewingDate]);
    const isToday = viewingKey === todayKey;
    const isPast = viewingKey < todayKey;
    const isFuture = viewingKey > todayKey;
    const planStorageKey = (dateKey: string) => `${storage.keys.DAILY_PLAN}_${dateKey}`;
    const isValidDateKey = (key: string | undefined | null) => !!key && /^\d{4}-\d{2}-\d{2}$/.test(key);
    const dateFromKey = (dateKey: string): Date => {
        const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return new Date();
        const [, y, m, d] = match;
        return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
    };
    const getPlanItemTypeLabel = (type?: string) => {
        if (!type) return '';
        const key = `dashboard.plan_type.${type}`;
        const label = t(key);
        return label === key ? type : label;
    };
    const getFoodSourceLabel = (source: string) => {
        const key = `food.log.source.${source}`;
        const translated = t(key);
        return translated === key ? source : translated;
    };
    const buildFoodDescriptionWithSource = (description: string, source: string) =>
        t('food.log.description_with_source', {
            description,
            source: getFoodSourceLabel(source),
        });
    const buildFoodDescriptionWithMacros = (description: string, calories: number, protein: number) =>
        t('food.log.description_with_macros', {
            description,
            calories: Math.round(calories),
            protein: Math.round(protein),
        });
    const formatSleepDraftTime = (timestamp?: number) => {
        if (!timestamp) return t('common.not_applicable');
        return new Date(timestamp).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' });
    };
    const formatSleepDraftHours = (hours?: number) => {
        if (!hours || !Number.isFinite(hours)) return t('common.not_applicable');
        return t('sleep.duration', { hours: Math.floor(hours), minutes: Math.round((hours - Math.floor(hours)) * 60) });
    };
    const getSleepDraftStatusLabel = (draft: SleepDraft) => (
        draft.state === 'pending_sleep'
            ? t('sleep_draft.pending_sleep')
            : t('sleep_draft.pending_review')
    );
    const resolveSleepHoursForDate = async (
        sleepHistory: SleepHoursEntry[],
        dateKey: string,
        todayKeyNow: string
    ): Promise<number> => {
        if (dateKey === todayKeyNow) {
            try {
                const lastNight = await sleepSessionService.getLastNightSleep();
                if (lastNight && lastNight.nightHours > 0) {
                    return lastNight.nightHours;
                }
            } catch (e) {
                console.warn('[Dashboard] Failed to load last night sleep:', e);
            }
        }

        const entry = sleepHistory.find(s => s.date === dateKey);
        if (entry) return entry.hours;

        if (dateKey === todayKeyNow && sleepHistory.length > 0) {
            return sleepHistory[sleepHistory.length - 1]?.hours || 0;
        }

        return 0;
    };
    const handleConfirmSleepDraft = (draft: SleepDraft) => {
        Alert.alert(
            t('sleep_draft.confirm_title'),
            t('sleep_draft.confirm_body', { duration: formatSleepDraftHours(draft.durationHours) }),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('sleep_draft.confirm_action'),
                    onPress: async () => {
                        await confirmSleepDraft(draft.id);
                        await loadData();
                    },
                },
            ]
        );
    };

    const handleDiscardSleepDraft = (draft: SleepDraft) => {
        Alert.alert(
            t('sleep_draft.discard_title'),
            t('sleep_draft.discard_body'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('sleep_draft.discard_action'),
                    style: 'destructive',
                    onPress: async () => {
                        await discardSleepDraft(draft.id);
                        await loadData();
                    },
                },
            ]
        );
    };

    const handleEndSleepNow = async (draft: SleepDraft) => {
        await updateSleepDraftTimes(draft.id, draft.sleepStartTime, Date.now());
        await loadData();
    };

    const handleEditSleepDraft = (draft: SleepDraft) => {
        navigation.navigate('SleepEdit', { draftId: draft.id });
    };
 
    // Permission state (legacy per-item reminders)
    const [showPermissionModal, setShowPermissionModal] = useState(false);
    const [itemToRemind, setItemToRemind] = useState<PlanItem | null>(null);
    const [reminderPlanDateKey, setReminderPlanDateKey] = useState<string | null>(null);
 
    const stableHash = (input: string) => {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            hash = (hash << 5) - hash + input.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    };
 
    const stablePlanItemId = (planDateKey: string, time: string, type: string, title: string, idx: number) =>
        `plan-${planDateKey}-${time}-${stableHash(`${type}|${title}|${idx}`)}`;
 
    const sanitizePlan = (
        plan: DailyPlan | null,
        dateKey: string,
        options?: { forceDateKey?: boolean }
    ): DailyPlan | null => {
        if (!plan) return null;
        const source = plan.source;
        if (source && source !== 'cloud' && source !== 'cloud_retry') {
            return null;
        }
        const planDate = (options?.forceDateKey && isValidDateKey(dateKey))
            ? dateKey
            : (isValidDateKey(plan.date) ? plan.date : dateKey);
        const normalized: PlanItem[] = (plan.items || [])
            .map((item, idx): PlanItem | null => {
                const match = item.time?.trim().match(/^(\d{1,2}):(\d{2})$/);
                const h = match ? Number(match[1]) : NaN;
                const m = match ? Number(match[2]) : NaN;
                const validTime = !Number.isNaN(h) && !Number.isNaN(m) && h >= 0 && h < 24 && m >= 0 && m < 60;
                const time = validTime ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null;
                if (!time) return null;
                const skipped = item.skipped ?? false;
                const completed = item.completed ?? false;
                const missed = item.missed ?? false;
                const scheduledAt = buildLocalDateTimeFromKey(planDate, time)?.getTime();
                const completedAtRaw = typeof (item as any).completedAt === 'number' ? (item as any).completedAt : undefined;
                const skippedAtRaw = typeof (item as any).skippedAt === 'number' ? (item as any).skippedAt : undefined;
                const missedAtRaw = typeof (item as any).missedAt === 'number' ? (item as any).missedAt : undefined;
                const completedAt = completed ? completedAtRaw : undefined;
                const skippedAt = skipped ? skippedAtRaw : undefined;
                return {
                    ...item,
                    id: (item.id && String(item.id).trim())
                        ? item.id
                        : stablePlanItemId(planDate, time, String(item.type || 'item'), String(item.title || ''), idx),
                    time,
                    scheduledAt,
                    completed,
                    skipped,
                    missed,
                    completedAt,
                    skippedAt,
                    missedAt: missed ? missedAtRaw : undefined,
                };
            })
            .filter((item): item is PlanItem => item !== null)
            .sort((a, b) => a.time.localeCompare(b.time));
        return { ...plan, date: planDate, items: normalized };
    };

    const MISSED_GRACE_MS = 10 * 60 * 1000; // 10 minutes after last possible slot

    const applyMissedState = (
        plan: DailyPlan | null,
        nowMs: number,
        activeDayKey: string
    ): { plan: DailyPlan | null; changed: boolean } => {
        if (!plan || !plan.items?.length) return { plan, changed: false };
        if (plan.date !== activeDayKey) return { plan, changed: false };

        const itemsWithTime = plan.items
            .map(item => {
                const ts = typeof item.scheduledAt === 'number'
                    ? item.scheduledAt
                    : buildLocalDateTimeFromKey(plan.date, item.time)?.getTime();
                return { item, ts };
            })
            .filter(entry => typeof entry.ts === 'number')
            .sort((a, b) => (a.ts as number) - (b.ts as number));

        const nextTimeById = new Map<string, number>();
        for (let i = 0; i < itemsWithTime.length - 1; i++) {
            const current = itemsWithTime[i];
            const next = itemsWithTime[i + 1];
            if (current.item?.id && typeof next.ts === 'number') {
                nextTimeById.set(current.item.id, next.ts as number);
            }
        }

        let changed = false;
        const updatedItems = plan.items.map(item => {
            if (item.completed) return item;
            const nextTs = item.id ? nextTimeById.get(item.id) : undefined;
            const scheduledAt = typeof item.scheduledAt === 'number'
                ? item.scheduledAt
                : buildLocalDateTimeFromKey(plan.date, item.time)?.getTime();

            const missedBySkip = !!item.skipped;
            const missedByNext = typeof nextTs === 'number' && nowMs >= nextTs;
            const missedByTime = typeof nextTs !== 'number' &&
                typeof scheduledAt === 'number' &&
                nowMs >= scheduledAt + MISSED_GRACE_MS;
            const shouldMiss = missedBySkip || missedByNext || missedByTime;

            if (shouldMiss && !item.missed) {
                changed = true;
                return { ...item, missed: true, missedAt: item.missedAt ?? nowMs };
            }

            return item;
        });

        if (!changed) return { plan, changed: false };
        return {
            plan: {
                ...plan,
                items: updatedItems,
                updatedAt: Date.now(),
            },
            changed: true,
        };
    };
 
    // Track if initial setup has run
    const hasInitializedRef = React.useRef(false);
    const lastLoadTimeRef = React.useRef(0);
    // Track which reminder items have been shown this session to prevent duplicates
    const shownReminderItems = React.useRef<Set<string>>(new Set());
 
    // Load data when screen comes into focus (debounced)
    useFocusEffect(
        useCallback(() => {
            const now = Date.now();
            // Debounce: don't reload if less than 500ms since last load
            if (now - lastLoadTimeRef.current < 500) {
                return;
            }
            lastLoadTimeRef.current = now;
 
            loadData();
            // Process any pending overlay actions (Done/Snooze/Skip from native overlay)
            processPendingActions().then(result => {
                if (result.processed > 0) {
                    console.log(`[Dashboard] Processed ${result.processed} pending overlay actions:`, result.actions);
                    // Reload data to reflect changes
                    loadData();
                }
            });
        }, [viewingKey])
    );
 
    // One-time initialization (empty dependency - runs only once)
    useEffect(() => {
        // Prevent multiple initializations
        if (hasInitializedRef.current) return;
        hasInitializedRef.current = true;
 
        // Record first install time if not already set (for grace period logic)
        const recordFirstInstall = async () => {
            const existingInstall = await storage.get<number>(storage.keys.FIRST_INSTALL_TIME);
            if (!existingInstall) {
                await storage.set(storage.keys.FIRST_INSTALL_TIME, Date.now());
                console.log('[Dashboard] First install time recorded');
            }
        };
        recordFirstInstall();
 
        loadLocationAndWeather();
        sleepService.initializeBackground();
        // Report cold start complete when Dashboard renders (main screen)
        reportColdStartComplete('DashboardScreen');
        // One-time notification permission request on first visit
        requestNotificationPermissionOnce();
        // CRITICAL: Sync overlay settings to native on startup
        // This ensures native SharedPreferences matches React Native state
        overlayService.syncSettingsToNative().then(synced => {
            console.log('[Dashboard] Overlay settings synced to native:', synced);
        });
        // Set up real-time overlay action listener (triggers loadData when action processed)
        const cleanupOverlay = setupOverlayActionListener(async (action) => {
            console.log('[Dashboard] Overlay action processed:', action.action, 'for item:', action.planItemId);
 
            // Cancel any showing modal for this item (Fix 4)
            if (pendingReminder?.id === action.planItemId) {
                setShowActionModal(false);
                setPendingReminder(null);
            }
 
            // Mark as shown so it won't trigger again (Fix 2)
            if (action.planItemId) {
                shownReminderItems.current.add(action.planItemId);
            }
 
            await loadData();
        });
 
 
        // Subscribe to plan events for auto-generation
        const { subscribe, checkAndAutoGenerate } = require('../services/planEventService');
 
        // Handle new day detection - auto-generate plan
        const unsubNewDay = subscribe('NEW_DAY_DETECTED', async () => {
            console.log('[Dashboard] New day detected, refreshing data...');
            // Reload data to show generate button - user taps to generate
            await loadData();
        });
 
        // Handle food logged - offer to update plan
        const unsubFoodLogged = subscribe('FOOD_LOGGED', async (data: any) => {
            console.log('[Dashboard] Food logged, refreshing data...', data);
            // Refresh data to reflect new food log
            await loadData();
        });
 
        // Handle activity logged
        const unsubActivityLogged = subscribe('ACTIVITY_LOGGED', async (data: any) => {
            console.log('[Dashboard] Activity logged, refreshing data...', data);
            await loadData();
        });
 
        // Handle plan generated in background - auto-update UI
        const unsubPlanGenerated = subscribe('PLAN_GENERATED', async (data: any) => {
            console.log('[Dashboard] Plan generated in background, refreshing...', data);
            await loadData();
            // Clear pending flag if it was set
            storage.set('plan_generation_pending', false).catch(() => { });
        });
 
        // Handle plan item completed/skipped - refresh to show updated state
        const unsubPlanItemCompleted = subscribe('PLAN_ITEM_COMPLETED', async (data: any) => {
            console.log('[Dashboard] Plan item completed, refreshing...', data);
            await loadData();
        });
 
        // Handle water logged - refresh to show updated water stats
        const unsubWaterLogged = subscribe('WATER_LOGGED', async (data: any) => {
            console.log('[Dashboard] Water logged, refreshing...', data);
            await loadData();
        });

        // Handle sleep updates - refresh to show updated sleep stats
        const unsubSleepAnalyzed = subscribe('SLEEP_ANALYZED', async (data: any) => {
            console.log('[Dashboard] Sleep analyzed, refreshing...', data);
            await loadData();
        });
 
        // Handle pending plan failure - background generation failed (e.g., low energy overnight)
        const unsubPendingFailure = subscribe('PENDING_PLAN_FAILURE', async (data: { reason: string }) => {
            console.log('[Dashboard] Pending plan failure:', data.reason);
            if (data.reason === 'LOW_ENERGY') {
                // Show alert to user on wake/app open
                Alert.alert(
                    t('dashboard.alert.low_energy_title'),
                    t('dashboard.alert.low_energy_morning_plan_body'),
                    [
                        { text: t('later'), style: 'cancel' },
                        { text: t('watch_ad'), onPress: () => showAdRecharge() }
                    ]
                );
            }
        });
 
        // Handle plan upgraded from offline - show success message
        const unsubPlanUpgraded = subscribe('PLAN_UPGRADED', async (data: { fromOffline: boolean }) => {
            console.log('[Dashboard] Plan upgraded!', data);
            await loadData();
            if (data.fromOffline) {
                Alert.alert(
                    t('dashboard.alert.plan_updated_title'),
                    t('dashboard.alert.plan_updated_body')
                );
            }
        });
 
        let wakeHandlingInProgress = false;
 
        // 🌅 WAKE CONFIRMATION LISTENER - Auto-generate plan after user confirms wake
        // This is triggered by SleepOverlayReceiver when user taps "Yes, Awake" on overlay
        const wakeListener = DeviceEventEmitter.addListener('onWakeConfirmed', async (event: {
            sleepDurationMinutes: number;
            sleepDurationHours: number;
            sleepStartTime: number;
            wakeTime: number;
        }) => {
            console.log('[Dashboard] Wake confirmed! Sleep duration:', event.sleepDurationHours, 'hours');
 
            if (wakeHandlingInProgress) return;
            wakeHandlingInProgress = true;
 
            try {
                // Save sleep to storage for LLM context
                const today = getLocalDateKey(new Date());
                const recordDate =
                    typeof event.sleepStartTime === 'number' && event.sleepStartTime > 0
                        ? getLocalDateKey(new Date(event.sleepStartTime))
                        : today;
                await sleepHoursService.recomputeForDate(recordDate);
 
                // Refresh data to get latest state
                await loadData();
 
                // Check if we already have a plan for today
                const todayPlan = await storage.get<DailyPlan>(planStorageKey(today));
                if (todayPlan && todayPlan.items?.length > 0) {
                    console.log('[Dashboard] Plan already exists for today');
                    Alert.alert(
                        t('dashboard.alert.good_morning_title'),
                        t('dashboard.alert.good_morning_ready_body', { hours: event.sleepDurationHours.toFixed(1) })
                    );
                    return;
                }
 
                // === ENERGY CHECK for background plan generation ===
                const planCost = ENERGY_COSTS.PLAN_GENERATION;
                if (!await energyService.canAfford(planCost)) {
                    console.log('[Dashboard] Insufficient energy for morning plan generation');
                    Alert.alert(
                        t('dashboard.alert.low_energy_title'),
                        t('dashboard.alert.low_energy_after_wake_body', { hours: event.sleepDurationHours.toFixed(1) }),
                        [
                            { text: t('later'), style: 'cancel' },
                            { text: t('watch_ad'), onPress: () => showAdRecharge() }
                        ]
                    );
                    return;
                }
 
                // Auto-generate plan with fresh sleep data
                Alert.alert(
                    t('dashboard.alert.good_morning_title'),
                    t('dashboard.alert.good_morning_generating_body', { hours: event.sleepDurationHours.toFixed(1) }),
                    [{ text: t('ok') }]
                );
 
                // Small delay to let alert show, then generate
                setTimeout(async () => {
                    try {
                        // handleGeneratePlan is defined in DashboardScreen
                        console.log('[Dashboard] Auto-generating plan after wake confirmation...');
                        await handleGeneratePlan();
                    } catch (error) {
                        console.error('[Dashboard] Auto-plan generation failed:', error);
                    }
                }, 500);
            } finally {
                wakeHandlingInProgress = false;
            }
        });
 
        // Also handle wake-confirmation that happened while the app process was dead (cold start).
        storage.get<any>(storage.keys.PENDING_WAKE_CONFIRMED).then(async (pending) => {
            if (!pending) return;
            try {
                await storage.remove(storage.keys.PENDING_WAKE_CONFIRMED);
            } catch { }
 
            const hours = Number(pending.sleepDurationHours);
            if (!Number.isFinite(hours)) return;
 
            DeviceEventEmitter.emit('onWakeConfirmed', {
                sleepDurationMinutes: typeof pending.sleepDurationMinutes === 'number'
                    ? pending.sleepDurationMinutes
                    : Math.round(hours * 60),
                sleepDurationHours: hours,
                sleepStartTime: typeof pending.sleepStartTime === 'number' ? pending.sleepStartTime : 0,
                wakeTime: typeof pending.wakeTime === 'number' ? pending.wakeTime : Date.now(),
            });
        }).catch(() => { });
 
        // Check if plan needs to be generated on mount (ONCE)
        checkAndAutoGenerate({ allowWhenSleeping: true, reason: 'dashboard_mount' }).then(async (result: { needsGeneration: boolean; reason?: string }) => {
            if (result.needsGeneration) {
                console.log(`[Dashboard] Plan needed: ${result.reason}`);
                // Load data which will show generate button
                await loadData();
            }
        });
 
        return () => {
            if (cleanupOverlay) cleanupOverlay();
            unsubNewDay();
            unsubFoodLogged();
            unsubActivityLogged();
            unsubPlanGenerated();
            unsubPlanItemCompleted();
            unsubWaterLogged();
            unsubSleepAnalyzed();
            unsubPendingFailure();
            unsubPlanUpgraded();
            wakeListener.remove(); // Clean up wake confirmation listener
        };
    }, []); // Empty dependency - run once only
 
    // Request notification permission once on first app visit
    const requestNotificationPermissionOnce = async () => {
        try {
            const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
            if (prefs?.notificationPermissionRequested) return; // Already asked
 
            // Request permission
            const granted = await requestNotificationPermission();
 
            // Mark as requested so we don't ask again
            await storage.set(storage.keys.APP_PREFERENCES, {
                ...prefs,
                notificationPermissionRequested: true,
                notificationsEnabled: granted, // Auto-enable if granted
            });
 
            if (granted) {
                setNotificationsEnabled(true);
            }
        } catch (error) {
            console.warn('Failed to request notification permission:', error);
        }
    };
 
    useEffect(() => {
        let unsubscribe: (() => void) | null = null;
        let mounted = true;

        const applyContextSnapshot = async () => {
            const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
            const contextEnabled = prefs?.contextSensingEnabled !== false;
            if (!mounted) return;

            if (!contextEnabled) {
                setAppContext(prev => ({
                    ...prev,
                    userContextState: 'unknown' as UserContextState,
                }));
                return;
            }

            const snapshot = await storage.get<ContextSnapshot>(storage.keys.LAST_CONTEXT_SNAPSHOT);
            if (!mounted || !snapshot) return;

            const nextState = snapshot.state as UserContextState;
            setAppContext(prev => ({
                ...prev,
                userContextState: nextState,
                locationContext: snapshot.locationContext ?? prev.locationContext,
                contextDetails: {
                    ...prev.contextDetails,
                    environment: snapshot.environment ?? prev.contextDetails?.environment,
                    confidence: snapshot.confidence ?? prev.contextDetails?.confidence,
                    pollTier: snapshot.pollTier ?? prev.contextDetails?.pollTier,
                    movementType: snapshot.movementType ?? prev.contextDetails?.movementType,
                    locationType: snapshot.locationLabel ?? snapshot.locationType ?? prev.contextDetails?.locationType,
                    lastUpdatedAt: snapshot.updatedAt ?? prev.contextDetails?.lastUpdatedAt,
                },
            }));
        };

        void applyContextSnapshot();
        unsubscribe = storage.subscribe((key) => {
            if (key === storage.keys.LAST_CONTEXT_SNAPSHOT || key === storage.keys.APP_PREFERENCES) {
                void applyContextSnapshot();
            }
        });

        return () => {
            mounted = false;
            unsubscribe?.();
        };
    }, []);
 
    const loadData = async (options?: { skipScheduling?: boolean }) => {
        const skipScheduling = options?.skipScheduling ?? false;
        const now = new Date();
        await maybeAdvanceActiveDay({ now, reason: 'dashboard_load', allowWhenSleeping: true });
        const nowMs = now.getTime();
        const activeDayKey = await getActiveDayKey();
        const todayKeyNow = activeDayKey || getLocalDateKey(now);
        setTodayKey(prev => (prev === todayKeyNow ? prev : todayKeyNow));
        const viewingKeyNow = getLocalDateKey(viewingDate);
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = getLocalDateKey(yesterday);
 
        const savedUser = await storage.get<UserProfile>(storage.keys.USER);
        const weightHistory = await storage.get<WeightLogEntry[]>(storage.keys.WEIGHT) || [];
        const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
        if (prefs?.useMetric !== undefined) setUseMetric(prefs.useMetric);
        if (prefs?.notificationsEnabled !== undefined) setNotificationsEnabled(!!prefs.notificationsEnabled);
        if (prefs?.notificationPlanMode) setNotificationPlanMode(prefs.notificationPlanMode);
        const notifEnabled = prefs?.notificationsEnabled !== false;
        const notifMode: NotificationPlanMode = prefs?.notificationPlanMode || 'high';
 
        const [todayPlanRaw, legacyPlanRaw, viewingPlanRawMaybe, yesterdayPlanRaw] = await Promise.all([
            storage.get<DailyPlan>(planStorageKey(todayKeyNow)),
            storage.get<DailyPlan>(storage.keys.DAILY_PLAN),
            viewingKeyNow === todayKeyNow ? Promise.resolve(null) : storage.get<DailyPlan>(planStorageKey(viewingKeyNow)),
            viewingKeyNow === todayKeyNow ? storage.get<DailyPlan>(planStorageKey(yesterdayKey)) : Promise.resolve(null),
        ]);
        const viewingPlanRaw = viewingKeyNow === todayKeyNow ? todayPlanRaw : viewingPlanRawMaybe;
        const foodLogs = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
        const [mealsRaw, legacyMeals] = await Promise.all([
            storage.get<any[]>(storage.keys.SAVED_MEALS),
            storage.get<any[]>('saved_meals')
        ]);
        const wrapUps = await storage.get<DailyWrapUp[]>(storage.keys.DAILY_WRAPUPS) || [];
        const drafts = await getSleepDrafts();
        setSleepDrafts(drafts);
 
        if (savedUser) {
            const { profile: refreshedProfile, targets, updated } = refreshTargetsForProfile(savedUser, {
                dateKey: todayKeyNow,
                weightHistory,
            });
            if (updated) {
                await userProfileService.saveUserProfile(refreshedProfile, { source: 'dashboard_target_refresh' });
            }
            setDailyTargets({
                calories: targets.calories,
                protein: targets.protein,
                waterMl: targets.waterMl,
            });
            if (JSON.stringify(refreshedProfile) !== JSON.stringify(user)) {
                setUser(refreshedProfile);
            }
        } else {
            setDailyTargets({ calories: 0, protein: 0, waterMl: 0 });
        }
 
        // Migration: legacy plan key -> dated plan key (preserves older plans across app updates)
        const legacyAny = legacyPlanRaw ? sanitizePlan(legacyPlanRaw, todayKeyNow) : null;
        if (legacyAny && isValidDateKey(legacyAny.date)) {
            const existingForLegacyDate = await storage.get<DailyPlan>(planStorageKey(legacyAny.date));
            if (!existingForLegacyDate) {
                await storage.set(planStorageKey(legacyAny.date), legacyAny);
            }
        }
 
        const todayPlanFromStorage = sanitizePlan(todayPlanRaw, todayKeyNow, { forceDateKey: true });
        const legacyForToday = todayPlanFromStorage ? null : sanitizePlan(legacyPlanRaw, todayKeyNow);
        const todayPlan =
            todayPlanFromStorage ||
            (legacyForToday?.date === todayKeyNow ? legacyForToday : null);

        const { plan: todayPlanWithMissed } = applyMissedState(todayPlan, nowMs, todayKeyNow);

        setDailyPlan(todayPlanWithMissed);
        if (todayPlanWithMissed) {
            await storage.set(planStorageKey(todayKeyNow), todayPlanWithMissed);
            await storage.set(storage.keys.DAILY_PLAN, todayPlanWithMissed);
            if (notifEnabled && !skipScheduling) {
                await schedulePlanNotifications(todayPlanWithMissed, { mode: notifMode });
            } else {
                await Promise.all([
                    clearNotificationType('plan'),
                    clearNotificationType('hydration'),
                    clearNotificationType('hydration_snooze'),
                ]);
            }
            await applyPendingSleepCompletion(todayKeyNow);
        }
 
        const viewingPlanFromStorage = sanitizePlan(viewingPlanRaw, viewingKeyNow, { forceDateKey: true });
        const legacyForViewing = viewingPlanFromStorage ? null : sanitizePlan(legacyPlanRaw, viewingKeyNow);
        const resolvedViewingPlan =
            viewingPlanFromStorage ||
            (legacyForViewing?.date === viewingKeyNow ? legacyForViewing : null);

        const { plan: viewingPlanWithMissed } = applyMissedState(resolvedViewingPlan, nowMs, todayKeyNow);

        setViewingPlan(viewingPlanWithMissed);
        if (viewingPlanWithMissed) {
            await storage.set(planStorageKey(viewingKeyNow), viewingPlanWithMissed);
            if (viewingPlanWithMissed.date && viewingPlanWithMissed.date !== todayKeyNow) {
                await applyPendingSleepCompletion(viewingPlanWithMissed.date);
            }
        }
 
        let resolvedFallbackKey: string | null = null;
        if (viewingKeyNow === todayKeyNow && !todayPlan) {
            const validYesterday = sanitizePlan(yesterdayPlanRaw, yesterdayKey, { forceDateKey: true });
            resolvedFallbackKey = validYesterday ? yesterdayKey : (legacyAny?.date === yesterdayKey ? yesterdayKey : null);
        }
        setFallbackPlanDateKey(resolvedFallbackKey);
        if (!todayPlan && resolvedFallbackKey && viewingKeyNow === todayKeyNow && !manualDateOverride) {
            setViewingDate(dateFromKey(resolvedFallbackKey));
            lastLoadTimeRef.current = 0;
        }
        if (todayPlan && viewingKeyNow === todayKeyNow && manualDateOverride) {
            setManualDateOverride(false);
        }
        if (todayPlan && viewingKeyNow !== todayKeyNow && !manualDateOverride) {
            setViewingDate(dateFromKey(todayKeyNow));
            lastLoadTimeRef.current = 0;
        }
 
        const hasWrapUpToday = wrapUps.some(w => w.date === todayKeyNow);
        setWrapUpShownToday(hasWrapUpToday);
        if (notifEnabled && !skipScheduling) {
            await scheduleNightlyWrapUpReminder();
        } else if (!skipScheduling) {
            await Promise.all([clearNotificationType('wrapup'), clearNotificationType('wrapup_snooze')]);
        }
        const mealsSource = (mealsRaw && mealsRaw.length ? mealsRaw : legacyMeals) || [];
        const normalizedMeals: SavedMeal[] = mealsSource.map((meal, idx) => ({
            id: meal.id || `saved-${idx}-${Date.now()}`,
            name: meal.name || meal.title || t('dashboard.saved_meal', { index: idx + 1 }),
            macros: meal.macros || {
                calories: meal.calories || 0,
                protein: meal.protein || 0,
                carbs: meal.carbs || 0,
                fat: meal.fat || 0,
            },
            healthGrade: meal.healthGrade || 'B',
            ...meal,
        }));
        setSavedMeals(normalizedMeals);
        if (!mealsRaw?.length && normalizedMeals.length) {
            await storage.set(storage.keys.SAVED_MEALS, normalizedMeals);
        }
        const wrapUpSummary = summarizeWrapUps(wrapUps, t);
        setAppContext(prev => ({ ...prev, wrapUpSummary }));

        try {
            const healthData = await getHealthContextData();
            const bioContext = await getBioContextForAppContext();
            setAppContext(prev => ({
                ...prev,
                ...(healthData ? { healthData } : {}),
                ...(bioContext.bioSnapshot ? { bioSnapshot: bioContext.bioSnapshot } : {}),
                ...(bioContext.bioTrends ? { bioTrends: bioContext.bioTrends } : {}),
                ...(bioContext.bioHistorySummary ? { bioHistorySummary: bioContext.bioHistorySummary } : {}),
            }));
        } catch (error) {
            console.warn('[Dashboard] Failed to load health context:', error);
        }
 
        // ✅ FIX: Filter food logs by the VIEWING DATE (not always today)
        const viewingFood = foodLogs.filter(f => getLocalDateKey(new Date(f.timestamp)) === viewingKeyNow);
        const viewingCalories = viewingFood.reduce((sum, f) => sum + f.food.macros.calories, 0);
        const viewingProtein = viewingFood.reduce((sum, f) => sum + f.food.macros.protein, 0);
 
        // ✅ FIX: Load water for the VIEWING DATE (per-date storage)
        const viewingWater = await getWaterAmountForDate(viewingKeyNow);
 
        // Load sleep data - get last night's sleep for today, or viewing date's sleep
        let viewingSleep = 0;
        try {
            const sleepHistory = await sleepHoursService.getHistory();
            viewingSleep = await resolveSleepHoursForDate(sleepHistory, viewingKeyNow, todayKeyNow);
        } catch (e) {
            console.warn('[Dashboard] Failed to load sleep data:', e);
        }
 
        setDailyStats(prev => ({
            ...prev,
            calories: Math.round(viewingCalories),
            protein: Math.round(viewingProtein),
            water: viewingWater,
            sleep: viewingSleep
        }));
 
        // === UPDATE HOME SCREEN WIDGET with real data ===
        // Only update for today's view (not past dates)
        if (viewingKeyNow === todayKeyNow) {
            const nextUncompleted = todayPlan?.items
                ?.filter(item => !item.completed && !item.skipped && item.type !== 'hydration')
                ?.sort((a, b) => {
                    const aTime = a.time?.replace(':', '') || '0000';
                    const bTime = b.time?.replace(':', '') || '0000';
                    return Number(aTime) - Number(bTime);
                })?.[0];
 
            WidgetService.updateWidgetData({
                calories: Math.round(viewingCalories),
                protein: Math.round(viewingProtein),
                water: Math.round(viewingWater / 250), // Convert ml to glasses (250ml per glass)
                nextItem: nextUncompleted
                    ? t('dashboard.widget_next_item', {
                        time: nextUncompleted.time,
                        title: nextUncompleted.title,
                    })
                    : t('dashboard.widget_all_done')
            });
        }
    };
 
    // Keep "today" derived flags correct across midnight/backgrounding.
    useEffect(() => {
        const updateTodayKey = async () => {
            const next = await getActiveDayKey();
            setTodayKey(prev => (prev === next ? prev : next));
        };

        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                void updateTodayKey();
            }
        });

        return () => sub.remove();
    }, []);
 
    // Handle deep links / notification actions
    useEffect(() => {
        // @ts-ignore - params might not be typed in checks but exist at runtime
        const action = (route.params as any)?.action;
 
        if (action === 'log_water') {
            // Simplified logging for now - directly adding water
            const waterDate = getLocalDateKey(new Date());
            const isViewingToday = getLocalDateKey(viewingDate) === waterDate;
            addWaterForDate(waterDate, 250).then((newTotal) => {
                // Only update visible UI if we're currently viewing today.
                if (isViewingToday) {
                    setDailyStats(prev => ({ ...prev, water: newTotal }));
                }
                Alert.alert(t('alert.hydration_logged'), t('alert.water_added'));
            });
            // Clear param to avoid re-triggering
            navigation.setParams({ action: undefined } as any);
        } else if (action === 'start_wrap_up') {
            setShowWrapUpModal(true);
            navigation.setParams({ action: undefined } as any);
        }
    }, [route.params]);
    const loadLocationAndWeather = async () => {
        try {
            if (foregroundStatus !== 'granted') {
                openForegroundDisclosure();
                return;
            }

            const location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;

            const [weather, locationName] = await Promise.all([
                fetchLocalWeather(latitude, longitude),
                fetchLocationName(latitude, longitude)
            ]);

            setAppContext(prev => ({
                ...prev,
                weather,
                currentLocation: locationName
            }));
        } catch (error) {
            console.error('Location/Weather error:', error);
        }
    };

    useEffect(() => {
        if (foregroundStatus === 'granted') {
            void loadLocationAndWeather();
        }
    }, [foregroundStatus]);
 
    // Handle Reminder Scheduling
    const handleSetReminder = async (item: PlanItem, planDateKey: string) => {
        const todayKeyNow = getLocalDateKey(new Date());
        if (planDateKey !== todayKeyNow) {
            Alert.alert(t('dashboard.alert.only_today_title'), t('dashboard.alert.only_today_body'));
            return;
        }
 
        const triggerDate = buildLocalDateTimeFromKey(planDateKey, item.time) || new Date();
        if (triggerDate.getTime() < Date.now()) triggerDate.setDate(triggerDate.getDate() + 1);
 
        try {
            await scheduleNotification(
                t('dashboard.reminder_title', { title: item.title }),
                item.description || t('dashboard.reminder_body', { type: getPlanItemTypeLabel(item.type) }),
                triggerDate
            );
            Alert.alert(t('alert.reminder_set'), `${t('alert.reminder_scheduled_for')} ${item.time}`);
        } catch (error) {
            console.error('Failed to schedule reminder:', error);
            Alert.alert(t('alert.error'), t('alert.could_not_schedule'));
        }
    };
 
    const onReminderPress = (item: PlanItem, planDateKey: string) => {
        setItemToRemind(item);
        setReminderPlanDateKey(planDateKey);
        setShowPermissionModal(true);
    };
 
    const handleReminderPermissionGranted = () => {
        setShowPermissionModal(false);
        if (itemToRemind && reminderPlanDateKey) {
            handleSetReminder(itemToRemind, reminderPlanDateKey);
        }
        setItemToRemind(null);
        setReminderPlanDateKey(null);
    };
 
    // Trigger daily wrap-up generation - NOW USES REAL DATA instead of AI hallucination
    const triggerDailyWrapUp = async () => {
        const todayKeyNow = getLocalDateKey(new Date());
        if (!user || !dailyPlan || dailyPlan.date !== todayKeyNow) return;
 
        // Check if already shown today (PERSISTENT)
        const shownKey = `wrapup_shown_${todayKeyNow}`;
        const alreadyShown = await storage.get<boolean>(shownKey);
        if (alreadyShown) {
            console.log('[Dashboard] Wrap-up already shown today');
            setWrapUpShownToday(true);
            return;
        }
 
        try {
            const foodLogs = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
            const activityLogs = await storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY) || [];
            const waterLog = await storage.get<{ date: string; amount: number }>(storage.keys.WATER);
            const sleepHistory = await sleepHoursService.getHistory();
 
            const todayFood = foodLogs.filter(f => getLocalDateKey(new Date(f.timestamp)) === todayKeyNow);
            const todayActivity = activityLogs.filter(a => getLocalDateKey(new Date(a.timestamp)) === todayKeyNow);
            const todaySleep = await resolveSleepHoursForDate(sleepHistory, todayKeyNow, todayKeyNow);
            const todayWater = waterLog?.date === todayKeyNow ? waterLog.amount : 0;
 
            // Build REAL comparison from actual tracked data
            const comparison = buildRealComparison(
                dailyPlan,
                todayFood,
                todayActivity,
                todayWater,
                todaySleep,
                user
            );
 
            // Calculate AI score based on actual completion rate
            const completedItems = dailyPlan.items.filter(i => i.completed);
            const totalItems = dailyPlan.items.length;
            const completionRate = totalItems > 0 ? completedItems.length / totalItems : 0;
            const aiScore = Math.min(10, Math.max(1, Math.round(completionRate * 10)));
 
            // Generate summary based on actual performance
            const summaryPhrases = {
                excellent: [
                    t('dashboard.wrapup.summary.excellent_1'),
                    t('dashboard.wrapup.summary.excellent_2'),
                    t('dashboard.wrapup.summary.excellent_3'),
                ],
                good: [
                    t('dashboard.wrapup.summary.good_1'),
                    t('dashboard.wrapup.summary.good_2'),
                    t('dashboard.wrapup.summary.good_3'),
                ],
                okay: [
                    t('dashboard.wrapup.summary.okay_1'),
                    t('dashboard.wrapup.summary.okay_2'),
                    t('dashboard.wrapup.summary.okay_3'),
                ],
                low: [
                    t('dashboard.wrapup.summary.low_1'),
                    t('dashboard.wrapup.summary.low_2'),
                    t('dashboard.wrapup.summary.low_3'),
                ],
            };
            const tier = aiScore >= 8 ? 'excellent' : aiScore >= 6 ? 'good' : aiScore >= 4 ? 'okay' : 'low';
            const summary = summaryPhrases[tier][Math.floor(Math.random() * 3)];
 
            const wrapUp: DailyWrapUp = {
                date: todayKeyNow,
                aiScore,
                summary,
                comparison,
                tomorrowFocus: completionRate < 0.7
                    ? t('dashboard.wrapup.focus_improve')
                    : t('dashboard.wrapup.focus_maintain')
            };
 
            setWrapUpData(wrapUp);
            setShowWrapUpModal(true);
            setWrapUpShownToday(true);
 
            // PERSIST shown status so it doesn't show again today
            await storage.set(shownKey, true);
            console.log('[Dashboard] Wrap-up generated with REAL data');
        } catch (error) {
            console.error('Failed to generate wrap-up:', error);
        }
    };
 
    // Build comparison from ACTUAL tracked data (not AI guesses)
    const buildRealComparison = (
        plan: DailyPlan,
        foodLogs: FoodLogEntry[],
        activityLogs: ActivityLogEntry[],
        waterAmount: number,
        sleepHours: number,
        userProfile: UserProfile
    ): DailyWrapUp['comparison'] => {
        const comparison: DailyWrapUp['comparison'] = [];
 
        // 1. Tasks Completed
        const totalTasks = plan.items.length;
        const completedTasks = plan.items.filter(i => i.completed).length;
        const skippedTasks = plan.items.filter(i => i.skipped).length;
        comparison.push({
            category: t('dashboard.wrapup.category.tasks'),
            planned: t('dashboard.wrapup.tasks_planned', { count: totalTasks }),
            actual: t('dashboard.wrapup.tasks_actual', { completed: completedTasks, skipped: skippedTasks }),
            status: completedTasks >= totalTasks * 0.7 ? 'hit' : completedTasks >= totalTasks * 0.4 ? 'partial' : 'miss'
        });
 
        // 2. Calories (from food logs)
        const plannedMeals = plan.items.filter(i => i.type === 'meal');
        const plannedCalories = userProfile.dailyCalorieTarget || 2000;
        const actualCalories = foodLogs.reduce((sum, f) => sum + (f.food?.macros?.calories || 0), 0);
        if (foodLogs.length > 0 || plannedMeals.length > 0) {
            comparison.push({
                category: t('dashboard.wrapup.category.calories'),
                planned: t('dashboard.wrapup.calories_planned', { calories: plannedCalories }),
                actual: actualCalories > 0
                    ? t('dashboard.wrapup.calories_actual', { calories: actualCalories })
                    : t('dashboard.wrapup.not_logged'),
                status: actualCalories > 0 && Math.abs(actualCalories - plannedCalories) < plannedCalories * 0.2 ? 'hit'
                    : actualCalories > 0 ? 'partial' : 'miss'
            });
        }
 
        // 3. Hydration
        const plannedWater = waterTargetMl; // Default water goal
        if (plannedWater > 0) {
            comparison.push({
                category: t('dashboard.wrapup.category.hydration'),
                planned: t('dashboard.wrapup.hydration_planned', { amount: plannedWater }),
                actual: waterAmount > 0
                    ? t('dashboard.wrapup.hydration_actual', { amount: waterAmount })
                    : t('dashboard.wrapup.not_logged'),
                status: waterAmount >= plannedWater * 0.8 ? 'hit' : waterAmount >= plannedWater * 0.5 ? 'partial' : 'miss'
            });
        }
 
        // 4. Sleep (if tracked)
        const plannedSleep = sleepTargetHours; // Default sleep goal
        if (sleepHours > 0 || plannedSleep > 0) {
            comparison.push({
                category: t('dashboard.wrapup.category.sleep'),
                planned: t('dashboard.wrapup.sleep_planned', { hours: plannedSleep }),
                actual: sleepHours > 0
                    ? t('dashboard.wrapup.sleep_actual', { hours: sleepHours.toFixed(1) })
                    : t('dashboard.wrapup.not_tracked'),
                status: sleepHours >= plannedSleep * 0.9 ? 'hit' : sleepHours >= plannedSleep * 0.7 ? 'partial' : 'miss'
            });
        }
 
        // 5. Exercise/Activities
        const plannedWorkouts = plan.items.filter(i => i.type === 'workout').length;
        const actualWorkouts = activityLogs.length;
        if (plannedWorkouts > 0 || actualWorkouts > 0) {
            comparison.push({
                category: t('dashboard.wrapup.category.exercise'),
                planned: t('dashboard.wrapup.exercise_planned', {
                    count: plannedWorkouts,
                    suffix: plannedWorkouts !== 1 ? 's' : ''
                }),
                actual: t('dashboard.wrapup.exercise_actual', { count: actualWorkouts }),
                status: actualWorkouts >= plannedWorkouts ? 'hit' : actualWorkouts > 0 ? 'partial' : 'miss'
            });
        }
 
        return comparison;
    };
 
    // Check for plan item reminders every minute
    useEffect(() => {
        const GRACE_PERIOD_MS = 2 * 60 * 60 * 1000; // 2 hours after first install = no intrusive triggers
 
        const checkReminders = async () => {
            const todayKeyNow = getLocalDateKey(new Date());
            if (!dailyPlan || !user || dailyPlan.date !== todayKeyNow) return;
            if (!notificationsEnabled) return;
 
            // Check for first-install grace period
            const firstInstallTime = await storage.get<number>(storage.keys.FIRST_INSTALL_TIME);
            const nowTs = Date.now();
            const isInGracePeriod = firstInstallTime && (nowTs - firstInstallTime) < GRACE_PERIOD_MS;
 
            if (isInGracePeriod) {
                console.log('[Dashboard] In first-install grace period, skipping intrusive checks');
                return;
            }
 
            const shouldRemindForMode = (item: PlanItem): boolean => {
                if (notificationPlanMode === 'high') return true;
                if (notificationPlanMode === 'medium') return item.type === 'meal' || item.type === 'workout';
                return item.type === 'meal';
            };
 
            const now = new Date();
            const currentHour = now.getHours();
            const reminderWindowMs = 5 * 60 * 1000;
            const graceMs = 2 * 60 * 1000;
            const latestTs = nowTs + reminderWindowMs;
 
            // Check for upcoming plan items (within 5 minutes), honoring snooze.
            const upcomingItem = (dailyPlan.items || []).find(item => {
                if (item.completed || item.skipped) return false;
                // Skip if already shown reminder for this item (Fix 2)
                if (shownReminderItems.current.has(item.id)) return false;
                if (!shouldRemindForMode(item)) return false;
                const base = buildLocalDateTimeFromKey(todayKeyNow, item.time);
                if (!base) return false;
                const targetTs = typeof item.snoozedUntil === 'number' ? item.snoozedUntil : base.getTime();
 
                // Too early or too late to remind.
                if (targetTs > latestTs) return false;
                if (targetTs < nowTs - graceMs) return false;
 
                return true;
            });
 
            // DISABLED: In-app popup now handled by native OverlayWindowService
            // Native overlay shows even when app is closed with full features
            // if (upcomingItem && !showActionModal && !pendingReminder) {
            //     shownReminderItems.current.add(upcomingItem.id);
            //     setPendingReminder(upcomingItem);
            //     setActionModalType('plan_reminder');
            //     setShowActionModal(true);
            // }
 
            // Check for evening wrap-up - DYNAMIC based on user's bed time (not hardcoded 9pm)
            // Require at least one completed or skipped item to prove engagement
            const hasEngagedToday = (dailyPlan.items || []).some(item => item.completed || item.skipped);
 
            // Calculate wrap-up hour: 1 hour before user's bed time (or 9pm default)
            const getUserBedHour = (): number => {
                if (!user?.sleepRoutine?.targetBedTime) return 21; // Default 9pm
                const match = user.sleepRoutine.targetBedTime.match(/^(\d{1,2}):(\d{2})$/);
                if (!match) return 21;
                return Number(match[1]);
            };
            const wrapUpHour = (getUserBedHour() - 1 + 24) % 24; // 1 hour before bed
 
            if (currentHour >= wrapUpHour && !showWrapUpModal && !wrapUpData && !wrapUpShownToday && hasEngagedToday) {
                triggerDailyWrapUp();
            }
        };
 
        const interval = setInterval(checkReminders, 60000); // Check every minute
        checkReminders(); // Check immediately on mount
        return () => clearInterval(interval);
    }, [dailyPlan, user, notificationsEnabled, notificationPlanMode, showActionModal, pendingReminder, showWrapUpModal, wrapUpData]);
 
 
    // Modal handlers
    const handleActionComplete = (reactionTime?: number) => {
        if (pendingReminder) {
            if (dailyPlan) {
                handleTogglePlanItem(pendingReminder.id, dailyPlan.date);
            }
        }
        setShowActionModal(false);
        setPendingReminder(null);
    };
 
    const handleActionSnooze = (minutes: number) => {
        const reminder = pendingReminder;
        const plan = dailyPlan;
        if (reminder && plan) {
            const todayKeyNow = getLocalDateKey(new Date());
            if (plan.date === todayKeyNow) {
                const nowTs = Date.now();
                const snoozedUntil = nowTs + minutes * 60 * 1000;
                const updatedItems = (plan.items || []).map(item =>
                    item.id === reminder.id
                        ? { ...item, snoozedUntil }
                        : item
                );
                const updatedPlan: DailyPlan = { ...plan, items: updatedItems, updatedAt: nowTs };
                setDailyPlan(updatedPlan);
                if (viewingPlan?.date === updatedPlan.date) {
                    setViewingPlan(updatedPlan);
                }
                void (async () => {
                    try {
                        await storage.set(planStorageKey(updatedPlan.date), updatedPlan);
                        await storage.set(storage.keys.DAILY_PLAN, updatedPlan);
                    } catch (e) {
                        console.warn('Failed to persist snooze state', e);
                    }
                })();
            }
        }
 
        setShowActionModal(false);
        setPendingReminder(null);
    };
 
    const handleActionSkip = () => {
        if (pendingReminder) {
            if (dailyPlan) {
                handleSkipPlanItem(pendingReminder.id, dailyPlan.date);
            }
        }
        setShowActionModal(false);
        setPendingReminder(null);
    };
 
    const handleWrapUpClose = async (rating?: number) => {
        if (wrapUpData) {
            try {
                const history = await storage.get<DailyWrapUp[]>(storage.keys.DAILY_WRAPUPS) || [];
                const withoutCurrent = history.filter(entry => entry.date !== wrapUpData.date);
                const updatedHistory = [...withoutCurrent, { ...wrapUpData, userRating: rating }];
                await storage.set(storage.keys.DAILY_WRAPUPS, updatedHistory);
                const summary = summarizeWrapUps(updatedHistory, t);
                setAppContext(prev => ({ ...prev, wrapUpSummary: summary }));
            } catch (error) {
                console.warn('Failed to persist wrap-up history', error);
            }
        }
        setShowWrapUpModal(false);
        setWrapUpData(null);
    };
 
    const openQuickLog = (type: 'unplanned_activity' | 'log_water' | 'log_food') => {
        setActionModalType(type);
        setShowActionModal(true);
    };
 
    const handleGeneratePlan = async (targetDateKey?: string) => {
        if (!user) {
            Alert.alert(t('dashboard.alert.profile_required_title'), t('dashboard.alert.profile_required_body'));
            return;
        }
 
        const todayKeyNow = getLocalDateKey(new Date());
        const generationKey = targetDateKey && isValidDateKey(targetDateKey) ? targetDateKey : todayKeyNow;
 
        if (generationKey < todayKeyNow) {
            Alert.alert(t('dashboard.alert.plan_not_available_title'), t('dashboard.alert.plan_not_available_body'));
            return;
        }
 
        const allowCloud = canAfford(ENERGY_COSTS.PLAN_GENERATION);
        if (!allowCloud) {
            Alert.alert(
                t('dashboard.alert.low_energy_title'),
                t('dashboard.alert.low_energy_generate_body', {
                    energy: ENERGY_COSTS.PLAN_GENERATION,
                    current: energy,
                })
            );
            showAdRecharge();
            return;
        }
 
        setIsGeneratingPlan(true);
        try {
            const foodLogs = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
            const activityLogs = await storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY) || [];
            const moodLogs = await storage.get<MoodLog[]>(storage.keys.MOOD) || [];
            const weightLogs = await storage.get<WeightLogEntry[]>(storage.keys.WEIGHT) || [];
            const waterLog =
                generationKey === todayKeyNow
                    ? { date: todayKeyNow, amount: await getWaterAmountForDate(todayKeyNow) }
                    : { date: generationKey, amount: 0 };
            const sleepHistory = await sleepHoursService.getHistory();
            const historySummary = await (await import('../services/historyService')).getHistorySummaryForLLM();
 
            const history = { food: foodLogs, activity: activityLogs, mood: moodLogs, weight: weightLogs, water: waterLog, sleep: sleepHistory };
            const [storedPlan, legacyPlan] = await Promise.all([
                storage.get<DailyPlan>(planStorageKey(generationKey)),
                storage.get<DailyPlan>(storage.keys.DAILY_PLAN),
            ]);
            const legacyForKey = legacyPlan && legacyPlan.date === generationKey ? legacyPlan : null;
            const currentPlanForDate =
                (viewingPlan && viewingPlan.date === generationKey ? viewingPlan : null) ||
                (dailyPlan && dailyPlan.date === generationKey ? dailyPlan : null) ||
                storedPlan ||
                legacyForKey ||
                null;
 
            const resolvedAppContext: AppContext = {
                ...appContext,
                weather: appContext.weather ?? { temp: 20, condition: t('dashboard.weather_clear'), code: 0 },
                currentLocation: appContext.currentLocation ?? t('dashboard.location_loading'),
            };
            const { immediate, upgraded } = await OfflineProxyService.getPlanHybrid(
                user,
                history,
                resolvedAppContext,
                language,
                currentPlanForDate,
                historySummary,
                { allowCloud }
            );
 
            const nowTs = Date.now();
            const timezoneOffsetMinutes = -new Date().getTimezoneOffset();
            const createdAtBase =
                (currentPlanForDate && currentPlanForDate.date === generationKey && typeof (currentPlanForDate as any).createdAt === 'number')
                    ? (currentPlanForDate as any).createdAt
                    : nowTs;
 
            const normalizedPreviousForMerge = currentPlanForDate ? sanitizePlan(currentPlanForDate, generationKey) : null;
            const previousForMerge =
                normalizedPreviousForMerge && normalizedPreviousForMerge.date === generationKey
                    ? normalizedPreviousForMerge
                    : null;
 
            const normalizedImmediate = sanitizePlan(immediate, generationKey, { forceDateKey: true });
            if (normalizedImmediate) {
                const mergedImmediate = mergePlanPreservingCompletedAndPast(normalizedImmediate, previousForMerge);
                const finalImmediate = sanitizePlan(mergedImmediate, generationKey, { forceDateKey: true });
                if (finalImmediate) {
                    const planWithMeta: DailyPlan = {
                        ...finalImmediate,
                        createdAt: createdAtBase,
                        updatedAt: nowTs,
                        generatedAt: nowTs,
                        timezoneOffsetMinutes,
                    };
                    await storage.set(planStorageKey(generationKey), planWithMeta);
                    if (generationKey === todayKeyNow) {
                        setDailyPlan(planWithMeta);
                        await storage.set(storage.keys.DAILY_PLAN, planWithMeta);
                    }
                    if (viewingKey === generationKey) {
                        setViewingPlan(planWithMeta);
                    }
                    if (generationKey === todayKeyNow) {
                        if (notificationsEnabled) {
                            await schedulePlanNotifications(planWithMeta, { mode: notificationPlanMode });
                        } else {
                            await Promise.all([
                                clearNotificationType('plan'),
                                clearNotificationType('hydration'),
                                clearNotificationType('hydration_snooze'),
                            ]);
                        }
                    }
                    if (generationKey === todayKeyNow) {
                        setViewingDate(new Date());
                        setFallbackPlanDateKey(null);
                    } else if (targetDateKey) {
                        setViewingDate(dateFromKey(generationKey));
                    }
                }
            }
 
            if (upgraded) {
                const normalizedUpgrade = sanitizePlan(upgraded, generationKey, { forceDateKey: true });
                if (normalizedUpgrade) {
                    const mergedUpgrade = mergePlanPreservingCompletedAndPast(normalizedUpgrade, previousForMerge);
                    const finalUpgrade = sanitizePlan(mergedUpgrade, generationKey, { forceDateKey: true });
                    if (finalUpgrade) {
                        const planWithMeta: DailyPlan = {
                            ...finalUpgrade,
                            createdAt: createdAtBase,
                            updatedAt: nowTs,
                            generatedAt: nowTs,
                            timezoneOffsetMinutes,
                        };
                        await storage.set(planStorageKey(generationKey), planWithMeta);
                        if (generationKey === todayKeyNow) {
                            setDailyPlan(planWithMeta);
                            await storage.set(storage.keys.DAILY_PLAN, planWithMeta);
                        }
                        if (viewingKey === generationKey) {
                            setViewingPlan(planWithMeta);
                        }
                        if (generationKey === todayKeyNow) {
                            if (notificationsEnabled) {
                                await schedulePlanNotifications(planWithMeta, { mode: notificationPlanMode });
                            } else {
                                await Promise.all([
                                    clearNotificationType('plan'),
                                    clearNotificationType('hydration'),
                                    clearNotificationType('hydration_snooze'),
                                ]);
                            }
                        }
                        if (generationKey === todayKeyNow) {
                            setViewingDate(new Date());
                            setFallbackPlanDateKey(null);
                        } else if (targetDateKey) {
                            setViewingDate(dateFromKey(generationKey));
                        }
                        Alert.alert(t('dashboard.alert.plan_enhanced_title'), t('dashboard.alert.plan_enhanced_body'));
                        // Positive interaction: Plan improved. Check for review.
                        ReviewService.logPositiveInteraction();
                        ReviewService.checkAndRequestReview();
                    }
                }
            }
 
            if (generationKey === todayKeyNow) {
                if (notificationsEnabled) {
                    await scheduleNightlyWrapUpReminder();
                } else {
                    await Promise.all([clearNotificationType('wrapup'), clearNotificationType('wrapup_snooze')]);
                }
            }
        } catch (error) {
            console.error('Plan generation failed:', error);
            if (error instanceof PlanGenerationError) {
                Alert.alert(t('alert.error'), error.message);
            } else {
                Alert.alert(t('alert.error'), t('dashboard.alert.generate_failed'));
            }
        } finally {
            setIsGeneratingPlan(false);
        }
    };
 
    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        await loadLocationAndWeather();
        setRefreshing(false);
    };
 
    // Date Navigation
    const changeDate = (offset: number) => {
        const newDate = new Date(viewingDate);
        newDate.setDate(newDate.getDate() + offset);
        setManualDateOverride(true);
        setViewingDate(newDate);
    };

    const goToToday = () => {
        setManualDateOverride(true);
        setViewingDate(new Date());
    };
 
    const formatViewingDate = () => {
        if (isToday) return t('daily_plan');
        const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
        return viewingDate.toLocaleDateString(language, options);
    };
 
    // Calculate completion stats for the viewed plan
    const viewedPlanCompletion = useMemo(() => {
        const plan = viewingPlan && viewingPlan.date === viewingKey ? viewingPlan : null;
        if (!plan?.items?.length) return { completed: 0, skipped: 0, total: 0, percentage: 0 };
        const completed = plan.items.filter(i => i.completed && !i.skipped).length;
        const skipped = plan.items.filter(i => i.skipped).length;
        const total = plan.items.length;
        return {
            completed,
            skipped,
            total,
            percentage: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }, [viewingPlan, viewingKey]);
 
    // Dynamic progress section title
    const getProgressTitle = () => {
        if (isPast) return t('dashboard.progress_summary', { date: formatViewingDate() });
        if (isFuture) return t('dashboard.progress_planned', { date: formatViewingDate() });
        return t('dashboard.todays_progress');
    };
 
    // Plan Refinement - Regenerate with user feedback
    const handleRefinePlan = async () => {
        if (!user || !refinementFeedback.trim()) return;
        const nowDate = new Date();
        const todayKeyNow = getLocalDateKey(nowDate);
        if (!dailyPlan || dailyPlan.date !== todayKeyNow) {
            Alert.alert(t('dashboard.alert.switch_to_today_title'), t('dashboard.alert.switch_to_today_body'));
            return;
        }

        if (!canAfford(ENERGY_COSTS.PLAN_GENERATION)) {
            Alert.alert(
                t('dashboard.alert.low_energy_title'),
                t('dashboard.alert.low_energy_refine_body', { energy: ENERGY_COSTS.PLAN_GENERATION })
            );
            showAdRecharge();
            return;
        }
 
        setIsRefiningPlan(true);
 
        try {
            const foodLogs = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
            const activityLogs = await storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY) || [];
            const moodLogs = await storage.get<MoodLog[]>(storage.keys.MOOD) || [];
            const weightLogs = await storage.get<WeightLogEntry[]>(storage.keys.WEIGHT) || [];
            const waterLog = await storage.get<{ date: string; amount: number }>(storage.keys.WATER) || { date: getLocalDateKey(new Date()), amount: 0 };
            const sleepHistory = await sleepHoursService.getHistory();
            const historySummary = await (await import('../services/historyService')).getHistorySummaryForLLM();
 
            // Create enhanced context with refinement feedback
            const enhancedContext = {
                ...appContext,
                userFeedback: refinementFeedback,
            };
 
            // Use queue for rate limit protection - pass full payload
            const plan = await llmQueueService.addJobAndWait<DailyPlan>('REFINE_PLAN', {
                userProfile: user,
                foodHistory: foodLogs,
                activityHistory: activityLogs,
                moodHistory: moodLogs,
                weightHistory: weightLogs,
                waterLog: waterLog,
                sleepHistory: sleepHistory,
                appContext: enhancedContext,
                language,
                currentPlan: dailyPlan,
                historySummary,
            }, 'critical');
 
            const normalized = sanitizePlan(plan, todayKeyNow, { forceDateKey: true });
            if (normalized) {
                const merged = mergePlanPreservingCompletedAndPast(normalized, dailyPlan);
                const finalPlan = sanitizePlan(merged, todayKeyNow, { forceDateKey: true });
                if (finalPlan) {
                    const nowTs = Date.now();
                    const timezoneOffsetMinutes = -new Date().getTimezoneOffset();
                    const planWithMeta: DailyPlan = {
                        ...finalPlan,
                        createdAt: typeof (dailyPlan as any).createdAt === 'number' ? (dailyPlan as any).createdAt : nowTs,
                        updatedAt: nowTs,
                        generatedAt: nowTs,
                        timezoneOffsetMinutes,
                    };
                    setDailyPlan(planWithMeta);
                    setViewingPlan(planWithMeta);
                    await storage.set(planStorageKey(todayKeyNow), planWithMeta);
                    await storage.set(storage.keys.DAILY_PLAN, planWithMeta);
                    if (planWithMeta.date === todayKeyNow) {
                        if (notificationsEnabled) {
                            await schedulePlanNotifications(planWithMeta, { mode: notificationPlanMode });
                        } else {
                            await Promise.all([
                                clearNotificationType('plan'),
                                clearNotificationType('hydration'),
                                clearNotificationType('hydration_snooze'),
                            ]);
                        }
                    }
                    setFallbackPlanDateKey(null);
                    setViewingDate(new Date());
                }
            }
            if (notificationsEnabled) {
                await scheduleNightlyWrapUpReminder();
            } else {
                await Promise.all([clearNotificationType('wrapup'), clearNotificationType('wrapup_snooze')]);
            }
            setShowRefinementInput(false);
            setRefinementFeedback('');
            Alert.alert(t('dashboard.alert.plan_refined_title'), t('dashboard.alert.plan_refined_body'));
        } catch (error) {
            console.error('Plan refinement failed:', error);
            if (error instanceof Error && error.name === 'InsufficientEnergyError') {
                Alert.alert(t('dashboard.alert.low_energy_title'), t('dashboard.alert.low_energy_refine_unavailable'));
                showAdRecharge();
                return;
            }
            Alert.alert(t('alert.error'), t('dashboard.alert.refine_failed'));
        } finally {
            setIsRefiningPlan(false);
        }
    };
 
    // Skip a plan item - now uses actionSyncService for cross-channel sync
    const handleSkipPlanItem = async (itemId: string, planDateKey: string) => {
        try {
            // Use sync service - cancels notifications/overlays, uses mutex
            const success = await skipItemWithSync(planDateKey, itemId);
 
            if (success) {
                // Refresh local state - skip scheduling since action already synced
                await loadData({ skipScheduling: true });
                console.log(`[Dashboard] Skipped plan item ${itemId} with sync`);
            }
        } catch (error) {
            console.error('[Dashboard] Failed to skip item:', error);
            // Store for recovery
            await storeFailedAction({ planDate: planDateKey, planItemId: itemId, actionType: 'skip' });
        }
    };
 
    // Toggle plan item completion - now uses actionSyncService for cross-channel sync
    const handleTogglePlanItem = async (itemId: string, planDateKey: string) => {
        const plan =
            (dailyPlan && dailyPlan.date === planDateKey ? dailyPlan : null) ||
            (viewingPlan && viewingPlan.date === planDateKey ? viewingPlan : null);
        if (!plan) return;
 
        const item = plan.items.find(i => i.id === itemId);
        if (!item) return;
 
        const newCompleted = !item.completed;
 
        try {
            if (newCompleted) {
                // Completing - use sync service
                const success = await completeItemWithSync(planDateKey, itemId);
                if (success) {
                    await loadData({ skipScheduling: true });
                    console.log(`[Dashboard] Completed plan item ${itemId} with sync`);
                }
            } else {
                // Uncompleting - use sync service to remove logged data (water, activity, food)
                const success = await uncompleteItemWithSync(planDateKey, itemId);
                if (success) {
                    await loadData({ skipScheduling: true });
                    console.log(`[Dashboard] Uncompleted plan item ${itemId} with sync`);
                }
            }
        } catch (error) {
            console.error('[Dashboard] Failed to toggle item:', error);
            if (newCompleted) {
                await storeFailedAction({ planDate: planDateKey, planItemId: itemId, actionType: 'complete' });
            }
        }
    };
 
    const handleUpdateWater = async (amount: number) => {
        // Only allow modifying water for TODAY
        const todayKeyNow = getLocalDateKey(new Date());
        if (viewingKey !== todayKeyNow) {
            Alert.alert(t('dashboard.alert.historical_view_title'), t('dashboard.alert.historical_view_body'));
            return;
        }
        const current = dailyStats.water + amount;
        const newAmount = Math.max(0, current);
        setDailyStats(prev => ({ ...prev, water: newAmount }));
        await setWaterAmountForDate(todayKeyNow, newAmount);
    };
 
    const logFoodEntry = async (food: FoodAnalysisResult, source: string, updatePlanItem?: boolean) => {
        const existing = await storage.get<FoodLogEntry[]>(storage.keys.FOOD) || [];
        const baseDescription = food.description || food.foodName || '';
        const entry: FoodLogEntry = {
            id: `food-${Date.now()}`,
            timestamp: Date.now(),
            source,
            food: { ...food, description: buildFoodDescriptionWithSource(baseDescription, source) }
        };
        await storage.set(storage.keys.FOOD, [...existing, entry]);
 
        // If we should update the plan item (alternative meal selected)
        if (updatePlanItem && mealDetailItem && mealDetailPlanDateKey) {
            await replaceMealInPlan(mealDetailItem.id, mealDetailPlanDateKey, food);
        }
 
        await loadData();
        Alert.alert(t('dashboard.alert.logged_title'), t('dashboard.alert.logged_food_day', { food: food.foodName }));
 
        // Close modal after successful log
        setMealDetailItem(null);
        setMealDetailPlanDateKey(null);
        setAltMealResult(null);
        setAltMealText('');
    };
 
    // Replace a meal in the plan with an alternative
    const replaceMealInPlan = async (itemId: string, planDateKey: string, newMeal: FoodAnalysisResult) => {
        const storageKey = planStorageKey(planDateKey);
        const plan = await storage.get<DailyPlan>(storageKey);
        if (!plan) return;
 
        const nowTs = Date.now();
        const updatedItems = plan.items.map(item => {
            if (item.id === itemId) {
                return {
                    ...item,
                    title: newMeal.foodName,
                    description: buildFoodDescriptionWithMacros(
                        newMeal.description || newMeal.foodName || '',
                        newMeal.macros?.calories ?? 0,
                        newMeal.macros?.protein ?? 0
                    ),
                    completed: true,
                    completedAt: nowTs,
                    skipped: false,
                    skippedAt: undefined,
                    // Store meal macros for reference
                    macros: newMeal.macros,
                };
            }
            return item;
        });
 
        const updatedPlan: DailyPlan = { ...plan, items: updatedItems, updatedAt: nowTs };
 
        // Save to storage
        await storage.set(storageKey, updatedPlan);
        if (planDateKey === todayKey) {
            await storage.set(storage.keys.DAILY_PLAN, updatedPlan);
        }
 
        // Update state
        if (dailyPlan?.date === planDateKey) {
            setDailyPlan(updatedPlan);
        }
        if (viewingPlan?.date === planDateKey) {
            setViewingPlan(updatedPlan);
        }
 
        console.log(`[Dashboard] Replaced meal "${itemId}" with "${newMeal.foodName}"`);
    };
 
const buildFoodFromSavedMeal = (meal: SavedMeal): FoodAnalysisResult => ({
    foodName: meal.name,
    description: t('dashboard.saved_meal_description', { name: meal.name }),
    ingredients: (meal as any).ingredients || [],
    macros: meal.macros || { calories: 0, protein: 0, carbs: 0, fat: 0 },
    healthGrade: meal.healthGrade || 'B',
    confidence: t('dashboard.meal_confidence_high'),
    advice: t('dashboard.meal_advice_from_favorites')
});
 
    // Context-aware greeting based on hours since user's wake time
    const getGreeting = () => {
        const currentHour = new Date().getHours();
 
        // Get user's wake hour (default 7am)
        let wakeHour = 7;
        if (user?.sleepRoutine?.targetWakeTime) {
            const match = user.sleepRoutine.targetWakeTime.match(/^(\d{1,2}):(\d{2})$/);
            if (match) wakeHour = Number(match[1]);
        }
 
        // Calculate hours since wake (handles wrap-around)
        const hoursSinceWake = (currentHour - wakeHour + 24) % 24;
 
        // Greeting based on time in user's "day", not clock time
        if (hoursSinceWake < 4) return t('good_morning');      // First 4h after wake
        if (hoursSinceWake < 10) return t('good_afternoon');   // 4-10h after wake
        if (hoursSinceWake < 14) return t('good_evening');     // 10-14h after wake
        return t('good_night');                                 // Approaching bed
    };

    const resolvedWeather = appContext.weather ?? {
        temp: 20,
        condition: t('dashboard.weather_clear'),
        code: 0,
    };
    const resolvedLocation = appContext.currentLocation ?? t('dashboard.location_loading');

    const getWeatherLabel = () => {
        const code = resolvedWeather.code;
        if (code === 0) return t('weather.clear');
        if (code === 1 || code === 2 || code === 3) return t('weather.cloudy');
        if (code === 45 || code === 48) return t('weather.foggy');
        if (code >= 51 && code <= 55) return t('weather.drizzle');
        if (code >= 61 && code <= 65) return t('weather.rain');
        if (code >= 71 && code <= 77) return t('weather.snow');
        if (code >= 95) return t('weather.thunderstorm');
        return t('weather.unknown');
    };

    const getContextLocationLabel = () => {
        const raw = String(appContext.contextDetails?.locationType || '').trim().toLowerCase();
        if (!raw) return t('context.detecting');
        const key = `settings.context_correction.${raw}`;
        const translated = t(key);
        if (translated !== key) return translated;
        if (raw === 'outside') return t('settings.context_correction.outside');
        if (raw === 'unknown') return t('settings.context_correction.unknown');
        return raw;
    };

    const getContextStateLabel = () => {
        const raw = String(appContext.userContextState || '').trim().toLowerCase();
        if (!raw) return t('context.detecting');
        const key = `context.${raw}`;
        const translated = t(key);
        return translated !== key ? translated : raw;
    };

    const calorieTarget = dailyTargets.calories || user?.dailyCalorieTarget || 0;
    const proteinTarget =
        dailyTargets.protein ||
        user?.dailyProteinTarget ||
        (user?.weight ? Math.round(user.weight * 1.6) : 0);
    const waterTargetMl = dailyTargets.waterMl || user?.dailyWaterTargetMl || 2500;
    const waterTargetDisplay = useMetric ? waterTargetMl : Math.round(waterTargetMl * 0.033814);
    const sleepTargetHours = 8;

    const getCalorieProgress = () => {
        if (!calorieTarget) return 0;
        return Math.min(100, (dailyStats.calories / calorieTarget) * 100);
    };
 
    const planForViewingDate = viewingPlan && viewingPlan.date === viewingKey ? viewingPlan : null;
    const planMeta = planForViewingDate
        ? (() => {
            const items = planForViewingDate.items || [];
            const completed = items.filter(item => item.completed).length;
            const missed = items.filter(item => !item.completed && (item.skipped || item.missed)).length;
            const pending = items.filter(item => !item.completed && !(item.skipped || item.missed)).length;
            const total = items.length;
            const updatedAt =
                planForViewingDate.updatedAt ||
                planForViewingDate.generatedAt ||
                planForViewingDate.createdAt;
            return { completed, missed, pending, total, updatedAt };
        })()
        : null;
 
    return (
        <SafeAreaView style={styles.container}>
            {/* Dashboard Content */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Neural Battery Widget */}
                {dailyPlan?.bioLoadSnapshot && (
                    <BatteryWidget />
                )}
                <BioWidget compact onPress={() => navigation.navigate('BioDetail')} />

                {/* Header Section */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>{getGreeting()}</Text>
                        <Text style={styles.userName}>{user?.name || t('dashboard.welcome_fallback')}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <QueueStatusBadge />
                        <BatteryWidget compact onPress={showAdRecharge} />
                        <TouchableOpacity
                            style={styles.profileButton}
                            onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab' })}
                        >
                            <Text style={styles.profileEmoji}>👤</Text>
                        </TouchableOpacity>
                    </View>
                </View>
 
                {/* Weather Card */}
                <View style={styles.weatherCard}>
                    <View style={styles.weatherInfo}>
                        <Text style={styles.weatherTemp}>{Math.round(resolvedWeather.temp)}°C</Text>
                        <Text style={styles.weatherCondition}>{getWeatherLabel()}</Text>
                    </View>
                    <Text style={styles.location}>📍 {resolvedLocation}</Text>
                    <View style={styles.contextStatusRow}>
                        <View style={styles.contextChip}>
                            <Text style={styles.contextChipText}>📍 {getContextLocationLabel()}</Text>
                        </View>
                        <View style={[styles.contextChip, styles.contextChipSecondary]}>
                            <Text style={styles.contextChipText}>🧭 {getContextStateLabel()}</Text>
                        </View>
                    </View>
                </View>
 
                {/* Daily Stats - Tap for detailed breakdown */}
                <TouchableOpacity onPress={() => setShowProgressDetail(true)} activeOpacity={0.8}>
                    <View style={styles.statsCard}>
                        <View style={styles.cardTitleRow}>
                            <Text style={styles.cardTitle}>{getProgressTitle()}</Text>
                            <Text style={styles.tapHint}>{t('dashboard.tap_for_details')}</Text>
                        </View>
 
                        {/* Historical badge for past dates */}
                        {isPast && (
                            <View style={styles.historicalBadge}>
                                <Text style={styles.historicalText}>{t('dashboard.historical_view')}</Text>
                            </View>
                        )}
 
                        {/* Future badge for upcoming dates */}
                        {isFuture && (
                            <View style={styles.futureBadge}>
                                <Text style={styles.futureText}>{t('dashboard.future_view')}</Text>
                            </View>
                        )}
 
                        {/* Plan completion bar */}
                        {viewedPlanCompletion.total > 0 && (
                            <View style={styles.completionSection}>
                                <View style={styles.planCompletionBar}>
                                    <View style={[styles.planCompletionFill, { width: `${viewedPlanCompletion.percentage}%` }]} />
                                </View>
                                <Text style={styles.planCompletionText}>
                                    {t('dashboard.plan_completion', {
                                        completed: viewedPlanCompletion.completed,
                                        total: viewedPlanCompletion.total,
                                        percent: viewedPlanCompletion.percentage,
                                    })}
                                    {viewedPlanCompletion.skipped > 0
                                        ? ` ${t('dashboard.plan_skipped', { skipped: viewedPlanCompletion.skipped })}`
                                        : ''}
                                </Text>
                            </View>
                        )}
 
                        <View style={styles.statsRow}>
                            <StatItem
                                emoji="🔥"
                                value={dailyStats.calories}
                                unit={t('units.kcal')}
                                label={t('calories')}
                                progress={getCalorieProgress()}
                                color="#f97316"
                                target={Math.round(calorieTarget)}
                                targetUnit={t('units.kcal')}
                                targetLabel={t('goal')}
                            />
                            <StatItem
                                emoji="💪"
                                value={dailyStats.protein}
                                unit={t('units.g')}
                                label={t('protein')}
                                progress={proteinTarget ? (dailyStats.protein / proteinTarget) * 100 : 0}
                                color="#06b6d4"
                                target={proteinTarget}
                                targetUnit={t('units.g')}
                                targetLabel={t('goal')}
                            />
                            <StatItem
                                emoji="💧"
                                value={useMetric ? dailyStats.water : Math.round(dailyStats.water * 0.033814)}
                                unit={useMetric ? t('units.ml') : t('units.oz')}
                                label={t('water')}
                                progress={waterTargetMl ? (dailyStats.water / waterTargetMl) * 100 : 0}
                                color="#3b82f6"
                                target={waterTargetDisplay}
                                targetUnit={useMetric ? t('units.ml') : t('units.oz')}
                                targetLabel={t('goal')}
                            />
                            <StatItem
                                emoji="😴"
                                value={Number(dailyStats.sleep.toFixed(1))}
                                unit={t('units.h')}
                                label={t('sleep')}
                                progress={sleepTargetHours ? (dailyStats.sleep / sleepTargetHours) * 100 : 0}
                                color="#8b5cf6"
                                target={sleepTargetHours}
                                targetUnit={t('units.h')}
                                targetLabel={t('goal')}
                            />
                        </View>
                        {/* Water quick add - only for today */}
                        {isToday && (
                            <View style={styles.waterButtons}>
                                <TouchableOpacity style={styles.waterBtn} onPress={() => handleUpdateWater(250)}>
                                    <Text style={styles.waterBtnText}>
                                        {t('dashboard.add_water', { amount: 250, unit: t('dashboard.unit_ml') })}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.waterBtn} onPress={() => handleUpdateWater(500)}>
                                    <Text style={styles.waterBtnText}>
                                        {t('dashboard.add_water', {
                                            amount: useMetric ? 500 : 17,
                                            unit: useMetric ? t('dashboard.unit_ml') : t('dashboard.unit_oz'),
                                        })}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {/* Show hint for past/future dates */}
                        {!isToday && (
                            <TouchableOpacity style={styles.goToTodayHint} onPress={goToToday}>
                                <Text style={styles.goToTodayText}>{t('dashboard.go_to_today_to_log')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </TouchableOpacity>

                {sleepDrafts.length > 0 && (
                    <View style={styles.sleepDraftCard}>
                        <Text style={styles.cardTitle}>{t('sleep_draft.title')}</Text>
                        <Text style={styles.sleepDraftSubtitle}>{t('sleep_draft.subtitle')}</Text>
                        {sleepDrafts.map(draft => {
                            const canConfirm = !!draft.wakeTime;
                            const endLabel = draft.wakeTime ? formatSleepDraftTime(draft.wakeTime) : t('sleep_draft.in_progress');
                            return (
                                <View key={draft.id} style={styles.sleepDraftItem}>
                                    <View style={styles.sleepDraftInfo}>
                                        <Text style={styles.sleepDraftStatus}>{getSleepDraftStatusLabel(draft)}</Text>
                                        <Text style={styles.sleepDraftTime}>
                                            {t('sleep_draft.time_range', {
                                                start: formatSleepDraftTime(draft.sleepStartTime),
                                                end: endLabel,
                                            })}
                                        </Text>
                                        <Text style={styles.sleepDraftDuration}>
                                            {t('sleep_draft.duration', { duration: formatSleepDraftHours(draft.durationHours) })}
                                        </Text>
                                    </View>
                                    <View style={styles.sleepDraftActions}>
                                        {!draft.wakeTime && (
                                            <TouchableOpacity
                                                style={styles.sleepDraftEndNow}
                                                onPress={() => handleEndSleepNow(draft)}
                                            >
                                                <Text style={styles.sleepDraftEndNowText}>{t('sleep_draft.end_now')}</Text>
                                            </TouchableOpacity>
                                        )}
                                        <TouchableOpacity
                                            style={styles.sleepDraftEdit}
                                            onPress={() => handleEditSleepDraft(draft)}
                                        >
                                            <Text style={styles.sleepDraftEditText}>{t('sleep_draft.edit_action')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                styles.sleepDraftConfirm,
                                                !canConfirm && styles.sleepDraftConfirmDisabled,
                                            ]}
                                            onPress={() => handleConfirmSleepDraft(draft)}
                                            disabled={!canConfirm}
                                        >
                                            <Text style={styles.sleepDraftConfirmText}>{t('sleep_draft.confirm_action')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.sleepDraftDiscard}
                                            onPress={() => handleDiscardSleepDraft(draft)}
                                        >
                                            <Text style={styles.sleepDraftDiscardText}>{t('sleep_draft.discard_action')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Bio Load Card */}
                {dailyPlan?.bioLoadSnapshot && (
                    <View style={styles.bioCard}>
                        <Text style={styles.cardTitle}>{t('dashboard.energy_today')}</Text>
                        <View style={styles.bioStats}>
                            <BioStat label={t('dashboard.bio.neural_battery')} value={dailyPlan.bioLoadSnapshot.neuralBattery} />
                            <BioStat label={t('dashboard.bio.physical_recovery')} value={dailyPlan.bioLoadSnapshot.physicalRecovery} />
                        </View>
                        <Text style={[
                            styles.bioStress,
                            {
                                color: dailyPlan.bioLoadSnapshot.hormonalStress === 'high' ? '#ef4444' :
                                    dailyPlan.bioLoadSnapshot.hormonalStress === 'moderate' ? '#f97316' : '#22c55e'
                            }
                        ]}>
                            {t('dashboard.bio.stress_level', {
                                level: dailyPlan.bioLoadSnapshot.hormonalStress.toUpperCase(),
                            })}
                        </Text>
                    </View>
                )}
 
                {/* Quick Actions */}
                <Text style={styles.sectionTitle}>{t('quick_actions')}</Text>
                <View style={styles.actionsGrid}>
                    <ActionButton
                        emoji="📷"
                        label={t('dashboard.action.scan_food')}
                        onPress={() => navigation.navigate('FoodAnalyzer')}
                        color="#06b6d4"
                    />
                    <ActionButton
                        emoji="✍️"
                        label={t('dashboard.action.log_food')}
                        onPress={() => openQuickLog('log_food')}
                        color="#22c55e"
                    />
                    <ActionButton
                        emoji="💧"
                        label={t('dashboard.action.log_water')}
                        onPress={() => openQuickLog('log_water')}
                        color="#3b82f6"
                    />
                    <ActionButton
                        emoji="📤"
                        label={t('dashboard.action.share_plan')}
                        onPress={async () => {
                            if (shareViewRef.current) {
                                await shareView(shareViewRef.current);
                            } else {
                                shareText(
                                    t('dashboard.share_text'),
                                    `https://bodymode.ai/plan/${dailyPlan?.date}`
                                );
                            }
                        }}
                        color="#ec4899"
                    />
                    <ActionButton
                        emoji="✨"
                        label={t('dashboard.action.generate_plan')}
                        onPress={() => void handleGeneratePlan(isPast ? todayKey : viewingKey)}
                        color="#8b5cf6"
                        loading={isGeneratingPlan}
                    />
                    <ActionButton
                        emoji="😴"
                        label={t('dashboard.action.sleep')}
                        onPress={() => navigation.navigate('SleepTracker')}
                        color="#6366f1"
                    />
                    <ActionButton
                        emoji="🧍"
                        label={t('dashboard.action.body_progress')}
                        onPress={() => navigation.navigate('BodyProgress')}
                        color="#f59e0b"
                    />
                    <ActionButton
                        emoji="🥗"
                        label={t('dashboard.action.smart_fridge')}
                        onPress={() => navigation.navigate('SmartFridge')}
                        color="#10b981"
                    />
                </View>
 
                {/* Today's Plan with Date Navigation */}
                {planForViewingDate ? (
                    <>
                        {/* Date Navigation Header */}
                        <View style={styles.planHeader}>
                            <TouchableOpacity
                                onPress={() => changeDate(-1)}
                                style={styles.dateNavBtn}
                                accessibilityRole="button"
                                accessibilityLabel={t('dashboard.accessibility.previous_day')}
                            >
                                <Text style={styles.dateNavText}>{'<'}</Text>
                            </TouchableOpacity>
                            <View style={styles.dateCenter}>
                                <Text style={styles.sectionTitle}>{formatViewingDate()}</Text>
                                {!isToday && (
                                    <TouchableOpacity onPress={goToToday}>
                                        <Text style={styles.todayLink}>{t('dashboard.go_to_today')}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <TouchableOpacity
                                onPress={() => changeDate(1)}
                                style={styles.dateNavBtn}
                                accessibilityRole="button"
                                accessibilityLabel={t('dashboard.accessibility.next_day')}
                            >
                                <Text style={styles.dateNavText}>{'>'}</Text>
                            </TouchableOpacity>
                        </View>
 
                        {planMeta && (
                            <View style={styles.planMetaRow}>
                                <Text style={styles.planMetaText}>
                                    {t('dashboard.plan_meta.summary', {
                                        energy,
                                        done: planMeta.completed,
                                        total: planMeta.total,
                                        missed: planMeta.missed,
                                        pending: planMeta.pending,
                                    })}
                                </Text>
                                {planMeta.updatedAt && (
                                    <Text style={styles.planMetaSubtext}>
                                        {t('dashboard.plan_meta.updated', {
                                            date: new Date(planMeta.updatedAt).toLocaleString(language),
                                        })}
                                    </Text>
                                )}
                            </View>
                        )}

                        <Text style={styles.planSummary}>{planForViewingDate.summary}</Text>
 
                        {/* Show banner if plan is temporary/generating */}
                        {planForViewingDate.isTemporary && (
                                <PlanGenerationBanner
                                    isTemporary={true}
                                    onRetry={
                                        canAfford(ENERGY_COSTS.PLAN_GENERATION)
                                            ? () => void handleGeneratePlan(planForViewingDate.date)
                                            : undefined
                                    }
                                />
                            )}
 
                        {/* Plan Refinement Button */}
                        {isToday && (
                            <TouchableOpacity
                                style={styles.refineBtn}
                                onPress={() => setShowRefinementInput(!showRefinementInput)}
                            >
                                <Text style={styles.refineBtnText}>
                                    {showRefinementInput ? t('dashboard.refine_cancel') : t('dashboard.refine_plan')}
                                </Text>
                            </TouchableOpacity>
                        )}
 
                        {/* Refinement Input */}
                        {isToday && showRefinementInput && (
                            <View style={styles.refinementCard}>
                                <Text style={styles.refinementLabel}>{t('dashboard.refine_prompt')}</Text>
                                <TextInput
                                    style={styles.refinementInput}
                                    value={refinementFeedback}
                                    onChangeText={setRefinementFeedback}
                                    placeholder={t('dashboard.refine_placeholder')}
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    multiline
                                    numberOfLines={2}
                                />
                                <TouchableOpacity
                                    style={[styles.refinementSubmit, isRefiningPlan && styles.refinementSubmitDisabled]}
                                    onPress={handleRefinePlan}
                                    disabled={isRefiningPlan || !refinementFeedback.trim()}
                                >
                                    {isRefiningPlan ? (
                                        <ActivityIndicator size="small" color="#020617" />
                                    ) : (
                                        <Text style={styles.refinementSubmitText}>{t('dashboard.refine_submit')}</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        )}
 
                        <View style={styles.planItems}>
                            {planForViewingDate.items.map((item) => (
                                <View key={item.id} style={styles.planItemContainer}>
                                    <View style={{ flex: 1 }}>
                                        <PlanItemCard
                                            item={item}
                                            typeLabel={getPlanItemTypeLabel(item.type)}
                                            isMissed={!item.completed && (item.skipped || item.missed)}
                                            missedLabel={t('dashboard.plan_item.missed')}
                                            onPress={() => {
                                                setMealDetailItem(item);
                                                setMealDetailPlanDateKey(planForViewingDate.date);
                                                setAltMealResult(null);
                                                setAltMealText('');
                                            }}
                                        />
                                    </View>
                                    {isToday && (
                                        <TouchableOpacity
                                            style={[styles.doneButton, item.completed && styles.doneButtonCompleted]}
                                            onPress={() => handleTogglePlanItem(item.id, planForViewingDate.date)}
                                        >
                                            <Text style={styles.doneEmoji}>{item.completed ? '✓' : '○'}</Text>
                                        </TouchableOpacity>
                                    )}
                                    {false && (
                                        <TouchableOpacity
                                            style={styles.reminderButton}
                                            onPress={() => onReminderPress(item, planForViewingDate?.date || todayKey)}
                                        >
                                            <Text style={styles.reminderEmoji}>🔔</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                        </View>
                    </>
                ) : (
                    <>
                        <View style={styles.planHeader}>
                            <TouchableOpacity
                                onPress={() => changeDate(-1)}
                                style={styles.dateNavBtn}
                                accessibilityRole="button"
                                accessibilityLabel={t('dashboard.accessibility.previous_day')}
                            >
                                <Text style={styles.dateNavText}>{'<'}</Text>
                            </TouchableOpacity>
                            <View style={styles.dateCenter}>
                                <Text style={styles.sectionTitle}>{formatViewingDate()}</Text>
                                {!isToday && (
                                    <TouchableOpacity onPress={goToToday}>
                                        <Text style={styles.todayLink}>{t('dashboard.go_to_today')}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <TouchableOpacity
                                onPress={() => changeDate(1)}
                                style={styles.dateNavBtn}
                                accessibilityRole="button"
                                accessibilityLabel={t('dashboard.accessibility.next_day')}
                            >
                                <Text style={styles.dateNavText}>{'>'}</Text>
                            </TouchableOpacity>
                        </View>
 
                        {isGeneratingPlan ? (
                            <View style={{ padding: 20 }}>
                                <PlanGenerationBanner />
                            </View>
                        ) : isFuture ? (
                            /* Future date with no plan - show friendly placeholder */
                            <View style={styles.futurePlanPlaceholder}>
                                <Text style={styles.placeholderEmoji}>🌅</Text>
                                <Text style={styles.placeholderTitle}>
                                    {t('dashboard.plan_for_date', { date: formatViewingDate() })}
                                </Text>
                                <Text style={styles.placeholderDesc}>
                                    {t('dashboard.future_plan_desc')}
                                </Text>
                                <TouchableOpacity
                                    style={styles.generateNowBtn}
                                    onPress={() => void handleGeneratePlan(viewingKey)}
                                    disabled={isGeneratingPlan}
                                >
                                    <Text style={styles.generateNowText}>
                                        {t('dashboard.generate_now', { energy: ENERGY_COSTS.PLAN_GENERATION })}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : isPast ? (
                            /* Past date with no plan - show archive message */
                            <View style={styles.noPlanCard}>
                                <Text style={styles.noPlanEmoji}>📜</Text>
                                <Text style={styles.noPlanText}>{t('dashboard.no_plan_found')}</Text>
                                <Text style={styles.noPlanSubtext}>
                                    {t('dashboard.no_plan_recorded')}
                                </Text>
                                <TouchableOpacity style={styles.viewYesterdayButton} onPress={goToToday}>
                                    <Text style={styles.viewYesterdayButtonText}>{t('dashboard.go_to_today')}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.noPlanCard}>
                                <Text style={styles.noPlanEmoji}>🎯</Text>
                                <Text style={styles.noPlanText}>{t('dashboard.no_plan_today_title')}</Text>
                                <Text style={styles.noPlanSubtext}>
                                    {t('dashboard.no_plan_today_body')}
                                </Text>
                                <TouchableOpacity
                                    style={styles.generateButton}
                                    onPress={() => void handleGeneratePlan(viewingKey)}
                                    disabled={isGeneratingPlan}
                                    accessibilityRole="button"
                                    accessibilityLabel={
                                        isGeneratingPlan
                                            ? t('dashboard.accessibility.generating_plan')
                                            : t('dashboard.accessibility.generate_plan_cost', {
                                                energy: ENERGY_COSTS.PLAN_GENERATION,
                                            })
                                    }
                                    accessibilityState={{ busy: isGeneratingPlan, disabled: isGeneratingPlan }}
                                >
                                    {isGeneratingPlan ? (
                                        <ActivityIndicator color="#020617" />
                                    ) : (
                                        <Text style={styles.generateButtonText}>✨ {t('generate_plan')}</Text>
                                    )}
                                </TouchableOpacity>
                                {fallbackPlanDateKey && (
                                    <TouchableOpacity
                                        style={styles.viewYesterdayButton}
                                        onPress={() => {
                                            setManualDateOverride(true);
                                            setViewingDate(dateFromKey(fallbackPlanDateKey));
                                        }}
                                    >
                                        <Text style={styles.viewYesterdayButtonText}>{t('dashboard.view_yesterday')}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </>
                )}
            </ScrollView>
 
            {/* Action Modal for reminders and quick logging */}
            <ActionModal
                visible={showActionModal}
                type={actionModalType}
                item={pendingReminder ?? undefined}
                userProfile={user ?? undefined}
                onComplete={handleActionComplete}
                onSnooze={handleActionSnooze}
                onSkip={handleActionSkip}
                onClose={() => {
                    setShowActionModal(false);
                    setPendingReminder(null);
                }}
                onLogFoodText={async (food: FoodAnalysisResult) => {
                    try {
                        if (pendingReminder && dailyPlan) {
                            await replaceAndLogMeal(food, pendingReminder.id, dailyPlan.date, 'text');
                        } else {
                            await logMealOnly(food, 'text');
                        }
                        await loadData();
                    } catch (error) {
                        console.warn('[Dashboard] Failed to log food from modal:', error);
                    }
                }}
                onLogActivity={(activity: ActivityLogEntry) => {
                    console.log('Logged activity from modal:', activity);
                }}
                onUpdateWater={(amount: number) => {
                    handleUpdateWater(amount);
                }}
                onNavigateToCamera={() => {
                    setShowActionModal(false);
                    if (pendingReminder && dailyPlan) {
                        navigation.navigate('FoodAnalyzer', {
                            replacePlanItemId: pendingReminder.id,
                            replacePlanDateKey: dailyPlan.date,
                            sourceMealTitle: pendingReminder.title,
                        });
                        return;
                    }
                    navigation.navigate('FoodAnalyzer');
                }}
            />
 
            {/* Daily Wrap-Up Modal */}
            {wrapUpData && (
                <DailyWrapUpModal
                    visible={showWrapUpModal}
                    data={wrapUpData}
                    onClose={handleWrapUpClose}
                />
            )}
            {/* Permission Modal */}
            <PermissionModal
                visible={showPermissionModal}
                permissionType="notifications"
                canAskAgain={true}
                onGranted={handleReminderPermissionGranted}
                onDenied={() => {
                    setShowPermissionModal(false);
                    setItemToRemind(null);
                    setReminderPlanDateKey(null);
                }}
                onClose={() => {
                    setShowPermissionModal(false);
                    setItemToRemind(null);
                    setReminderPlanDateKey(null);
                }}
            />
 
            {/* Meal Detail Modal */}
            <Modal
                visible={!!mealDetailItem}
                animationType="slide"
                transparent
                onRequestClose={() => {
                    setMealDetailItem(null);
                    setMealDetailPlanDateKey(null);
                }}
            >
                <View style={styles.overlay}>
                    <View style={styles.mealCard}>
                        <View style={styles.mealHeader}>
                            <View>
                                <Text style={styles.sectionTitle}>{mealDetailItem?.title}</Text>
                                <Text style={styles.mealTime}>{mealDetailItem?.time}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => {
                                    setMealDetailItem(null);
                                    setMealDetailPlanDateKey(null);
                                }}
                            >
                                <Text style={styles.closeText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            style={styles.mealScroll}
                            contentContainerStyle={styles.mealScrollContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            <Text style={styles.mealDesc}>{mealDetailItem?.description}</Text>
 
                            <View style={styles.mealActions}>
                                {mealDetailPlanDateKey === todayKey && (
                                    <TouchableOpacity
                                        style={mealDetailItem?.completed ? styles.mealActionBtnSecondary : styles.mealActionBtn}
                                        onPress={async () => {
                                            if (!mealDetailItem || !mealDetailPlanDateKey) return;
                                            await handleTogglePlanItem(mealDetailItem.id, mealDetailPlanDateKey);
                                            setMealDetailItem(prev => {
                                                if (!prev) return prev;
                                                const nextCompleted = !prev.completed;
                                                return { ...prev, completed: nextCompleted, skipped: false };
                                            });
                                        }}
                                    >
                                        <Text style={styles.mealActionText}>
                                            {mealDetailItem?.completed
                                                ? t('dashboard.meal.mark_not_done')
                                                : t('dashboard.meal.mark_done')}
                                        </Text>
                                    </TouchableOpacity>
                                )}
 
                                {mealDetailItem?.type === 'sleep' || mealDetailItem?.linkedAction === 'start_sleep' ? (
                                    <TouchableOpacity
                                        style={styles.mealActionBtn}
                                        onPress={() => {
                                            navigation.navigate('SleepTracker');
                                            setMealDetailItem(null);
                                            setMealDetailPlanDateKey(null);
                                        }}
                                    >
                                        <Text style={styles.mealActionText}>{t('dashboard.meal.start_sleep_tracker')}</Text>
                                    </TouchableOpacity>
                                ) : mealDetailItem?.type === 'hydration' || mealDetailItem?.linkedAction === 'log_water' ? (
                                    <TouchableOpacity
                                        style={[styles.mealActionBtn, mealDetailPlanDateKey !== todayKey && styles.disabledBtn]}
                                        disabled={mealDetailPlanDateKey !== todayKey}
                                        onPress={async () => {
                                            if (mealDetailPlanDateKey !== todayKey) return;
                                            await handleUpdateWater(250);
                                            if (mealDetailItem && mealDetailPlanDateKey && !mealDetailItem.completed) {
                                                await handleTogglePlanItem(mealDetailItem.id, mealDetailPlanDateKey);
                                                setMealDetailItem(prev => (prev ? { ...prev, completed: true, skipped: false } : prev));
                                            }
                                        }}
                                    >
                                        <Text style={styles.mealActionText}>
                                            {mealDetailPlanDateKey === todayKey
                                                ? t('dashboard.meal.log_water_amount', {
                                                    amount: 250,
                                                    unit: t('dashboard.unit_ml'),
                                                })
                                                : t('dashboard.meal.log_water_today_only')}
                                        </Text>
                                    </TouchableOpacity>
                                ) : (
                                    <>
                                        <TouchableOpacity
                                            style={styles.mealActionBtn}
                                            onPress={async () => {
                                                if (!mealDetailItem) return;
                                                setRecipeLoading(true);
                                                try {
                                                    const planDateKey = mealDetailPlanDateKey || undefined;
                                                    const planItemId = mealDetailItem.id;
                                                    const sourceTitle = mealDetailItem.title;
                                                    const recipe = await generateRecipeForMeal(mealDetailItem.title, mealDetailItem.description || '');
                                                    setMealDetailItem(null);
                                                    setMealDetailPlanDateKey(null);
                                                    navigation.navigate('Recipe', {
                                                        kind: 'meal',
                                                        recipe,
                                                        sourceTitle,
                                                        planDateKey,
                                                        planItemId,
                                                    });
                                                } catch (e) {
                                                    const message = typeof (e as any)?.message === 'string' ? (e as any).message : '';
                                                    const lower = message.toLowerCase();
                                                    const status = (e as any)?.status || (e as any)?.code;
                                                    let detail = t('dashboard.alert.recipe_failed');
                                                    if (lower.includes('api key')) {
                                                        detail = t('dashboard.alert.recipe_api_key');
                                                    } else if (status === 429 || lower.includes('quota') || lower.includes('rate')) {
                                                        detail = t('dashboard.alert.recipe_rate_limit');
                                                    } else if (lower.includes('network') || lower.includes('timeout') || lower.includes('connection') || lower.includes('fetch')) {
                                                        detail = t('dashboard.alert.recipe_network');
                                                    } else if (lower.includes('invalid json') || lower.includes('parse json')) {
                                                        detail = t('dashboard.alert.recipe_malformed');
                                                    }
                                                    Alert.alert(t('dashboard.alert.recipe_title'), detail);
                                                } finally {
                                                    setRecipeLoading(false);
                                                }
                                            }}
                                        >
                                            {recipeLoading ? (
                                                <ActivityIndicator color="#fff" />
                                            ) : (
                                                <Text style={styles.mealActionText}>{t('dashboard.meal.get_recipe')}</Text>
                                            )}
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.mealActionBtnSecondary}
                                            onPress={() => {
                                                // Pass replacement context so camera can show "Use Instead" option
                                                navigation.navigate('FoodAnalyzer', {
                                                    replacePlanItemId: mealDetailItem?.id,
                                                    replacePlanDateKey: mealDetailPlanDateKey || undefined,
                                                    sourceMealTitle: mealDetailItem?.title,
                                                });
                                                setMealDetailItem(null);
                                                setMealDetailPlanDateKey(null);
                                            }}
                                        >
                                            <Text style={styles.mealActionText}>{t('dashboard.meal.scan_camera')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.mealActionBtnSecondary}
                                            onPress={() => {
                                                navigation.navigate('MainTabs', { screen: 'CoachTab' });
                                                setMealDetailItem(null);
                                                setMealDetailPlanDateKey(null);
                                            }}
                                        >
                                            <Text style={styles.mealActionText}>{t('dashboard.meal.manual_text')}</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>

                            {mealDetailItem?.type === 'meal' && (
                                <View style={styles.altMeal}>
                                    <Text style={styles.mealSubhead}>{t('dashboard.meal.want_another')}</Text>
                                    <TextInput
                                        style={styles.altMealInput}
                                        placeholder={t('dashboard.meal.alt_meal_placeholder')}
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        value={altMealText}
                                        onChangeText={setAltMealText}
                                        multiline
                                    />
                                    <TouchableOpacity
                                        style={[styles.mealActionBtn, altMealLoading && styles.disabledBtn]}
                                        disabled={altMealLoading || !altMealText.trim()}
                                        onPress={async () => {
                                            if (!altMealText.trim()) return;
                                            setAltMealLoading(true);
                                            try {
                                                const [
                                                    foodHistory,
                                                    activityHistory,
                                                    moodHistory,
                                                    weightHistory,
                                                    waterLog,
                                                    sleepHistory,
                                                    historySummary,
                                                ] = await Promise.all([
                                                    storage.get<FoodLogEntry[]>(storage.keys.FOOD),
                                                    storage.get<ActivityLogEntry[]>(storage.keys.ACTIVITY),
                                                    storage.get<MoodLog[]>(storage.keys.MOOD),
                                                    storage.get<WeightLogEntry[]>(storage.keys.WEIGHT),
                                                    storage.get<{ date: string; amount: number }>(storage.keys.WATER),
                                                    sleepHoursService.getHistory(),
                                                    storage.get<string>('history_summary'),
                                                ]);
 
                                                const deepContext = {
                                                    foodHistory: foodHistory || [],
                                                    activityHistory: activityHistory || [],
                                                    moodHistory: moodHistory || [],
                                                    weightHistory: weightHistory || [],
                                                    waterLog: waterLog || { date: new Date().toDateString(), amount: 0 },
                                                    sleepHistory: sleepHistory || [],
                                                    appContext,
                                                    currentPlan: dailyPlan,
                                                    historySummary: historySummary || undefined,
                                                };
 
                                                const result = await analyzeTextFood(altMealText.trim(), user || undefined, language, deepContext);
                                                setAltMealResult(result);
                                            } catch (e) {
                                                Alert.alert(t('dashboard.alert.analysis_title'), t('dashboard.alert.analysis_failed'));
                                            } finally {
                                                setAltMealLoading(false);
                                            }
                                        }}
                                    >
                                        {altMealLoading ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <Text style={styles.mealActionText}>{t('dashboard.meal.analyze_save')}</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}

                            {mealDetailItem?.type === 'meal' && savedMeals.length > 0 && (
                                <View style={styles.favoritesSection}>
                                    <Text style={styles.mealSubhead}>{t('dashboard.meal.saved_meals')}</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {savedMeals.map((meal, idx) => (
                                            <View key={meal.id || idx} style={styles.favoriteCard}>
                                                <Text style={styles.recipeTitle}>{meal.name}</Text>
                                                {meal.macros && (
                                                    <Text style={styles.recipeText}>
                                                        {t('dashboard.meal.macros_short', {
                                                            calories: Math.round(meal.macros.calories),
                                                            protein: Math.round(meal.macros.protein),
                                                            carbs: Math.round(meal.macros.carbs),
                                                            fat: Math.round(meal.macros.fat),
                                                        })}
                                                    </Text>
                                                )}
                                                <View style={styles.recipeActions}>
                                                    {/* Select - puts it in altMealResult for preview */}
                                                    <TouchableOpacity
                                                        style={styles.mealActionBtnSecondary}
                                                        onPress={() => {
                                                            const food = buildFoodFromFavorite(meal);
                                                            setAltMealResult(food);
                                                        }}
                                                    >
                                                        <Text style={styles.mealActionText}>{t('dashboard.meal.preview')}</Text>
                                                    </TouchableOpacity>
                                                    {/* Log Only - does NOT replace */}
                                                    <TouchableOpacity
                                                        style={styles.mealActionBtnSecondary}
                                                        onPress={async () => {
                                                            try {
                                                                const food = buildFoodFromFavorite(meal);
                                                                await logMealOnly(food, 'favorite');
                                                                Alert.alert(t('dashboard.alert.logged_title'), t('dashboard.alert.logged_food_log', { food: meal.name }));
                                                                await loadData();
                                                            } catch (error) {
                                                                Alert.alert(t('alert.error'), t('dashboard.alert.log_meal_failed'));
                                                            }
                                                        }}
                                                    >
                                                        <Text style={styles.mealActionText}>{t('dashboard.meal.log')}</Text>
                                                    </TouchableOpacity>
                                                    {/* Use Instead - replaces plan item */}
                                                    <TouchableOpacity
                                                        style={styles.mealActionBtn}
                                                        onPress={async () => {
                                                            if (!mealDetailItem || !mealDetailPlanDateKey) return;
                                                            const food = buildFoodFromFavorite(meal);
                                                            Alert.alert(
                                                                t('dashboard.alert.replace_plan_title'),
                                                                t('dashboard.alert.replace_plan_body', {
                                                                    from: mealDetailItem.title,
                                                                    to: meal.name,
                                                                }),
                                                                [
                                                                    { text: t('cancel'), style: 'cancel' },
                                                                    {
                                                                        text: t('dashboard.alert.replace_action'),
                                                                        onPress: async () => {
                                                                            try {
                                                                                await replaceAndLogMeal(
                                                                                    food,
                                                                                    mealDetailItem.id,
                                                                                    mealDetailPlanDateKey,
                                                                                    'favorite'
                                                                                );
                                                                                Alert.alert(
                                                                                    t('dashboard.alert.replaced_title'),
                                                                                    t('dashboard.alert.replaced_body')
                                                                                );
                                                                                setMealDetailItem(null);
                                                                                setMealDetailPlanDateKey(null);
                                                                                await loadData();
                                                                            } catch (error) {
                                                                                Alert.alert(t('alert.error'), t('dashboard.alert.replace_failed'));
                                                                            }
                                                                        }
                                                                    }
                                                                ]
                                                            );
                                                        }}
                                                    >
                                                        <Text style={styles.mealActionText}>{t('dashboard.meal.use')}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
 
                            {mealDetailItem?.type === 'meal' && altMealResult && (
                                <View style={styles.recipeCard}>
                                    <Text style={styles.recipeTitle}>{altMealResult.foodName}</Text>
                                    <Text style={styles.recipeText}>{altMealResult.description}</Text>
                                    <Text style={styles.recipeText}>
                                        {t('dashboard.meal.macros_long', {
                                            calories: Math.round(altMealResult.macros.calories),
                                            protein: Math.round(altMealResult.macros.protein),
                                            carbs: Math.round(altMealResult.macros.carbs),
                                            fat: Math.round(altMealResult.macros.fat),
                                        })}
                                    </Text>
                                    <View style={styles.recipeActions}>
                                        {/* Save to Favorites */}
                                        <TouchableOpacity
                                            style={styles.mealActionBtnSecondary}
                                            onPress={async () => {
                                                if (!altMealResult) return;
                                                const existing = await storage.get<SavedMeal[]>(storage.keys.SAVED_MEALS) || [];
                                                const next: SavedMeal[] = [...existing, {
                                                    id: `fav-${Date.now()}`,
                                                    name: altMealResult.foodName,
                                                    macros: altMealResult.macros,
                                                    healthGrade: altMealResult.healthGrade || 'B',
                                                }];
                                                await storage.set(storage.keys.SAVED_MEALS, next);
                                                setSavedMeals(next);
                                                Alert.alert(t('dashboard.alert.saved_title'), t('dashboard.alert.saved_favorite_body'));
                                            }}
                                        >
                                            <Text style={styles.mealActionText}>{t('dashboard.meal.save')}</Text>
                                        </TouchableOpacity>

                                        {/* Log Only - does NOT replace plan item */}
                                        <TouchableOpacity
                                            style={styles.mealActionBtnSecondary}
                                            onPress={async () => {
                                                if (!altMealResult) return;
                                                try {
                                                    await logMealOnly(altMealResult, 'manual_alt');
                                                    Alert.alert(t('dashboard.alert.logged_title'), t('dashboard.alert.logged_food_log', { food: altMealResult.foodName }));
                                                    setMealDetailItem(null);
                                                    setMealDetailPlanDateKey(null);
                                                    setAltMealResult(null);
                                                    setAltMealText('');
                                                    await loadData();
                                                } catch (error) {
                                                    console.error('Failed to log meal:', error);
                                                    Alert.alert(t('alert.error'), t('dashboard.alert.log_meal_failed_retry'));
                                                }
                                            }}
                                        >
                                            <Text style={styles.mealActionText}>{t('dashboard.meal.log_this')}</Text>
                                        </TouchableOpacity>

                                        {/* Use Instead - replaces plan item AND logs */}
                                        <TouchableOpacity
                                            style={styles.mealActionBtn}
                                            onPress={async () => {
                                                if (!altMealResult || !mealDetailItem || !mealDetailPlanDateKey) return;
                                                Alert.alert(
                                                    t('dashboard.alert.replace_plan_title'),
                                                    t('dashboard.alert.replace_plan_confirm_body', {
                                                        from: mealDetailItem.title,
                                                        to: altMealResult.foodName,
                                                    }),
                                                    [
                                                        { text: t('cancel'), style: 'cancel' },
                                                        {
                                                            text: t('dashboard.alert.replace_action'),
                                                            onPress: async () => {
                                                                try {
                                                                    await replaceAndLogMeal(
                                                                        altMealResult,
                                                                        mealDetailItem.id,
                                                                        mealDetailPlanDateKey,
                                                                        'manual_alt'
                                                                    );
                                                                    Alert.alert(
                                                                        t('dashboard.alert.replaced_title'),
                                                                        t('dashboard.alert.replaced_body')
                                                                    );
                                                                    setMealDetailItem(null);
                                                                    setMealDetailPlanDateKey(null);
                                                                    setAltMealResult(null);
                                                                    setAltMealText('');
                                                                    await loadData();
                                                                } catch (error) {
                                                                    console.error('Failed to replace meal:', error);
                                                                    Alert.alert(t('alert.error'), t('dashboard.alert.replace_failed_retry'));
                                                                }
                                                            }
                                                        }
                                                    ]
                                                );
                                            }}
                                        >
                                            <Text style={styles.mealActionText}>{t('dashboard.meal.use_instead')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
 
            {/* Progress Detail Modal */}
            <ProgressDetailModal
                visible={showProgressDetail}
                onClose={() => setShowProgressDetail(false)}
                foodLogs={[]} // Loaded dynamically below
                activityLogs={[]}
                waterAmount={dailyStats.water}
                sleepHours={dailyStats.sleep}
                viewingDate={viewingDate}
                useMetric={useMetric}
                onEditSleep={() => navigation.navigate('SleepEdit', { dateKey: viewingKey })}
            />
 
            {/* Hidden Share Card for Screenshotting */}
            {dailyPlan && (
                <View style={{ position: 'absolute', top: 3000, left: 0, opacity: 0 }}>
                    <ShareCard
                        viewRef={shareViewRef}
                        date={new Date().toLocaleDateString(language, { weekday: 'long', day: 'numeric' })}
                        neuralBattery={dailyPlan.bioLoadSnapshot?.neuralBattery || 75}
                        streak={3} // TODO: hook up real streak
                    />
                </View>
            )}
        </SafeAreaView>
    );
};
 
// Sub-components - Memoized to prevent unnecessary re-renders
const StatItem: React.FC<{
    emoji: string;
    value: number;
    unit: string;
    label: string;
    progress: number;
    color: string;
    target?: number;
    targetUnit?: string;
    targetLabel?: string;
}> = React.memo(({ emoji, value, unit, label, progress, color, target, targetUnit, targetLabel }) => (
    <View style={styles.statItem}>
        <Text style={styles.statEmoji}>{emoji}</Text>
        <Text style={styles.statValue}>{value}<Text style={styles.statUnit}>{unit}</Text></Text>
        {typeof target === 'number' && target > 0 && (
            <Text style={styles.statTarget}>
                {targetLabel ? `${targetLabel}: ` : ''}
                {target}
                {targetUnit ? ` ${targetUnit}` : ''}
            </Text>
        )}
        <View style={styles.statBar}>
            <View style={[styles.statBarFill, { width: `${Math.min(100, progress)}%`, backgroundColor: color }]} />
        </View>
        <Text style={styles.statLabel}>{label}</Text>
    </View>
));
 
const BioStat: React.FC<{ label: string; value: number }> = React.memo(({ label, value }) => (
    <View style={styles.bioStatItem}>
        <View style={styles.bioStatBar}>
            <View style={[
                styles.bioStatFill,
                { width: `${value}%`, backgroundColor: value > 60 ? '#22c55e' : value > 30 ? '#f97316' : '#ef4444' }
            ]} />
        </View>
        <Text style={styles.bioStatLabel}>{label}: {value}%</Text>
    </View>
));
 
const ActionButton: React.FC<{
    emoji: string;
    label: string;
    onPress: () => void;
    color: string;
    loading?: boolean;
}> = React.memo(({ emoji, label, onPress, color, loading }) => (
    <TouchableOpacity
        style={[styles.actionButton, { borderColor: color }]}
        onPress={onPress}
        activeOpacity={0.7}
        disabled={loading}
    >
        {loading ? (
            <ActivityIndicator color={color} style={{ marginBottom: 8 }} />
        ) : (
            <Text style={styles.actionEmoji}>{emoji}</Text>
        )}
        <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
));
 
const PlanItemCard: React.FC<{
    item: PlanItem;
    typeLabel?: string;
    onPress: () => void;
    isMissed?: boolean;
    missedLabel?: string;
}> = React.memo(({ item, typeLabel, onPress, isMissed, missedLabel }) => (
    <TouchableOpacity
        style={[
            styles.planItem,
            item.completed && styles.planItemCompleted,
            isMissed && !item.completed && styles.planItemMissed,
        ]}
        onPress={onPress}
        activeOpacity={0.7}
    >
        <View style={styles.checkbox} pointerEvents="none">
            {item.completed ? (
                <Text style={styles.checkmark}>✓</Text>
            ) : (
                <View style={styles.checkboxEmpty} />
            )}
        </View>
        <View style={styles.planItemLeft}>
            <Text style={styles.planItemTime}>{item.time}</Text>
            <View style={[
                styles.planItemType,
                {
                    backgroundColor:
                        item.type === 'meal' ? '#14b8a6' :
                            item.type === 'workout' ? '#f97316' :
                                item.type === 'hydration' ? '#3b82f6' :
                                    item.type === 'sleep' ? '#8b5cf6' : '#06b6d4'
                }
            ]}>
                <Text style={styles.planItemTypeText}>{typeLabel || item.type}</Text>
            </View>
        </View>
        <View style={styles.planItemRight}>
            <View style={styles.planItemTitleRow}>
                <Text style={[styles.planItemTitle, item.completed && styles.completedText]}>{item.title}</Text>
                {isMissed && !item.completed && (
                    <View style={styles.missedBadge}>
                        <Text style={styles.missedBadgeText}>{missedLabel}</Text>
                    </View>
                )}
            </View>
            <Text style={styles.planItemDesc} numberOfLines={1}>{item.description}</Text>
        </View>
    </TouchableOpacity>
));
 
const summarizeWrapUps = (
    wrapUps: DailyWrapUp[],
    t: (key: string, options?: Record<string, any>) => string
): string | undefined => {
    if (!wrapUps.length) return undefined;
    const recent = wrapUps.slice(-3);
    const avgAi = recent.reduce((sum, entry) => sum + (entry.aiScore || 0), 0) / recent.length;
    const ratings = recent
        .map(entry => entry.userRating)
        .filter((rating): rating is number => typeof rating === 'number' && rating > 0);
    const avgRating = ratings.length
        ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
        : t('common.not_applicable');
    const focuses = recent.map(entry => entry.tomorrowFocus).filter(Boolean).join('; ');
    return t('dashboard.wrapup.summary_line', {
        ai: avgAi.toFixed(1),
        user: avgRating,
        focus: focuses || t('dashboard.wrapup.summary_focus_varied'),
    });
};
 
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    greeting: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    userName: {
        fontSize: 28,
        fontWeight: '700',
        color: '#ffffff',
    },
    profileButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(6, 182, 212, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileEmoji: {
        fontSize: 24,
    },
    weatherCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    weatherInfo: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 8,
    },
    weatherTemp: {
        fontSize: 32,
        fontWeight: '700',
        color: '#06b6d4',
        marginRight: 12,
    },
    weatherCondition: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    location: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    contextStatusRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 10,
    },
    contextChip: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: 'rgba(6, 182, 212, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.32)',
    },
    contextChipSecondary: {
        backgroundColor: 'rgba(34, 197, 94, 0.12)',
        borderColor: 'rgba(34, 197, 94, 0.32)',
    },
    contextChipText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.88)',
        fontWeight: '600',
    },
    statsCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    sleepDraftCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    sleepDraftSubtitle: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 13,
        marginBottom: 12,
    },
    sleepDraftItem: {
        backgroundColor: 'rgba(2, 6, 23, 0.6)',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        marginBottom: 12,
    },
    sleepDraftInfo: {
        marginBottom: 12,
    },
    sleepDraftStatus: {
        color: '#8b5cf6',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    sleepDraftTime: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    sleepDraftDuration: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 13,
    },
    sleepDraftActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    sleepDraftEndNow: {
        flex: 1,
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.3)',
    },
    sleepDraftEndNowText: {
        color: '#3b82f6',
        fontWeight: '700',
        fontSize: 13,
    },
    sleepDraftEdit: {
        flex: 1,
        backgroundColor: 'rgba(139, 92, 246, 0.12)',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.35)',
    },
    sleepDraftEditText: {
        color: '#8b5cf6',
        fontWeight: '700',
        fontSize: 13,
    },
    sleepDraftConfirm: {
        flex: 1,
        backgroundColor: '#22c55e',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
    },
    sleepDraftConfirmText: {
        color: '#020617',
        fontWeight: '700',
        fontSize: 13,
    },
    sleepDraftConfirmDisabled: {
        opacity: 0.5,
    },
    sleepDraftDiscard: {
        flex: 1,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    sleepDraftDiscardText: {
        color: '#ef4444',
        fontWeight: '700',
        fontSize: 13,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: 16,
    },
    cardTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    tapHint: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statEmoji: {
        fontSize: 24,
        marginBottom: 8,
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#ffffff',
    },
    statUnit: {
        fontSize: 12,
        fontWeight: '400',
        color: 'rgba(255, 255, 255, 0.5)',
    },
    statTarget: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.55)',
        marginTop: 4,
    },
    statBar: {
        width: '80%',
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 2,
        marginTop: 8,
        overflow: 'hidden',
    },
    statBarFill: {
        height: '100%',
        borderRadius: 2,
    },
    statLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 4,
    },
    waterButtons: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 16,
        gap: 12,
    },
    waterBtn: {
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#3b82f6',
    },
    waterBtnText: {
        color: '#3b82f6',
        fontWeight: '600',
    },
    bioCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    bioStats: {
        marginBottom: 12,
    },
    bioStatItem: {
        marginBottom: 12,
    },
    bioStatBar: {
        height: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    bioStatFill: {
        height: '100%',
        borderRadius: 4,
    },
    bioStatLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: 4,
    },
    bioStress: {
        fontSize: 14,
        fontWeight: '500',
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 16,
    },
    actionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    actionButton: {
        width: (width - 52) / 2,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 1,
    },
    actionEmoji: {
        fontSize: 32,
        marginBottom: 8,
    },
    actionLabel: {
        fontSize: 14,
        color: '#ffffff',
        fontWeight: '500',
    },
    planSummary: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: 16,
        fontStyle: 'italic',
    },
    planMetaRow: {
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginBottom: 12,
    },
    planMetaText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        fontWeight: '600',
    },
    planMetaSubtext: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 11,
        marginTop: 4,
    },
    offlineBanner: {
        backgroundColor: 'rgba(34,197,94,0.12)',
        borderColor: 'rgba(34,197,94,0.3)',
        borderWidth: 1,
        color: '#a7f3d0',
        padding: 10,
        borderRadius: 10,
        marginBottom: 12,
        fontSize: 13,
    },
    planItems: {
        marginBottom: 20,
    },
    planItem: {
        flexDirection: 'row',
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        alignItems: 'center',
    },
    planItemMissed: {
        borderLeftWidth: 4,
        borderLeftColor: '#ef4444',
        backgroundColor: 'rgba(127, 29, 29, 0.25)',
    },
    planItemCompleted: {
        opacity: 0.5,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#06b6d4',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    checkboxEmpty: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    checkmark: {
        color: '#06b6d4',
        fontSize: 14,
        fontWeight: 'bold',
    },
    planItemLeft: {
        marginRight: 12,
        alignItems: 'center',
        width: 50,
    },
    planItemTime: {
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: 4,
    },
    planItemType: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    planItemTypeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#ffffff',
    },
    planItemRight: {
        flex: 1,
    },
    planItemTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    planItemTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: 4,
    },
    missedBadge: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.5)',
    },
    missedBadgeText: {
        color: '#fca5a5',
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    completedText: {
        textDecorationLine: 'line-through',
        color: 'rgba(255, 255, 255, 0.5)',
    },
    planItemDesc: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    noPlanCard: {
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        borderRadius: 16,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    noPlanEmoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    noPlanText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: 8,
        textAlign: 'center',
    },
    noPlanSubtext: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 24,
        textAlign: 'center',
    },
    generateButton: {
        backgroundColor: '#06b6d4',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 12,
        minWidth: 180,
        alignItems: 'center',
    },
    generateButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#020617',
    },
    viewYesterdayButton: {
        marginTop: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    viewYesterdayButtonText: {
        fontSize: 14,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.85)',
        textAlign: 'center',
    },
    // Plan Item Reminder Styles
    planItemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    doneButton: {
        padding: 10,
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderRadius: 12,
        height: 50,
        width: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(34, 197, 94, 0.2)',
    },
    doneButtonCompleted: {
        backgroundColor: 'rgba(34, 197, 94, 0.25)',
        borderColor: 'rgba(34, 197, 94, 0.6)',
    },
    doneEmoji: {
        fontSize: 20,
        color: '#22c55e',
        fontWeight: '800',
    },
    reminderButton: {
        padding: 10,
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        borderRadius: 12,
        height: 50,
        width: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.2)',
    },
    reminderEmoji: {
        fontSize: 20,
    },
    // Date Navigation styles
    planHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 20,
        marginBottom: 8,
    },
    dateNavBtn: {
        padding: 12,
    },
    dateNavText: {
        color: '#06b6d4',
        fontSize: 18,
    },
    dateCenter: {
        flex: 1,
        alignItems: 'center',
    },
    todayLink: {
        color: '#06b6d4',
        fontSize: 12,
        marginTop: 2,
    },
    // Plan Refinement styles
    refineBtn: {
        alignSelf: 'flex-end',
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    refineBtnText: {
        color: '#8b5cf6',
        fontSize: 13,
        fontWeight: '500',
    },
    refinementCard: {
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.3)',
        padding: 16,
        marginBottom: 16,
    },
    refinementLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        marginBottom: 8,
    },
    refinementInput: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 8,
        padding: 12,
        color: '#ffffff',
        fontSize: 14,
        marginBottom: 12,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    refinementSubmit: {
        backgroundColor: '#8b5cf6',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
    },
    refinementSubmitDisabled: {
        opacity: 0.5,
    },
    refinementSubmitText: {
        color: '#020617',
        fontWeight: '700',
        fontSize: 14,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        padding: 16,
    },
    mealCard: {
        backgroundColor: '#0f172a',
        borderRadius: 16,
        padding: 16,
        maxHeight: '90%',
        flexShrink: 1,
    },
    mealHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    mealTime: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
    mealScroll: {
        flexShrink: 1,
    },
    mealScrollContent: {
        paddingBottom: 16,
    },
    mealDesc: { color: 'rgba(255,255,255,0.8)', marginBottom: 12 },
    mealActions: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
    mealActionBtn: { backgroundColor: '#06b6d4', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
    mealActionBtnSecondary: { backgroundColor: 'rgba(255,255,255,0.1)', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
    mealActionText: { color: '#ffffff', fontWeight: '600' },
    recipeActions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
    disabledBtn: { opacity: 0.6 },
    altMeal: { marginVertical: 10 },
    mealSubhead: { color: '#ffffff', fontWeight: '600', marginBottom: 6 },
    altMealInput: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        color: '#fff',
        borderRadius: 10,
        padding: 10,
        minHeight: 70,
        textAlignVertical: 'top',
        marginBottom: 8,
    },
    recipeCard: {
        marginTop: 10,
        padding: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    recipeTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 6 },
    recipeSub: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginTop: 6, marginBottom: 4 },
    recipeText: { color: 'rgba(255,255,255,0.8)', marginBottom: 2 },
    recipeTip: { color: '#22c55e', marginTop: 6 },
    favoritesSection: { marginTop: 6, marginBottom: 10 },
    favoriteCard: {
        padding: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        marginRight: 8,
        minWidth: 180,
    },
    closeText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 20,
        fontWeight: '600',
        padding: 8,
    },
    // Date-based progress styles
    historicalBadge: {
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        marginBottom: 12,
        alignSelf: 'center',
    },
    historicalText: {
        color: '#8b5cf6',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
    futureBadge: {
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        marginBottom: 12,
        alignSelf: 'center',
    },
    futureText: {
        color: '#22c55e',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
    completionSection: {
        marginBottom: 12,
    },
    planCompletionBar: {
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    planCompletionFill: {
        height: '100%',
        backgroundColor: '#22c55e',
        borderRadius: 4,
    },
    planCompletionText: {
        fontSize: 12,
        color: '#9ca3af',
        marginTop: 6,
        textAlign: 'center',
    },
    goToTodayHint: {
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
        marginTop: 8,
        alignSelf: 'center',
    },
    goToTodayText: {
        color: '#3b82f6',
        fontSize: 14,
        fontWeight: '600',
    },
    futurePlanPlaceholder: {
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(34, 197, 94, 0.3)',
        borderStyle: 'dashed',
    },
    placeholderEmoji: {
        fontSize: 48,
        marginBottom: 12,
    },
    placeholderTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 8,
    },
    placeholderDesc: {
        fontSize: 14,
        color: '#9ca3af',
        textAlign: 'center',
        marginBottom: 16,
    },
    generateNowBtn: {
        backgroundColor: '#22c55e',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 10,
    },
    generateNowText: {
        color: '#fff',
        fontWeight: '600',
    },
    disabledButton: {
        opacity: 0.5,
    },
});
 
export default DashboardScreen;
 
