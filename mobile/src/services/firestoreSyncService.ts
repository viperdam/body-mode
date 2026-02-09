/**
 * Firestore Sync Service
 * Handles bidirectional sync between local storage and Firestore.
 */

import { collection, doc, getDoc, getFirestore, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import { getCurrentUserId, isSignedIn } from './firebaseAuthService';
import firebaseService from './firebaseService';
import storage from './storageService';
import { UserProfile, FoodLogEntry, ActivityLogEntry, DailyPlan } from '../types';

const getUserDoc = () => {
    const userId = getCurrentUserId();
    if (!userId) return null;
    return doc(getFirestore(), 'users', userId);
};

export const syncProfileToCloud = async (profile: UserProfile): Promise<void> => {
    try {
        const userDoc = getUserDoc();
        if (!userDoc) return;
        await setDoc(userDoc, { profile, updatedAt: serverTimestamp() }, { merge: true });
        console.log('[FirestoreSync] Profile synced');
    } catch (error) {
        console.error('[FirestoreSync] Sync profile failed:', error);
        firebaseService.logError(error as Error, 'syncProfileToCloud');
    }
};

export const restoreProfileFromCloud = async (): Promise<UserProfile | null> => {
    try {
        const userDoc = getUserDoc();
        if (!userDoc) return null;
        const snapshot = await getDoc(userDoc);
        return snapshot.exists() ? snapshot.data()?.profile || null : null;
    } catch (error) {
        console.error('[FirestoreSync] Restore profile failed:', error);
        return null;
    }
};

export const syncFoodLogsToCloud = async (date: string, entries: FoodLogEntry[]): Promise<void> => {
    try {
        const userDoc = getUserDoc();
        if (!userDoc) return;
        const foodRef = doc(collection(userDoc, 'foodLogs'), date);
        await setDoc(foodRef, {
            entries,
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error('[FirestoreSync] Sync food logs failed:', error);
    }
};

export const syncDailyPlanToCloud = async (date: string, plan: DailyPlan): Promise<void> => {
    try {
        const userDoc = getUserDoc();
        if (!userDoc) return;
        const planRef = doc(collection(userDoc, 'dailyPlans'), date);
        await setDoc(planRef, {
            plan,
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error('[FirestoreSync] Sync daily plan failed:', error);
    }
};

export const syncActivityLogsToCloud = async (date: string, entries: ActivityLogEntry[]): Promise<void> => {
    try {
        const userDoc = getUserDoc();
        if (!userDoc) return;
        const activityRef = doc(collection(userDoc, 'activityLogs'), date);
        await setDoc(activityRef, {
            entries,
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error('[FirestoreSync] Sync activity logs failed:', error);
    }
};

export const performFullBackup = async (): Promise<boolean> => {
    try {
        if (!isSignedIn()) return false;
        console.log('[FirestoreSync] Starting backup...');
        
        const profile = await storage.get<UserProfile>(storage.keys.USER);
        if (profile) await syncProfileToCloud(profile);
        
        const today = new Date().toISOString().split('T')[0];
        const foodLogs = await storage.get<FoodLogEntry[]>(storage.keys.FOOD);
        if (foodLogs?.length) await syncFoodLogsToCloud(today, foodLogs);
        
        const planKey = `${storage.keys.DAILY_PLAN}_${today}`;
        const dailyPlan =
            (await storage.get<DailyPlan>(planKey)) ||
            (await storage.get<DailyPlan>(storage.keys.DAILY_PLAN));
        if (dailyPlan) await syncDailyPlanToCloud(today, dailyPlan);
        
        firebaseService.logEvent('backup_completed');
        return true;
    } catch (error) {
        console.error('[FirestoreSync] Backup failed:', error);
        return false;
    }
};

export const performFullRestore = async (): Promise<boolean> => {
    try {
        if (!isSignedIn()) return false;
        console.log('[FirestoreSync] Starting restore...');
        
        const profile = await restoreProfileFromCloud();
        if (profile) await storage.set(storage.keys.USER, profile);
        
        firebaseService.logEvent('restore_completed');
        return true;
    } catch (error) {
        console.error('[FirestoreSync] Restore failed:', error);
        return false;
    }
};

export const hasCloudData = async (): Promise<boolean> => {
    try {
        const userDoc = getUserDoc();
        if (!userDoc) return false;
        const snapshot = await getDoc(userDoc);
        return snapshot.exists() && !!snapshot.data()?.profile;
    } catch (error) {
        return false;
    }
};

export default {
    syncProfileToCloud,
    restoreProfileFromCloud,
    syncFoodLogsToCloud,
    syncDailyPlanToCloud,
    syncActivityLogsToCloud,
    performFullBackup,
    performFullRestore,
    hasCloudData,
};
