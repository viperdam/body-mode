import storage from './storageService';
import { getLocalDateKey } from '../utils/dateUtils';
import { txStoreService } from './txStoreService';
import { sleepSessionService } from './sleepSessionService';
import { Platform } from 'react-native';

export type SleepHoursEntry = { date: string; hours: number };

const MAX_ENTRIES = 30;

const clampHours = (hours: number) => Math.max(0, Math.min(24, hours));

const normalizeHistory = (entries: SleepHoursEntry[]): SleepHoursEntry[] => {
  const byDate = new Map<string, SleepHoursEntry>();
  for (const entry of entries) {
    if (!entry || typeof entry.date !== 'string') continue;
    const hours = typeof entry.hours === 'number' && Number.isFinite(entry.hours) ? clampHours(entry.hours) : null;
    if (hours === null) continue;
    byDate.set(entry.date, { date: entry.date, hours });
  }

  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_ENTRIES);
};

const deriveFromSessions = async (): Promise<SleepHoursEntry[]> => {
  const sessions = (await storage.get<any[]>(storage.keys.SLEEP_HISTORY)) || [];
  if (!Array.isArray(sessions) || sessions.length === 0) return [];

  const totals = new Map<string, number>();

  for (const session of sessions) {
    const endTime = typeof session?.endTime === 'number' ? session.endTime : undefined;
    const startTime = typeof session?.startTime === 'number' ? session.startTime : undefined;
    const sortTime = endTime ?? startTime;
    if (typeof sortTime !== 'number') continue;

    const date = getLocalDateKey(new Date(sortTime));

    const hoursRaw =
      typeof session?.hours === 'number' ? session.hours :
        typeof session?.sleepDurationHours === 'number' ? session.sleepDurationHours :
          typeof session?.durationHours === 'number' ? session.durationHours :
            typeof session?.durationMinutes === 'number' ? session.durationMinutes / 60 :
              typeof session?.duration === 'number' ? session.duration :
                undefined;

    if (typeof hoursRaw !== 'number' || !Number.isFinite(hoursRaw)) continue;
    const current = totals.get(date) ?? 0;
    totals.set(date, current + clampHours(hoursRaw));
  }

  const derived = Array.from(totals.entries())
    .map(([date, hours]) => ({ date, hours: clampHours(hours) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return normalizeHistory(derived);
};

export const sleepHoursService = {
  /**
   * Returns daily sleep hours history for plan generation (dateKey -> hours).
   * Prefers TxStore on Android for unified storage, falls back to AsyncStorage.
   */
  async getHistory(): Promise<SleepHoursEntry[]> {
    // Prefer unified TxStore on Android
    if (Platform.OS === 'android' && txStoreService.available()) {
      const txRecords = await txStoreService.getSleepHistory(MAX_ENTRIES);
      if (txRecords.length > 0) {
        return normalizeHistory(txRecords.map(r => ({ date: r.date, hours: r.hours })));
      }
    }

    // Fallback to AsyncStorage
    const stored = await storage.get<SleepHoursEntry[]>(storage.keys.SLEEP_HOURS);
    if (Array.isArray(stored) && stored.length > 0) return normalizeHistory(stored);

    const derived = await deriveFromSessions();
    if (derived.length > 0) {
      await storage.set(storage.keys.SLEEP_HOURS, derived);
    }
    return derived;
  },

  /**
   * Record (upsert) sleep hours for a given day.
   * Writes to both TxStore (Android) and AsyncStorage for compatibility.
   */
  async record(hours: number, dateKey: string = getLocalDateKey(new Date())): Promise<void> {
    if (typeof hours !== 'number' || !Number.isFinite(hours)) return;

    const clampedHours = clampHours(hours);

    // Write to TxStore on Android
    if (Platform.OS === 'android' && txStoreService.available()) {
      await txStoreService.recordSleep(clampedHours, dateKey, 'manual');
    }

    // Also write to AsyncStorage for compatibility
    const seeded = await this.getHistory();
    const next = normalizeHistory([...seeded.filter(e => e.date !== dateKey), { date: dateKey, hours: clampedHours }]);
    await storage.set(storage.keys.SLEEP_HOURS, next);
  },

  /**
   * Recalculate sleep hours for a specific date from session history.
   */
  async recomputeForDate(dateKey: string): Promise<number> {
    if (!dateKey) return 0;
    const record = await sleepSessionService.getSessionsForDate(dateKey);
    const total = record?.totalHours ?? 0;
    await this.record(total, dateKey);
    return total;
  },
};

export default sleepHoursService;

