import { bandFill, bandInk, bandText } from "./bands";
import type { Band } from "./catalog";

/*
 * India's AQI bands for the globe and city list, from the same ruleset the
 * rest of the app uses, with their theme colours.
 */

export interface ScaleBand {
  label: string;
  /** Upper edge of the band below this one (0 for the first). */
  from: number;
  /** Upper edge of this band. */
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

export function bandFor(scale: ScaleBand[], aqi: number | null | undefined): ScaleBand | null {
  if (aqi == null || scale.length === 0) return null;
  return scale.find((b) => aqi <= b.to) ?? scale[scale.length - 1];
}

/** "51–100", or "301+" for an open-ended band. */
export function rangeLabel(b: ScaleBand): string {
  const lo = b.from === 0 ? 0 : b.from + 1;
  return b.to === Infinity ? `${lo}+` : `${lo}–${b.to}`;
}
