/**
 * useLocationPermission - Hook for location permissions with disclosure flow
 */

import { useCallback, useMemo } from 'react';
import { usePermissionContext } from '../contexts/PermissionContext';

export type LocationPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'blocked';

export interface UseLocationPermissionResult {
  // Status
  foregroundStatus: LocationPermissionStatus;
  backgroundStatus: LocationPermissionStatus;

  // Computed helpers
  canUseWeather: boolean;
  canUseSleepContext: boolean;
  needsForegroundDisclosure: boolean;
  needsBackgroundDisclosure: boolean;
  isBlocked: boolean;

  // Disclosure visibility
  showForegroundDisclosure: boolean;
  showBackgroundDisclosure: boolean;

  // Actions
  openForegroundDisclosure: () => void;
  openBackgroundDisclosure: () => void;
  closeDisclosure: () => void;
  requestForeground: () => Promise<boolean>;
  requestBackground: () => Promise<boolean>;
  openSettings: () => void;
  refreshStatus: () => Promise<void>;

  // Loading/Error states
  isRequesting: boolean;
  error: string | null;
  clearError: () => void;
}

export function useLocationPermission(): UseLocationPermissionResult {
  const {
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
    openSettings,
    isBlocked,
  } = usePermissionContext();

  const foregroundStatus = locationState.foreground as LocationPermissionStatus;
  const backgroundStatus = locationState.background as LocationPermissionStatus;

  const canUseWeather = foregroundStatus === 'granted';
  const canUseSleepContext = backgroundStatus === 'granted';
  const needsForegroundDisclosure =
    foregroundStatus === 'undetermined' || foregroundStatus === 'denied';
  const needsBackgroundDisclosure =
    foregroundStatus === 'granted' &&
    (backgroundStatus === 'undetermined' || backgroundStatus === 'denied');

  const openForegroundDisclosure = useCallback(() => {
    showForegroundDisclosure();
  }, [showForegroundDisclosure]);

  const openBackgroundDisclosure = useCallback(() => {
    showBackgroundDisclosure();
  }, [showBackgroundDisclosure]);

  const closeDisclosure = useCallback(() => {
    dismissDisclosure('dismiss');
  }, [dismissDisclosure]);

  const refreshStatus = useCallback(async () => {
    await refreshLocationStatus();
  }, [refreshLocationStatus]);

  return useMemo(
    () => ({
      // Status
      foregroundStatus,
      backgroundStatus,

      // Computed helpers
      canUseWeather,
      canUseSleepContext,
      needsForegroundDisclosure,
      needsBackgroundDisclosure,
      isBlocked,

      // Disclosure visibility
      showForegroundDisclosure: activeDisclosure === 'foreground',
      showBackgroundDisclosure: activeDisclosure === 'background',

      // Actions
      openForegroundDisclosure,
      openBackgroundDisclosure,
      closeDisclosure,
      requestForeground: requestForegroundLocation,
      requestBackground: requestBackgroundLocation,
      openSettings,
      refreshStatus,

      // Loading/Error states
      isRequesting: isLoading,
      error,
      clearError,
    }),
    [
      activeDisclosure,
      backgroundStatus,
      canUseSleepContext,
      canUseWeather,
      clearError,
      closeDisclosure,
      error,
      foregroundStatus,
      isBlocked,
      isLoading,
      needsBackgroundDisclosure,
      needsForegroundDisclosure,
      openBackgroundDisclosure,
      openForegroundDisclosure,
      openSettings,
      refreshStatus,
      requestBackgroundLocation,
      requestForegroundLocation,
    ]
  );
}

export default useLocationPermission;

