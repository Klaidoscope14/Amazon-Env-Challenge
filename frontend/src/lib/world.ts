import { distanceKm } from "./geo";

/*
 * The world's countries and their major cities, loaded on demand (about
 * 300 KB) so the rest of the dashboard isn't held up by the globe.
 *
 * Boundaries: Natural Earth 1:10m admin-0, India point-of-view version,
 * simplified. Cities: Natural Earth populated places, the largest 25 per
 * country with at least 100,000 people. Both are public domain.
 */

export interface Ring {
  n: number;
  lat: Float32Array;
  lon: Float32Array;
  /** Precomputed so each frame needs no trigonometry per vertex. */
  sinPhi: Float32Array;
  cosPhi: Float32Array;
  sinLam: Float32Array;
  cosLam: Float32Array;
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
}

export interface Country {
  a3: string;
  name: string;
  rings: Ring[];
}

export interface City {
  name: string;
  lat: number;
  lon: number;
  /** Population in thousands. */
  popK: number;
  capital: boolean;
}

export interface World {
  countries: Country[];
  cities: Record<string, City[]>;
  nameOf: (a3: string) => string;
}

type RawCountry = { a: string; n: string; r: number[][] };
type RawCities = Record<string, [string, number, number, number, number][]>;

let loading: Promise<World> | null = null;

export function loadWorld(): Promise<World> {
  loading ??= Promise.all([
    import("./data/world-countries.json"),
    import("./data/world-cities.json"),
  ]).then(([c, k]) => {
    const raw = ((c as { default?: unknown }).default ?? c) as RawCountry[];
    const rawCities = ((k as { default?: unknown }).default ?? k) as RawCities;

    const countries: Country[] = raw.map((rc) => ({
      a3: rc.a,
      name: rc.n,
      rings: rc.r.map((flat) => {
        const n = flat.length / 2;
        const lat = new Float32Array(n);
        const lon = new Float32Array(n);
        const sinPhi = new Float32Array(n);
        const cosPhi = new Float32Array(n);
        const sinLam = new Float32Array(n);
        const cosLam = new Float32Array(n);
        let minLon = 999, minLat = 999, maxLon = -999, maxLat = -999;
        for (let i = 0; i < n; i++) {
          const lo = flat[2 * i] / 100;
          const la = flat[2 * i + 1] / 100;
          lon[i] = lo;
          lat[i] = la;
          sinPhi[i] = Math.sin((la * Math.PI) / 180);
          cosPhi[i] = Math.cos((la * Math.PI) / 180);
          sinLam[i] = Math.sin((lo * Math.PI) / 180);
          cosLam[i] = Math.cos((lo * Math.PI) / 180);
          if (lo < minLon) minLon = lo;
          if (lo > maxLon) maxLon = lo;
          if (la < minLat) minLat = la;
          if (la > maxLat) maxLat = la;
        }
        const bbox: Ring["bbox"] = [minLon, minLat, maxLon, maxLat];
        return { n, lat, lon, sinPhi, cosPhi, sinLam, cosLam, bbox };
      }),
    }));

    const cities: Record<string, City[]> = {};
    for (const [a3, list] of Object.entries(rawCities)) {
      cities[a3] = list.map(([name, lat, lon, popK, cap]) => ({ name, lat, lon, popK, capital: cap === 1 }));
    }
    const names = new Map(countries.map((c) => [c.a3, c.name]));
    return { countries, cities, nameOf: (a3: string) => names.get(a3) ?? a3 };
  });
  return loading;
}

function inRing(ring: Ring, lat: number, lon: number): boolean {
  const [minLon, minLat, maxLon, maxLat] = ring.bbox;
  if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) return false;
  let inside = false;
  for (let i = 0, j = ring.n - 1; i < ring.n; j = i++) {
    const yi = ring.lat[i], yj = ring.lat[j];
    if (yi > lat !== yj > lat) {
      const xi = ring.lon[i], xj = ring.lon[j];
      if (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** The country containing a point, if it is on land we have a boundary for. */
export function countryAt(world: World, lat: number, lon: number): Country | null {
  let wrapped = lon;
  while (wrapped > 180) wrapped -= 360;
  while (wrapped < -180) wrapped += 360;
  for (const c of world.countries) {
    for (const r of c.rings) if (inRing(r, lat, wrapped)) return c;
  }
  return null;
}

/** The country whose land is closest to a point (used when the centre is over water). */
export function nearestCountry(world: World, lat: number, lon: number): Country | null {
  let best: { c: Country; km: number } | null = null;
  for (const c of world.countries) {
    for (const r of c.rings) {
      const clat = (r.bbox[1] + r.bbox[3]) / 2;
      const clon = (r.bbox[0] + r.bbox[2]) / 2;
      const km = distanceKm([lat, lon], [clat, clon]);
      if (!best || km < best.km) best = { c, km };
    }
  }
  return best && best.km < 2500 ? best.c : null;
}
