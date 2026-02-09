import { NativeModules, Platform, PermissionsAndroid, AppState } from 'react-native';

export type WifiConnectionInfo = {
  connected: boolean;
  bssid?: string;
  ssid?: string;
  signalStrength?: number;
};

const { WifiBridge } = NativeModules;
let nearbyPermissionRequested = false;

const ensureNearbyWifiPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  if (typeof Platform.Version !== 'number' || Platform.Version < 33) return true;
  const permission = PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES;
  if (!permission) return true;

  try {
    const hasPermission = await PermissionsAndroid.check(permission);
    if (hasPermission) return true;
    if (nearbyPermissionRequested) return false;
    if (AppState.currentState !== 'active') return false;
    nearbyPermissionRequested = true;
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn('[WifiService] Permission check failed:', error);
    return false;
  }
};

const sanitizeBssid = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === '02:00:00:00:00:00') return undefined;
  if (!normalized.match(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) return undefined;
  return normalized;
};

const sanitizeSsid = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const stripped = value.replace(/^\"|\"$/g, '');
  if (!stripped || stripped === '<unknown ssid>') return undefined;
  return stripped;
};

export const wifiService = {
  async getConnectionInfo(): Promise<WifiConnectionInfo | null> {
    if (Platform.OS !== 'android' || !WifiBridge?.getConnectionInfo) return null;
    try {
      const hasPermission = await ensureNearbyWifiPermission();
      if (!hasPermission) return null;
      const result = await WifiBridge.getConnectionInfo();
      if (!result || typeof result !== 'object') return null;
      const bssid = sanitizeBssid(result.bssid);
      const ssid = sanitizeSsid(result.ssid);
      const connected = !!result.connected;
      return {
        connected,
        bssid,
        ssid,
        signalStrength: typeof result.signalStrength === 'number' ? result.signalStrength : undefined,
      };
    } catch (error) {
      console.warn('[WifiService] Failed to get connection info:', error);
      return null;
    }
  },
};

export default wifiService;
