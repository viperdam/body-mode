import { AppState } from 'react-native';
import storage from './storageService';
import backgroundLocationService from './backgroundLocationService';
import { requestContextRefresh } from './contextService';
import type { ContextSnapshot } from './contextTypes';

const WATCHDOG_INTERVAL_MS = 2 * 60_000;
const STALE_THRESHOLD_MS = 8 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let lastKickAt = 0;

const shouldRun = async (): Promise<boolean> => {
  const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
  return prefs?.contextSensingEnabled !== false;
};

const isBackgroundEnabled = async (): Promise<boolean> => {
  const enabled = await storage.get<boolean>('settings:backgroundLocation:enabled');
  return enabled === true;
};

const runCheck = async (reason: string) => {
  const now = Date.now();
  if (now - lastKickAt < 30_000) return;
  lastKickAt = now;

  if (!(await shouldRun())) return;

  const snapshot = await storage.get<ContextSnapshot>(storage.keys.LAST_CONTEXT_SNAPSHOT);
  const updatedAt = snapshot?.updatedAt ?? 0;
  if (now - updatedAt > STALE_THRESHOLD_MS) {
    requestContextRefresh('watchdog');
  }

  if (await isBackgroundEnabled()) {
    await backgroundLocationService.ensureRunning();
  }
};

export const contextWatchdogService = {
  start() {
    if (timer) return;
    timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      void runCheck('interval');
    }, WATCHDOG_INTERVAL_MS);
    appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runCheck('foreground');
      }
    });
  },
  stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (appStateSub) {
      appStateSub.remove();
      appStateSub = null;
    }
  },
};

export default contextWatchdogService;
