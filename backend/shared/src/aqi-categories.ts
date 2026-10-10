import { AQIThreshold, Ruleset } from "./types.js";

/*
 * The built-in ruleset: CPCB's six AQI categories with the action we
 * recommend for each. The same bands can be stored in the RulesConfig table
 * (see rules.ts) to change the actions without a redeploy; these defaults
 * are used whenever that table is empty, unreadable or fails validation.
 */
export const DEFAULT_RULESET_ID = "cpcb-india-v1";

export const CPCB_THRESHOLDS: AQIThreshold[] = [
  {
    minAqi: 0,
    maxAqi: 50,
    status: "Good",
    statusLevel: 1,
    action: "No action needed. Enjoy outdoor activities as usual.",
    color: "#00B050",
  },
  {
    minAqi: 51,
    maxAqi: 100,
    status: "Satisfactory",
    statusLevel: 2,
    action:
      "Air quality is acceptable. People who are unusually sensitive should consider limiting prolonged outdoor exertion.",
    color: "#92D050",
  },
  {
    minAqi: 101,
    maxAqi: 200,
    status: "Moderate",
    statusLevel: 3,
    action:
      "Children, older adults and people with breathing difficulties should limit prolonged outdoor exertion. Consider moving long outdoor plans indoors.",
    color: "#FFFF00",
  },
  {
    minAqi: 201,
    maxAqi: 300,
    status: "Poor",
    statusLevel: 4,
    action:
      "Avoid prolonged outdoor activity. Keep windows closed at peak hours and let your family and neighbours know.",
    color: "#FF9900",
  },
  {
    minAqi: 301,
    maxAqi: 400,
    status: "Very Poor",
    statusLevel: 5,
    action:
      "Avoid outdoor activities and stay indoors where possible. Warn your family, especially children, older adults and anyone with breathing conditions.",
    color: "#FF0000",
  },
  {
    minAqi: 401,
    maxAqi: 500,
    status: "Severe",
    statusLevel: 6,
    action:
      "Stay indoors and avoid all outdoor exertion. Follow official advisories and check on vulnerable family members and neighbours.",
    color: "#800000",
  },
];

export const BUILT_IN_RULESET: Ruleset = {
  id: DEFAULT_RULESET_ID,
  thresholds: CPCB_THRESHOLDS,
  source: "built-in",
};

export const STALE_THRESHOLD_MINUTES = 120;
export const CACHE_FRESH_MINUTES = 5;

export const DISCLAIMER =
  "This is decision support, not medical advice. Consult official CPCB guidance and local health authorities for health decisions.";

// Tolerated clock skew before a timestamp counts as "in the future".
const FUTURE_SKEW_MINUTES = 5;

/**
 * Returns the CPCB band for an AQI value, or null when the value is not a
 * usable AQI (missing, NaN, negative). Bands are matched on the rounded value
 * by upper bound, so fractional readings never fall between bands; anything
 * above 500 is still Severe.
 */
export function getThresholdForAqi(
  aqi: unknown,
  thresholds: AQIThreshold[] = CPCB_THRESHOLDS
): AQIThreshold | null {
  if (typeof aqi !== "number" || !Number.isFinite(aqi) || aqi < 0) return null;
  const rounded = Math.round(aqi);
  return thresholds.find((t) => rounded <= t.maxAqi) ?? thresholds[thresholds.length - 1];
}

export function getDataAge(timestamp: string): {
  label: string;
  minutes: number;
  isStale: boolean;
} {
  const then = new Date(timestamp).getTime();
  // An unparseable timestamp must never be treated as fresh.
  if (!Number.isFinite(then)) {
    return { label: "Unknown time", minutes: Number.NaN, isStale: true };
  }

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < -FUTURE_SKEW_MINUTES) {
    return { label: "Timestamp in the future", minutes, isStale: true };
  }

  let label: string;
  if (minutes < 1) label = "Just now";
  else if (minutes < 60) label = `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  else {
    const hours = Math.floor(minutes / 60);
    label = `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }

  return { label, minutes, isStale: minutes > STALE_THRESHOLD_MINUTES };
}
