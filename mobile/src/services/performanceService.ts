// Performance Service - Track app performance metrics
// Measures cold start, screen renders, API calls, and reports to analytics

import { analytics } from './analyticsService';

// Performance metric types
export type PerformanceMetric = {
    name: string;
    duration: number;
    timestamp: number;
    metadata?: Record<string, string | number | boolean>;
};

// Store for tracking ongoing measurements
const activeTimers: Map<string, number> = new Map();

// Cold start tracking
let appStartTime: number | null = null;
let coldStartReported = false;

// Threshold warnings (in milliseconds)
const THRESHOLDS = {
    COLD_START: 3000,      // 3 seconds max
    SCREEN_RENDER: 500,    // 500ms max
    API_CALL: 10000,       // 10 seconds max
    PLAN_GENERATION: 15000, // 15 seconds max for AI plan
};

/**
 * Mark the app start time (call in App.tsx before any other code)
 */
export const markAppStart = (): void => {
    if (appStartTime === null) {
        appStartTime = Date.now();
        if (__DEV__) {
            console.log('[Performance] App start marked');
        }
    }
};

/**
 * Report cold start complete (call when first interactive screen renders)
 */
export const reportColdStartComplete = (screenName: string = 'MainScreen'): void => {
    if (coldStartReported || appStartTime === null) return;

    const duration = Date.now() - appStartTime;
    coldStartReported = true;

    const metric: PerformanceMetric = {
        name: 'cold_start',
        duration,
        timestamp: Date.now(),
        metadata: { firstScreen: screenName },
    };

    logMetric(metric);

    // Warn if cold start is too slow
    if (duration > THRESHOLDS.COLD_START) {
        analytics.logWarning(
            `Cold start took ${duration}ms (threshold: ${THRESHOLDS.COLD_START}ms)`,
            'Performance',
            { duration, threshold: THRESHOLDS.COLD_START }
        );
    }
};

/**
 * Start timing an operation (returns a stop function)
 */
export const startTimer = (name: string): (() => number) => {
    const startTime = Date.now();
    activeTimers.set(name, startTime);

    return () => {
        const duration = Date.now() - startTime;
        activeTimers.delete(name);
        return duration;
    };
};

/**
 * Time a screen render (use in useEffect on mount)
 */
export const trackScreenRender = (screenName: string): void => {
    const key = `screen_${screenName}`;

    if (!activeTimers.has(key)) {
        activeTimers.set(key, Date.now());
        return; // First call - start timing
    }

    // Second call - report duration
    const startTime = activeTimers.get(key)!;
    const duration = Date.now() - startTime;
    activeTimers.delete(key);

    const metric: PerformanceMetric = {
        name: 'screen_render',
        duration,
        timestamp: Date.now(),
        metadata: { screenName },
    };

    logMetric(metric);

    // Warn if render is too slow
    if (duration > THRESHOLDS.SCREEN_RENDER) {
        analytics.logWarning(
            `Screen ${screenName} render took ${duration}ms`,
            'Performance',
            { screenName, duration, threshold: THRESHOLDS.SCREEN_RENDER }
        );
    }
};

/**
 * Create a screen render tracker hook helper
 * Usage: const trackRender = useScreenRenderTracker('DashboardScreen');
 */
export const createScreenTracker = (screenName: string) => {
    const startTime = Date.now();

    return {
        reportRendered: () => {
            const duration = Date.now() - startTime;

            const metric: PerformanceMetric = {
                name: 'screen_render',
                duration,
                timestamp: Date.now(),
                metadata: { screenName },
            };

            logMetric(metric);

            if (duration > THRESHOLDS.SCREEN_RENDER && __DEV__) {
                console.warn(`[Performance] ${screenName} slow render: ${duration}ms`);
            }
        }
    };
};

/**
 * Time an async API call
 * Usage: const result = await timeAsync('generatePlan', () => generateDailyPlan(...));
 */
export async function timeAsync<T>(
    operationName: string,
    operation: () => Promise<T>,
    options: {
        threshold?: number;
        warnOnSlow?: boolean;
        metadata?: Record<string, string | number | boolean>;
    } = {}
): Promise<T> {
    const {
        threshold = THRESHOLDS.API_CALL,
        warnOnSlow = true,
        metadata = {}
    } = options;

    const startTime = Date.now();

    try {
        const result = await operation();
        const duration = Date.now() - startTime;

        const metric: PerformanceMetric = {
            name: operationName,
            duration,
            timestamp: Date.now(),
            metadata: { ...metadata, success: true },
        };

        logMetric(metric);

        if (warnOnSlow && duration > threshold) {
            analytics.logWarning(
                `${operationName} took ${duration}ms (threshold: ${threshold}ms)`,
                'Performance',
                { operationName, duration, threshold }
            );
        }

        return result;
    } catch (error) {
        const duration = Date.now() - startTime;

        const metric: PerformanceMetric = {
            name: operationName,
            duration,
            timestamp: Date.now(),
            metadata: { ...metadata, success: false, error: String(error) },
        };

        logMetric(metric);
        throw error;
    }
}

/**
 * Track a synchronous operation
 */
export function timeSync<T>(
    operationName: string,
    operation: () => T,
    metadata?: Record<string, string | number | boolean>
): T {
    const startTime = Date.now();

    try {
        const result = operation();
        const duration = Date.now() - startTime;

        logMetric({
            name: operationName,
            duration,
            timestamp: Date.now(),
            metadata: { ...metadata, success: true },
        });

        return result;
    } catch (error) {
        const duration = Date.now() - startTime;

        logMetric({
            name: operationName,
            duration,
            timestamp: Date.now(),
            metadata: { ...metadata, success: false },
        });

        throw error;
    }
}

/**
 * Log a performance metric
 */
const logMetric = (metric: PerformanceMetric): void => {
    if (__DEV__) {
        const status = metric.duration > (THRESHOLDS.SCREEN_RENDER) ? '🐢' : '⚡';
        console.log(
            `[Performance] ${status} ${metric.name}: ${metric.duration}ms`,
            metric.metadata || ''
        );
    }

    // Report to analytics (which forwards to Sentry when configured)
    analytics.logEvent('performance_metric', {
        metric_name: metric.name,
        duration_ms: metric.duration,
        ...Object.entries(metric.metadata || {}).reduce((acc, [k, v]) => {
            acc[k] = typeof v === 'object' ? JSON.stringify(v) : v;
            return acc;
        }, {} as Record<string, string | number | boolean>),
    });
};

/**
 * Get performance summary for debugging
 */
export const getPerformanceSummary = (): {
    coldStartTime: number | null;
    activeTimers: string[];
} => {
    return {
        coldStartTime: appStartTime ? (coldStartReported ? Date.now() - appStartTime : null) : null,
        activeTimers: Array.from(activeTimers.keys()),
    };
};

// Export thresholds for external use
export const PERFORMANCE_THRESHOLDS = THRESHOLDS;

// Default export
export default {
    markAppStart,
    reportColdStartComplete,
    startTimer,
    trackScreenRender,
    createScreenTracker,
    timeAsync,
    timeSync,
    getPerformanceSummary,
    THRESHOLDS,
};
