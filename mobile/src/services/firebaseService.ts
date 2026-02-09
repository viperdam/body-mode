/**
 * Firebase Service - Centralized Firebase initialization and utilities
 *
 * This service initializes:
 * - Firebase App (core)
 * - Crashlytics (error tracking)
 * - Analytics (usage tracking)
 *
 * All services are FREE on Firebase Spark plan.
 */

// Firebase imports (modular API)
import type { FirebaseAnalyticsTypes } from '@react-native-firebase/analytics';
import {
    getAnalytics,
    logAppOpen,
    logEvent as logAnalyticsEvent,
    logScreenView as logAnalyticsScreenView,
    setAnalyticsCollectionEnabled,
    setUserId as setAnalyticsUserId,
    setUserProperties,
} from '@react-native-firebase/analytics';
import {
    crash as crashApp,
    getCrashlytics,
    log as logCrashMessage,
    recordError,
    setAttribute,
    setCrashlyticsCollectionEnabled,
    setUserId as setCrashlyticsUserId,
} from '@react-native-firebase/crashlytics';

// Track initialization state
let isInitialized = false;
const getAnalyticsInstance = () => getAnalytics();
const getCrashlyticsInstance = () => getCrashlytics();

/**
 * Initialize Firebase services
 * Call this once at app startup (in App.tsx or index.ts)
 */
export const initializeFirebase = async (): Promise<void> => {
    if (isInitialized) {
        console.log('[Firebase] Already initialized');
        return;
    }

    try {
        console.log('[Firebase] Initializing...');

        // Firebase App is auto-initialized by @react-native-firebase/app
        // when google-services.json / GoogleService-Info.plist are present

        const crashlyticsInstance = getCrashlyticsInstance();
        // Enable Crashlytics collection
        await setCrashlyticsCollectionEnabled(crashlyticsInstance, true);
        console.log('[Firebase] Crashlytics enabled');

        const analyticsInstance = getAnalyticsInstance();
        // Enable Analytics collection
        await setAnalyticsCollectionEnabled(analyticsInstance, true);
        console.log('[Firebase] Analytics enabled');

        // Log app open event
        await logAppOpen(analyticsInstance);

        isInitialized = true;
        console.log('[Firebase] Initialization complete');

    } catch (error) {
        console.error('[Firebase] Initialization failed:', error);
        // Don't throw - app should still work without Firebase
    }
};

// ============ CRASHLYTICS HELPERS ============

/**
 * Set user identifier for crash reports
 * Call this after user signs in or profile is loaded
 */
export const setUserId = async (userId: string): Promise<void> => {
    try {
        const crashlyticsInstance = getCrashlyticsInstance();
        const analyticsInstance = getAnalyticsInstance();
        await setCrashlyticsUserId(crashlyticsInstance, userId);
        await setAnalyticsUserId(analyticsInstance, userId);
    } catch (error) {
        console.warn('[Firebase] Failed to set user ID:', error);
    }
};

/**
 * Set custom attributes for crash reports
 * Useful for debugging context (e.g., current screen, feature being used)
 */
export const setUserAttributes = async (attributes: Record<string, string>): Promise<void> => {
    try {
        const crashlyticsInstance = getCrashlyticsInstance();
        const analyticsInstance = getAnalyticsInstance();
        for (const [key, value] of Object.entries(attributes)) {
            await setAttribute(crashlyticsInstance, key, value);
        }
        await setUserProperties(analyticsInstance, attributes);
    } catch (error) {
        console.warn('[Firebase] Failed to set attributes:', error);
    }
};

/**
 * Log a non-fatal error to Crashlytics
 * Use this for caught exceptions that don't crash the app
 */
export const logError = (error: Error, context?: string): void => {
    try {
        const crashlyticsInstance = getCrashlyticsInstance();
        if (context) {
            logCrashMessage(crashlyticsInstance, `Context: ${context}`);
        }
        recordError(crashlyticsInstance, error);
        console.log('[Firebase] Error logged:', error.message);
    } catch (e) {
        console.warn('[Firebase] Failed to log error:', e);
    }
};

/**
 * Log a message to Crashlytics (appears in crash report timeline)
 */
export const logMessage = (message: string): void => {
    try {
        const crashlyticsInstance = getCrashlyticsInstance();
        logCrashMessage(crashlyticsInstance, message);
    } catch (error) {
        console.warn('[Firebase] Failed to log message:', error);
    }
};

/**
 * Force a test crash (for testing Crashlytics integration)
 * WARNING: This will crash the app!
 */
export const testCrash = (): void => {
    console.log('[Firebase] Triggering test crash...');
    const crashlyticsInstance = getCrashlyticsInstance();
    crashApp(crashlyticsInstance);
};

// ============ ANALYTICS HELPERS ============

/**
 * Log a custom analytics event
 */
export const logEvent = async (
    eventName: string,
    params?: Record<string, string | number | boolean>
): Promise<void> => {
    try {
        const analyticsInstance = getAnalyticsInstance();
        await logAnalyticsEvent(
            analyticsInstance,
            eventName as FirebaseAnalyticsTypes.CustomEventName<string>,
            params
        );
    } catch (error) {
        console.warn('[Firebase] Failed to log event:', error);
    }
};

/**
 * Log screen view for analytics
 */
export const logScreenView = async (screenName: string, screenClass?: string): Promise<void> => {
    try {
        const analyticsInstance = getAnalyticsInstance();
        await logAnalyticsScreenView(analyticsInstance, {
            screen_name: screenName,
            screen_class: screenClass || screenName,
        });
    } catch (error) {
        console.warn('[Firebase] Failed to log screen view:', error);
    }
};

// ============ PRE-DEFINED EVENTS FOR BODY MODE ============

/**
 * Log when user generates a daily plan
 */
export const logPlanGenerated = async (planType: 'auto' | 'manual' | 'refresh'): Promise<void> => {
    await logEvent('plan_generated', { plan_type: planType });
};

/**
 * Log when user scans food
 */
export const logFoodScanned = async (method: 'camera' | 'gallery' | 'text'): Promise<void> => {
    await logEvent('food_scanned', { method });
};

/**
 * Log when user logs a meal
 */
export const logMealLogged = async (mealType: string, calories: number): Promise<void> => {
    await logEvent('meal_logged', { meal_type: mealType, calories });
};

/**
 * Log when user completes sleep tracking
 */
export const logSleepTracked = async (durationHours: number, quality: string): Promise<void> => {
    await logEvent('sleep_tracked', { duration_hours: durationHours, quality });
};

/**
 * Log when user watches an ad for energy
 */
export const logAdWatched = async (adType: 'rewarded'): Promise<void> => {
    await logEvent('ad_watched', { ad_type: adType });
};

/**
 * Log when user uses AI coach
 */
export const logCoachChatStarted = async (): Promise<void> => {
    await logEvent('coach_chat_started');
};

/**
 * Log when user completes onboarding
 */
export const logOnboardingComplete = async (): Promise<void> => {
    await logEvent('onboarding_complete');
};

/**
 * Log when user exports data
 */
export const logDataExported = async (): Promise<void> => {
    await logEvent('data_exported');
};

// ============ EXPORTS ============

export default {
    initialize: initializeFirebase,
    setUserId,
    setUserAttributes,
    logError,
    logMessage,
    logEvent,
    logScreenView,
    testCrash,
    // Pre-defined events
    logPlanGenerated,
    logFoodScanned,
    logMealLogged,
    logSleepTracked,
    logAdWatched,
    logCoachChatStarted,
    logOnboardingComplete,
    logDataExported,
};
