import mobileAds, { TestIds } from 'react-native-google-mobile-ads';

let initialized = false;
let initInFlight: Promise<void> | null = null;

export const initializeAds = async (): Promise<void> => {
  if (initialized) return;
  if (initInFlight) return initInFlight;

  initInFlight = (async () => {
    try {
      const envIds = process.env.EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS || '';
      const testDeviceIdentifiers = envIds
        .split(',')
        .map((id: string) => id.trim())
        .filter(Boolean);

      if (__DEV__ && testDeviceIdentifiers.length === 0) {
        const emulatorId = (TestIds as { EMULATOR?: string }).EMULATOR;
        testDeviceIdentifiers.push(emulatorId || 'EMULATOR');
      }

      if (testDeviceIdentifiers.length > 0) {
        await mobileAds().setRequestConfiguration({ testDeviceIdentifiers });
        console.log('[Ads] Test device IDs set:', testDeviceIdentifiers.join(', '));
      }

      await mobileAds().initialize();
      initialized = true;
      console.log('[Ads] Mobile Ads initialized');
    } catch (error) {
      console.warn('[Ads] Mobile Ads initialization failed:', error);
    } finally {
      initInFlight = null;
    }
  })();

  return initInFlight;
};

export const isAdsInitialized = (): boolean => initialized;
