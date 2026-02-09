/**
 * Firebase Authentication Service
 * 
 * Handles user authentication with Firebase.
 * Uses Anonymous Auth by default - users can sign in without credentials.
 * Can be upgraded to email/Google/Apple sign-in later.
 */

import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import {
    getAuth,
    onAuthStateChanged as firebaseOnAuthStateChanged,
    signInAnonymously as firebaseSignInAnonymously,
    signOut as signOutAuth,
} from '@react-native-firebase/auth';
import { analytics } from './analyticsService';
import firebaseService from './firebaseService';
import i18n from '../i18n';

// Auth state
let currentUser: FirebaseAuthTypes.User | null = null;
let authStateListeners = new Set<(user: FirebaseAuthTypes.User | null) => void>();
let isInitialized = false;
const getAuthInstance = () => getAuth();

/**
 * Initialize Firebase Auth and set up auth state listener
 */
export const initializeAuth = async (): Promise<FirebaseAuthTypes.User | null> => {
    if (isInitialized) {
        return currentUser;
    }

    return new Promise((resolve) => {
        const authInstance = getAuthInstance();
        const unsubscribe = firebaseOnAuthStateChanged(authInstance, async (user) => {
            currentUser = user;
            isInitialized = true;

            if (user) {
                console.log('[FirebaseAuth] User signed in:', user.uid);
                // Set user ID for analytics and crashlytics
                await firebaseService.setUserId(user.uid);
                await firebaseService.setUserAttributes({
                    auth_provider: user.isAnonymous ? 'anonymous' : 'linked',
                });
            } else {
                console.log('[FirebaseAuth] No user signed in');
            }

            // Notify all listeners
            authStateListeners.forEach(listener => listener(user));
            
            // Only resolve on first call
            if (!isInitialized) {
                resolve(user);
            }
        });

        // Don't unsubscribe - we want to keep listening
        isInitialized = true;
    });
};

/**
 * Get current user (may be null if not signed in)
 */
export const getCurrentUser = (): FirebaseAuthTypes.User | null => {
    return currentUser;
};

/**
 * Get current user ID (or null if not signed in)
 */
export const getCurrentUserId = (): string | null => {
    return currentUser?.uid || null;
};

/**
 * Check if user is signed in
 */
export const isSignedIn = (): boolean => {
    return currentUser !== null;
};

/**
 * Check if current user is anonymous
 */
export const isAnonymous = (): boolean => {
    return currentUser?.isAnonymous ?? true;
};

/**
 * Sign in anonymously
 * Creates a new anonymous account if not already signed in
 */
export const signInAnonymously = async (): Promise<FirebaseAuthTypes.User> => {
    try {
        // If already signed in, return current user
        if (currentUser) {
            console.log('[FirebaseAuth] Already signed in as:', currentUser.uid);
            return currentUser;
        }

        console.log('[FirebaseAuth] Signing in anonymously...');
        const credential = await firebaseSignInAnonymously(getAuthInstance());
        
        analytics.logEvent('auth_sign_in', { method: 'anonymous' });
        firebaseService.logEvent('auth_sign_in_anonymous');
        
        console.log('[FirebaseAuth] Anonymous sign-in successful:', credential.user.uid);
        return credential.user;
    } catch (error) {
        console.error('[FirebaseAuth] Anonymous sign-in failed:', error);
        firebaseService.logError(error as Error, 'signInAnonymously');
        throw error;
    }
};

/**
 * Sign out the current user
 */
export const signOut = async (): Promise<void> => {
    try {
        await signOutAuth(getAuthInstance());
        analytics.logEvent('auth_sign_out');
        console.log('[FirebaseAuth] User signed out');
    } catch (error) {
        console.error('[FirebaseAuth] Sign out failed:', error);
        firebaseService.logError(error as Error, 'signOut');
        throw error;
    }
};

/**
 * Delete the current user account
 * WARNING: This will delete all user data!
 */
export const deleteAccount = async (): Promise<void> => {
    try {
        if (!currentUser) {
            throw new Error(i18n.t('errors.auth.no_user'));
        }

        await currentUser.delete();
        analytics.logEvent('auth_account_deleted');
        console.log('[FirebaseAuth] User account deleted');
    } catch (error) {
        console.error('[FirebaseAuth] Delete account failed:', error);
        firebaseService.logError(error as Error, 'deleteAccount');
        throw error;
    }
};

/**
 * Subscribe to auth state changes
 */
export const onAuthStateChanged = (
    listener: (user: FirebaseAuthTypes.User | null) => void
): (() => void) => {
    authStateListeners.add(listener);
    
    // Immediately call with current state
    listener(currentUser);
    
    // Return unsubscribe function
    return () => {
        authStateListeners.delete(listener);
    };
};

/**
 * Ensure user is signed in (sign in anonymously if not)
 * Call this at app startup after Firebase is initialized
 */
export const ensureSignedIn = async (): Promise<FirebaseAuthTypes.User> => {
    await initializeAuth();
    
    if (currentUser) {
        return currentUser;
    }
    
    return signInAnonymously();
};

// Export default object
export default {
    initialize: initializeAuth,
    getCurrentUser,
    getCurrentUserId,
    isSignedIn,
    isAnonymous,
    signInAnonymously,
    signOut,
    deleteAccount,
    onAuthStateChanged,
    ensureSignedIn,
};
