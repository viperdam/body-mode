import storage from './storageService';
import { onNetworkEvent } from './offlineService';
import { requestContextRefresh } from './contextService';
import backgroundLocationService from './backgroundLocationService';
import contextBackgroundFetchService from './contextBackgroundFetchService';
import { usePermissionStore } from './permissions/PermissionStore';

type Unsubscribe = () => void;

let started = false;
let unsubscribeNetworkRestored: Unsubscribe | null = null;
let unsubscribeNetworkLost: Unsubscribe | null = null;
let unsubscribeStorage: Unsubscribe | null = null;
let unsubscribePermissions: Unsubscribe | null = null;
let lastBackgroundEnabled: boolean | null = null;
let syncInFlight = false;

const shouldBackgroundRun = async (): Promise<boolean> => {
    const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
    const contextEnabled = prefs?.contextSensingEnabled !== false;
    const backgroundEnabled = await storage.get<boolean>('settings:backgroundLocation:enabled');
    return contextEnabled && backgroundEnabled === true;
};

const syncBackgroundLocation = async (reason: string, force = false): Promise<void> => {
    if (syncInFlight) return;
    syncInFlight = true;
    try {
        const enabled = await shouldBackgroundRun();
        if (!force && lastBackgroundEnabled === enabled) {
            return;
        }
        lastBackgroundEnabled = enabled;
        if (enabled) {
            await backgroundLocationService.ensureRunning();
            await contextBackgroundFetchService.start();
        } else {
            await backgroundLocationService.stop();
            await contextBackgroundFetchService.stop();
        }
    } catch (error) {
        console.warn('[ContextTrigger] Failed to sync background location:', error);
    } finally {
        syncInFlight = false;
    }
};

const handlePermissionChange = (next: ReturnType<typeof usePermissionStore.getState>, prev: ReturnType<typeof usePermissionStore.getState>) => {
    const nextPerms = next.permissions;
    const prevPerms = prev.permissions;
    const nextLocation = !!nextPerms.location.granted;
    const prevLocation = !!prevPerms.location.granted;
    const nextBackground = !!nextPerms.backgroundLocation.granted;
    const prevBackground = !!prevPerms.backgroundLocation.granted;

    if (nextLocation && !prevLocation) {
        requestContextRefresh('permission_location_granted');
    }
    if (!nextLocation && prevLocation) {
        requestContextRefresh('permission_location_revoked');
    }
    if (nextBackground !== prevBackground) {
        void syncBackgroundLocation('permission_background_changed', true);
    }
};

export const contextTriggerService = {
    start(): void {
        if (started) return;
        started = true;

        unsubscribeNetworkRestored = onNetworkEvent('networkRestored', () => {
            requestContextRefresh('network_restored');
        });
        unsubscribeNetworkLost = onNetworkEvent('networkLost', () => {
            requestContextRefresh('network_lost');
        });

        unsubscribeStorage = storage.subscribe((key, _value, action) => {
            if (action !== 'set') return;
            if (key === storage.keys.APP_PREFERENCES || key === 'settings:backgroundLocation:enabled') {
                void syncBackgroundLocation('prefs_changed');
                requestContextRefresh('prefs_changed');
            }
        });

        unsubscribePermissions = usePermissionStore.subscribe(handlePermissionChange);

        void syncBackgroundLocation('init', true);
    },

    stop(): void {
        if (!started) return;
        started = false;
        unsubscribeNetworkRestored?.();
        unsubscribeNetworkLost?.();
        unsubscribeStorage?.();
        unsubscribePermissions?.();
        unsubscribeNetworkRestored = null;
        unsubscribeNetworkLost = null;
        unsubscribeStorage = null;
        unsubscribePermissions = null;
    },
};

export default contextTriggerService;
