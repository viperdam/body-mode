import storage from './storageService';

export type ContextPrivacyMode = 'standard' | 'minimal';

export type ContextPolicy = {
  contextHistoryEnabled: boolean;
  contextSignalHistoryEnabled: boolean;
  contextLearningEnabled: boolean;
  contextDiagnosticsEnabled: boolean;
  contextHistoryDays: number;
  contextSignalHistoryHours: number;
  contextPrivacyMode: ContextPrivacyMode;
};

const DEFAULT_POLICY: ContextPolicy = {
  contextHistoryEnabled: true,
  contextSignalHistoryEnabled: true,
  contextLearningEnabled: true,
  contextDiagnosticsEnabled: true,
  contextHistoryDays: 2,
  contextSignalHistoryHours: 48,
  contextPrivacyMode: 'standard',
};

const CACHE_TTL_MS = 30_000;
let cachedPolicy: ContextPolicy | null = null;
let cachedAt = 0;

const normalizeNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
};

const buildPolicy = (prefs: any): ContextPolicy => ({
  contextHistoryEnabled: prefs?.contextHistoryEnabled !== false,
  contextSignalHistoryEnabled: prefs?.contextSignalHistoryEnabled !== false,
  contextLearningEnabled: prefs?.contextLearningEnabled !== false,
  contextDiagnosticsEnabled: prefs?.contextDiagnosticsEnabled !== false,
  contextHistoryDays: normalizeNumber(prefs?.contextHistoryDays, DEFAULT_POLICY.contextHistoryDays, 1, 30),
  contextSignalHistoryHours: normalizeNumber(prefs?.contextSignalHistoryHours, DEFAULT_POLICY.contextSignalHistoryHours, 6, 168),
  contextPrivacyMode: prefs?.contextPrivacyMode === 'minimal' ? 'minimal' : 'standard',
});

export const getContextPolicy = async (): Promise<ContextPolicy> => {
  const now = Date.now();
  if (cachedPolicy && now - cachedAt < CACHE_TTL_MS) {
    return cachedPolicy;
  }
  const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
  cachedPolicy = buildPolicy(prefs || {});
  cachedAt = now;
  return cachedPolicy;
};

export const updateContextPolicy = async (
  partial: Partial<ContextPolicy>
): Promise<ContextPolicy> => {
  const prefs = (await storage.get<any>(storage.keys.APP_PREFERENCES)) || {};
  const nextPrefs = {
    ...prefs,
    contextHistoryEnabled:
      typeof partial.contextHistoryEnabled === 'boolean'
        ? partial.contextHistoryEnabled
        : prefs.contextHistoryEnabled,
    contextSignalHistoryEnabled:
      typeof partial.contextSignalHistoryEnabled === 'boolean'
        ? partial.contextSignalHistoryEnabled
        : prefs.contextSignalHistoryEnabled,
    contextLearningEnabled:
      typeof partial.contextLearningEnabled === 'boolean'
        ? partial.contextLearningEnabled
        : prefs.contextLearningEnabled,
    contextDiagnosticsEnabled:
      typeof partial.contextDiagnosticsEnabled === 'boolean'
        ? partial.contextDiagnosticsEnabled
        : prefs.contextDiagnosticsEnabled,
    contextHistoryDays:
      typeof partial.contextHistoryDays === 'number'
        ? partial.contextHistoryDays
        : prefs.contextHistoryDays,
    contextSignalHistoryHours:
      typeof partial.contextSignalHistoryHours === 'number'
        ? partial.contextSignalHistoryHours
        : prefs.contextSignalHistoryHours,
    contextPrivacyMode:
      partial.contextPrivacyMode === 'minimal' || partial.contextPrivacyMode === 'standard'
        ? partial.contextPrivacyMode
        : prefs.contextPrivacyMode,
  };
  await storage.set(storage.keys.APP_PREFERENCES, nextPrefs);
  cachedPolicy = buildPolicy(nextPrefs);
  cachedAt = Date.now();
  return cachedPolicy;
};

export const invalidateContextPolicyCache = (): void => {
  cachedPolicy = null;
  cachedAt = 0;
};

export default {
  getContextPolicy,
  updateContextPolicy,
  invalidateContextPolicyCache,
};
