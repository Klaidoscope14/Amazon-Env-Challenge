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
    action: "The air is clean today. Get outside and enjoy it.",
    color: "#00B050",
  },
  {
    minAqi: 51,
    maxAqi: 100,
    status: "Satisfactory",
    statusLevel: 2,
    action:
      "The air is fine for most people. If pollution usually bothers you, go easy on long, hard workouts outside.",
    color: "#92D050",
  },
  {
    minAqi: 101,
    maxAqi: 200,
    status: "Moderate",
    statusLevel: 3,
    action:
      "Kids, older family members and anyone with asthma should take it easy outdoors today. Move long outdoor plans inside if you can.",
    color: "#FFFF00",
  },
  {
    minAqi: 201,
    maxAqi: 300,
    status: "Poor",
    statusLevel: 4,
    action:
      "Not a good day to spend long outside. Keep windows shut during rush hour, and give your family a heads-up.",
    color: "#FF9900",
  },
  {
    minAqi: 301,
    maxAqi: 400,
    status: "Very Poor",
    statusLevel: 5,
    action:
      "Stay indoors as much as you can today. Keep kids, older family members and anyone with asthma inside, and let them know why.",
    color: "#FF0000",
  },
  {
    minAqi: 401,
    maxAqi: 500,
    status: "Severe",
    statusLevel: 6,
    action:
      "Stay indoors and skip any outdoor exercise. Follow official advice, and check on older family members and neighbours.",
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
