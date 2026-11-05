import type { WeatherLocation } from '../types';
import { currentLang, t } from '../i18n/core';

// Weather from Open-Meteo: free, no API key, called straight from the app.
export interface DayForecast {
  date: string; // yyyy-mm-dd
  code: number;
  max: number;
  min: number;
  rain: number; // chance in %
}
export interface Forecast {
  currentTemp: number;
  currentCode: number;
  days: DayForecast[];
}

// WMO weather codes → emoji + short Dutch description
export function describeWeather(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: t('Zonnig') };
  if (code <= 2) return { emoji: '🌤️', label: t('Licht bewolkt') };
  if (code === 3) return { emoji: '☁️', label: t('Bewolkt') };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: t('Mist') };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: t('Motregen') };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { emoji: '🌧️', label: t('Regen') };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { emoji: '🌨️', label: t('Sneeuw') };
  if (code >= 95) return { emoji: '⛈️', label: t('Onweer') };
  return { emoji: '🌤️', label: '' };
}

const CACHE_MS = 30 * 60 * 1000; // no need to ask more than every half hour

// Last fetched forecast for this place, however old (shown while refreshing)
export function cachedForecast(loc: WeatherLocation): Forecast | null {
  try {
    return JSON.parse(localStorage.getItem(`forecast:${loc.lat},${loc.lon}`) ?? 'null')?.forecast ?? null;
  } catch {
    return null;
  }
}

export async function fetchForecast(loc: WeatherLocation): Promise<Forecast> {
  const cacheKey = `forecast:${loc.lat},${loc.lon}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? 'null');
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.forecast as Forecast;
  } catch {
    // no/blocked storage: just fetch
  }

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${loc.lat}&longitude=${loc.lon}` +
    '&current=temperature_2m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=Europe%2FAmsterdam&forecast_days=7';
  const res = await fetch(url);
  if (!res.ok) throw new Error(t('Weer ophalen mislukt ({status})', { status: res.status }));
  const data = await res.json();
  const forecast: Forecast = {
    currentTemp: Math.round(data.current.temperature_2m),
    currentCode: data.current.weather_code,
    days: (data.daily.time as string[]).map((date, i) => ({
      date,
      code: data.daily.weather_code[i],
      max: Math.round(data.daily.temperature_2m_max[i]),
      min: Math.round(data.daily.temperature_2m_min[i]),
      rain: data.daily.precipitation_probability_max[i] ?? 0,
    })),
  };
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), forecast }));
  } catch {
    // fine without cache
  }
  return forecast;
}

// Rounded to 2 decimals (~1 km): precise enough for weather, less precise
// than the exact address — this is stored in the household for both of you
const round = (n: number) => Math.round(n * 100) / 100;

// Asks the phone for its location ONCE (not continuous tracking)
export function currentPosition(): Promise<WeatherLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error(t('Deze telefoon kan geen locatie delen.')));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: round(pos.coords.latitude), lon: round(pos.coords.longitude), name: t('Huidige locatie') }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? t('Locatie geweigerd. Kies hieronder een plaats.')
              : t('Locatie niet gevonden. Kies hieronder een plaats.')
          )
        ),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

// Town search (for when location access isn't wanted)
export async function searchPlaces(name: string): Promise<WeatherLocation[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=${currentLang()}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(t('Zoeken mislukt.'));
  const data = await res.json();
  return ((data.results ?? []) as { latitude: number; longitude: number; name: string; admin1?: string; country_code?: string }[]).map(
    (r) => ({
      lat: round(r.latitude),
      lon: round(r.longitude),
      name: r.country_code && r.country_code !== 'NL' ? `${r.name} (${r.country_code})` : r.admin1 ? `${r.name}, ${r.admin1}` : r.name,
    })
  );
}
