import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import storage from './storageService';
import { refreshContextOnce } from './contextService';
import { getContextPolicy } from './contextPolicyService';

const TASK_NAME = 'CONTEXT_BACKGROUND_FETCH';

let taskDefined = false;

const defineTask = () => {
  if (taskDefined) return;
  TaskManager.defineTask(TASK_NAME, async () => {
    try {
      const prefs = await storage.get<any>(storage.keys.APP_PREFERENCES);
      const contextEnabled = prefs?.contextSensingEnabled !== false;
      if (!contextEnabled) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }
      const policy = await getContextPolicy();
      if (!policy.contextDiagnosticsEnabled && !policy.contextHistoryEnabled) {
        // Minimal mode: still attempt a refresh but avoid heavy work.
      }
      const snapshot = await refreshContextOnce('background_fetch');
      return snapshot ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
      console.warn('[ContextBackgroundFetch] Task failed:', error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
  taskDefined = true;
};

export const contextBackgroundFetchService = {
  async start(): Promise<boolean> {
    defineTask();
    try {
      const status = await BackgroundFetch.getStatusAsync();
      if (status === BackgroundFetch.BackgroundFetchStatus.Restricted || status === BackgroundFetch.BackgroundFetchStatus.Denied) {
        return false;
      }
      const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
      if (!isRegistered) {
        await BackgroundFetch.registerTaskAsync(TASK_NAME, {
          minimumInterval: 15 * 60,
          stopOnTerminate: false,
          startOnBoot: true,
        });
      }
      return true;
    } catch (error) {
      console.warn('[ContextBackgroundFetch] Failed to register:', error);
      return false;
    }
  },

  async stop(): Promise<void> {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
      if (isRegistered) {
        await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
      }
    } catch (error) {
      console.warn('[ContextBackgroundFetch] Failed to unregister:', error);
    }
  },

  async getStatus(): Promise<BackgroundFetch.BackgroundFetchStatus> {
    try {
      const status = await BackgroundFetch.getStatusAsync();
      return status ?? BackgroundFetch.BackgroundFetchStatus.Restricted;
    } catch (error) {
      console.warn('[ContextBackgroundFetch] Failed to get status:', error);
      return BackgroundFetch.BackgroundFetchStatus.Restricted;
    }
  },
};

export default contextBackgroundFetchService;
