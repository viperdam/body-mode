import storage from './storageService';
import type { WifiConnectionInfo } from './wifiService';

export type WifiLabel = 'home' | 'work' | 'gym' | 'frequent' | 'unclassified';

export type WifiEntry = {
  bssid: string;
  ssid?: string;
  label?: WifiLabel;
  confidence?: number;
  totalConnections: number;
  totalDurationMin: number;
  avgDurationMin: number;
  connectionsByHour: number[];
  connectionsByDay: number[];
  nightConnections: number;
  lastSeen: number;
  lastConnectedAt?: number;
};

type WifiDb = Record<string, WifiEntry>;

type WifiSession = {
  bssid: string;
  connectedAt: number;
};

const NIGHT_HOURS = new Set([22, 23, 0, 1, 2, 3, 4, 5, 6]);

const loadDb = async (): Promise<WifiDb> => {
  return (await storage.get<WifiDb>(storage.keys.CONTEXT_WIFI_DB)) || {};
};

const saveDb = async (db: WifiDb): Promise<void> => {
  await storage.set(storage.keys.CONTEXT_WIFI_DB, db);
};

const loadSession = async (): Promise<WifiSession | null> => {
  return (await storage.get<WifiSession>(storage.keys.CONTEXT_WIFI_SESSION)) || null;
};

const saveSession = async (session: WifiSession | null): Promise<void> => {
  if (!session) {
    await storage.remove(storage.keys.CONTEXT_WIFI_SESSION);
    return;
  }
  await storage.set(storage.keys.CONTEXT_WIFI_SESSION, session);
};

const ensureEntry = (db: WifiDb, info: WifiConnectionInfo): WifiEntry => {
  const existing = db[info.bssid || ''];
  if (existing) {
    if (info.ssid && !existing.ssid) {
      existing.ssid = info.ssid;
    }
    return existing;
  }
  const entry: WifiEntry = {
    bssid: info.bssid || '',
    ssid: info.ssid,
    label: 'unclassified',
    confidence: 0,
    totalConnections: 0,
    totalDurationMin: 0,
    avgDurationMin: 0,
    connectionsByHour: Array.from({ length: 24 }, () => 0),
    connectionsByDay: Array.from({ length: 7 }, () => 0),
    nightConnections: 0,
    lastSeen: Date.now(),
  };
  db[entry.bssid] = entry;
  return entry;
};

const classifyEntry = (entry: WifiEntry): void => {
  if (entry.totalConnections < 3) {
    entry.label = 'unclassified';
    entry.confidence = 0;
    return;
  }

  const nightRatio = entry.totalConnections > 0 ? entry.nightConnections / entry.totalConnections : 0;
  const avgDuration = entry.avgDurationMin;

  if (nightRatio > 0.6 && avgDuration > 180) {
    entry.label = 'home';
    entry.confidence = Math.min(1, nightRatio + 0.2);
    return;
  }

  const weekdayConnections = entry.connectionsByDay.reduce((sum, value, idx) => {
    if (idx >= 1 && idx <= 5) return sum + value;
    return sum;
  }, 0);
  const weekdayRatio = entry.totalConnections > 0 ? weekdayConnections / entry.totalConnections : 0;

  if (weekdayRatio > 0.6 && avgDuration > 120) {
    entry.label = 'work';
    entry.confidence = Math.min(1, weekdayRatio + 0.15);
    return;
  }

  if (avgDuration >= 30 && avgDuration <= 120 && entry.totalConnections >= 5) {
    entry.label = 'gym';
    entry.confidence = Math.min(1, 0.5 + entry.totalConnections / 20);
    return;
  }

  entry.label = entry.totalConnections >= 5 ? 'frequent' : 'unclassified';
  entry.confidence = entry.label === 'frequent' ? 0.4 : 0.2;
};

const finalizeSession = (db: WifiDb, session: WifiSession): void => {
  const entry = db[session.bssid];
  if (!entry) return;
  const durationMin = Math.max(1, Math.round((Date.now() - session.connectedAt) / 60000));
  entry.totalDurationMin += durationMin;
  entry.avgDurationMin = entry.totalDurationMin / Math.max(1, entry.totalConnections);
  classifyEntry(entry);
};

export const wifiLearningService = {
  async updateConnection(info: WifiConnectionInfo | null): Promise<WifiEntry | null> {
    const db = await loadDb();
    const session = await loadSession();

    if (!info || !info.connected || !info.bssid) {
      if (session) {
        finalizeSession(db, session);
        await saveDb(db);
        await saveSession(null);
      }
      return null;
    }

    const entry = ensureEntry(db, info);
    const now = new Date();
    entry.lastSeen = Date.now();
    entry.connectionsByHour[now.getHours()] += 1;
    entry.connectionsByDay[now.getDay()] += 1;
    if (NIGHT_HOURS.has(now.getHours())) {
      entry.nightConnections += 1;
    }

    if (!session || session.bssid !== info.bssid) {
      if (session) {
        finalizeSession(db, session);
      }
      entry.totalConnections += 1;
      entry.lastConnectedAt = Date.now();
      await saveSession({ bssid: info.bssid, connectedAt: Date.now() });
    }

    classifyEntry(entry);
    await saveDb(db);
    return entry;
  },

  async getWifiLabel(bssid?: string): Promise<WifiEntry | null> {
    if (!bssid) return null;
    const db = await loadDb();
    return db[bssid] || null;
  },

  async getWifiDatabase(): Promise<WifiDb> {
    return await loadDb();
  },

  async setManualLabel(bssid: string, label: WifiLabel): Promise<void> {
    if (!bssid) return;
    const db = await loadDb();
    const entry = db[bssid];
    if (!entry) return;
    entry.label = label;
    entry.confidence = 1;
    entry.lastSeen = Date.now();
    await saveDb(db);
  },

  async clearDatabase(): Promise<void> {
    await storage.remove(storage.keys.CONTEXT_WIFI_DB);
    await storage.remove(storage.keys.CONTEXT_WIFI_SESSION);
  },
};

export default wifiLearningService;
