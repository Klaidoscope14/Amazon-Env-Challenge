import { AQIReading, TrendPoint } from "./types.js";

/*
 * Air quality for any location from the Open-Meteo Air Quality API (free, no
 * key; attribution "Open-Meteo"). It returns hourly pollutant concentrations;
 * the Indian AQI is computed here with CPCB's method: 24-hour averages for
 * PM10, PM2.5, NO2, SO2 and NH3, 8-hour averages for O3 and CO, each turned
 * into a sub-index with CPCB breakpoints; the AQI is the highest sub-index
 * (at least three pollutants, one of them PM).
 */

const ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";
const TIMEOUT_MS = 8000;
const CACHE_MS = 30 * 60 * 1000;
export const OPEN_METEO_SOURCE = "Open-Meteo";

type Pollutant = "pm10" | "pm25" | "no2" | "so2" | "nh3" | "o3" | "co";

const API_FIELDS: Record<Pollutant, string> = {
  pm10: "pm10",
  pm25: "pm2_5",
  no2: "nitrogen_dioxide",
  so2: "sulphur_dioxide",
  nh3: "ammonia",
  o3: "ozone",
  co: "carbon_monoxide",
};

// Averaging window (hours) and the minimum number of hourly values required.
const WINDOWS: Record<Pollutant, { hours: number; minValues: number }> = {
  pm10: { hours: 24, minValues: 16 },
  pm25: { hours: 24, minValues: 16 },
  no2: { hours: 24, minValues: 16 },
  so2: { hours: 24, minValues: 16 },
  nh3: { hours: 24, minValues: 16 },
  o3: { hours: 8, minValues: 6 },
  co: { hours: 8, minValues: 6 },
};

const AQI_BOUNDS = [0, 50, 100, 200, 300, 400, 500];

// CPCB concentration breakpoints (upper bound of each band; µg/m³, CO in mg/m³).
// The last value closes the Severe band so it can be interpolated; above it
// the sub-index is capped at 500.
const BREAKPOINTS: Record<Pollutant, number[]> = {
  pm10: [0, 50, 100, 250, 350, 430, 600],
  pm25: [0, 30, 60, 90, 120, 250, 380],
  no2: [0, 40, 80, 180, 280, 400, 800],
  so2: [0, 40, 80, 380, 800, 1600, 2400],
  nh3: [0, 200, 400, 800, 1200, 1800, 2400],
  o3: [0, 50, 100, 168, 208, 748, 1000],
  co: [0, 1, 2, 10, 17, 34, 50],
};

export function subIndex(pollutant: Pollutant, concentration: number): number {
  const bp = BREAKPOINTS[pollutant];
  for (let i = 1; i < bp.length; i++) {
    if (concentration <= bp[i]) {
      const ratio = (concentration - bp[i - 1]) / (bp[i] - bp[i - 1]);
      return Math.round(AQI_BOUNDS[i - 1] + ratio * (AQI_BOUNDS[i] - AQI_BOUNDS[i - 1]));
    }
  }
  return 500;
}

interface HourlySeries {
  /** UTC ISO timestamps, one per hour. */
  times: string[];
  values: Record<Pollutant, (number | null)[]>;
}

async function fetchSeries(lat: number, lon: number, pastDays: number): Promise<HourlySeries> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("latitude", lat.toFixed(2));
  url.searchParams.set("longitude", lon.toFixed(2));
  url.searchParams.set("hourly", Object.values(API_FIELDS).join(","));
  url.searchParams.set("past_days", String(pastDays));
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "GMT");

  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}`);
  const data = (await response.json()) as { hourly?: Record<string, (number | null)[] | string[]> };
  const hourly = data.hourly;
  if (!hourly || !Array.isArray(hourly.time)) throw new Error("Open-Meteo response had no hourly data");

  const values = {} as Record<Pollutant, (number | null)[]>;
  for (const [pollutant, field] of Object.entries(API_FIELDS) as [Pollutant, string][]) {
    const series = (hourly[field] as (number | null)[] | undefined) ?? [];
    // CO arrives in µg/m³; CPCB breakpoints use mg/m³.
    values[pollutant] = series.map((v) =>
      typeof v === "number" && Number.isFinite(v) && v >= 0 ? (pollutant === "co" ? v / 1000 : v) : null
    );
  }
  // Times come as "2026-10-10T19:00" in GMT.
  return { times: (hourly.time as string[]).map((t) => `${t}Z`), values };
}

/** AQI from the averaging windows ending at hour `index`, or null if too little data. */
function aqiAt(series: HourlySeries, index: number) {
  const averages: Partial<Record<Pollutant, number>> = {};
  const subIndices: Partial<Record<Pollutant, number>> = {};

  for (const pollutant of Object.keys(WINDOWS) as Pollutant[]) {
    const { hours, minValues } = WINDOWS[pollutant];
    const window = series.values[pollutant]
      .slice(Math.max(0, index - hours + 1), index + 1)
      .filter((v): v is number => v !== null);
    if (window.length < minValues) continue;
    const mean = window.reduce((sum, v) => sum + v, 0) / window.length;
    averages[pollutant] = Math.round(mean * (pollutant === "co" ? 100 : 10)) / (pollutant === "co" ? 100 : 10);
    subIndices[pollutant] = subIndex(pollutant, mean);
  }

  const entries = Object.entries(subIndices) as [Pollutant, number][];
  const hasPm = "pm10" in subIndices || "pm25" in subIndices;
  if (entries.length < 3 || !hasPm) return null;
  const [dominant, aqi] = entries.reduce((max, e) => (e[1] > max[1] ? e : max));
  return { aqi, dominant, averages };
}

/** Index of the latest hour that is not in the future. */
function currentIndex(series: HourlySeries, now = Date.now()): number {
  let index = -1;
  series.times.forEach((t, i) => {
    if (new Date(t).getTime() <= now) index = i;
  });
  return index;
}

const cache = new Map<string, { reading: AQIReading; at: number }>();

/** Current AQI reading for a location, cached per area for 30 minutes. */
export async function getOpenMeteoReading(
  areaId: string,
  place: { lat: number; lon: number; name: string }
): Promise<AQIReading | null> {
  const cached = cache.get(areaId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.reading;

  try {
    const series = await fetchSeries(place.lat, place.lon, 2);
    const index = currentIndex(series);
    const result = index >= 0 ? aqiAt(series, index) : null;
    if (!result) return null;

    const reading: AQIReading = {
      campus: areaId,
      aqi: result.aqi,
      dominantPollutant: result.dominant,
      pollutants: result.averages as Record<string, number>,
      pollutantScale: "concentration",
      source: OPEN_METEO_SOURCE,
      stationName: place.name,
      timestamp: new Date(series.times[index]).toISOString(),
      fetchedAt: new Date().toISOString(),
      dataMode: "live",
    };
    cache.set(areaId, { reading, at: Date.now() });
    return reading;
  } catch (err) {
    console.error(JSON.stringify({ event: "open_meteo_failed", message: (err as Error).message }));
    return null;
  }
}

/** Hourly AQI history for a location (each point uses its own averaging windows). */
export async function getOpenMeteoTrend(
  place: { lat: number; lon: number },
  hours: number
): Promise<TrendPoint[] | null> {
  try {
    // Extra day so the earliest point still has a full 24-hour window.
    const series = await fetchSeries(place.lat, place.lon, Math.min(Math.ceil(hours / 24) + 1, 8));
    const end = currentIndex(series);
    if (end < 0) return null;
    const step = hours <= 48 ? 1 : 3;
    const points: TrendPoint[] = [];
    for (let i = Math.max(0, end - hours); i <= end; i += step) {
      const result = aqiAt(series, i);
      if (!result) continue;
      points.push({
        timestamp: new Date(series.times[i]).toISOString(),
        aqi: result.aqi,
        dominantPollutant: result.dominant,
        source: OPEN_METEO_SOURCE,
        dataMode: "live",
      });
    }
    return points;
  } catch (err) {
    console.error(JSON.stringify({ event: "open_meteo_trend_failed", message: (err as Error).message }));
    return null;
  }
}
