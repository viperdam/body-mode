
interface WeatherData {
  temp: number;
  condition: string;
  code: number;
}

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
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`
    );
    const data = await response.json();
    
    if (!data.current) throw new Error("Invalid weather data");

    return {
      temp: data.current.temperature_2m,
      code: data.current.weather_code,
      condition: getWeatherCondition(data.current.weather_code)
    };
  } catch (error) {
    console.error("Weather fetch failed:", error);
    // Fallback
    return { temp: 20, condition: 'Clear', code: 0 };
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
