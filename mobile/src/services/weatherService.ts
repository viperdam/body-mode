
import storage from './storageService';
import type { Coordinates } from './locationService';
import i18n from '../i18n';

interface WeatherData {
  temp: number;
  condition: string;
  code: number;
}

export type WeatherSnapshot = {
  weather: WeatherData;
  locationName?: string;
  coords?: Coordinates;
  updatedAt: number;
};

const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;

// WMO Weather interpretation codes (http://www.wmo.int/pages/prog/www/IMOP/WMO306/WMO306_vI_2_2011_en.pdf)
const getWeatherCondition = (code: number): string => {
  if (code === 0) return 'Clear';
  if (code === 1 || code === 2 || code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 95) return 'Thunderstorm';
  return 'Clear';
};

export const fetchLocalWeather = async (lat: number, lon: number): Promise<WeatherData> => {
  try {
    console.log(`[Weather] Fetching weather for: lat=${lat}, lon=${lon}`);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;
    console.log(`[Weather] API URL: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Weather] API error: ${response.status} ${response.statusText}`);
      throw new Error(i18n.t('errors.weather.api_error', { status: response.status }));
    }

    const data = await response.json();
    console.log(`[Weather] API response:`, JSON.stringify(data, null, 2));

    if (!data.current) {
      console.error("[Weather] No 'current' field in response:", data);
      throw new Error(i18n.t('errors.weather.invalid_data'));
    }

    const result = {
      temp: data.current.temperature_2m,
      code: data.current.weather_code,
      condition: getWeatherCondition(data.current.weather_code)
    };

    console.log(`[Weather] Parsed result: temp=${result.temp}, condition=${result.condition}, code=${result.code}`);
    return result;
  } catch (error) {
    console.error("[Weather] Fetch failed:", error);
    throw error;
  }
};

export const fetchLocationName = async (lat: number, lon: number): Promise<string> => {
  try {
    // Using BigDataCloud's free client-side reverse geocoding API (no key required for client-side)
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    );
    const data = await response.json();
    return data.city || data.locality || data.principalSubdivision || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  } catch (error) {
    console.error("Location name fetch failed:", error);
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
};

export const getWeatherSnapshot = async (options?: {
  coords?: Coordinates;
  locationName?: string;
  maxAgeMs?: number;
}): Promise<WeatherSnapshot | null> => {
  const maxAgeMs = options?.maxAgeMs ?? WEATHER_CACHE_TTL_MS;
  const cached = await storage.get<WeatherSnapshot>(storage.keys.LAST_WEATHER);
  if (cached && Date.now() - cached.updatedAt <= maxAgeMs) {
    return cached;
  }

  if (!options?.coords) {
    return cached || null;
  }

  try {
    const weather = await fetchLocalWeather(options.coords.lat, options.coords.lng);
    const locationName =
      options.locationName ||
      cached?.locationName ||
      (await fetchLocationName(options.coords.lat, options.coords.lng));
    const snapshot: WeatherSnapshot = {
      weather,
      locationName,
      coords: options.coords,
      updatedAt: Date.now(),
    };
    await storage.set(storage.keys.LAST_WEATHER, snapshot);
    return snapshot;
  } catch (error) {
    console.error('[Weather] Snapshot refresh failed:', error);
    return cached || null;
  }
};

export const saveWeatherSnapshot = async (
  snapshot: WeatherSnapshot
): Promise<WeatherSnapshot> => {
  await storage.set(storage.keys.LAST_WEATHER, snapshot);
  return snapshot;
};

export const WEATHER_SNAPSHOT_TTL_MS = WEATHER_CACHE_TTL_MS;
