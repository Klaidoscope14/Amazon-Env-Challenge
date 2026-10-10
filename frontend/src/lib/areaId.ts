/** Same rule as the backend: lowercase slug, e.g. "st-ito-delhi-cpcb" or "city-delhi". */
export function isValidAreaId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,89}$/.test(value);
}
