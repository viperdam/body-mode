import storage from './storageService';
import { getContextPolicy } from './contextPolicyService';
import { getSensorHealth } from './contextReliabilityService';
import { getHistorySummary, getRecentSnapshots, getRecentTransitions } from './contextHistoryService';
import { getRecentSignalSnapshots } from './contextSignalHistoryService';
import { contextCorrectionService } from './contextCorrectionService';
import { wifiLearningService } from './wifiLearningService';
import locationService from './locationService';
import type { ContextSnapshot } from './contextTypes';

export type ContextDiagnostics = {
  policy: Awaited<ReturnType<typeof getContextPolicy>>;
  lastSnapshot?: ContextSnapshot | null;
  historySummary?: Awaited<ReturnType<typeof getHistorySummary>>;
  recentSnapshots?: ContextSnapshot[];
  recentTransitions?: Awaited<ReturnType<typeof getRecentTransitions>>;
  recentSignals?: Awaited<ReturnType<typeof getRecentSignalSnapshots>>;
  sensorHealth?: Awaited<ReturnType<typeof getSensorHealth>>;
  wifiDbCount?: number;
  corrections?: Awaited<ReturnType<typeof contextCorrectionService.getCorrections>>;
  frequentPlaces?: Awaited<ReturnType<typeof locationService.getFrequentPlaces>>;
  recentVisits?: Awaited<ReturnType<typeof locationService.getRecentVisits>>;
};

export const getContextDiagnostics = async (): Promise<ContextDiagnostics> => {
  const policy = await getContextPolicy();
  if (!policy.contextDiagnosticsEnabled) {
    return { policy };
  }
  const [lastSnapshot, historySummary, sensorHealth, wifiDb, corrections, frequentPlaces, recentVisits, recentSignals, recentSnapshots] =
    await Promise.all([
      storage.get<ContextSnapshot>(storage.keys.LAST_CONTEXT_SNAPSHOT),
      getHistorySummary(),
      getSensorHealth(),
      wifiLearningService.getWifiDatabase(),
      contextCorrectionService.getCorrections(),
      locationService.getFrequentPlaces(),
      locationService.getRecentVisits(5),
      getRecentSignalSnapshots(10),
      getRecentSnapshots(10),
    ]);
  const transitions = await getRecentTransitions(5);

  return {
    policy,
    lastSnapshot,
    historySummary,
    recentSnapshots,
    recentTransitions: transitions,
    recentSignals,
    sensorHealth,
    wifiDbCount: wifiDb ? Object.keys(wifiDb).length : 0,
    corrections,
    frequentPlaces,
    recentVisits,
  };
};

export const exportContextDiagnostics = async (): Promise<string> => {
  const diagnostics = await getContextDiagnostics();
  return JSON.stringify(diagnostics, null, 2);
};

export default {
  getContextDiagnostics,
  exportContextDiagnostics,
};
