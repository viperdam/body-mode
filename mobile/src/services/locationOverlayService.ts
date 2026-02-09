// Location Overlay Service - JS bridge for driving stop context overlays
import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import storage from './storageService';
import locationService from './locationService';
import type { UserContextState } from '../types';

type LocationActivity = 'home' | 'work' | 'gym' | 'visiting' | 'errand' | 'save_place';

type PendingLocationActivity = {
    activity: LocationActivity;
    timestamp?: number;
    requiresSave?: boolean;
};

type PendingLocationSave = {
    coords: { lat: number; lng: number };
    timestamp?: number;
};

const LOCATION_SAVE_PENDING_KEY = '@pending_location_save';

const getLocationModule = () => {
    if (Platform.OS !== 'android') return null;
    return NativeModules.LocationBridge ?? null;
};

const normalizeActivity = (value?: string): LocationActivity | null => {
    if (!value) return null;
    const normalized = value.toLowerCase();
    if (
        normalized === 'home' ||
        normalized === 'work' ||
        normalized === 'gym' ||
        normalized === 'visiting' ||
        normalized === 'errand' ||
        normalized === 'save_place'
    ) {
        return normalized;
    }
    return null;
};

const mapActivityToVisit = (activity: LocationActivity): 'home' | 'work' | 'gym' | 'visiting' | 'errand' | 'unknown' => {
    if (activity === 'home' || activity === 'work' || activity === 'gym') return activity;
    if (activity === 'visiting' || activity === 'errand') return activity;
    return 'unknown';
};

const updateLastContextSnapshot = async (activity: LocationActivity): Promise<void> => {
    const snapshot = await storage.get<any>(storage.keys.LAST_CONTEXT_SNAPSHOT);
    if (!snapshot) return;

    const locationLabel = activity === 'save_place' ? snapshot.locationLabel : activity;
    const locationContext =
        activity === 'save_place'
            ? snapshot.locationContext
            : `User selected ${activity}`;

    await storage.set(storage.keys.LAST_CONTEXT_SNAPSHOT, {
        ...snapshot,
        locationLabel,
        locationContext,
        updatedAt: Date.now(),
    });
};

const handleLocationActivity = async (activity: LocationActivity, timestamp?: number, requiresSave?: boolean) => {
    const coords =
        (await locationService.getCurrentLocation()) ||
        (await locationService.getLastKnownLocation());

    if (coords) {
        await locationService.recordArrival(coords, mapActivityToVisit(activity));

        if (activity === 'home' || activity === 'work' || activity === 'gym') {
            const saved = await locationService.getSavedLocations();
            if (!saved[activity]) {
                await locationService.saveLocation(activity, {
                    ...coords,
                    label: activity,
                });
            }
        }
    }

    await updateLastContextSnapshot(activity);

    const { planRefinementService } = require('./planRefinementService');
    const lastContext = (await planRefinementService.getLastContext()) || ('resting' as UserContextState);
    await planRefinementService.recordContextChange(lastContext, lastContext, {
        location: activity === 'save_place' ? undefined : activity,
        locationContext: activity === 'save_place' ? undefined : `User selected ${activity}`,
    });

    if (requiresSave && coords) {
        await storage.set(LOCATION_SAVE_PENDING_KEY, {
            coords,
            timestamp: timestamp || Date.now(),
        });
    }
};

export const showLocationContextOverlay = async (): Promise<boolean> => {
    const module = getLocationModule();
    if (!module?.showLocationContextOverlay) return false;
    try {
        await module.showLocationContextOverlay();
        return true;
    } catch (error) {
        console.warn('[LocationOverlay] Failed to show overlay:', error);
        return false;
    }
};

export const getPendingLocationActivity = async (): Promise<PendingLocationActivity | null> => {
    const module = getLocationModule();
    if (!module?.getPendingLocationActivity) return null;
    try {
        const result = await module.getPendingLocationActivity();
        if (!result) return null;
        const activity = normalizeActivity(result.activity);
        if (!activity) return null;
        return {
            activity,
            timestamp: typeof result.timestamp === 'number' ? result.timestamp : undefined,
            requiresSave: !!result.requiresSave,
        };
    } catch (error) {
        console.warn('[LocationOverlay] Failed to read pending activity:', error);
        return null;
    }
};

export const processPendingLocationActivity = async (): Promise<void> => {
    const pending = await getPendingLocationActivity();
    if (!pending) return;
    await handleLocationActivity(pending.activity, pending.timestamp, pending.requiresSave);
};

export const getPendingLocationSave = async (): Promise<PendingLocationSave | null> => {
    const pending = await storage.get<PendingLocationSave>(LOCATION_SAVE_PENDING_KEY);
    if (!pending || !pending.coords) return null;
    return pending;
};

export const clearPendingLocationSave = async (): Promise<void> => {
    await storage.remove(LOCATION_SAVE_PENDING_KEY);
};

export const savePendingLocationAs = async (label: 'home' | 'work' | 'gym'): Promise<boolean> => {
    const pending = await getPendingLocationSave();
    if (!pending) return false;

    await locationService.saveLocation(label, {
        ...pending.coords,
        label,
    });
    await clearPendingLocationSave();
    return true;
};

export const setupLocationActivityListener = (onHandled?: () => void): (() => void) | undefined => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = DeviceEventEmitter.addListener(
        'onLocationActivitySelected',
        async (event: { activity?: string; timestamp?: number }) => {
            const pending = await getPendingLocationActivity();
            const activity = normalizeActivity(pending?.activity || event?.activity);
            if (!activity) return;
            await handleLocationActivity(
                activity,
                pending?.timestamp ?? event?.timestamp,
                pending?.requiresSave
            );
            onHandled?.();
        }
    );

    return () => subscription.remove();
};

export default {
    showLocationContextOverlay,
    processPendingLocationActivity,
    getPendingLocationSave,
    clearPendingLocationSave,
    savePendingLocationAs,
    setupLocationActivityListener,
};
