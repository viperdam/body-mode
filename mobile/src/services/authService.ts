import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import {
    createUserWithEmailAndPassword,
    EmailAuthProvider,
    getAuth,
    GoogleAuthProvider,
    linkWithCredential,
    onAuthStateChanged,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    signInAnonymously,
    signInWithCredential,
    signInWithEmailAndPassword,
    signOut as signOutAuth,
} from '@react-native-firebase/auth';
import firebaseService from './firebaseService';
import { analytics } from './analyticsService';
import i18n from '../i18n';

let currentUser: FirebaseAuthTypes.User | null = null;
let initPromise: Promise<FirebaseAuthTypes.User | null> | null = null;
let authStateUnsubscribe: (() => void) | null = null;
const authListeners = new Set<(user: FirebaseAuthTypes.User | null) => void>();
const getAuthInstance = () => getAuth();

const applyUserContext = async (user: FirebaseAuthTypes.User | null): Promise<void> => {
    currentUser = user;
    if (!user) {
        authListeners.forEach((listener) => {
            try {
                listener(null);
            } catch (error) {
                console.warn('[AuthService] Listener error:', error);
            }
        });
        return;
    }

    try {
        await firebaseService.setUserId(user.uid);
    } catch (error) {
        analytics.logWarning('Failed to set Firebase user id', 'AuthService.applyUserContext', {
            message: error instanceof Error ? error.message : String(error),
        });
    }

    analytics.setUserId(user.uid);
    authListeners.forEach((listener) => {
        try {
            listener(user);
        } catch (error) {
            console.warn('[AuthService] Listener error:', error);
        }
    });
};

const initialize = async (): Promise<FirebaseAuthTypes.User | null> => {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const authInstance = getAuthInstance();
            let user = authInstance.currentUser;
            if (!user) {
                const credential = await signInAnonymously(authInstance);
                user = credential.user;
            }

            await applyUserContext(user ?? null);

            if (!authStateUnsubscribe) {
                authStateUnsubscribe = onAuthStateChanged(authInstance, (nextUser) => {
                    void applyUserContext(nextUser ?? null);
                });
            }

            return currentUser;
        } catch (error) {
            analytics.logError(error, 'AuthService.initialize');
            return null;
        }
    })();

    return initPromise;
};

const waitForAuthReady = async (): Promise<FirebaseAuthTypes.User | null> => {
    return initPromise ?? initialize();
};

const getCurrentUser = (): FirebaseAuthTypes.User | null => currentUser;

const getUid = (): string | null => currentUser?.uid ?? null;

const isAnonymous = (): boolean => currentUser?.isAnonymous === true;

const getEmail = (): string | null => currentUser?.email ?? null;

export type GoogleAuthResult = {
    user: FirebaseAuthTypes.User | null;
    mode: 'link' | 'sign_in';
    recovered?: boolean;
};

const getProviderIds = (): string[] => {
    return currentUser?.providerData
        ?.map((provider) => provider?.providerId)
        .filter((providerId): providerId is string => !!providerId) || [];
};

const linkWithEmail = async (email: string, password: string): Promise<FirebaseAuthTypes.User | null> => {
    try {
        const authInstance = getAuthInstance();
        const user = authInstance.currentUser;
        if (!user) {
            return await signUpWithEmail(email, password);
        }

        if (!user.isAnonymous) {
            return user;
        }

        const credential = EmailAuthProvider.credential(email, password);
        const linked = await linkWithCredential(user, credential);
        await applyUserContext(linked.user);
        return linked.user;
    } catch (error) {
        analytics.logError(error, 'AuthService.linkWithEmail');
        throw error;
    }
};

const signInWithGoogle = async (idToken: string): Promise<GoogleAuthResult> => {
    try {
        const authInstance = getAuthInstance();
        const credential = GoogleAuthProvider.credential(idToken);
        const user = authInstance.currentUser;

        if (user) {
            const alreadyLinked = user.providerData?.some((provider) => provider?.providerId === 'google.com');
            if (alreadyLinked) {
                return { user, mode: 'link' };
            }

            try {
                const linked = await linkWithCredential(user, credential);
                await applyUserContext(linked.user);
                return { user: linked.user, mode: 'link' };
            } catch (error: any) {
                const code = error?.code;
                if (code === 'auth/credential-already-in-use' || code === 'auth/account-exists-with-different-credential') {
                    const signed = await signInWithCredential(authInstance, credential);
                    await applyUserContext(signed.user);
                    return { user: signed.user, mode: 'sign_in', recovered: true };
                }
                analytics.logError(error, 'AuthService.signInWithGoogle');
                throw error;
            }
        }

        const signed = await signInWithCredential(authInstance, credential);
        await applyUserContext(signed.user);
        return { user: signed.user, mode: 'sign_in' };
    } catch (error) {
        analytics.logError(error, 'AuthService.signInWithGoogle');
        throw error;
    }
};

const signInWithEmail = async (email: string, password: string): Promise<FirebaseAuthTypes.User | null> => {
    try {
        const credential = await signInWithEmailAndPassword(getAuthInstance(), email, password);
        await applyUserContext(credential.user);
        return credential.user;
    } catch (error) {
        analytics.logError(error, 'AuthService.signInWithEmail');
        throw error;
    }
};

const signUpWithEmail = async (email: string, password: string): Promise<FirebaseAuthTypes.User | null> => {
    try {
        const credential = await createUserWithEmailAndPassword(getAuthInstance(), email, password);
        await applyUserContext(credential.user);
        return credential.user;
    } catch (error) {
        analytics.logError(error, 'AuthService.signUpWithEmail');
        throw error;
    }
};

const sendPasswordReset = async (email: string): Promise<void> => {
    try {
        await sendPasswordResetEmail(getAuthInstance(), email);
    } catch (error) {
        analytics.logError(error, 'AuthService.sendPasswordReset');
        throw error;
    }
};

const reauthenticateWithEmail = async (email: string, password: string): Promise<FirebaseAuthTypes.User> => {
    const user = getAuthInstance().currentUser;
    if (!user) {
        throw new Error(i18n.t('errors.auth.no_user_reauth'));
    }

    try {
        const credential = EmailAuthProvider.credential(email, password);
        await reauthenticateWithCredential(user, credential);
        await applyUserContext(user);
        return user;
    } catch (error) {
        analytics.logError(error, 'AuthService.reauthenticateWithEmail');
        throw error;
    }
};

const reauthenticateWithGoogle = async (idToken: string): Promise<FirebaseAuthTypes.User> => {
    const user = getAuthInstance().currentUser;
    if (!user) {
        throw new Error(i18n.t('errors.auth.no_user_reauth'));
    }

    try {
        const credential = GoogleAuthProvider.credential(idToken);
        await reauthenticateWithCredential(user, credential);
        await applyUserContext(user);
        return user;
    } catch (error) {
        analytics.logError(error, 'AuthService.reauthenticateWithGoogle');
        throw error;
    }
};

const onAuthStateChange = (listener: (user: FirebaseAuthTypes.User | null) => void): (() => void) => {
    authListeners.add(listener);
    return () => authListeners.delete(listener);
};

const signOut = async (): Promise<void> => {
    try {
        await signOutAuth(getAuthInstance());
        currentUser = null;
        await initialize();
    } catch (error) {
        analytics.logError(error, 'AuthService.signOut');
    }
};

const deleteAccount = async (): Promise<{ deleted: boolean; requiresRecentLogin: boolean }> => {
    const user = getAuthInstance().currentUser;
    if (!user) {
        return { deleted: false, requiresRecentLogin: false };
    }

    try {
        await user.delete();
        currentUser = null;
        try {
            await signOutAuth(getAuthInstance());
        } catch {
            // Ignore sign-out failures after delete
        }
        await initialize();
        return { deleted: true, requiresRecentLogin: false };
    } catch (error: any) {
        if (error?.code === 'auth/requires-recent-login') {
            return { deleted: false, requiresRecentLogin: true };
        }
        analytics.logError(error, 'AuthService.deleteAccount');
        throw error;
    }
};

const destroy = (): void => {
    authStateUnsubscribe?.();
    authStateUnsubscribe = null;
    currentUser = null;
    initPromise = null;
};

export const authService = {
    initialize,
    waitForAuthReady,
    getCurrentUser,
    getUid,
    getEmail,
    isAnonymous,
    getProviderIds,
    linkWithEmail,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    reauthenticateWithEmail,
    reauthenticateWithGoogle,
    onAuthStateChange,
    signOut,
    deleteAccount,
    destroy,
};

export default authService;
