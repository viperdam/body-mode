// Analytics Service - Abstraction layer for usage tracking and crash reporting
// Uses Sentry when configured. Install: npx expo install @sentry/react-native

import firebaseService from './firebaseService';

type EventParams = Record<string, string | number | boolean>;

type SentryModule = typeof import('@sentry/react-native');

interface ErrorContext {
    componentStack?: string;
    extra?: Record<string, unknown>;
}

class AnalyticsService {
    private isEnabled: boolean = true;
    private sentryInitialized = false;
    private sentryModule: SentryModule | null = null;

    constructor() {
        if (__DEV__) {
            console.log('[Analytics] Service initialized (development mode)');
        }
    }

    /**
     * Initialize Sentry for crash reporting (no-op if DSN missing).
     */
    initialize() {
        if (this.sentryInitialized) return;

        const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
        if (!dsn) {
            if (__DEV__) {
                console.log('[Analytics] Sentry DSN not set; skipping Sentry init');
            }
            return;
        }

        try {
            // Lazy require to avoid issues in test environments.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Sentry = require('@sentry/react-native') as SentryModule;
            this.sentryModule = Sentry;

            Sentry.init({
                dsn,
                debug: __DEV__,
                enableAutoSessionTracking: true,
                sessionTrackingIntervalMillis: 30000,
                tracesSampleRate: 0.1,
            });

            this.sentryInitialized = true;
            if (__DEV__) {
                console.log('[Analytics] Sentry initialized');
            }
        } catch (error) {
            console.error('[Analytics] Failed to initialize Sentry:', error);
        }
    }

    private getSentry(): SentryModule | null {
        return this.sentryInitialized ? this.sentryModule : null;
    }

    setEnabled(enabled: boolean) {
        this.isEnabled = enabled;
    }

    logScreenView(screenName: string, screenClass?: string) {
        if (!this.isEnabled) return;

        if (__DEV__) {
            console.log(`[Analytics] Screen View: ${screenName}`);
        }

        void firebaseService.logScreenView(screenName, screenClass);

        const Sentry = this.getSentry();
        if (Sentry) {
            Sentry.addBreadcrumb({
                category: 'navigation',
                message: `Viewed ${screenName}`,
                data: screenClass ? { screenClass } : undefined,
                level: 'info',
            });
        }
    }

    logEvent(eventName: string, params?: EventParams) {
        if (!this.isEnabled) return;

        if (__DEV__) {
            console.log(`[Analytics] Event: ${eventName}`, params || '');
        }

        void firebaseService.logEvent(eventName, params);

        const Sentry = this.getSentry();
        if (Sentry) {
            Sentry.addBreadcrumb({
                category: 'user_action',
                message: eventName,
                data: params,
                level: 'info',
            });
        }
    }

    /**
     * Log an error to crash reporting service
     * @param error The error to log
     * @param context Optional context string (e.g., 'FoodAnalyzer', 'GeminiService')
     * @param extras Optional extra data to attach
     */
    logError(error: Error | unknown, context?: string, extras?: Record<string, unknown>) {
        const errorObj = error instanceof Error ? error : new Error(String(error));

        // Always log errors, even when disabled (for debugging)
        console.error(`[Analytics] Error in ${context || 'app'}:`, errorObj.message);

        if (__DEV__) {
            // In development, show full stack trace
            console.error('[Analytics] Stack:', errorObj.stack);
        }

        const Sentry = this.getSentry();
        if (Sentry) {
            Sentry.withScope((scope) => {
                if (context) scope.setTag('context', context);
                if (extras) scope.setExtras(extras);
                Sentry.captureException(errorObj);
            });
        }

        firebaseService.logError(errorObj, context);
    }

    /**
     * Log a warning (non-fatal issue)
     */
    logWarning(message: string, context?: string, extras?: Record<string, unknown>) {
        console.warn(`[Analytics] Warning in ${context || 'app'}:`, message);

        if (this.isEnabled) {
            firebaseService.logMessage(`[Warning] ${context || 'app'}: ${message}`);
        }

        const Sentry = this.getSentry();
        if (Sentry) {
            Sentry.addBreadcrumb({
                category: 'warning',
                message,
                data: { context, ...extras },
                level: 'warning',
            });
        }
    }

    /**
     * Log a fatal error - the app is in an unrecoverable state
     */
    logFatal(error: Error, context?: string) {
        console.error(`[Analytics] FATAL in ${context || 'app'}:`, error);

        const Sentry = this.getSentry();
        if (Sentry) {
            Sentry.withScope((scope) => {
                scope.setLevel('fatal');
                if (context) scope.setTag('context', context);
                Sentry.captureException(error);
            });
        }
    }

    /**
     * Set user properties for analytics
     */
    setUserProperty(name: string, value: string) {
        if (__DEV__) {
            console.log(`[Analytics] Set User Property: ${name}=${value}`);
        }

        void firebaseService.setUserAttributes({ [name]: value });

        const Sentry = this.getSentry();
        if (Sentry) {
            Sentry.setTag(name, value);
        }
    }

    /**
     * Set user ID for analytics tracking
     */
    setUserId(userId: string | null) {
        if (__DEV__) {
            console.log(`[Analytics] Set User ID: ${userId}`);
        }

        if (userId) {
            void firebaseService.setUserId(userId);
        }

        const Sentry = this.getSentry();
        if (Sentry) {
            if (userId) Sentry.setUser({ id: userId });
            else Sentry.setUser(null);
        }
    }

    /**
     * Add context that will be attached to future error reports
     */
    setContext(name: string, context: Record<string, unknown>) {
        if (__DEV__) {
            console.log(`[Analytics] Set Context: ${name}`, context);
        }

        const Sentry = this.getSentry();
        if (Sentry) {
            Sentry.setContext(name, context);
        }
    }

    /**
     * Capture a message (for non-error logging to Sentry)
     */
    captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
        if (__DEV__) {
            console.log(`[Analytics] Message (${level}): ${message}`);
        }

        const Sentry = this.getSentry();
        if (Sentry) {
            Sentry.captureMessage(message, level);
        }
    }

    /**
     * Start a performance transaction
     */
    startTransaction(name: string, op: string) {
        const Sentry = this.getSentry();
        if (Sentry && 'startTransaction' in Sentry) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (Sentry as any).startTransaction({ name, op });
        }
        return null;
    }

    /**
     * Wrap an async function with error tracking
     */
    async trackAsync<T>(
        name: string,
        fn: () => Promise<T>,
        context?: string
    ): Promise<T> {
        try {
            const result = await fn();
            return result;
        } catch (error) {
            this.logError(error, context || name);
            throw error;
        }
    }

    // ========== ASO-Critical Event Tracking ==========

    /**
     * Track first app open (acquisition)
     */
    logFirstOpen() {
        this.logEvent('app_first_open', {
            timestamp: Date.now(),
        });
    }

    /**
     * Track onboarding completion (activation funnel)
     */
    logOnboardingCompleted(params?: { skipped?: boolean; durationMs?: number }) {
        this.logEvent('onboarding_completed', {
            skipped: params?.skipped || false,
            duration_ms: params?.durationMs || 0,
        });
    }

    /**
     * Track plan generation (core value delivery)
     */
    logPlanGenerated(params: { isFirstPlan: boolean; itemCount: number; durationMs: number }) {
        this.logEvent('plan_generated', {
            is_first_plan: params.isFirstPlan,
            item_count: params.itemCount,
            generation_duration_ms: params.durationMs,
        });
    }

    /**
     * Track plan item completed (engagement)
     */
    logPlanItemCompleted(params: { itemType: string; wasOnTime: boolean }) {
        this.logEvent('plan_item_completed', params);
    }

    /**
     * Track review request flow
     */
    logReviewPrompted() {
        this.logEvent('review_prompted', {});
    }

    /**
     * Track streak milestones (retention indicators)
     */
    logStreakMilestone(streakDays: number) {
        this.logEvent('streak_milestone', { streak_days: streakDays });
    }

    /**
     * Track feature usage for ASO keyword optimization
     */
    logFeatureUsed(featureName: string) {
        this.logEvent('feature_used', { feature: featureName });
    }

    /**
     * Track subscription funnel
     */
    logSubscriptionViewed() {
        this.logEvent('subscription_viewed', {});
    }

    logSubscriptionStarted(params: { plan: string; source: string }) {
        this.logEvent('subscription_started', params);
    }
}

export const analytics = new AnalyticsService();
