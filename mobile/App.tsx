// BioSync AI - React Native Mobile App
// Entry point using Expo and React Navigation

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform, AppState, Modal, TouchableOpacity, Linking, InteractionManager, DeviceEventEmitter } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import AppNavigator from './src/navigation/AppNavigator';
import storage from './src/services/storageService';
import { UserProfile, DailyPlan } from './src/types';
import { requestNotificationPermission, setupOverlayNotificationListener } from './src/services/notificationService';
import { cancelAllScheduledOverlays, checkOverlayPermission } from './src/services/overlayService';
import { LanguageProvider, useLanguage } from './src/contexts/LanguageContext';
import { SubscriptionProvider } from './src/contexts/SubscriptionContext';
import { EnergyProvider } from './src/contexts/EnergyContext';
import { PermissionProvider } from './src/contexts/PermissionContext';
import { ErrorBoundary, MedicalDisclaimerModal } from './src/components';
import DisclosureModalContainer from './src/components/DisclosureModalContainer';
import { sleepService } from './src/services/sleepService'; // Register background tasks
import { analytics } from './src/services/analyticsService';
import { markAppStart } from './src/services/performanceService';
import { initBootRecovery } from './src/services/bootRecoveryService';
import { checkAndAutoGenerate, initPlanEventService, subscribe } from './src/services/planEventService';
import { initPlanRetryService } from './src/services/planRetryService';
import { initOverlayEventListeners, syncOverlaysWithCurrentPlan } from './src/services/overlaySchedulerService';
import { processPendingActions, setupOverlayActionListener } from './src/services/overlayActionService';
import { processNativeSleepEvents } from './src/services/sleepEventService';
import { syncPlanFromNative } from './src/services/planSyncService';
import { initializePermissionManager } from './src/services/permissions/PermissionManager';
import { ensureAppDefaults } from './src/services/appDefaultsService';
import { txStoreService } from './src/services/txStoreService';
import { getLocalDateKey } from './src/utils/dateUtils';
import { getActiveDayKey, maybeAdvanceActiveDay } from './src/services/dayBoundaryService';
import { autoPlanService } from './src/services/autoPlanService';
import { midnightPlanService } from './src/services/midnightPlanService';
import { planRefinementService } from './src/services/planRefinementService';
import { migrationService } from './src/services/migrationService';
import { errorRecoveryService } from './src/services/errorRecoveryService';
import { onNetworkEvent } from './src/services/offlineService';
import { getNetlifyFunctionUrl, isNetlifyFunctionAvailable } from './src/services/netlifyGeminiService';
import healthSyncService from './src/services/healthSyncService';
import { healthService } from './src/services/healthService';
import nutritionDbService from './src/services/nutritionDbService';
import { LEGAL_LINKS } from './src/constants/legal';
import { getLegalAcceptance, recordLegalAcceptance, subscribeLegalAcceptance } from './src/services/legalService';
import { subscriptionService } from './src/services/subscriptionService';
import { getAppInstanceId } from './src/services/integrityService';
import { getAgeStatus, AGE_VERIFICATION_EVENT } from './src/services/ageVerificationService';
import { checkDisclaimerAccepted } from './src/components/MedicalDisclaimerModal';
import { startContextMonitoring } from './src/services/contextService';
import { invalidateLLMContextCache } from './src/services/llmContextService';
import { WidgetService } from './src/services/WidgetService';
import { contextWatchdogService } from './src/services/contextWatchdogService';
import { contextTriggerService } from './src/services/contextTriggerService';


import firebaseService from './src/services/firebaseService';
import authService from './src/services/authService';
import firestoreService from './src/services/firestoreService';
import cloudSyncService from './src/services/cloudSyncService';
import settingsSyncService from './src/services/settingsSyncService';
import settingsEffectsService from './src/services/settingsEffectsService';
// Mark app start time IMMEDIATELY (before any other code runs)
markAppStart();

// Helper to prevent indefinite hangs on laggy devices
const timeoutPromise = <T,>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
  let timeoutId: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState<'Welcome' | 'MainTabs' | 'AgeVerification'>('Welcome');
  const [ageVerified, setAgeVerified] = useState<boolean | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const overlaySyncRef = React.useRef(0);
  const ensurePlanCheckRef = React.useRef(0);
  const ensurePlanInFlightRef = React.useRef<Promise<void> | null>(null);
  const savedUserRef = React.useRef<UserProfile | null>(null);
  const backgroundInitRef = React.useRef<Promise<void> | null>(null);

  // Ref to hold the boot recovery cleanup function
  const bootRecoveryCleanupRegex = React.useRef<(() => void) | null>(null);

  const syncOverlaysSafely = React.useCallback(async (reason: string) => {
    const now = Date.now();
    if (now - overlaySyncRef.current < 30000) {
      return;
    }
    overlaySyncRef.current = now;
    try {
      const result = await syncOverlaysWithCurrentPlan();
      console.log(`[App] Overlay sync (${reason}): ${result.scheduled}/${result.total}`);
    } catch (error) {
      console.warn('[App] Overlay sync failed:', error);
    }
  }, []);

  const ensureActiveDayPlan = React.useCallback(async (reason: string) => {
    const now = Date.now();
    if (now - ensurePlanCheckRef.current < 30000) {
      return;
    }
    if (ensurePlanInFlightRef.current) {
      await ensurePlanInFlightRef.current;
      return;
    }
    ensurePlanCheckRef.current = now;

    ensurePlanInFlightRef.current = (async () => {
      try {
        await maybeAdvanceActiveDay({ reason: `ensure_plan_${reason}`, allowWhenSleeping: true });
        const check = await checkAndAutoGenerate({ allowWhenSleeping: true, reason: `app_${reason}` });
        if (!check.needsGeneration) return;

        console.log(`[App] ensureActiveDayPlan (${reason}): ${check.reason || 'needs generation'}`);
        const result = await autoPlanService.generateTodayPlan('APP_FOREGROUND');
        console.log(`[App] ensureActiveDayPlan result: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
      } catch (error) {
        console.warn('[App] ensureActiveDayPlan failed:', error);
      }
    })();

    try {
      await ensurePlanInFlightRef.current;
    } finally {
      ensurePlanInFlightRef.current = null;
    }
  }, []);

  const initializeCritical = React.useCallback(async () => {
    // Run schema migrations early to keep storage consistent.
    try {
      console.log('[App] Running schema migrations...');
      await timeoutPromise(
        migrationService.runMigrations(),
        6000,
        'Schema migration timed out'
      );
      console.log('[App] Schema migrations complete');
    } catch (migrationError) {
      console.error('[App] Migration failed (continuing):', migrationError);
    }

    // Load user profile to decide initial route.
    try {
      const savedUser = await timeoutPromise(
        storage.get<UserProfile>(storage.keys.USER),
        5000,
        'Storage read timed out'
      );
      savedUserRef.current = savedUser;
      const ageStatus = await getAgeStatus();
      setAgeVerified(ageStatus.verified);
      if (!ageStatus.verified) {
        setInitialRoute('AgeVerification');
      } else if (savedUser && savedUser.name) {
        setInitialRoute('MainTabs');
      }
    } catch (e) {
      console.warn('[App] Failed to load user during critical init:', e);
    }
  }, []);

  const refreshAgeStatus = React.useCallback(async () => {
    try {
      const status = await getAgeStatus();
      setAgeVerified(status.verified);
      if (status.verified && initialRoute === 'AgeVerification') {
        setInitialRoute(savedUserRef.current?.name ? 'MainTabs' : 'Welcome');
      }
    } catch (error) {
      console.warn('[App] Failed to refresh age status:', error);
    }
  }, [initialRoute]);

  useEffect(() => {
    let isMounted = true;
    let cleanupOverlayEvents: (() => void) | null = null;
    let cleanupNutritionNetwork: (() => void) | null = null;

    const startBackgroundInit = () => {
      if (backgroundInitRef.current) return;
      backgroundInitRef.current = initializeBackground()
        .finally(() => {
          backgroundInitRef.current = null;
        });
    };

    // Run minimal critical init to render fast, then defer heavy init.
    void (async () => {
      try {
        await initializeCritical();
      } catch (error) {
        console.warn('[App] Critical init failed:', error);
      }
      if (!isMounted) return;
      setIsLoading(false);

      // One-time defaults bootstrap (FULL background mode + high overlays + sleep detection).
      await ensureAppDefaults();

      // Initialize permission manager early (non-blocking) so onboarding/settings buttons work immediately.
      initializePermissionManager().catch((error) => {
        console.warn('[App] Early Permission Manager init failed:', error);
      });

      // Apply settings side-effects (notifications/overlays/auto-sleep) consistently.
      try {
        await settingsEffectsService.initialize();
      } catch (settingsEffectsError) {
        console.warn('[App] Settings effects init failed:', settingsEffectsError);
      }

      // Start context watchdog for background reliability.
      contextWatchdogService.start();
      contextTriggerService.start();

      InteractionManager.runAfterInteractions(() => {
        if (!isMounted) return;
        startBackgroundInit();
      });

      cleanupOverlayEvents = initOverlayEventListeners();
      await sleepService.initializeBackground();
      if (Platform.OS === 'ios') {
        void sleepService.syncIosSleepFromHealthKit('foreground');
      }
      void processNativeSleepEvents();
      await ensureActiveDayPlan('startup');
    })();

    // Initialize plan event service for auto-generation on new day
    const unsubscribeNewDay = subscribe('NEW_DAY_DETECTED', async (data: any) => {
      console.log('[App] NEW_DAY_DETECTED received, ensuring plan...', data?.reason);
      await ensureActiveDayPlan('new_day_event');
    });
    const cleanupPlanEvents = initPlanEventService();

    // Initialize plan retry service to resume any pending retries
    initPlanRetryService();

    // Initialize auto plan service for background generation
    autoPlanService.init();

    // Set up real-time overlay action listener (for Done/Snooze/Skip when app is in foreground)
    const cleanupOverlayActions = setupOverlayActionListener();

    // Check for pending midnight plan + day rollover on cold start/foreground (Android)
    let pendingPlanAppStateSub: any = null;
    if (Platform.OS === 'android') {
      midnightPlanService.checkAndGeneratePending();
      planRefinementService.handleMidnightRollover();
    }

    // Always check for pending work when the app returns to foreground.
    // iOS uses the same hook to process local sleep events and refresh reminders.
    pendingPlanAppStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (Platform.OS === 'android') {
          midnightPlanService.checkAndGeneratePending();
          planRefinementService.handleMidnightRollover();
          void syncPlanFromNative({ emitEvents: true });
          void checkOverlayPermission();
        }
        if (Platform.OS === 'ios') {
          void sleepService.syncIosSleepFromHealthKit('foreground');
        }
        void refreshAgeStatus();
        void processNativeSleepEvents();
        void syncOverlaysSafely('foreground');
        void ensureActiveDayPlan('foreground');
      } else if (state === 'background') {
        void syncOverlaysSafely('background');
      }
    });

    cleanupNutritionNetwork = onNetworkEvent('networkRestored', () => {
      void nutritionDbService.processPendingLookups();
      void cloudSyncService.syncAllNow('network_restored');
    });

    const ageSub = DeviceEventEmitter.addListener(AGE_VERIFICATION_EVENT, refreshAgeStatus);

    return () => {
      isMounted = false;
      // Clean up boot recovery listener
      if (bootRecoveryCleanupRegex.current) {
        bootRecoveryCleanupRegex.current();
      }
      unsubscribeNewDay();
      cleanupPlanEvents();
      cleanupOverlayEvents?.();
      cleanupOverlayActions?.();
      cleanupNutritionNetwork?.();
      settingsEffectsService.destroy();
      pendingPlanAppStateSub?.remove?.();
      ageSub.remove();
      autoPlanService.destroy();
      contextWatchdogService.stop();
      contextTriggerService.stop();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadLegalAcceptance = async () => {
      try {
        const existing = await getLegalAcceptance();
        if (!mounted) return;
        setLegalAccepted(!!existing?.acceptedAt);
      } catch (error) {
        console.warn('[App] Failed to load legal acceptance:', error);
      }
    };
    loadLegalAcceptance();
    const unsubscribe = subscribeLegalAcceptance((value) => {
      setLegalAccepted(!!value?.acceptedAt);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const checkDisclaimer = async () => {
      if (!ageVerified || !legalAccepted) {
        if (mounted) setShowDisclaimer(false);
        return;
      }
      try {
        const accepted = await checkDisclaimerAccepted();
        if (mounted) setShowDisclaimer(!accepted);
      } catch (error) {
        console.warn('[App] Failed to check medical disclaimer:', error);
      }
    };
    void checkDisclaimer();
    return () => {
      mounted = false;
    };
  }, [ageVerified, legalAccepted]);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let unsubscribe: (() => void) | null = null;
    let mounted = true;
    let lastOptionsKey = '';

    const applyContextMonitoring = async () => {
      const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
      const contextEnabled = prefs?.contextSensingEnabled !== false;
      const environmentEnabled = prefs?.environmentSensingEnabled !== false;
      const networkEnabled = prefs?.networkMonitoringEnabled !== false;
      const nextKey = `${contextEnabled ? '1' : '0'}:${environmentEnabled ? '1' : '0'}:${networkEnabled ? '1' : '0'}`;

      if (!mounted) return;

      if (!contextEnabled) {
        if (stop) {
          stop();
          stop = null;
        }
        lastOptionsKey = nextKey;
        return;
      }

      if (stop && lastOptionsKey === nextKey) {
        return;
      }

      if (stop) {
        stop();
        stop = null;
      }

      stop = startContextMonitoring(
        () => {
          invalidateLLMContextCache();
        },
        { environmentEnabled, networkEnabled }
      );
      lastOptionsKey = nextKey;
    };

    void applyContextMonitoring();
    unsubscribe = storage.subscribe((key) => {
      if (key === storage.keys.APP_PREFERENCES) {
        void applyContextMonitoring();
      }
    });

    return () => {
      mounted = false;
      stop?.();
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const refreshWidgetAndContext = () => {
      invalidateLLMContextCache();
      void WidgetService.updateWidgetFromStorage();
    };

    const widgetEvents: Array<Parameters<typeof subscribe>[0]> = [
      'PLAN_GENERATED',
      'PLAN_UPDATED',
      'PLAN_ITEM_COMPLETED',
      'PLAN_ITEM_SKIPPED',
      'FOOD_LOGGED',
      'WATER_LOGGED',
      'ACTIVITY_LOGGED',
      'SLEEP_ANALYZED',
      'WEIGHT_UPDATED',
      'NUTRITION_INSIGHTS_UPDATED',
      'BODY_PROGRESS_UPDATED',
      'PLAN_UPGRADED',
      'PLAN_GENERATION_RECOVERED',
    ];

    const unsubscribers = widgetEvents.map((event) =>
      subscribe(event, () => refreshWidgetAndContext())
    );

    refreshWidgetAndContext();

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const initializeBackground = async () => {
    try {
      // Background initialization (non-blocking to first render).

      // Initialize Firebase (Crashlytics + Analytics)
      try {
        console.log('[App] Initializing Firebase...');
        await firebaseService.initialize();
        console.log('[App] Firebase initialized');
      } catch (firebaseError) {
        console.warn('[App] Firebase init failed:', firebaseError);
        // Continue anyway - app should work without Firebase
      }

      // Initialize Firebase Auth (anonymous by default)
      try {
        console.log('[App] Initializing Firebase Auth...');
        await timeoutPromise(
          authService.initialize(),
          5000,
          'Firebase Auth init timed out'
        );
        console.log('[App] Firebase Auth initialized');
        const authUid = authService.getUid();
        if (authUid) {
          await storage.set(storage.keys.LAST_AUTH_UID, authUid);
        }
      } catch (authError) {
        console.warn('[App] Firebase Auth init failed:', authError);
        // Continue anyway - app should work without Auth
      }

      // Initialize settings sync (preferences -> Firestore)
      try {
        console.log('[App] Initializing settings sync...');
        settingsSyncService.initialize();
        void settingsSyncService.syncPreferences('app_start');
        console.log('[App] Settings sync initialized');
      } catch (settingsError) {
        console.warn('[App] Settings sync init failed:', settingsError);
      }

      // Initialize cloud sync (Firestore backups)
      try {
        console.log('[App] Initializing cloud sync...');
        await timeoutPromise(
          cloudSyncService.initialize(),
          3000,
          'Cloud sync init timed out'
        );
        void cloudSyncService.syncAllNow('app_start');
        console.log('[App] Cloud sync initialized');
      } catch (cloudSyncError) {
        console.warn('[App] Cloud sync init failed:', cloudSyncError);
      }

      // Initialize error recovery service (circuit breaker for LLM)
      try {
        console.log('[App] Initializing error recovery service...');
        await timeoutPromise(
          errorRecoveryService.initialize(),
          3000,
          'Error recovery init timed out'
        );
        console.log('[App] Error recovery service initialized');
      } catch (errorRecoveryErr) {
        console.warn('[App] Error recovery init failed:', errorRecoveryErr);
        // Continue anyway
      }

      // LLM proxy health check (non-blocking)
      try {
        const available = await isNetlifyFunctionAvailable();
        console.log(`[App] Netlify Gemini proxy ${available ? 'available' : 'unreachable'}: ${getNetlifyFunctionUrl()}`);
      } catch (proxyError) {
        console.warn('[App] Netlify Gemini proxy check failed:', proxyError);
      }

      // Check storage quota and cleanup if needed (>80% full)
      try {
        console.log('[App] Checking storage quota...');
        const quota = await timeoutPromise(
          storage.getQuota(),
          5000,
          'Storage quota check timed out'
        );
        console.log(`[App] Storage: ${quota.used.toFixed(2)}MB / ${quota.total}MB (${quota.percentUsed.toFixed(1)}%)`);

        if (quota.percentUsed > 80) {
          console.log('[App] Storage >80% full, running cleanup...');
          const cleanupResult = await storage.cleanup(90); // Delete data >90 days old
          console.log(`[App] Cleanup complete: freed ${cleanupResult.freedMB}MB (${cleanupResult.deletedKeys.length} keys)`);
        }
      } catch (quotaError) {
        console.warn('[App] Storage quota check/cleanup failed:', quotaError);
        // Continue anyway
      }

      let premiumActive = false;
      try {
        console.log('[App] Initializing subscription service...');
        await timeoutPromise(
          subscriptionService.init(),
          5000,
          'Subscription init timed out'
        );
        premiumActive = subscriptionService.isPremiumActive();
        console.log(`[App] Subscription status: ${premiumActive ? 'premium' : 'free'}`);
      } catch (subscriptionError) {
        console.warn('[App] Subscription init failed:', subscriptionError);
        premiumActive = subscriptionService.isPremiumActive();
      }

      if (premiumActive) {
        console.log('[Ads] Skipping Mobile Ads initialization (premium active)');
      }

      // CRITICAL: Initialize Permission Manager FIRST (with timeout)
      try {
        console.log('[App] Initializing Permission Manager...');
        await timeoutPromise(
          initializePermissionManager(),
          5000,
          'Permission Manager init timed out'
        );
        console.log('[App] Permission Manager initialized');
      } catch (permError) {
        console.warn('[App] Failed to initialize Permission Manager:', permError);
        // Continue anyway - permissions will be checked later
      }

      // One-time alarm cleanup/migration BEFORE we schedule anything.
      // This prevents a race where we schedule overlays/notifications and then immediately cancel them.
      // On laggy devices, this can hang, so we cap it at 8 seconds.
      try {
        const alreadyCleaned = await storage.get<boolean>(storage.keys.ALARM_CLEANUP_DONE);
        if (!alreadyCleaned) {
          console.log('[App] One-time alarm cleanup starting...');
          const cleanupPromise = Promise.all([
            Notifications.cancelAllScheduledNotificationsAsync(),
            cancelAllScheduledOverlays()
          ]);

          await timeoutPromise(
            cleanupPromise,
            8000,
            'Alarm cleanup timed out'
          );

          await storage.set(storage.keys.ALARM_CLEANUP_DONE, true);
          console.log('[App] One-time alarm cleanup complete');
        } else {
          console.log('[App] Alarm cleanup already done, skipping');
        }
      } catch (cleanupError) {
        console.warn('[App] Failed to cleanup alarms (continuing to UI):', cleanupError);
      }

      // Seed local nutrition database (common foods) once per install.
      try {
        console.log('[App] Seeding nutrition DB...');
        await timeoutPromise(
          nutritionDbService.ensureSeeded(),
          4000,
          'Nutrition DB seed timed out'
        );
        console.log('[App] Nutrition DB seeded');
      } catch (seedError) {
        console.warn('[App] Nutrition DB seed failed:', seedError);
      }

      // Process any pending nutrition lookups queued while offline.
      try {
        await timeoutPromise(
          nutritionDbService.processPendingLookups(),
          4000,
          'Nutrition lookup retry timed out'
        );
      } catch (pendingError) {
        console.warn('[App] Pending nutrition lookups failed:', pendingError);
      }

      // Initialize health sync (Google Fit / Apple Health) if available.
      try {
        if (healthService.isAvailable()) {
          await timeoutPromise(
            healthSyncService.initialize(),
            5000,
            'Health sync init timed out'
          );
          if (healthSyncService.isHealthSyncEnabled()) {
            const granted = await timeoutPromise(
              healthService.requestPermissions(),
              5000,
              'Health permissions init timed out'
            );
            if (granted) {
              healthSyncService.startPolling();
            } else {
              console.warn('[App] Health sync enabled but permissions not granted');
            }
          }
        }
      } catch (healthInitError) {
        console.warn('[App] Health sync init failed:', healthInitError);
      }

      // Ensure native sleep detection settings are synced on launch (Android)
      try {
        const autoSleepSettings = await storage.get<any>(storage.keys.AUTO_SLEEP_SETTINGS);
        if (autoSleepSettings && Platform.OS === 'android') {
          await sleepService.syncSettingsToNative(autoSleepSettings);
        }
      } catch (sleepSettingsError) {
        console.warn('[App] Failed to sync sleep settings to native:', sleepSettingsError);
      }

      // ANDROID: Initialize TxStore and sync today's plan to native
      // This enables native background workers to read plan data
      if (Platform.OS === 'android' && txStoreService.available()) {
        try {
          console.log('[App] Syncing plan to native TxStore...');
          const activeDayKey = await getActiveDayKey();
          const calendarDayKey = getLocalDateKey(new Date());
          const candidateKeys = activeDayKey === calendarDayKey
            ? [activeDayKey]
            : [activeDayKey, calendarDayKey];

          let plan: DailyPlan | null = null;

          for (const key of candidateKeys) {
            const planKey = `${storage.keys.DAILY_PLAN}_${key}`;
            const candidate = await storage.get<DailyPlan>(planKey);
            if (candidate && (!candidate.date || candidate.date === key)) {
              plan = candidate;
              break;
            }
          }

          if (!plan) {
            const legacy = await storage.get<DailyPlan>(storage.keys.DAILY_PLAN);
            if (legacy && (!legacy.date || candidateKeys.includes(legacy.date))) {
              plan = legacy;
            }
          }

          if (plan) {
            await txStoreService.syncPlan(plan);
            console.log('[App] Plan synced to TxStore for native workers');
          } else {
            console.log(`[App] No plan found for ${candidateKeys.join(', ')}, skipping TxStore sync`);
          }
        } catch (txError) {
          console.warn('[App] TxStore sync failed (non-critical):', txError);
        }
      }

      analytics.initialize();
      // Refresh saved user in the background if critical load failed.
      let savedUser: UserProfile | null = savedUserRef.current;
      if (!savedUser) {
        try {
          savedUser = await timeoutPromise(
            storage.get<UserProfile>(storage.keys.USER),
            8000,
            'Storage read timed out'
          );
          savedUserRef.current = savedUser;
        } catch (e) {
          console.warn('[App] Background storage read failed:', e);
        }
      }
      if (savedUser && savedUser.name) {
        setInitialRoute('MainTabs');
      }

      let instanceId: string | null = null;
      try {
        instanceId = await getAppInstanceId();
      } catch (instanceError) {
        console.warn('[App] Failed to load app instance id:', instanceError);
      }

      try {
        const authUid = authService.getUid();
        if (!authUid && instanceId) {
          await firebaseService.setUserId(instanceId);
        }

        const attributes: Record<string, string> = {};
        if (savedUser?.goal) attributes.goal = savedUser.goal;
        if (savedUser?.planIntensity) attributes.plan_intensity = savedUser.planIntensity;
        if (savedUser?.activityLevel) attributes.activity_level = savedUser.activityLevel;
        if (savedUser?.gender) attributes.gender = savedUser.gender;
        if (instanceId) attributes.app_instance_id = instanceId;

        if (Object.keys(attributes).length > 0) {
          await firebaseService.setUserAttributes(attributes);
        }
      } catch (firebaseUserError) {
        console.warn('[App] Failed to set Firebase user context:', firebaseUserError);
      }

      try {
        await firestoreService.touchUser({
          source: 'app_start',
          appInstanceId: instanceId ?? undefined,
        });
        if (savedUser) {
          await firestoreService.syncUserProfile(savedUser, {
            source: 'app_start',
            appInstanceId: instanceId ?? undefined,
          });
        }
      } catch (firestoreError) {
        console.warn('[App] Failed to sync Firestore user context:', firestoreError);
      }

      // Request notification permissions
      await requestNotificationPermission();
      // Set up overlay notification listener
      setupOverlayNotificationListener();

      // CRITICAL: Process pending actions (with timeout)
      try {
        console.log('[App] Processing pending overlay actions...');
        const actionResult = await timeoutPromise(
          processPendingActions(),
          5000,
          'Pending actions processing timed out'
        );

        if (actionResult.processed > 0) {
          console.log(`[App] Processed ${actionResult.processed} overlay actions:`, actionResult.actions);
        }
        if (actionResult.recovered > 0) {
          console.log(`[App] Recovered ${actionResult.recovered} previously failed actions`);
        }
      } catch (actionError) {
        console.warn('[App] Failed to process overlay actions:', actionError);
      }

      // Sync any native plan changes (overlay/notification actions while app closed).
      if (Platform.OS === 'android') {
        try {
          await syncPlanFromNative({ emitEvents: true });
        } catch (planSyncError) {
          console.warn('[App] Failed to sync plan from native:', planSyncError);
        }
      }

      // Process pending native sleep events (sleep/wake) and sync to plan/LLM pipeline
      if (Platform.OS === 'android') {
        try {
          console.log('[App] Processing pending native sleep events...');
          await processNativeSleepEvents();
        } catch (sleepEventError) {
          console.warn('[App] Failed to process native sleep events:', sleepEventError);
        }
      }

      // SERIALIZATION FIX: Run boot recovery sync ONLY after all cleanup and initialization is complete
      // This prevents deadlock on Native Notification Bridge during cold boot
      // We clear all alarms first (above), then restore them here (Source of Truth pattern)
      console.log('[App] Initialization complete, starting boot recovery sync...');
      bootRecoveryCleanupRegex.current = initBootRecovery();
    } catch (error) {
      analytics.logError(error, 'App.initializeBackground');
    }
  };


  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#06b6d4" />
        <Text style={styles.loadingText}>Loading BioSync AI...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
        <ErrorBoundary>
        <SafeAreaProvider>
          <PermissionProvider>
            <DisclosureModalContainer />
          <LanguageProvider>
            <SubscriptionProvider>
              <EnergyProvider>
                <LegalGate enabled={ageVerified === true}>
                  <AppNavigator key={initialRoute} initialRoute={initialRoute} />
                  <MedicalDisclaimerModal
                    visible={showDisclaimer}
                    onAccept={() => setShowDisclaimer(false)}
                  />
                </LegalGate>
              </EnergyProvider>
            </SubscriptionProvider>
          </LanguageProvider>
          </PermissionProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const LegalGate: React.FC<{ children: React.ReactNode; enabled?: boolean }> = ({ children, enabled = true }) => {
  const { t } = useLanguage();
  const [checking, setChecking] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadAcceptance = async () => {
      try {
        const existing = await getLegalAcceptance();
        if (!mounted) return;
        const isAccepted = !!existing?.acceptedAt;
        setAccepted(isAccepted);
        setConfirmed(isAccepted);
      } finally {
        if (mounted) setChecking(false);
      }
    };
    if (enabled) {
      loadAcceptance();
    } else {
      setChecking(false);
    }
    const unsubscribe = subscribeLegalAcceptance((value) => {
      const isAccepted = !!value?.acceptedAt;
      setAccepted(isAccepted);
      setConfirmed(isAccepted);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [enabled]);

  const openLegal = (url: string) => {
    Linking.openURL(url).catch((error) => {
      console.warn('[LegalGate] Failed to open link:', error);
    });
  };

  const acceptNow = async () => {
    if (!confirmed) return;
    await recordLegalAcceptance();
    setAccepted(true);
  };

  return (
    <>
      {children}
      <Modal visible={enabled && !checking && !accepted} transparent animationType="fade">
        <View style={styles.legalOverlay}>
          <View style={styles.legalCard}>
            <Text style={styles.legalTitle}>{t('legal.accept_title')}</Text>
            <Text style={styles.legalBody}>{t('legal.accept_body')}</Text>

            <View style={styles.legalCheckRow}>
              <TouchableOpacity
                onPress={() => setConfirmed(prev => !prev)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: confirmed }}
                style={styles.legalCheckButton}
              >
                <View style={[styles.legalCheckBox, confirmed && styles.legalCheckBoxChecked]}>
                  <Text style={styles.legalCheckBoxText}>{confirmed ? 'x' : ''}</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.legalCheckLabel}>
                {t('legal.agree_prefix')}{' '}
                <Text style={styles.legalLink} onPress={() => openLegal(LEGAL_LINKS.terms)}>
                  {t('legal.terms')}
                </Text>{' '}
                {t('legal.and')}{' '}
                <Text style={styles.legalLink} onPress={() => openLegal(LEGAL_LINKS.privacy)}>
                  {t('legal.privacy')}
                </Text>
                .
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.legalButton, !confirmed && styles.legalButtonDisabled]}
              onPress={acceptNow}
              accessibilityRole="button"
              accessibilityState={{ disabled: !confirmed }}
              disabled={!confirmed}
            >
              <Text style={styles.legalButtonText}>{t('legal.accept_button')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#020617',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
  },
  legalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  legalCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  legalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  legalBody: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  legalCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  legalCheckButton: {
    marginRight: 12,
  },
  legalCheckBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalCheckBoxChecked: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },
  legalCheckBoxText: {
    color: '#020617',
    fontWeight: '700',
    fontSize: 12,
  },
  legalCheckLabel: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },
  legalLink: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  legalButton: {
    backgroundColor: '#06b6d4',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  legalButtonDisabled: {
    opacity: 0.5,
  },
  legalButtonText: {
    color: '#020617',
    fontWeight: '700',
    fontSize: 16,
  },
});
