import { GetParameterCommand, ParameterNotFound, SSMClient } from "@aws-sdk/client-ssm";
import { z } from "zod";
import { AQIReading, TrendPoint } from "./types.js";
import { errorFields, log } from "./observability.js";
import { indianAqiFromParticles } from "./aqi-scales.js";

/*
 * Real-time air quality from the Google Air Quality API. We ask for India's
 * National AQI (index code "ind_cpcb", CPCB's scale and categories), its
 * dominant pollutant, and pollutant concentrations. Gas concentrations come
 * in ppb and are converted to µg/m³ (CO to mg/m³), the units Indian AQI
 * breakpoints use.
 *
 * Cost control: the API is billed per request, so each area is fetched at
 * most once per 30 minutes per Lambda container (callers also reuse a recent
 * stored reading), and history is fetched once per area per hour and sliced
 * for every trend window. The key is read from SSM, never from code.
 */

const ENDPOINT = "https://airquality.googleapis.com/v1";
const TIMEOUT_MS = 6000;
const CURRENT_CACHE_MS = 30 * 60 * 1000;
const HISTORY_CACHE_MS = 60 * 60 * 1000;
const HISTORY_HOURS = 168;
const CACHE_LIMIT = 200;
export const GOOGLE_SOURCE = "Google Air Quality";
export const GOOGLE_ESTIMATE_SOURCE = "Google Air Quality (estimated Indian AQI)";
const INDIA_AQI = "ind_cpcb";

// ---- Response validation ---------------------------------------------------

const IndexSchema = z.object({
  code: z.string(),
  aqi: z.number().optional(),
  category: z.string().optional(),
  dominantPollutant: z.string().optional(),
});

const PollutantSchema = z.object({
  code: z.string(),
  concentration: z
    .object({
      value: z.number(),
      units: z.enum(["PARTS_PER_BILLION", "MICROGRAMS_PER_CUBIC_METER", "UNIT_UNSPECIFIED"]),
    })
    .optional(),
});

const ConditionsSchema = z.object({
  dateTime: z.string(),
  indexes: z.array(IndexSchema).optional(),
  pollutants: z.array(PollutantSchema).optional(),
});

export const CurrentConditionsSchema = ConditionsSchema.extend({ regionCode: z.string().optional() });

export const HistorySchema = z.object({
  hoursInfo: z.array(ConditionsSchema.partial({ dateTime: true })).optional(),
  nextPageToken: z.string().optional(),
});

// ---- Units -----------------------------------------------------------------

// Molecular weights (g/mol) for ppb -> µg/m³ at 25 °C and 1 atm (24.45 L/mol).
const MOLECULAR_WEIGHT: Record<string, number> = { no2: 46.01, o3: 48.0, co: 28.01, so2: 64.07, nh3: 17.03 };
const MOLAR_VOLUME = 24.45;

/** Concentration in the Indian AQI's units: µg/m³, except CO in mg/m³. */
export function toAqiUnits(code: string, value: number, units: string): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  let ugm3: number;
  if (units === "MICROGRAMS_PER_CUBIC_METER") ugm3 = value;
  else if (units === "PARTS_PER_BILLION" && MOLECULAR_WEIGHT[code]) ugm3 = (value * MOLECULAR_WEIGHT[code]) / MOLAR_VOLUME;
  else return null;
  return code === "co" ? Math.round(ugm3 / 10) / 100 : Math.round(ugm3 * 10) / 10;
}

// ---- Key -------------------------------------------------------------------

const ssm = new SSMClient({});
// undefined = not loaded; null = not configured. Reloaded every 15 minutes,
// so a rotated key in SSM is picked up without a redeploy.
let apiKey: string | null | undefined;
let apiKeyLoadedAt = 0;
const KEY_RELOAD_MS = 15 * 60 * 1000;

export function googleKeyParamFromEnv(): string {
  return process.env.GOOGLE_AQ_KEY_PARAM || "/breathesafe/google-air-quality-key";
}

/** The Google API key (Air Quality, Places, Geocoding) from SSM; null when not configured. */
export async function getGoogleApiKey(parameter = googleKeyParamFromEnv()): Promise<string | null> {
  if (apiKey !== undefined && Date.now() - apiKeyLoadedAt < KEY_RELOAD_MS) return apiKey;
  try {
    const result = await ssm.send(new GetParameterCommand({ Name: parameter, WithDecryption: true }));
    apiKey = result.Parameter?.Value?.trim() || null;
    apiKeyLoadedAt = Date.now();
  } catch (err) {
    if (err instanceof ParameterNotFound) {
      log("error", "google_aq_key_missing", { parameter });
      apiKey = null;
      apiKeyLoadedAt = Date.now();
    } else {
      log("error", "google_aq_key_unavailable", errorFields(err));
      return apiKey ?? null; // transient: keep the last key, retry next request
    }
  }
  return apiKey;
}

/** Clears caches and the key (tests). */
export function resetGoogleAq(): void {
  apiKey = undefined;
  currentCache.clear();
  historyCache.clear();
}

// ---- HTTP ------------------------------------------------------------------

async function post(path: string, body: unknown, keyParam: string): Promise<unknown> {
  const key = await getGoogleApiKey(keyParam);
  if (!key) throw new Error("Google Air Quality API key is not configured");
  let response: Response | undefined;
  // One retry for transient server errors.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      response = await fetch(`${ENDPOINT}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok || response.status < 500 || attempt === 2) break;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  if (!response?.ok) {
    // Error bodies are Google's JSON error object; log the status and reason only.
    const reason = await response
      ?.json()
      .then((e) => (e as { error?: { status?: string } }).error?.status)
      .catch(() => undefined);
    throw new Error(`Google Air Quality API returned HTTP ${response?.status}${reason ? ` (${reason})` : ""}`);
  }
  return response.json();
}

function requestBase(lat: number, lon: number) {
  return {
    location: { latitude: Number(lat.toFixed(4)), longitude: Number(lon.toFixed(4)) },
    universalAqi: false,
    customLocalAqis: [{ regionCode: "IN", aqi: INDIA_AQI }],
    languageCode: "en",
  };
}

type Conditions = z.infer<typeof ConditionsSchema>;

function indiaIndex(conditions: Partial<Conditions>) {
  const index = conditions.indexes?.find((i) => i.code === INDIA_AQI);
  return index && typeof index.aqi === "number" && index.aqi >= 0 ? index : null;
}

function pollutantsOf(conditions: Partial<Conditions>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of conditions.pollutants ?? []) {
    if (!p.concentration) continue;
    const value = toAqiUnits(p.code, p.concentration.value, p.concentration.units);
    if (value !== null) out[p.code] = value;
  }
  return out;
}

// ---- Current conditions ------------------------------------------------------

const currentCache = new Map<string, { reading: AQIReading; at: number }>();

function remember<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}

/** Converts a current-conditions response into a reading (exported for tests). */
export function toReading(areaId: string, placeName: string, data: unknown): AQIReading | null {
  const parsed = CurrentConditionsSchema.safeParse(data);
  if (!parsed.success) throw new Error(`Google response failed validation: ${parsed.error.issues[0]?.message}`);
  const index = indiaIndex(parsed.data);
  if (!index) return null;
  return {
    campus: areaId,
    aqi: index.aqi!,
    dominantPollutant: index.dominantPollutant ?? "unknown",
    pollutants: pollutantsOf(parsed.data),
    pollutantScale: "concentration",
    source: GOOGLE_SOURCE,
    stationName: placeName,
    timestamp: new Date(parsed.data.dateTime).toISOString(),
    fetchedAt: new Date().toISOString(),
    dataMode: "live",
  };
}

/** Current Indian AQI for a location, or null when unavailable. */
export async function getGoogleReading(
  areaId: string,
  place: { lat: number; lon: number; name: string },
  keyParam = googleKeyParamFromEnv()
): Promise<AQIReading | null> {
  const hit = currentCache.get(areaId);
  if (hit && Date.now() - hit.at < CURRENT_CACHE_MS) return hit.reading;
  try {
    const data = await post(
      "currentConditions:lookup",
      { ...requestBase(place.lat, place.lon), extraComputations: ["LOCAL_AQI", "POLLUTANT_CONCENTRATION"] },
      keyParam
    );
    const reading = toReading(areaId, place.name, data);
    if (!reading) {
      log("warn", "google_aq_no_india_index", { area: areaId });
      return null;
    }
    remember(currentCache, areaId, { reading, at: Date.now() });
    return reading;
  } catch (err) {
    log("error", "google_aq_current_failed", errorFields(err));
    return null;
  }
}

/**
 * Converts a current-conditions response for a place outside India into an
 * estimated Indian AQI (exported for tests). Google publishes no Indian index
 * there, so the PM2.5 / PM10 concentrations go through CPCB's breakpoints.
 * Null when there is no particulate data.
 */
export function toEstimate(id: string, data: unknown): AQIReading | null {
  const parsed = CurrentConditionsSchema.safeParse(data);
  if (!parsed.success) throw new Error(`Google response failed validation: ${parsed.error.issues[0]?.message}`);
  const pollutants = pollutantsOf(parsed.data);
  const estimate = indianAqiFromParticles({ pm25: pollutants.pm25, pm10: pollutants.pm10 });
  if (!estimate) return null;
  return {
    campus: id,
    aqi: estimate.aqi,
    dominantPollutant: estimate.dominant,
    pollutants,
    pollutantScale: "concentration",
    source: GOOGLE_ESTIMATE_SOURCE,
    stationName: id,
    timestamp: new Date(parsed.data.dateTime).toISOString(),
    fetchedAt: new Date().toISOString(),
    dataMode: "live",
  };
}

/**
 * An estimated Indian AQI for a place outside India (the globe), or null when
 * Google has no particulate data there. Cached per place like current readings.
 */
export async function getGoogleEstimate(
  place: { lat: number; lon: number },
  keyParam = googleKeyParamFromEnv()
): Promise<AQIReading | null> {
  const id = `est:${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  const hit = currentCache.get(id);
  if (hit && Date.now() - hit.at < CURRENT_CACHE_MS) return hit.reading;
  try {
    const data = await post(
      "currentConditions:lookup",
      { ...requestBase(place.lat, place.lon), extraComputations: ["POLLUTANT_CONCENTRATION"] },
      keyParam
    );
    const reading = toEstimate(id, data);
    if (!reading) return null;
    remember(currentCache, id, { reading, at: Date.now() });
    return reading;
  } catch (err) {
    log("error", "google_aq_estimate_failed", errorFields(err));
    return null;
  }
}

// ---- History -----------------------------------------------------------------

const historyCache = new Map<string, { points: TrendPoint[]; at: number }>();

/** Converts a history response into trend points, oldest first (exported for tests). */
export function toTrendPoints(data: unknown): TrendPoint[] {
  const parsed = HistorySchema.safeParse(data);
  if (!parsed.success) throw new Error(`Google history failed validation: ${parsed.error.issues[0]?.message}`);
  const points: TrendPoint[] = [];
  for (const hour of parsed.data.hoursInfo ?? []) {
    const index = indiaIndex(hour);
    if (!index || !hour.dateTime) continue;
    points.push({
      timestamp: new Date(hour.dateTime).toISOString(),
      aqi: index.aqi!,
      dominantPollutant: index.dominantPollutant ?? "unknown",
      source: GOOGLE_SOURCE,
      dataMode: "live",
    });
  }
  return points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Hourly Indian AQI for the last `hours` (≤168) at a location, or null. */
export async function getGoogleTrend(
  areaId: string,
  place: { lat: number; lon: number },
  hours: number,
  keyParam = googleKeyParamFromEnv()
): Promise<TrendPoint[] | null> {
  let entry = historyCache.get(areaId);
  if (!entry || Date.now() - entry.at >= HISTORY_CACHE_MS) {
    try {
      const data = await post(
        "history:lookup",
        {
          ...requestBase(place.lat, place.lon),
          hours: HISTORY_HOURS,
          pageSize: HISTORY_HOURS,
          extraComputations: ["LOCAL_AQI"],
        },
        keyParam
      );
      entry = { points: toTrendPoints(data), at: Date.now() };
      remember(historyCache, areaId, entry);
    } catch (err) {
      log("error", "google_aq_history_failed", errorFields(err));
      return null;
    }
  }
  const cutoff = Date.now() - hours * 3600 * 1000;
  return entry.points.filter((p) => new Date(p.timestamp).getTime() >= cutoff);
}
