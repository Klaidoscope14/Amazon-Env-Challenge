import { PollutantLimit } from "./types.js";

/*
 * Reference data the app shows, served to the browser via GET /catalog so
 * there is one copy of it.
 */

/**
 * CPCB National Ambient Air Quality Standards: the limit a measured
 * concentration is compared against (PM, NO₂, SO₂, NH₃: 24-hour average;
 * O₃, CO: 8-hour). CO in mg/m³, the rest µg/m³.
 */
export const POLLUTANT_LIMITS: Record<string, PollutantLimit> = {
  pm25: { limit: 60, averaging: "24-hour" },
  pm10: { limit: 100, averaging: "24-hour" },
  no2: { limit: 80, averaging: "24-hour" },
  so2: { limit: 80, averaging: "24-hour" },
  nh3: { limit: 400, averaging: "24-hour" },
  o3: { limit: 100, averaging: "8-hour" },
  co: { limit: 2, averaging: "8-hour" },
};

/** One-tap choices for "What did you decide?" (people can also write their own). */
export const DECISION_OPTIONS = [
  "Moved plans indoors",
  "Skipped outdoor exercise",
  "Kept windows closed",
  "No action needed",
];
