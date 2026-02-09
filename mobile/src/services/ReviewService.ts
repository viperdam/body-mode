import * as StoreReview from 'expo-store-review';
import storage from './storageService';

const KEYS = {
    LAST_REVIEW_REQUEST: 'last_review_request',
    INTERACTION_COUNT: 'review_interaction_count',
};

const MIN_INTERACTIONS_BEFORE_REQUEST = 5;
const MIN_DAYS_BETWEEN_REQUESTS = 90;

export const ReviewService = {
    /**
     * Check if we should ask for a review based on engagement and timing.
     */
    checkAndRequestReview: async () => {
        try {
            if (!(await StoreReview.hasAction())) {
                return;
            }

            const now = Date.now();
            const lastRequest = await storage.get<number>(KEYS.LAST_REVIEW_REQUEST) || 0;
            const interactions = await storage.get<number>(KEYS.INTERACTION_COUNT) || 0;

            // Increment interaction count
            await storage.set(KEYS.INTERACTION_COUNT, interactions + 1);

            // Gate 1: Engagement (at least X meaningful actions)
            if (interactions + 1 < MIN_INTERACTIONS_BEFORE_REQUEST) {
                return;
            }

            // Gate 2: Timing (don't spam, adhere to Apple/Google guidelines)
            const daysSinceLast = (now - lastRequest) / (1000 * 60 * 60 * 24);
            if (daysSinceLast < MIN_DAYS_BETWEEN_REQUESTS && lastRequest > 0) {
                return;
            }

            // Request Review
            console.log('[ReviewService] Requesting Store Review');
            await StoreReview.requestReview();

            // Record success
            await storage.set(KEYS.LAST_REVIEW_REQUEST, now);
            await storage.set(KEYS.INTERACTION_COUNT, 0); // Reset engagement counter for next cycle

        } catch (error) {
            console.warn('[ReviewService] Error checking review:', error);
        }
    },

    /**
     * Call this when a significant positive event happens (e.g., plan completion, streak).
     */
    logPositiveInteraction: async () => {
        const count = await storage.get<number>(KEYS.INTERACTION_COUNT) || 0;
        await storage.set(KEYS.INTERACTION_COUNT, count + 1);
    }
};
