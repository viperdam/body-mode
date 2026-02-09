import storage from './storageService';
import { clearHistory } from './contextHistoryService';
import { clearSignalHistory } from './contextSignalHistoryService';
import { resetSensorHealth } from './contextReliabilityService';
import { stopGeofence } from './contextGeofenceService';
import locationService from './locationService';
import { wifiLearningService } from './wifiLearningService';
import contextCorrectionService from './contextCorrectionService';

export type ClearContextOptions = {
  keepSavedLocations?: boolean;
};

export const clearContextData = async (options: ClearContextOptions = {}): Promise<void> => {
  const { keepSavedLocations = true } = options;
  await Promise.allSettled([
    clearHistory(),
    clearSignalHistory(),
    resetSensorHealth(),
    contextCorrectionService.clearCorrections(),
    wifiLearningService.clearDatabase(),
    locationService.clearVisits(),
    locationService.clearFrequentPlaces(),
    stopGeofence(),
  ]);

  await storage.remove(storage.keys.LAST_CONTEXT_SNAPSHOT);
  await storage.remove(storage.keys.CONTEXT_GEOFENCE);

  if (!keepSavedLocations) {
    await storage.remove('@saved_locations');
  }

  try {
    const { invalidateLLMContextCache } = require('./llmContextService');
    invalidateLLMContextCache();
  } catch (error) {
    console.warn('[ContextData] Failed to invalidate LLM cache:', error);
  }
};

export default {
  clearContextData,
};
