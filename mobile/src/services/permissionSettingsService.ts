import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

type IntentLauncherModule = typeof import('expo-intent-launcher');

const getIntentLauncher = (): IntentLauncherModule | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-intent-launcher');
  } catch (error) {
    return null;
  }
};

const getAndroidPackage = (): string | null => {
  const legacyManifest = (Constants as { manifest?: { android?: { package?: string } } }).manifest;
  const legacyManifest2 = (Constants as { manifest2?: { android?: { package?: string } } }).manifest2;

  return (
    Constants.expoConfig?.android?.package ||
    legacyManifest?.android?.package ||
    legacyManifest2?.android?.package ||
    null
  );
};

const startIntent = async (
  action: string,
  options?: { data?: string; extra?: Record<string, unknown> }
): Promise<boolean> => {
  const IntentLauncher = getIntentLauncher();
  if (!IntentLauncher) return false;
  try {
    await IntentLauncher.startActivityAsync(action, options);
    return true;
  } catch (error) {
    return false;
  }
};

export const openAppSettings = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    await Linking.openURL('app-settings:');
    return;
  }

  const packageName = getAndroidPackage();
  const opened = await startIntent(
    'android.settings.APPLICATION_DETAILS_SETTINGS',
    packageName ? { data: `package:${packageName}` } : undefined
  );

  if (!opened) {
    await Linking.openSettings();
  }
};

export const openNotificationSettings = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    await Linking.openURL('app-settings:');
    return;
  }

  const packageName = getAndroidPackage();
  const opened = await startIntent('android.settings.APP_NOTIFICATION_SETTINGS', {
    extra: packageName ? { 'android.provider.extra.APP_PACKAGE': packageName } : undefined,
  });

  if (!opened) {
    await openAppSettings();
  }
};

export const openLocationSettings = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    await Linking.openURL('app-settings:');
    return;
  }

  const packageName = getAndroidPackage();
  const openedAppLocation = await startIntent('android.settings.APP_LOCATION_SETTINGS', {
    extra: packageName ? { 'android.provider.extra.APP_PACKAGE': packageName } : undefined,
  });

  if (openedAppLocation) return;

  const openedAppSettings = await startIntent(
    'android.settings.APPLICATION_DETAILS_SETTINGS',
    packageName ? { data: `package:${packageName}` } : undefined
  );

  if (openedAppSettings) return;

  const openedSystemLocation = await startIntent('android.settings.LOCATION_SOURCE_SETTINGS');
  if (openedSystemLocation) return;

  await openAppSettings();
};
