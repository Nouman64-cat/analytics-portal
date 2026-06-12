"use client";

import { useState, useEffect, useRef } from "react";

export interface WeatherData {
  temp: number;
  weatherCode: number;
  windspeed: number;
  localTime: string;   // e.g. "2:45 PM"
  localDate: string;   // e.g. "Fri, Jun 13"
  timezone: string;    // IANA tz
  cityName: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface WeatherState {
  loading: boolean;
  error: string | null;
  weather: WeatherData | null;
}

/** WMO Weather code → label + emoji */
function describeWeatherCode(code: number): string {
  if (code === 0) return "☀️ Clear sky";
  if (code === 1) return "🌤️ Mainly clear";
  if (code === 2) return "⛅ Partly cloudy";
  if (code === 3) return "☁️ Overcast";
  if (code <= 49) return "🌫️ Foggy";
  if (code <= 59) return "🌦️ Drizzle";
  if (code <= 67) return "🌧️ Rain";
  if (code <= 77) return "❄️ Snow";
  if (code <= 82) return "🌧️ Rain showers";
  if (code <= 86) return "🌨️ Snow showers";
  if (code <= 99) return "⛈️ Thunderstorm";
  return "🌡️ Unknown";
}

// Simple in-memory cache keyed by lowercase location string
const cache = new Map<string, WeatherData>();

export function useProfileWeather(location: string | null | undefined): WeatherState & { description: string } {
  const [state, setState] = useState<WeatherState>({
    loading: false,
    error: null,
    weather: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!location?.trim()) {
      setState({ loading: false, error: null, weather: null });
      return;
    }

    const key = location.trim().toLowerCase();

    // Serve from cache if available
    if (cache.has(key)) {
      setState({ loading: false, error: null, weather: cache.get(key)! });
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState({ loading: true, error: null, weather: null });

    (async () => {
      try {
        // 1. Geocode (extract just the city part before the first comma for the search)
        const cityNameSearch = location.split(",")[0].trim();
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityNameSearch)}&count=1&language=en&format=json`,
          { signal: ctrl.signal },
        );
        if (!geoRes.ok) throw new Error("Geocoding failed");
        const geoJson = await geoRes.json();
        const geo = geoJson.results?.[0];
        if (!geo) throw new Error(`Location "${location}" not found`);

        const { latitude, longitude, timezone, name: cityName, country } = geo;

        // 2. Fetch weather
        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,windspeed_10m&timezone=${encodeURIComponent(timezone)}`,
          { signal: ctrl.signal },
        );
        if (!wxRes.ok) throw new Error("Weather fetch failed");
        const wxJson = await wxRes.json();
        const cur = wxJson.current;

        // 3. Derive local time using the resolved IANA timezone
        const now = new Date();
        const localTime = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZoneName: "short",
        }).format(now);

        const localDate = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          weekday: "short",
          month: "short",
          day: "numeric",
        }).format(now);

        const data: WeatherData = {
          temp: Math.round(cur.temperature_2m),
          weatherCode: cur.weathercode,
          windspeed: Math.round(cur.windspeed_10m),
          localTime,
          localDate,
          timezone,
          cityName,
          country: country ?? "",
          latitude,
          longitude,
        };

        cache.set(key, data);
        if (!ctrl.signal.aborted) {
          setState({ loading: false, error: null, weather: data });
        }
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch weather",
          weather: null,
        });
      }
    })();

    return () => ctrl.abort();
  }, [location]);

  return {
    ...state,
    description: state.weather ? describeWeatherCode(state.weather.weatherCode) : "",
  };
}
