import { Platform } from 'react-native';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    limit,
    query,
    serverTimestamp,
    setDoc,
    writeBatch,
} from '@react-native-firebase/firestore';
import type { UserProfile } from '../types';
import authService from './authService';
import { analytics } from './analyticsService';
import i18n from '../i18n';

type SyncOptions = {
    source?: string;
    appInstanceId?: string;
};

const getDb = () => getFirestore();

export type DeleteUserDataResult = {
    plans: number;
    wrapups: number;
    logTypes: number;
    logMonths: number;
    userDocDeleted: boolean;
};

const stripUndefined = <T>(value: T): T => {
    if (Array.isArray(value)) {
        return value.map((entry) => stripUndefined(entry)) as unknown as T;
    }
    if (value && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        const isPlainObject = proto === Object.prototype || proto === null;
        if (!isPlainObject) {
            return value;
        }

        const next: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
            if (entry === undefined) return;
            next[key] = stripUndefined(entry);
        });
        return next as T;
    }
    return value;
};

const getUserDocRef = async () => {
    const user = await authService.waitForAuthReady();
    if (!user) return null;
    return doc(getDb(), 'users', user.uid);
};

const deleteCollectionDocs = async (
    collectionRef: FirebaseFirestoreTypes.CollectionReference<FirebaseFirestoreTypes.DocumentData>,
    batchSize: number = 25
): Promise<number> => {
    let deleted = 0;
    while (true) {
        const snapshot = await getDocs(query(collectionRef, limit(batchSize)));
        if (snapshot.empty) break;

        const batch = writeBatch(getDb());
        snapshot.docs.forEach((docSnap: FirebaseFirestoreTypes.QueryDocumentSnapshot<FirebaseFirestoreTypes.DocumentData>) =>
            batch.delete(docSnap.ref)
        );
        await batch.commit();
        deleted += snapshot.size;
    }
    return deleted;
};

const deleteLogsCollection = async (
    logsRef: FirebaseFirestoreTypes.CollectionReference<FirebaseFirestoreTypes.DocumentData>
): Promise<{ logTypes: number; logMonths: number }> => {
    const snapshot = await getDocs(logsRef);
    let logTypes = 0;
    let logMonths = 0;

    for (const doc of snapshot.docs) {
        const monthsRef = collection(doc.ref, 'months');
        logMonths += await deleteCollectionDocs(monthsRef);
        await deleteDoc(doc.ref);
        logTypes += 1;
    }

    return { logTypes, logMonths };
};

const syncUserProfile = async (profile: UserProfile | null, options: SyncOptions = {}): Promise<void> => {
    try {
        const docRef = await getUserDocRef();
        if (!docRef) return;

        const payload = stripUndefined({
            profile: profile ? stripUndefined(profile) : null,
            profileUpdatedAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
            platform: Platform.OS,
            appInstanceId: options.appInstanceId,
            lastUpdateSource: options.source ?? 'profile_sync',
        });

        await setDoc(docRef, payload, { merge: true });
    } catch (error) {
        analytics.logError(error, 'FirestoreService.syncUserProfile', { source: options.source });
    }
};

const touchUser = async (options: SyncOptions = {}): Promise<void> => {
    try {
        const docRef = await getUserDocRef();
        if (!docRef) return;

        const payload = stripUndefined({
            lastSeenAt: serverTimestamp(),
            platform: Platform.OS,
            appInstanceId: options.appInstanceId,
            lastUpdateSource: options.source ?? 'heartbeat',
        });

        await setDoc(docRef, payload, { merge: true });
    } catch (error) {
        analytics.logError(error, 'FirestoreService.touchUser', { source: options.source });
    }
};

const clearUserProfile = async (options: SyncOptions = {}): Promise<void> => {
    try {
        const docRef = await getUserDocRef();
        if (!docRef) return;

        const payload = stripUndefined({
            profile: null,
            profileClearedAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
            platform: Platform.OS,
            appInstanceId: options.appInstanceId,
            lastUpdateSource: options.source ?? 'profile_cleared',
        });

        await setDoc(docRef, payload, { merge: true });
    } catch (error) {
        analytics.logError(error, 'FirestoreService.clearUserProfile', { source: options.source });
    }
};

const fetchUserProfile = async (): Promise<UserProfile | null> => {
    try {
        const docRef = await getUserDocRef();
        if (!docRef) return null;

        const snapshot = await getDoc(docRef);
        const data = snapshot.data();
        const profile = data?.profile;
        if (profile && typeof profile === 'object') {
            return profile as UserProfile;
        }
        return null;
    } catch (error) {
        analytics.logError(error, 'FirestoreService.fetchUserProfile');
        return null;
    }
};

const deleteUserData = async (options: SyncOptions = {}): Promise<DeleteUserDataResult> => {
    const docRef = await getUserDocRef();
    if (!docRef) {
        throw new Error(i18n.t('errors.auth.no_user_delete'));
    }

    const result: DeleteUserDataResult = {
        plans: 0,
        wrapups: 0,
        logTypes: 0,
        logMonths: 0,
        userDocDeleted: false,
    };

    const errors: string[] = [];

    try {
        result.plans = await deleteCollectionDocs(docRef.collection('plans'));
    } catch (error) {
        errors.push('plans');
        analytics.logError(error, 'FirestoreService.deleteUserData.plans', { source: options.source });
    }

    try {
        result.wrapups = await deleteCollectionDocs(docRef.collection('wrapups'));
    } catch (error) {
        errors.push('wrapups');
        analytics.logError(error, 'FirestoreService.deleteUserData.wrapups', { source: options.source });
    }

    try {
        const logsResult = await deleteLogsCollection(docRef.collection('logs'));
        result.logTypes = logsResult.logTypes;
        result.logMonths = logsResult.logMonths;
    } catch (error) {
        errors.push('logs');
        analytics.logError(error, 'FirestoreService.deleteUserData.logs', { source: options.source });
    }

    try {
        await deleteDoc(docRef);
        result.userDocDeleted = true;
    } catch (error) {
        errors.push('userDoc');
        analytics.logError(error, 'FirestoreService.deleteUserData.userDoc', { source: options.source });
    }

    analytics.logEvent('cloud_data_deleted', {
        source: options.source ?? 'unknown',
        plans: result.plans,
        wrapups: result.wrapups,
        logTypes: result.logTypes,
        logMonths: result.logMonths,
        userDocDeleted: result.userDocDeleted,
    });

    if (errors.length > 0) {
        throw new Error(i18n.t('errors.cloud.delete_failed', { errors: errors.join(', ') }));
    }

    return result;
};

export const firestoreService = {
    syncUserProfile,
    touchUser,
    clearUserProfile,
    fetchUserProfile,
    deleteUserData,
};

export default firestoreService;
