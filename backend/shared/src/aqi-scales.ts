/*
 * AQI breakpoint tables, as concentration <-> index points joined end to end
 * (piecewise linear). Concentrations in µg/m³, except CO in mg/m³; gases on
 * ppb/ppm scales are converted at 25 °C and 1 atm (24.45 L/mol).
 */

export interface Scale {
  conc: number[];
  index: number[];
}

export type ScalePollutant = "pm25" | "pm10" | "o3";

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
 * US EPA AQI (PM2.5 as revised in 2024; ozone on its 8-hour scale, which
 * ends at 300). Used to convert IQAir's US index back to concentrations.
 */
export const US: Partial<Record<ScalePollutant, Scale>> = {
  pm25: { conc: [0, 9, 35.4, 55.4, 125.4, 225.4, 325.4], index: [0, 50, 100, 150, 200, 300, 500] },
  pm10: { conc: [0, 54, 154, 254, 354, 424, 604], index: [0, 50, 100, 150, 200, 300, 500] },
  o3: { conc: ppb([0, 54, 70, 85, 105, 200], 48.0), index: [0, 50, 100, 150, 200, 300] },
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
