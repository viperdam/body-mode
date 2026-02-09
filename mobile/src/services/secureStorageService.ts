// Secure Storage Service - Uses SecureStore for sensitive data with AsyncStorage fallback
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Keys for secure storage (sensitive data)
export const SECURE_KEYS = {
    API_KEY: 'biosync_api_key',
    USER_CREDENTIALS: 'biosync_user_credentials',
    ENCRYPTION_KEY: 'biosync_encryption_key',
} as const;

// Check if SecureStore is available (not available on web)
const isSecureStoreAvailable = Platform.OS !== 'web';

/**
 * Save sensitive data securely
 */
export async function saveSecure(key: string, value: string): Promise<void> {
    try {
        if (isSecureStoreAvailable) {
            await SecureStore.setItemAsync(key, value, {
                keychainAccessible: SecureStore.WHEN_UNLOCKED,
            });
        } else {
            // Fallback for web - use AsyncStorage with warning
            console.warn('SecureStore not available, using AsyncStorage (less secure)');
            await AsyncStorage.setItem(`secure_${key}`, value);
        }
    } catch (error) {
        console.error('Failed to save secure data:', error);
        throw error;
    }
}

/**
 * Get sensitive data securely
 */
export async function getSecure(key: string): Promise<string | null> {
    try {
        if (isSecureStoreAvailable) {
            return await SecureStore.getItemAsync(key);
        } else {
            return await AsyncStorage.getItem(`secure_${key}`);
        }
    } catch (error) {
        console.error('Failed to get secure data:', error);
        return null;
    }
}

/**
 * Delete sensitive data
 */
export async function deleteSecure(key: string): Promise<void> {
    try {
        if (isSecureStoreAvailable) {
            await SecureStore.deleteItemAsync(key);
        } else {
            await AsyncStorage.removeItem(`secure_${key}`);
        }
    } catch (error) {
        console.error('Failed to delete secure data:', error);
    }
}

/**
 * Migration: Move data from AsyncStorage to SecureStore
 * Call this once during app startup
 */
export async function migrateToSecureStore(): Promise<void> {
    if (!isSecureStoreAvailable) return;

    const migrationKey = 'secure_migration_v1_complete';
    const migrated = await AsyncStorage.getItem(migrationKey);

    if (migrated === 'true') return;

    console.log('Starting secure storage migration...');

    // List of keys to migrate from AsyncStorage to SecureStore
    const keysToMigrate = Object.values(SECURE_KEYS);

    for (const key of keysToMigrate) {
        try {
            // Check if data exists in AsyncStorage
            const value = await AsyncStorage.getItem(key);
            if (value) {
                // Move to SecureStore
                await SecureStore.setItemAsync(key, value);
                // Remove from AsyncStorage
                await AsyncStorage.removeItem(key);
                console.log(`Migrated ${key} to SecureStore`);
            }
        } catch (error) {
            console.error(`Failed to migrate ${key}:`, error);
        }
    }

    // Mark migration as complete
    await AsyncStorage.setItem(migrationKey, 'true');
    console.log('Secure storage migration complete');
}

/**
 * Clear all secure data (for logout/delete account)
 */
export async function clearAllSecureData(): Promise<void> {
    const keysToDelete = Object.values(SECURE_KEYS);

    for (const key of keysToDelete) {
        await deleteSecure(key);
    }
}

export default {
    save: saveSecure,
    get: getSecure,
    delete: deleteSecure,
    migrate: migrateToSecureStore,
    clearAll: clearAllSecureData,
    KEYS: SECURE_KEYS,
};
