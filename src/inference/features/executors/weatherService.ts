import { resolveLocationQuery } from "../../location/locationResolver.js";

interface WeatherForecastDay {
  date: string;
  maxtempC?: number;
  mintempC?: number;
  totalprecipMm?: number;
  dailyWillItRain?: number;
  dailyChanceOfRain?: number;
  dailyWillItSnow?: number;
  dailyChanceOfSnow?: number;
  conditionText: string;
  uv?: number;
}

export interface WeatherData {
  city: string;
  tempC: number;
  description: string;
  humidity: number;
  airQualityUsEpaIndex: number;
  forecastDays: WeatherForecastDay[];
}

export interface WeatherLookupInput {
  city?: string | null;
  viewerAddress?: string;
  viewerCity?: string;
  viewerLat?: number;
  viewerLon?: number;
}

interface Coordinates {
  lat: number;
  lon: number;
  city: string;
}

const OPENWEATHER_ONECALL_URL = "https://api.openweathermap.org/data/3.0/onecall";
const OPENWEATHER_GEOCODE_URL = "https://api.openweathermap.org/geo/1.0/direct";

const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const toChancePercent = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : undefined;

const toRainFlag = (value: unknown): number | undefined => {
  const chance = toChancePercent(value);
  if (chance === undefined) {
    return undefined;
  }
  return chance > 0 ? 1 : 0;
};

const aqiToUsEpaIndex = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(5, Math.round(value)));
};

const parseDailyForecast = (daily: unknown[]): WeatherForecastDay[] =>
  daily.slice(0, 3).map((item) => {
    const day = item as Record<string, unknown>;
    const temp = (day.temp ?? {}) as Record<string, unknown>;
    const weather = Array.isArray(day.weather) ? day.weather[0] : {};
    const weatherItem = (weather ?? {}) as Record<string, unknown>;
    const rainMm = numberOrUndefined(day.rain);
    const snowMm = numberOrUndefined(day.snow);
    return {
      date:
        typeof day.dt === "number"
          ? new Date(day.dt * 1000).toISOString().slice(0, 10)
          : "",
      maxtempC: numberOrUndefined(temp.max),
      mintempC: numberOrUndefined(temp.min),
      totalprecipMm: rainMm ?? snowMm,
      dailyWillItRain: toRainFlag(day.pop),
      dailyChanceOfRain: toChancePercent(day.pop),
      dailyWillItSnow: snowMm && snowMm > 0 ? 1 : 0,
      dailyChanceOfSnow: snowMm && snowMm > 0 ? 100 : 0,
      conditionText: typeof weatherItem.description === "string" ? weatherItem.description : "",
      uv: numberOrUndefined(day.uvi)
    };
  });

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`weather_api_failed:${response.status}:${detail}`);
  }
  return (await response.json()) as T;
};

const getApiKey = (): string => {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY ?? process.env.WEATHER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENWEATHERMAP_API_KEY is not configured");
  }
  return apiKey;
};

const geocodeCity = async (city: string, apiKey: string): Promise<Coordinates> => {
  const params = new URLSearchParams({
    q: city,
    limit: "1",
    appid: apiKey
  });
  const data = await fetchJson<Array<Record<string, unknown>>>(`${OPENWEATHER_GEOCODE_URL}?${params.toString()}`);
  const first = data[0];
  if (!first || typeof first.lat !== "number" || typeof first.lon !== "number") {
    throw new Error(`weather_geocode_failed:no_result:${city}`);
  }

  const cityName =
    typeof first.name === "string" && first.name.length > 0 ? first.name : city;

  return {
    lat: first.lat,
    lon: first.lon,
    city: cityName
  };
};

const resolveCoordinates = async (input: WeatherLookupInput, apiKey: string): Promise<Coordinates> => {
  if (input.city && input.city !== "null") {
    return geocodeCity(input.city, apiKey);
  }

  const resolved = await resolveLocationQuery({
    messages: [],
    viewerAddress: input.viewerAddress,
    viewerCity: input.viewerCity,
    viewerLat: input.viewerLat,
    viewerLon: input.viewerLon
  });

  if (resolved.source === "city") {
    return geocodeCity(resolved.query, apiKey);
  }

  if (
    (resolved.source === "coordinates" || resolved.source === "default") &&
    typeof input.viewerLat === "number" &&
    typeof input.viewerLon === "number"
  ) {
    return {
      lat: input.viewerLat,
      lon: input.viewerLon,
      city: input.viewerCity ?? "Current location"
    };
  }

  if (typeof input.viewerLat === "number" && typeof input.viewerLon === "number") {
    return {
      lat: input.viewerLat,
      lon: input.viewerLon,
      city: input.viewerCity ?? "Current location"
    };
  }

  return geocodeCity("Seoul", apiKey);
};

export const getWeatherData = async (input: WeatherLookupInput): Promise<WeatherData> => {
  const apiKey = getApiKey();
  const coordinates = await resolveCoordinates(input, apiKey);

  const params = new URLSearchParams({
    lat: String(coordinates.lat),
    lon: String(coordinates.lon),
    exclude: "minutely,alerts,hourly",
    units: "metric",
    lang: "kr",
    appid: apiKey
  });

  console.log(`${OPENWEATHER_ONECALL_URL}?${params.toString()}`)
  const data = await fetchJson<Record<string, unknown>>(`${OPENWEATHER_ONECALL_URL}?${params.toString()}`);
  const current = (data.current ?? {}) as Record<string, unknown>;
  const weather = Array.isArray(current.weather) ? current.weather[0] : {};
  const weatherItem = (weather ?? {}) as Record<string, unknown>;
  const daily = Array.isArray(data.daily) ? data.daily : [];

  return {
    city: coordinates.city,
    tempC: typeof current.temp === "number" ? current.temp : 0,
    description: typeof weatherItem.description === "string" ? weatherItem.description : "Unknown",
    humidity: typeof current.humidity === "number" ? current.humidity : 0,
    airQualityUsEpaIndex: aqiToUsEpaIndex(undefined),
    forecastDays: parseDailyForecast(daily)
  };
};
