import storage from './storageService';
import type { ContextSnapshot } from './contextTypes';
import { recordSnapshot as recordContextSnapshot } from './contextHistoryService';
import { wifiLearningService, type WifiLabel } from './wifiLearningService';
import locationService from './locationService';

export type ContextCorrection = {
  timestamp: number;
  detectedState?: string;
  detectedEnvironment?: string;
  detectedLocation?: string;
  actualState?: string;
  actualEnvironment?: string;
  actualLocation?: string;
  snapshot?: ContextSnapshot;
};

const STORAGE_KEY = 'context:corrections';

const normalizeLocationLabel = (label?: string | null): string | null => {
  if (!label) return null;
  const normalized = label.toLowerCase();
  if (['home', 'work', 'gym', 'outside'].includes(normalized)) return normalized;
  return normalized;
};

export const contextCorrectionService = {
  async recordCorrection(input: {
    actualState?: ContextSnapshot['state'];
    actualEnvironment?: ContextSnapshot['environment'];
    actualLocation?: string;
  }): Promise<void> {
    const snapshot = await storage.get<ContextSnapshot>(storage.keys.LAST_CONTEXT_SNAPSHOT);
    if (!snapshot) return;

    const actualLocation = normalizeLocationLabel(input.actualLocation);
    const correction: ContextCorrection = {
      timestamp: Date.now(),
      detectedState: snapshot.state,
      detectedEnvironment: snapshot.environment,
      detectedLocation: snapshot.locationLabel,
      actualState: input.actualState ?? snapshot.state,
      actualEnvironment: input.actualEnvironment ?? snapshot.environment,
      actualLocation: actualLocation ?? snapshot.locationLabel,
      snapshot,
    };

    const existing = (await storage.get<ContextCorrection[]>(STORAGE_KEY)) || [];
    const next = [...existing.slice(-49), correction];
    await storage.set(STORAGE_KEY, next);

    const correctedSnapshot: ContextSnapshot = {
      ...snapshot,
      state: (input.actualState ?? snapshot.state),
      environment: (input.actualEnvironment ?? snapshot.environment),
      locationLabel: actualLocation ?? snapshot.locationLabel,
      confidence: 0.99,
      confidenceLevel: 'very_high',
      updatedAt: Date.now(),
    };

    await storage.set(storage.keys.LAST_CONTEXT_SNAPSHOT, correctedSnapshot);
    void recordContextSnapshot(correctedSnapshot);

    if (actualLocation === 'home' || actualLocation === 'work' || actualLocation === 'gym') {
      const coords = correctedSnapshot.locationCoords;
      if (coords) {
        await locationService.saveLocation(actualLocation as 'home' | 'work' | 'gym', {
          ...coords,
          label: actualLocation,
        });
      }
    }

    if (snapshot && snapshot.locationLabel && snapshot.locationLabel !== 'outside') {
      const currentWifi = await storage.get<any>(storage.keys.CONTEXT_WIFI_SESSION);
      if (currentWifi?.bssid && actualLocation && ['home', 'work', 'gym', 'frequent'].includes(actualLocation)) {
        await wifiLearningService.setManualLabel(currentWifi.bssid, actualLocation as WifiLabel);
      }
    }

    try {
      const { invalidateLLMContextCache } = require('./llmContextService');
      invalidateLLMContextCache();
    } catch (error) {
      console.warn('[ContextCorrection] Failed to invalidate LLM cache:', error);
    }
    try {
      const { planRefinementService } = require('./planRefinementService');
      if (planRefinementService?.recordContextChange) {
        planRefinementService.recordContextChange(
          snapshot.state,
          correctedSnapshot.state,
          {
            location: correctedSnapshot.locationLabel,
            locationContext: correctedSnapshot.locationContext,
          }
        );
      }
    } catch (error) {
      console.warn('[ContextCorrection] Failed to record context change:', error);
    }
  },

  async getCorrections(): Promise<ContextCorrection[]> {
    return (await storage.get<ContextCorrection[]>(STORAGE_KEY)) || [];
  },

  async clearCorrections(): Promise<void> {
    await storage.remove(STORAGE_KEY);
  },
};

export default contextCorrectionService;
