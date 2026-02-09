import { NativeModules } from 'react-native';
import storage from '../services/storageService';
import { processNativeSleepEvents } from '../services/sleepEventService';
import { autoPlanService } from '../services/autoPlanService';

type SleepPlanTaskData = {
  trigger?: string;
  timestamp?: number;
  source?: string;
};

const LOCK_KEY = '@sleep_plan_headless_lock_v1';
const LOCK_TTL_MS = 5 * 60 * 1000;

const acquireLock = async (): Promise<boolean> => {
  const now = Date.now();
  const existing = await storage.get<{ startedAt: number }>(LOCK_KEY);
  if (existing?.startedAt && now - existing.startedAt < LOCK_TTL_MS) {
    return false;
  }
  await storage.set(LOCK_KEY, { startedAt: now });
  return true;
};

const releaseLock = async (): Promise<void> => {
  await storage.remove(LOCK_KEY);
};

export const sleepPlanHeadlessTask = async (data: SleepPlanTaskData = {}): Promise<void> => {
  const acquired = await acquireLock();
  if (!acquired) {
    return;
  }

  try {
    if (!autoPlanService) {
      return;
    }

    await autoPlanService.init();
    const trigger = String(data.trigger || 'WAKE').toUpperCase();

    await processNativeSleepEvents();

    if (trigger === 'MIDNIGHT') {
      const result = await autoPlanService.generateTodayPlan('MIDNIGHT');
      if (result.status === 'SUCCESS' || result.status === 'SKIPPED') {
        NativeModules.MidnightPlanBridge?.clearPendingGeneration?.();
      }
      return;
    }

    if (trigger === 'BOOT') {
      await autoPlanService.generateTodayPlan('BOOT');
      return;
    }

    if (trigger === 'NETWORK_RESTORED') {
      await autoPlanService.generateTodayPlan('NETWORK_RESTORED');
      return;
    }
  } catch (error) {
    console.warn('[SleepPlanHeadlessTask] Failed to process sleep events:', error);
  } finally {
    await releaseLock();
  }
};

export default sleepPlanHeadlessTask;
