import { bandFill, bandInk, bandText } from "./bands";
import type { Band } from "./catalog";

/*
 * The two AQI standards the globe can speak. India's bands come from the same
 * ruleset the rest of the app uses; the US EPA bands are fixed.
 */

export type AqiStandard = "india" | "us";

export interface ScaleBand {
  label: string;
  /** Upper edge of the band below this one (0 for the first). */
  from: number;
  /** Upper edge of this band (Infinity for the last US band). */
  to: number;
  fill: string;
  ink: string;
  text: string;
}

export function indiaScale(bands: Band[]): ScaleBand[] {
  return bands.map((b) => ({
    label: b.status,
    from: b.from,
    to: b.to,
    fill: bandFill(b.status),
    ink: bandInk(b.status),
    text: bandText(b.status),
  }));
}

function us(label: string, from: number, to: number, css: string): ScaleBand {
  return {
    label,
    from,
    to,
    fill: `var(--band-${css})`,
    ink: `var(--band-${css}-ink)`,
    text: `var(--band-${css}-text)`,
  };
}

/** US EPA Air Quality Index categories. */
export const US_SCALE: ScaleBand[] = [
  us("Good", 0, 50, "good"),
  us("Moderate", 50, 100, "moderate"),
  us("Unhealthy for sensitive groups", 100, 150, "poor"),
  us("Unhealthy", 150, 200, "very-poor"),
  us("Very unhealthy", 200, 300, "purple"),
  us("Hazardous", 300, Infinity, "severe"),
];

export function bandFor(scale: ScaleBand[], aqi: number | null | undefined): ScaleBand | null {
  if (aqi == null || scale.length === 0) return null;
  return scale.find((b) => aqi <= b.to) ?? scale[scale.length - 1];
}

/** "51–100", or "301+" for an open-ended band. */
export function rangeLabel(b: ScaleBand): string {
  const lo = b.from === 0 ? 0 : b.from + 1;
  return b.to === Infinity ? `${lo}+` : `${lo}–${b.to}`;
}

export const STANDARD_LABEL: Record<AqiStandard, { name: string; short: string; body: string }> = {
  india: { name: "India AQI", short: "AQI", body: "India's National AQI" },
  us: { name: "US AQI", short: "AQI-US", body: "US EPA AQI" },
};
