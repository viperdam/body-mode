import authService from './authService';
import cloudSyncService from './cloudSyncService';
import firestoreService, { type DeleteUserDataResult } from './firestoreService';
import storage from './storageService';
import { analytics } from './analyticsService';

export type AccountDeletionResult = {
    cloudResult: DeleteUserDataResult | null;
    authDeleted: boolean;
    requiresRecentLogin: boolean;
};

const clearLocalData = async (): Promise<void> => {
    await storage.clear();
    await storage.remove(storage.keys.USER);
    await storage.remove(storage.keys.APP_PREFERENCES);
    await storage.remove(storage.keys.CHAT_HISTORY);
    storage.clearCache();
};

const deleteAccountAndData = async (
    options: { source?: string; skipCloudDelete?: boolean } = {}
): Promise<AccountDeletionResult> => {
    const source = options.source ?? 'settings';
    const skipCloudDelete = options.skipCloudDelete === true;
    analytics.logEvent('account_delete_started', { source, skipCloudDelete });

    cloudSyncService.destroy();

    let cloudResult: DeleteUserDataResult | null = null;
    let authDeleted = false;
    let requiresRecentLogin = false;

    try {
        if (!skipCloudDelete) {
            cloudResult = await firestoreService.deleteUserData({ source });
        }

        const authResult = await authService.deleteAccount();
        authDeleted = authResult.deleted;
        requiresRecentLogin = authResult.requiresRecentLogin;

        if (requiresRecentLogin) {
            await storage.set(storage.keys.PENDING_AUTH_DELETE, {
                requestedAt: Date.now(),
                source,
                cloudDeleted: !skipCloudDelete,
            });
            analytics.logEvent('account_delete_requires_reauth', {
                source,
                cloudDeleted: !skipCloudDelete,
            });
            return {
                cloudResult,
                authDeleted: false,
                requiresRecentLogin: true,
            };
        }

        if (authDeleted) {
            await clearLocalData();
            await storage.remove(storage.keys.PENDING_AUTH_DELETE);
        }

        const nextUid = authService.getUid();
        if (nextUid) {
            try {
                await storage.set(storage.keys.LAST_AUTH_UID, nextUid);
            } catch {
                // Non-critical
            }
        }

        analytics.logEvent('account_delete_completed', {
            source,
            authDeleted,
            requiresRecentLogin,
            plans: cloudResult?.plans ?? 0,
            wrapups: cloudResult?.wrapups ?? 0,
            logTypes: cloudResult?.logTypes ?? 0,
            logMonths: cloudResult?.logMonths ?? 0,
            userDocDeleted: cloudResult?.userDocDeleted ?? false,
        });

        return {
            cloudResult,
            authDeleted,
            requiresRecentLogin,
        };
    } finally {
        try {
            await cloudSyncService.initialize();
        } catch {
            // Non-critical
        }
    }
};

export const accountService = {
    deleteAccountAndData,
};

export default accountService;
