import type { AlertDelivery, AQIStatus, Audience } from "./types";

export const STATUS_CONFIG: Record<
  AQIStatus,
  { color: string; bg: string; border: string; text: string; hex: string }
> = {
  Good: {
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    text: "Good",
    hex: "#16a34a",
  },
  Satisfactory: {
    color: "text-lime-700",
    bg: "bg-lime-50",
    border: "border-lime-200",
    text: "Satisfactory",
    hex: "#65a30d",
  },
  Moderate: {
    color: "text-yellow-700",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    text: "Moderate",
    hex: "#ca8a04",
  },
  Poor: {
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "Poor",
    hex: "#ea580c",
  },
  "Very Poor": {
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "Very Poor",
    hex: "#dc2626",
  },
  Severe: {
    color: "text-red-900",
    bg: "bg-red-100",
    border: "border-red-300",
    text: "Severe",
    hex: "#7f1d1d",
  },
  Unavailable: {
    color: "text-gray-700",
    bg: "bg-gray-50",
    border: "border-gray-200",
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

export const AUDIENCE_OPTIONS = [
  { value: "all", label: "All (Students, Staff & Parents)" },
  { value: "students", label: "Students" },
  { value: "staff", label: "Staff" },
  { value: "parents", label: "Parents" },
] as const;

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: "All stakeholders",
  students: "Students",
  staff: "Staff",
  parents: "Parents",
};

/** Label + style for the email part of an alert's delivery record. */
export const EMAIL_DELIVERY: Record<
  AlertDelivery["email"],
  { label: string; className: string }
> = {
  sent: { label: "Email sent", className: "bg-green-100 text-green-800" },
  pending: { label: "Email pending", className: "bg-amber-100 text-amber-800" },
  failed: { label: "Email failed", className: "bg-red-100 text-red-800" },
  not_configured: { label: "In-app only", className: "bg-gray-100 text-gray-700" },
};

export const DECISION_OPTIONS = [
  "Moved activities indoors",
  "Cancelled outdoor events",
  "Sent advisory — monitoring",
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
