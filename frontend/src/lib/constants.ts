import type { AlertDelivery, AQIStatus, Audience, LegacyAudience } from "./types";

export const STATUS_CONFIG: Record<
  AQIStatus,
  { color: string; bg: string; border: string; text: string; hex: string }
> = {
  Good: {
    color: "text-green-700 dark:text-green-300",
    bg: "bg-green-50 dark:bg-green-950/40",
    border: "border-green-200 dark:border-green-900",
    text: "Good",
    hex: "#16a34a",
  },
  Satisfactory: {
    color: "text-lime-700 dark:text-lime-300",
    bg: "bg-lime-50 dark:bg-lime-950/40",
    border: "border-lime-200 dark:border-lime-900",
    text: "Satisfactory",
    hex: "#65a30d",
  },
  Moderate: {
    color: "text-yellow-700 dark:text-yellow-300",
    bg: "bg-yellow-50 dark:bg-yellow-950/40",
    border: "border-yellow-200 dark:border-yellow-900",
    text: "Moderate",
    hex: "#ca8a04",
  },
  Poor: {
    color: "text-orange-700 dark:text-orange-300",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    border: "border-orange-200 dark:border-orange-900",
    text: "Poor",
    hex: "#ea580c",
  },
  "Very Poor": {
    color: "text-red-700 dark:text-red-300",
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-200 dark:border-red-900",
    text: "Very Poor",
    hex: "#dc2626",
  },
  Severe: {
    color: "text-red-900 dark:text-red-200",
    bg: "bg-red-100 dark:bg-red-900/40",
    border: "border-red-300 dark:border-red-800",
    text: "Severe",
    hex: "#7f1d1d",
  },
  Unavailable: {
    color: "text-gray-700 dark:text-gray-300",
    bg: "bg-gray-50 dark:bg-gray-800",
    border: "border-gray-200 dark:border-gray-700",
    text: "Unavailable",
    hex: "#6b7280",
  },
};

/** CPCB bands in order, by upper AQI bound (used by the trend chart). */
export const AQI_BANDS: { max: number; status: AQIStatus }[] = [
  { max: 50, status: "Good" },
  { max: 100, status: "Satisfactory" },
  { max: 200, status: "Moderate" },
  { max: 300, status: "Poor" },
  { max: 400, status: "Very Poor" },
  { max: Infinity, status: "Severe" },
];

export function statusForAqi(aqi: number): AQIStatus {
  const rounded = Math.round(aqi);
  return AQI_BANDS.find((b) => rounded <= b.max)?.status ?? "Severe";
}

export const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: "family", label: "My family" },
  { value: "neighbours", label: "My neighbourhood / society" },
  { value: "group", label: "My team / group" },
  { value: "all", label: "Everyone" },
];

export const AUDIENCE_LABELS: Record<Audience | LegacyAudience, string> = {
  family: "My family",
  neighbours: "My neighbourhood / society",
  group: "My team / group",
  all: "Everyone",
  // Older alerts
  students: "Students",
  staff: "Staff",
  parents: "Parents",
};

/** Label + style for the email part of an alert's delivery record. */
export const EMAIL_DELIVERY: Record<
  AlertDelivery["email"],
  { label: string; className: string }
> = {
  sent: { label: "Email sent", className: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200" },
  pending: { label: "Email pending", className: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200" },
  failed: { label: "Email failed", className: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200" },
  not_configured: { label: "In-app only", className: "bg-surface-2 text-muted" },
};

export const DECISION_OPTIONS = [
  "Moved plans indoors",
  "Skipped outdoor exercise",
  "Kept windows closed",
  "No action needed",
] as const;

export const DEMO_SCENARIO_OPTIONS = [
  { value: "good", label: "Good (0–50)" },
  { value: "satisfactory", label: "Satisfactory (51–100)" },
  { value: "moderate", label: "Moderate (101–200)" },
  { value: "poor", label: "Poor (201–300)" },
  { value: "veryPoor", label: "Very Poor (301–400)" },
  { value: "severe", label: "Severe (401–500)" },
] as const;

export const DEFAULT_DEMO_SCENARIO = "poor";

const POLLUTANT_LABELS: Record<string, { label: string; unit: string }> = {
  pm25: { label: "PM2.5", unit: "µg/m³" },
  pm10: { label: "PM10", unit: "µg/m³" },
  no2: { label: "NO₂", unit: "µg/m³" },
  so2: { label: "SO₂", unit: "µg/m³" },
  o3: { label: "O₃", unit: "µg/m³" },
  co: { label: "CO", unit: "mg/m³" },
  nh3: { label: "NH₃", unit: "µg/m³" },
};

export function formatPollutant(key: string): { label: string; unit: string } {
  return POLLUTANT_LABELS[key.toLowerCase()] ?? { label: key.toUpperCase(), unit: "" };
}
