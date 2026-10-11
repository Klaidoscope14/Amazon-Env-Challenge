/*
 * India's National Air Quality Index (CPCB), computed from pollutant
 * concentrations. Used for the globe, where every city needs a reading on the
 * same scale as "Main Statistics" but only has modelled concentrations.
 *
 * Method (CPCB NAQI): each pollutant's concentration is converted to a
 * sub-index by linear interpolation between breakpoints; the AQI is the
 * highest sub-index, and requires at least three pollutants, one of them PM2.5
 * or PM10. Averaging: PM2.5, PM10, NO₂, SO₂ over 24 hours; O₃ and CO over
 * 8 hours. Concentrations are µg/m³, except CO in mg/m³.
 */

export type Pollutant = "pm25" | "pm10" | "no2" | "so2" | "co" | "o3";

/** [concentration low, concentration high, index low, index high]. */
type Row = [number, number, number, number];

// Top rows run to an arbitrary ceiling: indices are capped at 500 regardless.
const BREAKPOINTS: Record<Pollutant, Row[]> = {
  pm10: [[0, 50, 0, 50], [51, 100, 51, 100], [101, 250, 101, 200], [251, 350, 201, 300], [351, 430, 301, 400], [431, 600, 401, 500]],
  pm25: [[0, 30, 0, 50], [31, 60, 51, 100], [61, 90, 101, 200], [91, 120, 201, 300], [121, 250, 301, 400], [251, 380, 401, 500]],
  no2: [[0, 40, 0, 50], [41, 80, 51, 100], [81, 180, 101, 200], [181, 280, 201, 300], [281, 400, 301, 400], [401, 800, 401, 500]],
  o3: [[0, 50, 0, 50], [51, 100, 51, 100], [101, 168, 101, 200], [169, 208, 201, 300], [209, 748, 301, 400], [749, 1000, 401, 500]],
  co: [[0, 1, 0, 50], [1.1, 2, 51, 100], [2.1, 10, 101, 200], [10.1, 17, 201, 300], [17.1, 34, 301, 400], [34.1, 50, 401, 500]],
  so2: [[0, 40, 0, 50], [41, 80, 51, 100], [81, 380, 101, 200], [381, 800, 201, 300], [801, 1600, 301, 400], [1601, 2400, 401, 500]],
};

/** The CPCB sub-index for one pollutant's (already averaged) concentration. */
export function subIndex(pollutant: Pollutant, concentration: number): number {
  const rows = BREAKPOINTS[pollutant];
  const row = rows.find((r) => concentration <= r[1]) ?? rows[rows.length - 1];
  const [cLo, cHi, iLo, iHi] = row;
  const c = Math.min(Math.max(concentration, cLo), cHi);
  const value = iLo + ((iHi - iLo) * (c - cLo)) / (cHi - cLo);
  return Math.min(500, value);
}

export interface CpcbResult {
  aqi: number;
  dominant: Pollutant;
  sub: Partial<Record<Pollutant, number>>;
}

/**
 * The AQI from averaged concentrations, or null when there is too little data
 * to be valid (fewer than three pollutants, or neither PM2.5 nor PM10).
 */
export function cpcbAqi(c: Partial<Record<Pollutant, number | null>>): CpcbResult | null {
  const sub: Partial<Record<Pollutant, number>> = {};
  for (const p of Object.keys(BREAKPOINTS) as Pollutant[]) {
    const v = c[p];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) sub[p] = subIndex(p, v);
  }
  const entries = Object.entries(sub) as [Pollutant, number][];
  if (entries.length < 3 || (sub.pm25 === undefined && sub.pm10 === undefined)) return null;
  const [dominant, top] = entries.reduce((m, e) => (e[1] > m[1] ? e : m));
  return { aqi: Math.round(top), dominant, sub };
}

/** Mean of the last `n` values, or null when fewer than `minValid` of them exist. */
export function trailingMean(values: (number | null | undefined)[], n: number, minValid: number): number | null {
  const window = values.slice(-n).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (window.length < minValid) return null;
  return window.reduce((a, b) => a + b, 0) / window.length;
}
