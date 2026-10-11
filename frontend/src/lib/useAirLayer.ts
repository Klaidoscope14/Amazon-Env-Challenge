"use client";

import { useQuery } from "@tanstack/react-query";
import { getAirSites } from "./api";

/*
 * Current air quality for many places at once (the globe and "cities near
 * you"), from the VayuSaathi API: the same reading the dashboard shows for
 * each place's area, on India's AQI, plus the US AQI for the standard switch.
 * Places outside India have no reading.
 */

export type Pollutant = "pm25" | "pm10" | "no2" | "so2" | "co" | "o3";

export interface AirSite {
  lat: number;
  lon: number;
}

export interface AirPoint {
  /** India's AQI for the place; null outside India or without a reading. */
  aqi: number | null;
  dominant: Pollutant | null;
  /** US AQI for the same place, from the same pollutant values. */
  usAqi: number | null;
  usDominant: Pollutant | null;
  /** Latest concentrations (µg/m³). */
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  /** When the reading was taken (ISO). */
  time: string | null;
}

export function siteKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/** Readings for `sites`, keyed by siteKey(). `tag` names the group (e.g. a country code). */
export function useAirLayer(sites: AirSite[], tag: string) {
  const key = sites.map((s) => siteKey(s.lat, s.lon)).join("|");
  return useQuery({
    queryKey: ["air-layer", "v3", tag, key],
    queryFn: () => getAirSites(sites),
    enabled: sites.length > 0,
    staleTime: 20 * 60 * 1000,
    refetchInterval: false,
    retry: 1,
  });
}
