/** Same rule as the backend: lowercase slug, e.g. "geo-288-771" or "city-delhi". */
export function isValidAreaId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,89}$/.test(value);
}
