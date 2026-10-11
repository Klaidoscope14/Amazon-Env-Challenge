"use client";

import { useQuery } from "@tanstack/react-query";
import { cpcbAqi, trailingMean, type Pollutant } from "./cpcb";

/*
 * Current air quality for a set of places anywhere in the world, on India's
 * CPCB National AQI scale (and, for comparison, the US EPA index). Pollutant
 * concentrations come from Open-Meteo's
 * air-quality API (Copernicus CAMS model data; free, no key, browser-friendly)
 * and are turned into a CPCB AQI with the official breakpoints and averaging
 * periods (see ./cpcb). One request covers every city in view, and each place
 * gets its own reading, so values differ city to city the way real air does.
 *
 * These are modelled estimates, separate from the official reading in "Main
 * Statistics" (which comes from the VayuSaathi API).
 */

const ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";

export interface AirSite {
  lat: number;
  lon: number;
}

export interface AirPoint {
  /** CPCB AQI estimated from modelled concentrations; null if there isn't enough data. */
  aqi: number | null;
  dominant: Pollutant | null;
  /** US EPA AQI for the same place, as computed by the provider. */
  usAqi: number | null;
  usDominant: Pollutant | null;
  /** The averaged concentrations used (µg/m³; CO is not shown). */
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  /** Local time of the latest model hour (ISO, no zone). */
  time: string | null;
}

export function siteKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

type Hourly = Record<string, unknown> & { time?: unknown };

function series(h: Hourly | undefined, name: string): (number | null)[] {
  const v = h?.[name];
  return Array.isArray(v) ? v.map((x) => (typeof x === "number" && Number.isFinite(x) ? x : null)) : [];
}

async function fetchAir(sites: AirSite[], signal?: AbortSignal): Promise<Record<string, AirPoint>> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("latitude", sites.map((s) => s.lat.toFixed(2)).join(","));
  url.searchParams.set("longitude", sites.map((s) => s.lon.toFixed(2)).join(","));
  url.searchParams.set(
    "hourly",
    [
      "pm2_5", "pm10", "nitrogen_dioxide", "sulphur_dioxide", "carbon_monoxide", "ozone",
      "us_aqi", "us_aqi_pm2_5", "us_aqi_pm10", "us_aqi_nitrogen_dioxide", "us_aqi_sulphur_dioxide",
      "us_aqi_carbon_monoxide", "us_aqi_ozone",
    ].join(",")
  );
  url.searchParams.set("past_hours", "24");
  url.searchParams.set("forecast_hours", "1");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Air quality service responded ${res.status}`);
  const json: unknown = await res.json();
  const list = Array.isArray(json) ? json : [json];

  const out: Record<string, AirPoint> = {};
  sites.forEach((site, i) => {
    const h = (list[i] as { hourly?: Hourly } | undefined)?.hourly;
    const times = Array.isArray(h?.time) ? (h!.time as string[]) : [];

    // CPCB averaging: 24 h for PM2.5, PM10, NO2, SO2; 8 h for O3 and CO (mg/m3).
    const pm25 = trailingMean(series(h, "pm2_5"), 24, 16);
    const pm10 = trailingMean(series(h, "pm10"), 24, 16);
    const no2 = trailingMean(series(h, "nitrogen_dioxide"), 24, 16);
    const so2 = trailingMean(series(h, "sulphur_dioxide"), 24, 16);
    const o3 = trailingMean(series(h, "ozone"), 8, 6);
    const coUg = trailingMean(series(h, "carbon_monoxide"), 8, 6);
    const co = coUg === null ? null : coUg / 1000;

    const result = cpcbAqi({ pm25, pm10, no2, so2, o3, co });

    // US EPA index: the latest hourly value, and which pollutant drives it.
    const latest = (name: string) => {
      const v = series(h, name);
      for (let k = v.length - 1; k >= 0; k--) if (v[k] !== null) return v[k];
      return null;
    };
    const usParts: [Pollutant, number | null][] = [
      ["pm25", latest("us_aqi_pm2_5")],
      ["pm10", latest("us_aqi_pm10")],
      ["no2", latest("us_aqi_nitrogen_dioxide")],
      ["so2", latest("us_aqi_sulphur_dioxide")],
      ["co", latest("us_aqi_carbon_monoxide")],
      ["o3", latest("us_aqi_ozone")],
    ];
    const usTop = usParts.reduce<[Pollutant, number] | null>(
      (m, [k, v]) => (v !== null && (!m || v > m[1]) ? [k, v] : m),
      null
    );
    const usAqi = latest("us_aqi");
    out[siteKey(site.lat, site.lon)] = {
      aqi: result?.aqi ?? null,
      dominant: result?.dominant ?? null,
      usAqi: usAqi !== null ? Math.round(usAqi) : null,
      usDominant: usTop ? usTop[0] : null,
      pm25,
      pm10,
      o3,
      no2,
      time: times.length ? times[times.length - 1] : null,
    };
  });
  return out;
}

/** Readings for `sites`, keyed by siteKey(). `tag` names the group (e.g. a country code). */
export function useAirLayer(sites: AirSite[], tag: string) {
  const key = sites.map((s) => siteKey(s.lat, s.lon)).join("|");
  return useQuery({
    queryKey: ["air-layer", "v2", tag, key],
    queryFn: ({ signal }) => fetchAir(sites, signal),
    enabled: sites.length > 0,
    staleTime: 20 * 60 * 1000,
    refetchInterval: false,
    retry: 1,
  });
}
