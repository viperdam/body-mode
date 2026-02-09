/**
 * Location Service - GPS tracking, auto-learn places, and location context
 * 
 * Features:
 * - Manual location setup (home/work/gym)
 * - Auto-learn frequent places from GPS patterns
 * - Track location visits for LLM context
 * - Calculate distance to saved locations
 */

import * as Location from 'expo-location';
import { permissionManager } from './permissions/PermissionManager';
import storage from './storageService';
import { UserProfile } from '../types';

// ==================== TYPES ====================

export interface Coordinates {
    lat: number;
    lng: number;
}

export interface LocationFix {
    coords: Coordinates;
    accuracy?: number;
    speed?: number | null;
    timestamp?: number;
}

export interface SavedLocation extends Coordinates {
    address?: string;
    label: 'home' | 'work' | 'gym' | 'custom';
    customName?: string;
}

export interface LocationVisit {
    id: string;
    lat: number;
    lng: number;
    arrivedAt: number;
    leftAt?: number;
    activity?: 'work' | 'gym' | 'visiting' | 'errand' | 'home' | 'unknown';
    savedLocationLabel?: string;
    duration?: number; // minutes
}

export interface FrequentPlace {
    lat: number;
    lng: number;
    visitCount: number;
    avgDurationMinutes: number;
    firstVisit: number;
    lastVisit: number;
    suggestedLabel?: 'home' | 'work' | 'gym';
    confirmedLabel?: string;
}

export interface LocationContext {
    currentLocation?: Coordinates;
    currentAccuracy?: number;
    currentSpeed?: number | null;
    currentTimestamp?: number;
    currentActivity?: string;
    nearestSavedLocation?: { label: string; distance: number };
    nearestFrequentPlace?: {
        label: string;
        distance: number;
        confidence: number;
        isConfirmed?: boolean;
        suggestedLabel?: string;
    };
    isHome?: boolean;
    isWork?: boolean;
    isGym?: boolean;
    lastVisits: LocationVisit[];
    frequentPlaces: FrequentPlace[];
}

// ==================== STORAGE KEYS ====================

const STORAGE_KEYS = {
    SAVED_LOCATIONS: '@saved_locations',
    LOCATION_VISITS: '@location_visits',
    FREQUENT_PLACES: '@frequent_places',
    CURRENT_VISIT: '@current_visit',
    LAST_KNOWN_LOCATION: '@last_known_location',
};

// ==================== CONSTANTS ====================

const DISTANCE_THRESHOLD_METERS = 150; // Consider "same place" if within 150m
const MIN_VISITS_FOR_FREQUENT = 3; // Need 3+ visits to suggest as frequent place
const CLUSTER_RADIUS_METERS = 200; // Radius for clustering visits

type RawSavedLocation = Partial<SavedLocation> & {
    latitude?: number;
    longitude?: number;
    radius?: number;
};

const normalizeSavedLocation = (
    label: SavedLocation['label'],
    location?: RawSavedLocation | null
): SavedLocation | null => {
    if (!location) return null;
    const lat =
        typeof location.lat === 'number'
            ? location.lat
            : typeof location.latitude === 'number'
                ? location.latitude
                : null;
    const lng =
        typeof location.lng === 'number'
            ? location.lng
            : typeof location.longitude === 'number'
                ? location.longitude
                : null;
    if (lat === null || lng === null) return null;

    return {
        lat,
        lng,
        label,
        address: location.address,
        customName: location.customName,
    };
};

const normalizeSavedLocations = (
    saved: Record<string, RawSavedLocation>
): { normalized: Record<string, SavedLocation>; updated: boolean } => {
    let updated = false;
    const normalized: Record<string, SavedLocation> = {};

    for (const [key, value] of Object.entries(saved || {})) {
        const label = (value?.label as SavedLocation['label']) || (key as SavedLocation['label']) || 'custom';
        const normalizedLoc = normalizeSavedLocation(label, value);
        if (!normalizedLoc) continue;
        normalized[key] = normalizedLoc;

        if (value && (typeof value.latitude === 'number' || typeof value.longitude === 'number')) {
            updated = true;
        }
    }

    return { normalized, updated };
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Calculate distance between two coordinates in meters (Haversine formula)
 */
export const calculateDistance = (coord1: Coordinates, coord2: Coordinates): number => {
    const earthRadiusMeters = 6371e3; // Earth's radius in meters
    const phi1 = (coord1.lat * Math.PI) / 180;
    const phi2 = (coord2.lat * Math.PI) / 180;
    const deltaPhi = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const deltaLambda = ((coord2.lng - coord1.lng) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
};

/**
 * Check if two locations are the same place (within threshold)
 */
export const isSamePlace = (
    coord1: Coordinates,
    coord2: Coordinates,
    thresholdMeters: number = DISTANCE_THRESHOLD_METERS
): boolean => {
    return calculateDistance(coord1, coord2) <= thresholdMeters;
};

// ==================== LOCATION SERVICE ====================

export const locationService = {
    // ========== PERMISSIONS ==========

    async requestPermission(): Promise<boolean> {
        try {
            const granted = await permissionManager.requestForegroundLocationWithDisclosure();
            if (!granted) {
                console.log('[Location] Foreground permission not granted');
                return false;
            }

            await permissionManager.requestBackgroundLocationWithDisclosure();
            return true;
        } catch (error) {
            console.error('[Location] Permission request failed:', error);
            return false;
        }
    },

    async hasPermission(): Promise<boolean> {
        const { status } = await Location.getForegroundPermissionsAsync();
        return status === 'granted';
    },

    // ========== CURRENT LOCATION ==========

    async getCurrentLocation(): Promise<Coordinates | null> {
        const fix = await this.getCurrentFix();
        return fix?.coords || null;
    },

    async getCurrentFix(): Promise<LocationFix | null> {
        try {
            const hasPermission = await this.hasPermission();
            if (!hasPermission) {
                console.log('[Location] No permission to get location');
                const cached = await this.getLastKnownLocation();
                if (cached) {
                    return {
                        coords: cached,
                        accuracy: undefined,
                        speed: null,
                        timestamp: undefined,
                    };
                }
                return null;
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            const coords: Coordinates = {
                lat: location.coords.latitude,
                lng: location.coords.longitude,
            };

            // Save as last known
            await storage.set(STORAGE_KEYS.LAST_KNOWN_LOCATION, coords);

            return {
                coords,
                accuracy: typeof location.coords.accuracy === 'number' ? location.coords.accuracy : undefined,
                speed: typeof location.coords.speed === 'number' ? location.coords.speed : null,
                timestamp: location.timestamp,
            };
        } catch (error) {
            console.error('[Location] Failed to get current location:', error);
            return null;
        }
    },

    async getLastKnownLocation(): Promise<Coordinates | null> {
        return await storage.get<Coordinates>(STORAGE_KEYS.LAST_KNOWN_LOCATION);
    },

    // ========== SAVED LOCATIONS ==========

    async getSavedLocations(): Promise<Record<string, SavedLocation>> {
        const saved = (await storage.get<Record<string, RawSavedLocation>>(STORAGE_KEYS.SAVED_LOCATIONS)) || {};
        const { normalized, updated } = normalizeSavedLocations(saved);
        if (updated) {
            await storage.set(STORAGE_KEYS.SAVED_LOCATIONS, normalized);
        }
        return normalized;
    },

    async saveLocation(label: 'home' | 'work' | 'gym' | 'custom', location: SavedLocation | RawSavedLocation): Promise<void> {
        const saved = await this.getSavedLocations();
        const key = label === 'custom' ? `custom_${Date.now()}` : label;
        const normalized = normalizeSavedLocation(label, location);
        if (!normalized) return;
        saved[key] = normalized;
        await storage.set(STORAGE_KEYS.SAVED_LOCATIONS, saved);
        console.log(`[Location] Saved ${label} location:`, location);
    },

    async saveCurrentAsLocation(label: 'home' | 'work' | 'gym'): Promise<boolean> {
        const current = await this.getCurrentLocation();
        if (!current) return false;

        await this.saveLocation(label, {
            ...current,
            label,
        });
        return true;
    },

    async removeLocation(key: string): Promise<void> {
        const saved = await this.getSavedLocations();
        delete saved[key];
        await storage.set(STORAGE_KEYS.SAVED_LOCATIONS, saved);
    },

    // ========== LOCATION CONTEXT ==========

    async getNearestSavedLocation(coords: Coordinates): Promise<{ label: string; distance: number } | null> {
        const saved = await this.getSavedLocations();
        let nearest: { label: string; distance: number } | null = null;

        for (const [key, location] of Object.entries(saved)) {
            const distance = calculateDistance(coords, location);
            if (!nearest || distance < nearest.distance) {
                nearest = { label: location.customName || key, distance };
            }
        }

        return nearest;
    },

    async getNearestFrequentPlace(coords: Coordinates): Promise<{
        label: string;
        distance: number;
        confidence: number;
        isConfirmed?: boolean;
        suggestedLabel?: string;
    } | null> {
        const places = await this.getFrequentPlaces();
        let nearest: {
            label: string;
            distance: number;
            confidence: number;
            isConfirmed?: boolean;
            suggestedLabel?: string;
        } | null = null;

        for (const place of places) {
            const distance = calculateDistance(coords, place);
            if (!nearest || distance < nearest.distance) {
                const label = place.confirmedLabel ? place.confirmedLabel : 'frequent';
                const confidence = Math.min(1, place.visitCount / 10);
                nearest = {
                    label,
                    distance,
                    confidence,
                    isConfirmed: !!place.confirmedLabel,
                    suggestedLabel: place.suggestedLabel || undefined,
                };
            }
        }

        if (nearest && nearest.distance <= CLUSTER_RADIUS_METERS) {
            return nearest;
        }
        return null;
    },

    async isAtLocation(label: string): Promise<boolean> {
        const current = await this.getCurrentLocation();
        if (!current) return false;

        const saved = await this.getSavedLocations();
        const target = saved[label];
        if (!target) return false;

        return isSamePlace(current, target);
    },

    async getCurrentContext(): Promise<LocationContext> {
        const fix = await this.getCurrentFix();
        const current = fix?.coords || null;
        const visits = await this.getRecentVisits(10);
        const frequentPlaces = await this.getFrequentPlaces();

        const context: LocationContext = {
            currentLocation: current || undefined,
            currentAccuracy: fix?.accuracy,
            currentSpeed: typeof fix?.speed === 'number' ? fix.speed : undefined,
            currentTimestamp: fix?.timestamp,
            lastVisits: visits,
            frequentPlaces,
        };

        if (current) {
            const nearest = await this.getNearestSavedLocation(current);
            if (nearest && nearest.distance < DISTANCE_THRESHOLD_METERS) {
                context.nearestSavedLocation = nearest;
                context.currentActivity = nearest.label;

                if (nearest.label === 'home') context.isHome = true;
                if (nearest.label === 'work') context.isWork = true;
                if (nearest.label === 'gym') context.isGym = true;
            }

            if (!context.nearestSavedLocation) {
                const frequentNearest = await this.getNearestFrequentPlace(current);
                if (frequentNearest) {
                    context.nearestFrequentPlace = frequentNearest;
                }
            }
        }

        return context;
    },

    // ========== VISIT TRACKING ==========

    async getVisits(): Promise<LocationVisit[]> {
        return (await storage.get<LocationVisit[]>(STORAGE_KEYS.LOCATION_VISITS)) || [];
    },

    async getRecentVisits(count: number): Promise<LocationVisit[]> {
        const visits = await this.getVisits();
        return visits.slice(-count);
    },

    async recordArrival(coords: Coordinates, activity?: LocationVisit['activity']): Promise<LocationVisit> {
        // End any current visit first
        await this.endCurrentVisit();

        const visit: LocationVisit = {
            id: `visit_${Date.now()}`,
            lat: coords.lat,
            lng: coords.lng,
            arrivedAt: Date.now(),
            activity,
        };

        // Check if near a saved location
        const nearest = await this.getNearestSavedLocation(coords);
        if (nearest && nearest.distance < DISTANCE_THRESHOLD_METERS) {
            visit.savedLocationLabel = nearest.label;
            if (!activity) {
                // Auto-set activity based on saved location
                if (nearest.label === 'home') visit.activity = 'home';
                else if (nearest.label === 'work') visit.activity = 'work';
                else if (nearest.label === 'gym') visit.activity = 'gym';
            }
        }

        await storage.set(STORAGE_KEYS.CURRENT_VISIT, visit);
        console.log(`[Location] Arrived at:`, visit);

        return visit;
    },

    async updateCurrentVisitActivity(activity: LocationVisit['activity']): Promise<void> {
        const current = await storage.get<LocationVisit>(STORAGE_KEYS.CURRENT_VISIT);
        if (current) {
            current.activity = activity;
            await storage.set(STORAGE_KEYS.CURRENT_VISIT, current);
            console.log(`[Location] Updated activity to: ${activity}`);
        }
    },

    async endCurrentVisit(): Promise<LocationVisit | null> {
        const current = await storage.get<LocationVisit>(STORAGE_KEYS.CURRENT_VISIT);
        if (!current) return null;

        current.leftAt = Date.now();
        current.duration = Math.round((current.leftAt - current.arrivedAt) / 60000);

        // Save to history
        const visits = await this.getVisits();
        visits.push(current);

        // Keep last 100 visits
        if (visits.length > 100) {
            visits.splice(0, visits.length - 100);
        }

        await storage.set(STORAGE_KEYS.LOCATION_VISITS, visits);
        await storage.remove(STORAGE_KEYS.CURRENT_VISIT);

        // Update frequent places
        await this.updateFrequentPlaces(current);

        console.log(`[Location] Left after ${current.duration} minutes`);
        return current;
    },

    async clearVisits(): Promise<void> {
        await storage.remove(STORAGE_KEYS.CURRENT_VISIT);
        await storage.remove(STORAGE_KEYS.LOCATION_VISITS);
    },

    // ========== AUTO-LEARN FREQUENT PLACES ==========

    async getFrequentPlaces(): Promise<FrequentPlace[]> {
        return (await storage.get<FrequentPlace[]>(STORAGE_KEYS.FREQUENT_PLACES)) || [];
    },

    async clearFrequentPlaces(): Promise<void> {
        await storage.remove(STORAGE_KEYS.FREQUENT_PLACES);
    },

    async updateFrequentPlaces(visit: LocationVisit): Promise<void> {
        const places = await this.getFrequentPlaces();

        // Find if this location clusters with an existing frequent place
        let existingPlace = places.find(p =>
            isSamePlace({ lat: p.lat, lng: p.lng }, { lat: visit.lat, lng: visit.lng }, CLUSTER_RADIUS_METERS)
        );

        if (existingPlace) {
            // Update existing
            existingPlace.visitCount++;
            existingPlace.lastVisit = visit.arrivedAt;
            existingPlace.avgDurationMinutes = Math.round(
                (existingPlace.avgDurationMinutes * (existingPlace.visitCount - 1) + (visit.duration || 0)) /
                existingPlace.visitCount
            );

            // Update centroid
            existingPlace.lat = (existingPlace.lat + visit.lat) / 2;
            existingPlace.lng = (existingPlace.lng + visit.lng) / 2;
        } else {
            // Add new place
            places.push({
                lat: visit.lat,
                lng: visit.lng,
                visitCount: 1,
                avgDurationMinutes: visit.duration || 0,
                firstVisit: visit.arrivedAt,
                lastVisit: visit.arrivedAt,
            });
        }

        // Auto-suggest labels for frequent places
        for (const place of places) {
            if (place.visitCount >= MIN_VISITS_FOR_FREQUENT && !place.confirmedLabel) {
                // Suggest based on patterns
                if (place.avgDurationMinutes > 360) {
                    // 6+ hours average = likely home or work
                    place.suggestedLabel = 'home';
                } else if (place.avgDurationMinutes > 30 && place.avgDurationMinutes < 180) {
                    // 30min - 3 hours = could be gym
                    place.suggestedLabel = 'gym';
                } else if (place.avgDurationMinutes > 240) {
                    // 4+ hours = likely work
                    place.suggestedLabel = 'work';
                }
            }
        }

        await storage.set(STORAGE_KEYS.FREQUENT_PLACES, places);
    },

    async confirmFrequentPlace(placeIndex: number, label: string): Promise<void> {
        const places = await this.getFrequentPlaces();
        if (places[placeIndex]) {
            places[placeIndex].confirmedLabel = label;
            await storage.set(STORAGE_KEYS.FREQUENT_PLACES, places);

            // Also save as a location
            const place = places[placeIndex];
            if (label === 'home' || label === 'work' || label === 'gym') {
                await this.saveLocation(label, {
                    lat: place.lat,
                    lng: place.lng,
                    label,
                });
            }
        }
    },

    // ========== LLM CONTEXT BUILDER ==========

    async buildContextForLLM(): Promise<string> {
        const context = await this.getCurrentContext();
        const visits = await this.getRecentVisits(20);

        let str = '\n=== LOCATION CONTEXT ===\n';

        if (context.currentLocation) {
            str += `Current Position: ${context.currentLocation.lat.toFixed(4)}, ${context.currentLocation.lng.toFixed(4)}\n`;
        }

        if (context.nearestSavedLocation) {
            str += `Nearest Known Place: ${context.nearestSavedLocation.label} (${Math.round(context.nearestSavedLocation.distance)}m away)\n`;
        }
        if (!context.nearestSavedLocation && context.nearestFrequentPlace) {
            const suggested = context.nearestFrequentPlace.suggestedLabel
                ? `, suggested: ${context.nearestFrequentPlace.suggestedLabel}`
                : '';
            str += `Nearest Frequent Place: ${context.nearestFrequentPlace.label}${suggested} (${Math.round(context.nearestFrequentPlace.distance)}m away)\n`;
        }

        if (context.isHome) str += 'Status: Currently at HOME\n';
        else if (context.isWork) str += 'Status: Currently at WORK\n';
        else if (context.isGym) str += 'Status: Currently at GYM\n';

        // Recent visits summary
        if (visits.length > 0) {
            str += '\nRecent Location History:\n';
            const last5 = visits.slice(-5);
            for (const v of last5) {
                const time = new Date(v.arrivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const activity = v.activity || 'unknown';
                const duration = v.duration ? ` (${v.duration} min)` : '';
                str += `• ${time}: ${activity}${duration}\n`;
            }
        }

        // Frequent places
        const frequentPlaces = context.frequentPlaces.filter(p => p.visitCount >= MIN_VISITS_FOR_FREQUENT);
        if (frequentPlaces.length > 0) {
            str += '\nFrequent Places:\n';
            for (const p of frequentPlaces.slice(0, 3)) {
                const label = p.confirmedLabel || p.suggestedLabel || 'unknown';
                str += `• ${label}: visited ${p.visitCount}x, avg ${p.avgDurationMinutes} min\n`;
            }
        }

        return str;
    },
};

export default locationService;
