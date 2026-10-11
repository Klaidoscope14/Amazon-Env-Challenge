import { AQIReading } from "./types.js";
import { CITIES, City, nearestCity } from "./cities.js";

/*
 * Areas: the unit everything (readings, alerts, notices) is keyed by.
 *   city-<city>      a city from the built-in table (area picker)
 *   geo-<lat>-<lon>  a ~11 km grid cell around the user (0.1° rounding), so
 *                    any location in India has an area
 */

export interface Area {
  id: string;
  kind: "city" | "geo";
  name: string;
  city: string;
  state: string;
  distanceKm?: number;
  lat: number;
  lon: number;
}

const GEO_NAME_RADIUS_KM = 150;
const CITY_RADIUS_KM = 75;
export const INDIA_BOUNDS = { minLat: 5, maxLat: 38, minLon: 67, maxLon: 99 };

function cityArea(city: City, km?: number): Area {
  return {
    id: `city-${city.id}`,
    kind: "city",
    name: city.name,
    city: city.name,
    state: city.state,
    lat: city.lat,
    lon: city.lon,
    ...(km !== undefined ? { distanceKm: Math.round(km * 10) / 10 } : {}),
  };
}

/** Grid cell id for a location: 0.1° cells, e.g. 28.75,77.12 -> "geo-288-771". */
export function geoAreaId(lat: number, lon: number): string {
  return `geo-${Math.round(lat * 10)}-${Math.round(lon * 10)}`;
}

export function parseGeoId(id: string): { lat: number; lon: number } | null {
  const match = id.match(/^geo-(\d{2,3})-(\d{2,3})$/);
  if (!match) return null;
  const lat = Number(match[1]) / 10;
  const lon = Number(match[2]) / 10;
  const b = INDIA_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon ? { lat, lon } : null;
}

function geoArea(id: string, lat: number, lon: number): Area {
  const near = nearestCity(lat, lon, GEO_NAME_RADIUS_KM);
  return {
    id,
    kind: "geo",
    name: near ? `${near.city.name} area` : `Area near ${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E`,
    city: near?.city.name ?? "",
    state: near?.city.state ?? "",
    lat,
    lon,
  };
}

/** Selectable areas: every city in the table. */
export function listAreas(): Area[] {
  return CITIES.map((c) => cityArea(c));
}

/**
 * Area for a location. Live mode: the location's grid cell (any point in
 * India). Demo mode: the nearest city, so sample values carry a city name.
 */
export function findNearestArea(lat: number, lon: number, live = true): Area | null {
  if (live) {
    const id = geoAreaId(lat, lon);
    const cell = parseGeoId(id);
    return cell ? geoArea(id, cell.lat, cell.lon) : null;
  }
  const near = nearestCity(lat, lon, CITY_RADIUS_KM);
  return near ? cityArea(near.city, near.km) : null;
}

export function resolveArea(id: string): Area | null {
  if (id.startsWith("city-")) {
    const city = CITIES.find((c) => `city-${c.id}` === id);
    return city ? cityArea(city) : null;
  }
  if (id.startsWith("geo-")) {
    const cell = parseGeoId(id);
    return cell ? geoArea(id, cell.lat, cell.lon) : null;
  }
  return null;
}

/** Coordinates used to look up air quality for an area. */
export function areaCoordinates(area: Area): { lat: number; lon: number } | null {
  return Number.isFinite(area.lat) && Number.isFinite(area.lon) ? { lat: area.lat, lon: area.lon } : null;
}

/** Name to show for where a reading applies (strips the demo suffix). */
export function readingPlaceName(reading: AQIReading): string {
  return reading.stationName.replace(/ \(sample values\)$/, "");
}
