import { AQIThreshold } from "./types.js";

export const CPCB_THRESHOLDS: AQIThreshold[] = [
  {
    minAqi: 0,
    maxAqi: 50,
    status: "Good",
    statusLevel: 1,
    action: "No action needed. Air quality is satisfactory.",
    color: "#00B050",
  },
  {
    minAqi: 51,
    maxAqi: 100,
    status: "Satisfactory",
    statusLevel: 2,
    action:
      "Sensitive individuals: consider limiting prolonged outdoor exertion.",
    color: "#92D050",
  },
  {
    minAqi: 101,
    maxAqi: 200,
    status: "Moderate",
    statusLevel: 3,
    action:
      "Review outdoor activities. Consider moving prolonged events indoors.",
    color: "#FFFF00",
  },
  {
    minAqi: 201,
    maxAqi: 300,
    status: "Poor",
    statusLevel: 4,
    action:
      "Avoid prolonged outdoor activities. Issue campus advisory to all stakeholders.",
    color: "#FF9900",
  },
  {
    minAqi: 301,
    maxAqi: 400,
    status: "Very Poor",
    statusLevel: 5,
    action:
      "Cancel all outdoor activities. Notify all stakeholders immediately. Consider early dismissal for sensitive groups.",
    color: "#FF0000",
  },
  {
    minAqi: 401,
    maxAqi: 500,
    status: "Severe",
    statusLevel: 6,
    action:
      "Emergency protocol. Cancel all outdoor activities. Consider campus-wide early dismissal. Notify parents and guardians.",
    color: "#800000",
  },
];

export const STALE_THRESHOLD_MINUTES = 120;
export const CACHE_FRESH_MINUTES = 5;

export const DISCLAIMER =
  "This is decision support, not medical advice. Consult official CPCB guidance and local health authorities for health decisions.";

export function getThresholdForAqi(aqi: number): AQIThreshold {
  const threshold = CPCB_THRESHOLDS.find(
    (t) => aqi >= t.minAqi && aqi <= t.maxAqi
  );
  return threshold ?? CPCB_THRESHOLDS[CPCB_THRESHOLDS.length - 1];
}

export function getDataAge(timestamp: string): {
  label: string;
  minutes: number;
  isStale: boolean;
} {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);

  let label: string;
  if (minutes < 1) label = "Just now";
  else if (minutes < 60) label = `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  else {
    const hours = Math.floor(minutes / 60);
    label = `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }

  return { label, minutes, isStale: minutes > STALE_THRESHOLD_MINUTES };
}
