import type { AQIStatus } from "./types";

/*
 * AQI band colours come from CSS variables (--band-*, --band-*-text) so they
 * re-tune per theme: vivid fills on the night canvas, deeper ones on light.
 */

function key(status: AQIStatus): string {
  return status.toLowerCase().replace(/\s+/g, "-");
}

/** Fill colour for marks (bars, dots, arcs) of a band. */
export function bandFill(status: AQIStatus): string {
  return `var(--band-${key(status)})`;
}

/** Legible text colour for a band on the current surface. */
export function bandText(status: AQIStatus): string {
  return `var(--band-${key(status)}-text)`;
}

/** Text colour that is legible when drawn on the band's fill. */
export function bandInk(status: AQIStatus): string {
  return `var(--band-${key(status)}-ink)`;
}

/** The band a number falls in, given the active bands (null until they load). */
export function statusIn(
  bands: { status: AQIStatus; from: number; to: number }[],
  aqi: number
): AQIStatus | null {
  if (bands.length === 0) return null;
  const hit = bands.find((b) => aqi <= b.to);
  return (hit ?? bands[bands.length - 1]).status;
}
