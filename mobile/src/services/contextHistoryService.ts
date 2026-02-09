import storage from './storageService';
import type { ContextSnapshot } from './contextTypes';
import { getContextPolicy } from './contextPolicyService';

export type ContextHistorySummary = {
  total: number;
  byState: Record<string, number>;
  byMovement?: Record<string, number>;
  avgConfidence?: number;
  conflictRate?: number;
  lastUpdatedAt?: number;
};

export type ContextTransition = {
  from: string;
  to: string;
  at: number;
  location?: string;
  environment?: string;
  movement?: string;
};

const pruneHistory = (
  items: ContextSnapshot[],
  config: { maxEntries: number; maxAgeMs: number }
): ContextSnapshot[] => {
  const cutoff = Date.now() - config.maxAgeMs;
  const filtered = items.filter(entry => entry && entry.updatedAt >= cutoff);
  if (filtered.length <= config.maxEntries) return filtered;
  return filtered.slice(filtered.length - config.maxEntries);
};

export const recordSnapshot = async (snapshot: ContextSnapshot): Promise<void> => {
  try {
    const policy = await getContextPolicy();
    if (!policy.contextHistoryEnabled) return;
    const existing = (await storage.get<ContextSnapshot[]>(storage.keys.CONTEXT_HISTORY)) || [];
    const maxAgeMs = Math.max(1, policy.contextHistoryDays) * 24 * 60 * 60 * 1000;
    const maxEntries = Math.max(60, Math.round(policy.contextHistoryDays * 120));
    const next = pruneHistory([...existing, snapshot], { maxEntries, maxAgeMs });
    await storage.set(storage.keys.CONTEXT_HISTORY, next);
  } catch (error) {
    console.warn('[ContextHistory] Failed to record snapshot:', error);
  }
};

export const getRecentSnapshots = async (count: number = 50): Promise<ContextSnapshot[]> => {
  const existing = (await storage.get<ContextSnapshot[]>(storage.keys.CONTEXT_HISTORY)) || [];
  if (!existing.length) return [];
  return existing.slice(Math.max(0, existing.length - count));
};

export const getRecentTransitions = async (count: number = 5): Promise<ContextTransition[]> => {
  const existing = (await storage.get<ContextSnapshot[]>(storage.keys.CONTEXT_HISTORY)) || [];
  if (existing.length < 2) return [];

  const sorted = [...existing].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  const transitions: ContextTransition[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (!prev || !next) continue;
    const stateChanged = prev.state !== next.state;
    const locationChanged = prev.locationLabel !== next.locationLabel;
    const environmentChanged = prev.environment !== next.environment;
    if (stateChanged || locationChanged || environmentChanged) {
      transitions.push({
        from: prev.state,
        to: next.state,
        at: next.updatedAt,
        location: next.locationLabel,
        environment: next.environment,
        movement: next.movementType,
      });
    }
  }
  if (transitions.length <= count) return transitions;
  return transitions.slice(transitions.length - count);
};

export const getHistorySummary = async (): Promise<ContextHistorySummary> => {
  const entries = (await storage.get<ContextSnapshot[]>(storage.keys.CONTEXT_HISTORY)) || [];
  if (!entries.length) return { total: 0, byState: {} };

  const byState: Record<string, number> = {};
  const byMovement: Record<string, number> = {};
  let confidenceTotal = 0;
  let confidenceCount = 0;
  let conflictCount = 0;
  let lastUpdatedAt = 0;

  for (const entry of entries) {
    byState[entry.state] = (byState[entry.state] || 0) + 1;
    if (entry.movementType) {
      byMovement[entry.movementType] = (byMovement[entry.movementType] || 0) + 1;
    }
    if (typeof entry.confidence === 'number') {
      confidenceTotal += entry.confidence;
      confidenceCount += 1;
    }
    if (entry.conflicts && entry.conflicts.length > 0) {
      conflictCount += 1;
    }
    if (entry.updatedAt > lastUpdatedAt) {
      lastUpdatedAt = entry.updatedAt;
    }
  }

  return {
    total: entries.length,
    byState,
    byMovement,
    avgConfidence: confidenceCount > 0 ? confidenceTotal / confidenceCount : undefined,
    conflictRate: entries.length > 0 ? conflictCount / entries.length : undefined,
    lastUpdatedAt: lastUpdatedAt || undefined,
  };
};

export const buildContextSummary = (input: {
  lastSnapshot?: ContextSnapshot | null;
  summary?: ContextHistorySummary | null;
  transitions?: ContextTransition[] | null;
}): string | undefined => {
  const { lastSnapshot, summary, transitions } = input;
  const lines: string[] = [];
  if (lastSnapshot) {
    const confidence = typeof lastSnapshot.confidence === 'number'
      ? Math.round(lastSnapshot.confidence * 100)
      : undefined;
    const env = lastSnapshot.environment || 'unknown';
    const movement = lastSnapshot.movementType || 'unknown';
    const location = lastSnapshot.locationLabel || 'unknown';
    const pollTier = lastSnapshot.pollTier || 'unknown';
    lines.push(
      `Current context: ${lastSnapshot.state} (${env}), movement ${movement}, location ${location}, ` +
      `confidence ${confidence ?? 'n/a'}%, poll ${pollTier}.`
    );
    if (lastSnapshot.conflicts?.length) {
      lines.push(`Conflicts: ${lastSnapshot.conflicts.join(', ')}`);
    }
  }

  if (summary && summary.total > 0) {
    if (summary.avgConfidence !== undefined) {
      lines.push(`Avg confidence (${summary.total} samples): ${Math.round(summary.avgConfidence * 100)}%.`);
    }
    if (summary.conflictRate !== undefined) {
      lines.push(`Conflict rate: ${Math.round(summary.conflictRate * 100)}%.`);
    }

    const byState = summary.byState || {};
    const topStates = Object.entries(byState)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([state, count]) => `${state} (${Math.round((count / summary.total) * 100)}%)`);
    if (topStates.length > 0) {
      lines.push(`Recent states: ${topStates.join(', ')}.`);
    }

    const byMovement = summary.byMovement || {};
    const topMovement = Object.entries(byMovement)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([movement, count]) => `${movement} (${Math.round((count / summary.total) * 100)}%)`);
    if (topMovement.length > 0) {
      lines.push(`Movement mix: ${topMovement.join(', ')}.`);
    }
  }

  if (transitions && transitions.length > 0) {
    const formatted = transitions.slice(-5).map((transition) => {
      const at = new Date(transition.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const location = transition.location ? ` @ ${transition.location}` : '';
      return `• ${at}: ${transition.from} → ${transition.to}${location}`;
    });
    lines.push('Recent transitions:');
    lines.push(...formatted);
  }

  return lines.length ? lines.join('\n') : undefined;
};

export const pruneHistoryNow = async (): Promise<void> => {
  try {
    const policy = await getContextPolicy();
    const existing = (await storage.get<ContextSnapshot[]>(storage.keys.CONTEXT_HISTORY)) || [];
    if (!existing.length) return;
    const maxAgeMs = Math.max(1, policy.contextHistoryDays) * 24 * 60 * 60 * 1000;
    const maxEntries = Math.max(60, Math.round(policy.contextHistoryDays * 120));
    const next = pruneHistory(existing, { maxEntries, maxAgeMs });
    if (next.length !== existing.length) {
      await storage.set(storage.keys.CONTEXT_HISTORY, next);
    }
  } catch (error) {
    console.warn('[ContextHistory] Failed to prune history:', error);
  }
};

export const clearHistory = async (): Promise<void> => {
  await storage.remove(storage.keys.CONTEXT_HISTORY);
};

export default {
  recordSnapshot,
  getRecentSnapshots,
  getRecentTransitions,
  getHistorySummary,
  buildContextSummary,
  pruneHistoryNow,
  clearHistory,
};
