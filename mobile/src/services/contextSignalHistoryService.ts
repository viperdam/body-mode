import storage from './storageService';
import type { ContextSnapshot, SignalSnapshot } from './contextTypes';
import { getContextPolicy } from './contextPolicyService';

type SignalHistoryEntry = {
  collectedAt: number;
  signals: SignalSnapshot;
  snapshot?: ContextSnapshot;
};

const pruneHistory = (
  items: SignalHistoryEntry[],
  config: { maxEntries: number; maxAgeMs: number }
): SignalHistoryEntry[] => {
  const cutoff = Date.now() - config.maxAgeMs;
  const filtered = items.filter(entry => entry.collectedAt >= cutoff);
  if (filtered.length <= config.maxEntries) return filtered;
  return filtered.slice(filtered.length - config.maxEntries);
};

export const recordSignalSnapshot = async (
  signals: SignalSnapshot,
  snapshot?: ContextSnapshot
): Promise<void> => {
  try {
    const policy = await getContextPolicy();
    if (!policy.contextSignalHistoryEnabled) return;
    const existing =
      (await storage.get<SignalHistoryEntry[]>(storage.keys.CONTEXT_SIGNAL_HISTORY)) || [];
    const entry: SignalHistoryEntry = {
      collectedAt: signals.collectedAt || Date.now(),
      signals,
      snapshot,
    };
    const maxAgeMs = Math.max(6, policy.contextSignalHistoryHours) * 60 * 60 * 1000;
    const maxEntries = Math.max(120, Math.round(policy.contextSignalHistoryHours * 5));
    const next = pruneHistory([...existing, entry], { maxEntries, maxAgeMs });
    await storage.set(storage.keys.CONTEXT_SIGNAL_HISTORY, next);
  } catch (error) {
    console.warn('[ContextSignalHistory] Failed to record signals:', error);
  }
};

export const getRecentSignalSnapshots = async (
  count: number = 50
): Promise<SignalHistoryEntry[]> => {
  const existing =
    (await storage.get<SignalHistoryEntry[]>(storage.keys.CONTEXT_SIGNAL_HISTORY)) || [];
  if (!existing.length) return [];
  return existing.slice(Math.max(0, existing.length - count));
};

export const pruneSignalHistoryNow = async (): Promise<void> => {
  try {
    const policy = await getContextPolicy();
    const existing =
      (await storage.get<SignalHistoryEntry[]>(storage.keys.CONTEXT_SIGNAL_HISTORY)) || [];
    if (!existing.length) return;
    const maxAgeMs = Math.max(6, policy.contextSignalHistoryHours) * 60 * 60 * 1000;
    const maxEntries = Math.max(120, Math.round(policy.contextSignalHistoryHours * 5));
    const next = pruneHistory(existing, { maxEntries, maxAgeMs });
    if (next.length !== existing.length) {
      await storage.set(storage.keys.CONTEXT_SIGNAL_HISTORY, next);
    }
  } catch (error) {
    console.warn('[ContextSignalHistory] Failed to prune signals:', error);
  }
};

export const clearSignalHistory = async (): Promise<void> => {
  await storage.remove(storage.keys.CONTEXT_SIGNAL_HISTORY);
};

export default {
  recordSignalSnapshot,
  getRecentSignalSnapshots,
  pruneSignalHistoryNow,
  clearSignalHistory,
};
