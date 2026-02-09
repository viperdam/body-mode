import storage from './storageService';

export type SensorKey = 'gps' | 'activity' | 'environment' | 'motion' | 'wifi';
type CircuitState = 'closed' | 'open' | 'half';

type SensorStatus = {
  failures: number;
  successes: number;
  lastFailureAt?: number;
  state: CircuitState;
  halfOpenAt?: number;
};

type SensorHealth = Record<SensorKey, SensorStatus>;

const DEFAULT_STATUS: SensorStatus = {
  failures: 0,
  successes: 0,
  state: 'closed',
};

const OPEN_AFTER_FAILURES = 3;
const OPEN_COOLDOWN_MS = 5 * 60 * 1000;

let cached: SensorHealth | null = null;

const ensureLoaded = async (): Promise<SensorHealth> => {
  if (cached) return cached;
  const stored = await storage.get<SensorHealth>(storage.keys.CONTEXT_SENSOR_HEALTH);
  if (stored) {
    cached = stored;
    return stored;
  }
  const initial: SensorHealth = {
    gps: { ...DEFAULT_STATUS },
    activity: { ...DEFAULT_STATUS },
    environment: { ...DEFAULT_STATUS },
    motion: { ...DEFAULT_STATUS },
    wifi: { ...DEFAULT_STATUS },
  };
  cached = initial;
  return initial;
};

const persist = async (health: SensorHealth): Promise<void> => {
  cached = health;
  await storage.set(storage.keys.CONTEXT_SENSOR_HEALTH, health);
};

const updateStatus = (current: SensorStatus, update: Partial<SensorStatus>): SensorStatus => ({
  ...current,
  ...update,
});

export const recordSuccess = async (sensor: SensorKey): Promise<void> => {
  const health = await ensureLoaded();
  const current = health[sensor] || { ...DEFAULT_STATUS };
  const next = updateStatus(current, {
    successes: current.successes + 1,
    failures: 0,
    state: 'closed',
    halfOpenAt: undefined,
  });
  health[sensor] = next;
  await persist(health);
};

export const recordFailure = async (sensor: SensorKey): Promise<void> => {
  const health = await ensureLoaded();
  const current = health[sensor] || { ...DEFAULT_STATUS };
  const failures = current.failures + 1;
  let state: CircuitState = current.state;
  let halfOpenAt = current.halfOpenAt;
  if (failures >= OPEN_AFTER_FAILURES) {
    state = 'open';
    halfOpenAt = Date.now() + OPEN_COOLDOWN_MS;
  }

  const next = updateStatus(current, {
    failures,
    state,
    lastFailureAt: Date.now(),
    halfOpenAt,
  });
  health[sensor] = next;
  await persist(health);
};

export const shouldUseSensor = async (sensor: SensorKey): Promise<boolean> => {
  const health = await ensureLoaded();
  const current = health[sensor] || { ...DEFAULT_STATUS };
  if (current.state === 'closed') return true;
  if (current.state === 'open') {
    if (current.halfOpenAt && Date.now() >= current.halfOpenAt) {
      health[sensor] = updateStatus(current, { state: 'half' });
      await persist(health);
      return true;
    }
    return false;
  }
  return true;
};

export const getSensorHealth = async (): Promise<SensorHealth> => {
  const health = await ensureLoaded();
  return { ...health };
};

export const resetSensorHealth = async (): Promise<void> => {
  cached = null;
  await storage.remove(storage.keys.CONTEXT_SENSOR_HEALTH);
};

export default {
  recordSuccess,
  recordFailure,
  shouldUseSensor,
  getSensorHealth,
  resetSensorHealth,
};
