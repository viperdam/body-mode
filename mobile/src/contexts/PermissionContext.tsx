import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import storage from '../services/storageService';
import backgroundLocationService from '../services/backgroundLocationService';
import { analytics } from '../services/analyticsService';
import { openLocationSettings } from '../services/permissionSettingsService';
import i18n from '../i18n';
import { usePermissionStore } from '../services/permissions/PermissionStore';
import { permissionManager } from '../services/permissions/PermissionManager';
import {
  PermissionDecision,
  PermissionState,
  PermissionDisclosureType,
  locationPermissionMachine,
} from '../services/permissions/PermissionStateMachine';

type DisclosureType = PermissionDisclosureType;

export interface PermissionContextValue {
  locationState: PermissionState;
  requestForegroundLocation: () => Promise<boolean>;
  requestBackgroundLocation: () => Promise<boolean>;
  refreshLocationStatus: () => Promise<void>;
  showForegroundDisclosure: () => void;
  showBackgroundDisclosure: () => void;
  dismissDisclosure: (reason?: 'deny' | 'dismiss') => void;
  activeDisclosure: DisclosureType | null;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  canRequestBackground: boolean;
  isFullyGranted: boolean;
  isBlocked: boolean;
  blockedType: DisclosureType | null;
  dismissBlocked: () => void;
  openSettings: () => void;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

const PERMISSION_STORAGE_KEYS = {
  FOREGROUND_STATUS: 'permission:location:foreground',
  BACKGROUND_STATUS: 'permission:location:background',
  FOREGROUND_DISCLOSURE_SHOWN: 'disclosure:foreground:shown',
  BACKGROUND_DISCLOSURE_SHOWN: 'disclosure:background:shown',
  USER_DENIED_FOREGROUND_AT: 'user:denied:foreground:timestamp',
  USER_DENIED_BACKGROUND_AT: 'user:denied:background:timestamp',
  FOREGROUND_BLOCK_HINT: 'permission:location:foreground:block_hint',
  BACKGROUND_BLOCK_HINT: 'permission:location:background:block_hint',
  ERROR_COUNT: 'permission:error:count',
  LAST_CHECK: 'permission:last:check',
};

const DENIAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const mapDecisionToGranted = (decision: PermissionDecision): boolean | null => {
  if (decision === 'granted') return true;
  if (decision === 'undetermined') return null;
  return false;
};

const isDecision = (value: unknown): value is PermissionDecision => {
  return value === 'granted' || value === 'denied' || value === 'undetermined' || value === 'blocked';
};

const retryWithBackoff = async <T,>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 300
): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= maxAttempts) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
};

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const machine = locationPermissionMachine;
  const [locationState, setLocationState] = useState<PermissionState>(machine.getState());
  const [activeDisclosure, setActiveDisclosure] = useState<DisclosureType | null>(null);
  const [blockedType, setBlockedType] = useState<DisclosureType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const denialTimestampsRef = useRef<{ foreground: number; background: number }>({
    foreground: 0,
    background: 0,
  });
  const disclosureShownRef = useRef<{ foreground: boolean; background: boolean }>({
    foreground: false,
    background: false,
  });

  const persistState = useCallback(async (state: PermissionState) => {
    await storage.set(PERMISSION_STORAGE_KEYS.FOREGROUND_STATUS, state.foreground);
    await storage.set(PERMISSION_STORAGE_KEYS.BACKGROUND_STATUS, state.background);
    await storage.set(PERMISSION_STORAGE_KEYS.ERROR_COUNT, state.errorCount);
    await storage.set(PERMISSION_STORAGE_KEYS.LAST_CHECK, state.lastChecked);
    const blockHints = machine.getBlockHints();
    await storage.set(PERMISSION_STORAGE_KEYS.FOREGROUND_BLOCK_HINT, blockHints.foreground);
    await storage.set(PERMISSION_STORAGE_KEYS.BACKGROUND_BLOCK_HINT, blockHints.background);
  }, [machine]);

  const syncStore = useCallback((state: PermissionState) => {
    const store = usePermissionStore.getState();
    store.updatePermissionStatus('location', {
      granted: mapDecisionToGranted(state.foreground),
      lastChecked: state.lastChecked,
      error: null,
    });
    store.updatePermissionStatus('backgroundLocation', {
      granted: mapDecisionToGranted(state.background),
      lastChecked: state.lastChecked,
      error: null,
    });
  }, []);

  useEffect(() => {
    const unsubscribe = machine.subscribe((state) => {
      setLocationState(state);
      syncStore(state);
    });
    return () => {
      unsubscribe();
    };
  }, [machine, syncStore]);

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      const stored = await storage.getMultiple<unknown>([
        PERMISSION_STORAGE_KEYS.FOREGROUND_STATUS,
        PERMISSION_STORAGE_KEYS.BACKGROUND_STATUS,
        PERMISSION_STORAGE_KEYS.FOREGROUND_DISCLOSURE_SHOWN,
        PERMISSION_STORAGE_KEYS.BACKGROUND_DISCLOSURE_SHOWN,
        PERMISSION_STORAGE_KEYS.USER_DENIED_FOREGROUND_AT,
        PERMISSION_STORAGE_KEYS.USER_DENIED_BACKGROUND_AT,
        PERMISSION_STORAGE_KEYS.FOREGROUND_BLOCK_HINT,
        PERMISSION_STORAGE_KEYS.BACKGROUND_BLOCK_HINT,
        PERMISSION_STORAGE_KEYS.ERROR_COUNT,
        PERMISSION_STORAGE_KEYS.LAST_CHECK,
      ]);

      if (!mounted) return;

      const storedForeground = stored[PERMISSION_STORAGE_KEYS.FOREGROUND_STATUS];
      const storedBackground = stored[PERMISSION_STORAGE_KEYS.BACKGROUND_STATUS];
      const errorCount = stored[PERMISSION_STORAGE_KEYS.ERROR_COUNT];
      const lastCheck = stored[PERMISSION_STORAGE_KEYS.LAST_CHECK];

      const foreground = isDecision(storedForeground) ? storedForeground : undefined;
      const background = isDecision(storedBackground) ? storedBackground : undefined;

      if (typeof stored[PERMISSION_STORAGE_KEYS.USER_DENIED_FOREGROUND_AT] === 'number') {
        denialTimestampsRef.current.foreground =
          stored[PERMISSION_STORAGE_KEYS.USER_DENIED_FOREGROUND_AT] as number;
      }
      if (typeof stored[PERMISSION_STORAGE_KEYS.USER_DENIED_BACKGROUND_AT] === 'number') {
        denialTimestampsRef.current.background =
          stored[PERMISSION_STORAGE_KEYS.USER_DENIED_BACKGROUND_AT] as number;
      }
      if (typeof stored[PERMISSION_STORAGE_KEYS.FOREGROUND_DISCLOSURE_SHOWN] === 'boolean') {
        disclosureShownRef.current.foreground =
          stored[PERMISSION_STORAGE_KEYS.FOREGROUND_DISCLOSURE_SHOWN] as boolean;
      }
      if (typeof stored[PERMISSION_STORAGE_KEYS.BACKGROUND_DISCLOSURE_SHOWN] === 'boolean') {
        disclosureShownRef.current.background =
          stored[PERMISSION_STORAGE_KEYS.BACKGROUND_DISCLOSURE_SHOWN] as boolean;
      }
      const foregroundBlockHint = stored[PERMISSION_STORAGE_KEYS.FOREGROUND_BLOCK_HINT];
      const backgroundBlockHint = stored[PERMISSION_STORAGE_KEYS.BACKGROUND_BLOCK_HINT];
      machine.hydrateBlockHints({
        foreground: typeof foregroundBlockHint === 'boolean' ? foregroundBlockHint : undefined,
        background: typeof backgroundBlockHint === 'boolean' ? backgroundBlockHint : undefined,
      });

      machine.hydrate({
        foreground: foreground ?? machine.getState().foreground,
        background: background ?? machine.getState().background,
        errorCount: typeof errorCount === 'number' ? errorCount : machine.getState().errorCount,
        lastChecked: typeof lastCheck === 'number' ? lastCheck : machine.getState().lastChecked,
      });

      try {
        const state = await retryWithBackoff(() => machine.checkPermissions(), 2, 300);
        await persistState(state);
      } catch (err) {
        console.warn('[PermissionContext] Initial permission check failed:', err);
      }
    };

    hydrate();
    return () => {
      mounted = false;
    };
  }, [persistState]);

  const openSettings = useCallback(() => {
    void openLocationSettings();
  }, []);

  const refreshLocationStatus = useCallback(async () => {
    try {
      const state = await retryWithBackoff(() => machine.checkPermissions(), 2, 300);
      await persistState(state);
      const backgroundEnabled = await storage.get<boolean>('settings:backgroundLocation:enabled');
      if (backgroundEnabled && state.background === 'granted') {
        await backgroundLocationService.ensureRunning();
      } else {
        await backgroundLocationService.stop();
      }
    } catch (err) {
      console.warn('[PermissionContext] refreshLocationStatus failed:', err);
    }
  }, [machine, persistState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshLocationStatus();
      }
    });
    return () => subscription.remove();
  }, [refreshLocationStatus]);

  useEffect(() => {
    if (!blockedType) return;
    if (blockedType === 'foreground' && locationState.foreground !== 'blocked') {
      setBlockedType(null);
    }
    if (blockedType === 'background' && locationState.background !== 'blocked') {
      setBlockedType(null);
    }
  }, [blockedType, locationState.foreground, locationState.background]);

  useEffect(() => {
    if (!activeDisclosure) return;
    if (activeDisclosure === 'foreground') {
      if (locationState.foreground === 'granted') {
        setActiveDisclosure(null);
        machine.resetDisclosure();
        permissionManager.resolveDisclosure('foreground', true);
        return;
      }
      if (locationState.foreground === 'blocked' || locationState.foreground === 'denied') {
        setActiveDisclosure(null);
        machine.resetDisclosure();
        permissionManager.resolveDisclosure('foreground', false);
        return;
      }
    }
    if (activeDisclosure === 'background') {
      if (locationState.background === 'granted') {
        setActiveDisclosure(null);
        machine.resetDisclosure();
        permissionManager.resolveDisclosure('background', true);
        return;
      }
      if (locationState.background === 'blocked' || locationState.background === 'denied') {
        setActiveDisclosure(null);
        machine.resetDisclosure();
        permissionManager.resolveDisclosure('background', false);
      }
    }
  }, [
    activeDisclosure,
    locationState.background,
    locationState.foreground,
  ]);

  useEffect(() => {
    if (!activeDisclosure) return;
    const timeout = setTimeout(() => {
      setActiveDisclosure(null);
      machine.resetDisclosure();
      permissionManager.resolveDisclosure(activeDisclosure, false);
    }, 45000);
    return () => {
      clearTimeout(timeout);
    };
  }, [activeDisclosure]);

  useEffect(() => {
    let cancelled = false;
    const syncBackground = async () => {
      try {
        const enabled = await storage.get<boolean>('settings:backgroundLocation:enabled');
        if (cancelled) return;
        if (enabled && locationState.background === 'granted') {
          await backgroundLocationService.ensureRunning();
        } else {
          await backgroundLocationService.stop();
        }
      } catch (error) {
        console.warn('[PermissionContext] Background sync failed:', error);
      }
    };
    void syncBackground();
    return () => {
      cancelled = true;
    };
  }, [locationState.background]);

  const recordDenial = useCallback(async (type: DisclosureType) => {
    const key =
      type === 'foreground'
        ? PERMISSION_STORAGE_KEYS.USER_DENIED_FOREGROUND_AT
        : PERMISSION_STORAGE_KEYS.USER_DENIED_BACKGROUND_AT;
    const timestamp = Date.now();
    denialTimestampsRef.current[type] = timestamp;
    await storage.set(key, timestamp);
  }, []);

  const recordDisclosureShown = useCallback(async (type: DisclosureType) => {
    const key =
      type === 'foreground'
        ? PERMISSION_STORAGE_KEYS.FOREGROUND_DISCLOSURE_SHOWN
        : PERMISSION_STORAGE_KEYS.BACKGROUND_DISCLOSURE_SHOWN;
    disclosureShownRef.current[type] = true;
    await storage.set(key, true);
  }, []);

  const canShowDisclosure = useCallback((type: DisclosureType): boolean => {
    const lastDenied = denialTimestampsRef.current[type] || 0;
    if (!lastDenied) return true;
    return Date.now() - lastDenied > DENIAL_COOLDOWN_MS;
  }, []);

  const attemptShowDisclosure = useCallback(
    (type: DisclosureType): boolean => {
      const currentState = machine.getState();
      if (type === 'foreground') {
        if (currentState.foreground === 'blocked') {
          setBlockedType('foreground');
          return false;
        }
        if (!canShowDisclosure('foreground')) {
          setError(i18n.t('permissions.error.try_again'));
          return false;
        }
        setError(null);
        setActiveDisclosure('foreground');
        machine.setDisclosureShown(true);
        void recordDisclosureShown('foreground');
        analytics.logEvent('disclosure_shown', { type: 'foreground' });
        return true;
      }

      if (currentState.foreground !== 'granted') {
        setError(i18n.t('permissions.error.enable_location_first'));
        return false;
      }
      if (currentState.background === 'blocked') {
        setBlockedType('background');
        return false;
      }
      if (!canShowDisclosure('background')) {
        setError(i18n.t('permissions.error.try_again'));
        return false;
      }
      setError(null);
      setActiveDisclosure('background');
      machine.setDisclosureShown(true);
      void recordDisclosureShown('background');
      analytics.logEvent('disclosure_shown', { type: 'background' });
      return true;
    },
    [
      canShowDisclosure,
      machine,
      recordDisclosureShown,
    ]
  );

  const showForegroundDisclosure = useCallback(() => {
    attemptShowDisclosure('foreground');
  }, [attemptShowDisclosure]);

  const showBackgroundDisclosure = useCallback(() => {
    attemptShowDisclosure('background');
  }, [attemptShowDisclosure]);

  useEffect(() => {
    const unsubscribe = permissionManager.onDisclosureNeeded((type) => {
      const shown = attemptShowDisclosure(type);
      if (!shown) {
        permissionManager.resolveDisclosure(type, false);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [attemptShowDisclosure]);

  const dismissDisclosure = useCallback(
    (reason: 'deny' | 'dismiss' = 'dismiss') => {
      const currentDisclosure = activeDisclosure;
      setActiveDisclosure(null);
      machine.resetDisclosure();

      if (currentDisclosure) {
        permissionManager.resolveDisclosure(currentDisclosure, false);
      }

      if (reason === 'deny' && currentDisclosure) {
        void recordDenial(currentDisclosure);
        analytics.logEvent('disclosure_denied', { type: currentDisclosure });
      }
    },
    [activeDisclosure, machine, recordDenial]
  );

  const requestForegroundLocation = useCallback(async (): Promise<boolean> => {
    setError(null);
    setActiveDisclosure(null);
    machine.setDisclosureAcknowledged(true);
    analytics.logEvent('disclosure_allowed', { type: 'foreground' });
    usePermissionStore.getState().updatePermissionStatus('location', { requesting: true });

    try {
      const granted = await retryWithBackoff(() => machine.requestForeground(), 3, 300);
      const state = machine.getState();
      await persistState(state);
      usePermissionStore.getState().updatePermissionStatus('location', { requesting: false });
      permissionManager.resolveDisclosure('foreground', granted);
      permissionManager.notifyLocationDecision('foreground', state.foreground);

      if (granted) {
        analytics.logEvent('permission_granted', { type: 'foreground' });
        return true;
      }

      if (state.foreground === 'blocked') {
        setBlockedType('foreground');
        analytics.logEvent('permission_blocked', { type: 'foreground' });
      } else {
        setError(i18n.t('permissions.error.location_denied'));
        void recordDenial('foreground');
        analytics.logEvent('permission_denied', { type: 'foreground' });
      }
      return false;
    } catch (err) {
      usePermissionStore.getState().updatePermissionStatus('location', { requesting: false });
      permissionManager.resolveDisclosure('foreground', false);
      setError(i18n.t('permissions.error.request_failed'));
      analytics.logEvent('permission_error', { type: 'foreground', error: String(err) });
      return false;
    }
  }, [machine, persistState, recordDenial]);

  const requestBackgroundLocation = useCallback(async (): Promise<boolean> => {
    if (machine.getState().foreground !== 'granted') {
      setError(i18n.t('permissions.error.enable_location_first'));
      permissionManager.resolveDisclosure('background', false);
      return false;
    }
    setError(null);
    setActiveDisclosure(null);
    machine.setDisclosureAcknowledged(true);
    analytics.logEvent('disclosure_allowed', { type: 'background' });
    usePermissionStore.getState().updatePermissionStatus('backgroundLocation', { requesting: true });

    try {
      const granted = await retryWithBackoff(() => machine.requestBackground(), 3, 300);
      const state = machine.getState();
      await persistState(state);
      usePermissionStore.getState().updatePermissionStatus('backgroundLocation', { requesting: false });
      permissionManager.resolveDisclosure('background', granted);
      permissionManager.notifyLocationDecision('background', state.background);

      if (granted) {
        analytics.logEvent('permission_granted', { type: 'background' });
        try {
          await backgroundLocationService.ensureRunning();
        } catch (serviceErr) {
          console.warn('[PermissionContext] Background service start failed:', serviceErr);
        }
        return true;
      }

      if (state.background === 'blocked') {
        setBlockedType('background');
        analytics.logEvent('permission_blocked', { type: 'background' });
      } else {
        setError(i18n.t('permissions.error.background_denied'));
        void recordDenial('background');
        analytics.logEvent('permission_denied', { type: 'background' });
      }
      return false;
    } catch (err) {
      usePermissionStore.getState().updatePermissionStatus('backgroundLocation', { requesting: false });
      permissionManager.resolveDisclosure('background', false);
      setError(i18n.t('permissions.error.request_failed'));
      analytics.logEvent('permission_error', { type: 'background', error: String(err) });
      return false;
    }
  }, [machine, persistState, recordDenial]);

  const dismissBlocked = useCallback(() => {
    setBlockedType(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const isLoading = locationState.isTransitioning;
  const canRequestBackground = locationState.foreground === 'granted';
  const isFullyGranted = locationState.foreground === 'granted' && locationState.background === 'granted';
  const isBlocked = locationState.foreground === 'blocked' || locationState.background === 'blocked';

  const value = useMemo<PermissionContextValue>(() => ({
    locationState,
    requestForegroundLocation,
    requestBackgroundLocation,
    refreshLocationStatus,
    showForegroundDisclosure,
    showBackgroundDisclosure,
    dismissDisclosure,
    activeDisclosure,
    isLoading,
    error,
    clearError,
    canRequestBackground,
    isFullyGranted,
    isBlocked,
    blockedType,
    dismissBlocked,
    openSettings,
  }), [
    locationState,
    requestForegroundLocation,
    requestBackgroundLocation,
    refreshLocationStatus,
    showForegroundDisclosure,
    showBackgroundDisclosure,
    dismissDisclosure,
    activeDisclosure,
    isLoading,
    error,
    clearError,
    canRequestBackground,
    isFullyGranted,
    isBlocked,
    blockedType,
    dismissBlocked,
    openSettings,
  ]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermissionContext = (): PermissionContextValue => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissionContext must be used within PermissionProvider');
  }
  return context;
};
