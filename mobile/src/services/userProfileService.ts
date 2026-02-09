import type { UserProfile } from '../types';
import storage from './storageService';
import firestoreService from './firestoreService';
import firebaseService from './firebaseService';
import { analytics } from './analyticsService';

type UserProfileSaveOptions = {
    source?: string;
    sync?: boolean;
    appInstanceId?: string;
};

const saveUserProfile = async (
    profile: UserProfile,
    options: UserProfileSaveOptions = {}
): Promise<boolean> => {
    const saved = await storage.set(storage.keys.USER, profile);
    if (!saved) return false;

    analytics.logEvent('profile_saved', { source: options.source ?? 'unknown' });

    void firebaseService.setUserAttributes({
        goal: profile.goal,
        plan_intensity: profile.planIntensity,
        activity_level: profile.activityLevel,
        gender: profile.gender,
    });

    if (options.sync !== false) {
        void firestoreService.syncUserProfile(profile, {
            source: options.source ?? 'profile_saved',
            appInstanceId: options.appInstanceId,
        });
    }

    return true;
};

const clearUserProfile = async (options: UserProfileSaveOptions = {}): Promise<boolean> => {
    const cleared = await storage.remove(storage.keys.USER);
    if (!cleared) return false;

    analytics.logEvent('profile_cleared', { source: options.source ?? 'unknown' });

    if (options.sync !== false) {
        void firestoreService.clearUserProfile({
            source: options.source ?? 'profile_cleared',
            appInstanceId: options.appInstanceId,
        });
    }

    return true;
};

const loadUserProfile = async (): Promise<UserProfile | null> => {
    return storage.get<UserProfile>(storage.keys.USER);
};

export const userProfileService = {
    saveUserProfile,
    clearUserProfile,
    loadUserProfile,
};

export default userProfileService;
