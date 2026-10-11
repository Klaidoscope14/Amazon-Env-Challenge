import { GetParameterCommand, ParameterNotFound, SSMClient } from "@aws-sdk/client-ssm";
import { z } from "zod";
import { AQIReading } from "./types.js";
import { errorFields, log } from "./observability.js";

/*
 * Fallback source: IQAir (AirVisual) "nearest_city", used when Google's
 * Indian AQI is unavailable. The free plan reports only the US EPA and China
 * AQI and each one's main pollutant: no Indian AQI and no concentrations.
 *
 * So the Indian AQI is estimated: each index is turned back into the
 * concentration of its main pollutant (PM2.5, PM10 or, from the US index,
 * ozone), and CPCB's
 * breakpoints are applied to that concentration. IQAir's values are near
 * real-time while CPCB's are 24-hour averages, and pollutants that are not
 * an index's main pollutant are unknown, so the result is labelled as an
 * estimate (source IQAIR_SOURCE) and carries no pollutant breakdown.
 */

const ENDPOINT = "https://api.airvisual.com/v2/nearest_city";
const TIMEOUT_MS = 6000;
const CACHE_MS = 30 * 60 * 1000;
const CACHE_LIMIT = 200;
export const IQAIR_SOURCE = "IQAir (estimated Indian AQI)";

// ---- Breakpoints (concentration in µg/m³ <-> index), joined end to end ------

interface Scale {
  conc: number[];
  index: number[];
}

type Pollutant = "pm25" | "pm10" | "o3";

// Ozone ppb -> µg/m³ at 25 °C and 1 atm (48.00 g/mol / 24.45 L/mol).
const O3_UG_PER_PPB = 48.0 / 24.45;

// US EPA (PM2.5 as revised in 2024; ozone on its 8-hour scale, which ends at 300).
const US: Partial<Record<Pollutant, Scale>> = {
  pm25: { conc: [0, 9, 35.4, 55.4, 125.4, 225.4, 325.4], index: [0, 50, 100, 150, 200, 300, 500] },
  pm10: { conc: [0, 54, 154, 254, 354, 424, 604], index: [0, 50, 100, 150, 200, 300, 500] },
  o3: { conc: [0, 54, 70, 85, 105, 200].map((ppb) => ppb * O3_UG_PER_PPB), index: [0, 50, 100, 150, 200, 300] },
};

// China HJ 633-2012 (24-hour). Its ozone index is 1-hour, which would
// overstate India's 8-hour ozone, so ozone is taken from the US index only.
const CN: Partial<Record<Pollutant, Scale>> = {
  pm25: { conc: [0, 35, 75, 115, 150, 250, 350, 500], index: [0, 50, 100, 150, 200, 300, 400, 500] },
  pm10: { conc: [0, 50, 150, 250, 350, 420, 500, 600], index: [0, 50, 100, 150, 200, 300, 400, 500] },
};

// India CPCB National AQI (ozone: 8-hour).
const IN: Record<Pollutant, Scale> = {
  pm25: { conc: [0, 30, 60, 90, 120, 250, 380], index: [0, 50, 100, 200, 300, 400, 500] },
  pm10: { conc: [0, 50, 100, 250, 350, 430, 510], index: [0, 50, 100, 200, 300, 400, 500] },
  o3: { conc: [0, 50, 100, 168, 208, 748, 1000], index: [0, 50, 100, 200, 300, 400, 500] },
};

/** Piecewise-linear lookup of y for x along (xs, ys); clamped to the last point. */
function interpolate(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
  }
  return ys[ys.length - 1];
}

const MAIN_POLLUTANT: Record<string, Pollutant> = { p2: "pm25", p1: "pm10", o3: "o3" };

/**
 * Indian AQI estimated from IQAir's US and China indices, or null when
 * neither index is driven by a pollutant we can convert (exported for tests).
 */
export function estimateIndianAqi(p: {
  aqius: number;
  mainus: string;
  aqicn: number;
  maincn: string;
}): { aqi: number; dominantPollutant: Pollutant } | null {
  const concentration: Partial<Record<Pollutant, number>> = {};
  const add = (index: number, main: string, scales: Partial<Record<Pollutant, Scale>>) => {
    const pollutant = MAIN_POLLUTANT[main];
    const scale = pollutant && scales[pollutant];
    if (!scale || !Number.isFinite(index) || index < 0) return;
    const c = interpolate(index, scale.index, scale.conc);
    concentration[pollutant] = Math.max(concentration[pollutant] ?? 0, c);
  };
  add(p.aqius, p.mainus, US);
  add(p.aqicn, p.maincn, CN);

  let best: { aqi: number; dominantPollutant: Pollutant } | null = null;
  for (const pollutant of ["pm25", "pm10", "o3"] as const) {
    const c = concentration[pollutant];
    if (c === undefined) continue;
    const aqi = Math.round(interpolate(c, IN[pollutant].conc, IN[pollutant].index));
    if (!best || aqi > best.aqi) best = { aqi, dominantPollutant: pollutant };
  }
  return best;
}

// ---- Response validation ---------------------------------------------------

export const NearestCitySchema = z.object({
  status: z.literal("success"),
  data: z.object({
    city: z.string().optional(),
    current: z.object({
      pollution: z.object({
        ts: z.string(),
        aqius: z.number(),
        mainus: z.string(),
        aqicn: z.number(),
        maincn: z.string(),
      }),
    }),
  }),
});

/** Converts a nearest_city response into a reading (exported for tests). */
export function toIqAirReading(areaId: string, placeName: string, data: unknown): AQIReading | null {
  const parsed = NearestCitySchema.safeParse(data);
  if (!parsed.success) throw new Error(`IQAir response failed validation: ${parsed.error.issues[0]?.message}`);
  const pollution = parsed.data.data.current.pollution;
  const estimate = estimateIndianAqi(pollution);
  if (!estimate) return null;
  return {
    campus: areaId,
    aqi: estimate.aqi,
    dominantPollutant: estimate.dominantPollutant,
    pollutants: {},
    source: IQAIR_SOURCE,
    stationName: placeName,
    timestamp: new Date(pollution.ts).toISOString(),
    fetchedAt: new Date().toISOString(),
    dataMode: "live",
    estimated: true,
  };
}

// ---- Key and requests -------------------------------------------------------

const ssm = new SSMClient({});
// undefined = not loaded; null = not configured.
let apiKey: string | null | undefined;

export function iqAirKeyParamFromEnv(): string {
  return process.env.IQAIR_KEY_PARAM || "/breathesafe/iqair-api-key";
}

async function getApiKey(parameter: string): Promise<string | null> {
  if (apiKey !== undefined) return apiKey;
  try {
    const result = await ssm.send(new GetParameterCommand({ Name: parameter, WithDecryption: true }));
    apiKey = result.Parameter?.Value?.trim() || null;
  } catch (err) {
    if (err instanceof ParameterNotFound) {
      log("warn", "iqair_key_missing", { parameter });
      apiKey = null;
    } else {
      log("error", "iqair_key_unavailable", errorFields(err));
      return null; // transient: retry next request
    }
  }
  return apiKey;
}

const cache = new Map<string, { reading: AQIReading; at: number }>();

/** Clears the cache and the key (tests). */
export function resetIqAir(): void {
  apiKey = undefined;
  cache.clear();
}

/** Estimated Indian AQI for a location from IQAir, or null when unavailable. */
export async function getIqAirReading(
  areaId: string,
  place: { lat: number; lon: number; name: string },
  keyParam = iqAirKeyParamFromEnv()
): Promise<AQIReading | null> {
  const hit = cache.get(areaId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.reading;
  try {
    const key = await getApiKey(keyParam);
    if (!key) return null;
    const url = `${ENDPOINT}?lat=${place.lat.toFixed(4)}&lon=${place.lon.toFixed(4)}&key=${encodeURIComponent(key)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      // Error bodies are {"status":"fail","data":{"message":"..."}}; log the reason only (never the URL).
      const reason = (body as { data?: { message?: string } } | null)?.data?.message;
      throw new Error(`IQAir API returned HTTP ${response.status}${reason ? ` (${reason})` : ""}`);
    }
    const reading = toIqAirReading(areaId, place.name, body);
    if (!reading) {
      log("warn", "iqair_no_pm_index", { area: areaId });
      return null;
    }
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(areaId, { reading, at: Date.now() });
    return reading;
  } catch (err) {
    log("error", "iqair_current_failed", errorFields(err));
    return null;
  }
}
