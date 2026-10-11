/*
 * AQI breakpoint tables, as concentration <-> index points joined end to end
 * (piecewise linear). Concentrations in µg/m³, except CO in mg/m³; gases on
 * ppb/ppm scales are converted at 25 °C and 1 atm (24.45 L/mol).
 */

export interface Scale {
  conc: number[];
  index: number[];
}

export type ScalePollutant = "pm25" | "pm10" | "o3" | "no2" | "so2" | "co";

const MOLAR_VOLUME = 24.45;
const ugPerPpb = (molecularWeight: number) => molecularWeight / MOLAR_VOLUME;
const ppb = (values: number[], molecularWeight: number) => values.map((v) => v * ugPerPpb(molecularWeight));

/** Piecewise-linear lookup of y for x along (xs, ys); clamped to the last point. */
export function interpolate(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
  }
  return ys[ys.length - 1];
}

/**
 * US EPA AQI (PM2.5 as revised in 2024). Ozone on its 8-hour scale, which
 * ends at 300; NO₂ and SO₂ on 1-hour; CO on 8-hour (ppm, here as mg/m³).
 */
export const US: Partial<Record<ScalePollutant, Scale>> = {
  pm25: { conc: [0, 9, 35.4, 55.4, 125.4, 225.4, 325.4], index: [0, 50, 100, 150, 200, 300, 500] },
  pm10: { conc: [0, 54, 154, 254, 354, 424, 604], index: [0, 50, 100, 150, 200, 300, 500] },
  o3: { conc: ppb([0, 54, 70, 85, 105, 200], 48.0), index: [0, 50, 100, 150, 200, 300] },
  no2: { conc: ppb([0, 53, 100, 360, 649, 1249, 2049], 46.01), index: [0, 50, 100, 150, 200, 300, 500] },
  so2: { conc: ppb([0, 35, 75, 185, 304, 604, 1004], 64.07), index: [0, 50, 100, 150, 200, 300, 500] },
  co: {
    conc: [0, 4.4, 9.4, 12.4, 15.4, 30.4, 50.4].map((ppm) => (ppm * 28.01) / MOLAR_VOLUME),
    index: [0, 50, 100, 150, 200, 300, 500],
  },
};

// China HJ 633-2012 (24-hour). Its ozone index is 1-hour, which would
// overstate India's 8-hour ozone, so it is left out.
export const CN: Partial<Record<ScalePollutant, Scale>> = {
  pm25: { conc: [0, 35, 75, 115, 150, 250, 350, 500], index: [0, 50, 100, 150, 200, 300, 400, 500] },
  pm10: { conc: [0, 50, 150, 250, 350, 420, 500, 600], index: [0, 50, 100, 150, 200, 300, 400, 500] },
};

// India CPCB National AQI (ozone: 8-hour).
export const IN: Partial<Record<ScalePollutant, Scale>> = {
  pm25: { conc: [0, 30, 60, 90, 120, 250, 380], index: [0, 50, 100, 200, 300, 400, 500] },
  pm10: { conc: [0, 50, 100, 250, 350, 430, 510], index: [0, 50, 100, 200, 300, 400, 500] },
  o3: { conc: [0, 50, 100, 168, 208, 748, 1000], index: [0, 50, 100, 200, 300, 400, 500] },
};

/**
 * US EPA AQI from pollutant concentrations (µg/m³, CO mg/m³): the highest
 * sub-index and the pollutant behind it, or null with no usable pollutant.
 * Uses the latest values as given, so it is an approximation of the
 * averaged official index.
 */
export function usAqiFrom(
  pollutants: Partial<Record<string, number>>
): { aqi: number; dominant: ScalePollutant } | null {
  let best: { aqi: number; dominant: ScalePollutant } | null = null;
  for (const [pollutant, scale] of Object.entries(US) as [ScalePollutant, Scale][]) {
    const value = pollutants[pollutant];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    const aqi = Math.round(interpolate(value, scale.conc, scale.index));
    if (!best || aqi > best.aqi) best = { aqi, dominant: pollutant };
  }
  return best;
}
