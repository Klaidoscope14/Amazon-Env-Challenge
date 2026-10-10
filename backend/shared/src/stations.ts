import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { gunzipSync, gzipSync } from "node:zlib";
import { AQIReading } from "./types.js";
import { CITIES, City, distanceKm, matchCity, nearestCity } from "./cities.js";
import { errorFields, log } from "./observability.js";

/*
 * Live air quality from CPCB's "Real time Air Quality Index" feed on
 * data.gov.in. The feed has one row per station per pollutant; each row's
 * pollutant_avg is that pollutant's sub-index. A station's AQI is the highest
 * sub-index, computed only when at least three pollutants are reported and
 * one of them is PM2.5 or PM10 (CPCB's rule).
 *
 * A scheduled job stores the whole parsed feed as one compressed snapshot
 * item, so each API request needs a single read to find the nearest station.
 */

const CPCB_URL = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69";
const PAGE_SIZE = 1000;
const MAX_PAGES = 8;
const PAGE_TIMEOUT_MS = 8000;
const SNAPSHOT_KEY = { PK: "STATIONS", SK: "LATEST" };
const MEMORY_CACHE_MS = 5 * 60 * 1000;
export const SNAPSHOT_MAX_AGE_MS = 45 * 60 * 1000;
const READING_TTL_SECONDS = 8 * 24 * 3600;
const CITY_RADIUS_KM = 75;

export interface Station {
  id: string;
  name: string;
  city: string;
  state: string;
  lat?: number;
  lon?: number;
  /** Source observation time, ISO UTC. */
  lastUpdate: string | null;
  aqi: number | null;
  dominantPollutant: string | null;
  subIndices: Record<string, number>;
}

export interface StationSnapshot {
  fetchedAt: string;
  stations: Station[];
}

export interface Area {
  id: string;
  kind: "station" | "city" | "geo";
  name: string;
  city: string;
  state: string;
  distanceKm?: number;
}

const POLLUTANT_KEYS: Record<string, string> = {
  "pm2.5": "pm25",
  pm25: "pm25",
  pm10: "pm10",
  no2: "no2",
  so2: "so2",
  co: "co",
  ozone: "o3",
  o3: "o3",
  nh3: "nh3",
  pb: "pb",
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function pick(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() && value.trim().toUpperCase() !== "NA") {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * CPCB publishes "dd-mm-yyyy HH:MM:SS" in India Standard Time. Parsed
 * explicitly: `new Date()` would read it as mm-dd and in the server's zone.
 */
export function parseCpcbTime(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const [d, m, y, h, min, s] = match.slice(1).map((part) => Number(part ?? 0));
    // Reject impossible values (e.g. 31-02 or 25:00) that Date.UTC would roll over.
    const day = new Date(Date.UTC(y, m - 1, d));
    if (
      day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d ||
      h > 23 || min > 59 || s > 59
    ) {
      return null;
    }
    return new Date(Date.UTC(y, m - 1, d, h, min, s) - 5.5 * 3600 * 1000).toISOString();
  }
  const iso = new Date(value);
  return Number.isFinite(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(value) ? iso.toISOString() : null;
}

export function parseCpcbRecords(records: Record<string, unknown>[]): Station[] {
  const byStation = new Map<string, Station>();

  for (const record of records) {
    const name = pick(record, "station");
    if (!name) continue;
    const id = `st-${slug(name)}`;

    let station = byStation.get(id);
    if (!station) {
      const lat = toNumber(pick(record, "latitude", "lat"));
      const lon = toNumber(pick(record, "longitude", "lon", "long"));
      const validCoords =
        lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
      station = {
        id,
        name,
        city: pick(record, "city") ?? "",
        state: pick(record, "state") ?? "",
        ...(validCoords ? { lat, lon } : {}),
        lastUpdate: null,
        aqi: null,
        dominantPollutant: null,
        subIndices: {},
      };
      byStation.set(id, station);
    }

    const updated = parseCpcbTime(pick(record, "last_update", "lastupdate"));
    if (updated && (!station.lastUpdate || updated > station.lastUpdate)) {
      station.lastUpdate = updated;
    }

    const pollutant = POLLUTANT_KEYS[(pick(record, "pollutant_id") ?? "").toLowerCase()];
    const value = toNumber(pick(record, "pollutant_avg", "avg_value"));
    if (pollutant && value !== undefined && value >= 0) {
      station.subIndices[pollutant] = value;
    }
  }

  for (const station of byStation.values()) {
    const entries = Object.entries(station.subIndices);
    const hasPm = "pm25" in station.subIndices || "pm10" in station.subIndices;
    if (entries.length >= 3 && hasPm) {
      const [dominant, value] = entries.reduce((max, e) => (e[1] > max[1] ? e : max));
      station.aqi = Math.round(value);
      station.dominantPollutant = dominant;
    }
  }

  return [...byStation.values()];
}

async function fetchCpcbRecords(apiKey: string): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(CPCB_URL);
    url.searchParams.set("api-key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(page * PAGE_SIZE));

    const response = await fetch(url, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`CPCB API returned HTTP ${response.status}`);
    const data = (await response.json()) as { records?: Record<string, unknown>[]; total?: number | string };
    const batch = data.records ?? [];
    records.push(...batch);

    const total = Number(data.total);
    if (batch.length < PAGE_SIZE || (Number.isFinite(total) && records.length >= total)) break;
  }
  return records;
}

/** Fetches and parses the full CPCB feed. Logs field names and counts, never values. */
export async function fetchStationSnapshot(apiKey: string): Promise<StationSnapshot> {
  const records = await fetchCpcbRecords(apiKey);
  const stations = parseCpcbRecords(records);
  console.log(
    JSON.stringify({
      event: "cpcb_refresh",
      records: records.length,
      fields: Object.keys(records[0] ?? {}),
      stations: stations.length,
      withCoords: stations.filter((s) => s.lat !== undefined).length,
      withAqi: stations.filter((s) => s.aqi !== null).length,
    })
  );
  if (stations.length === 0) throw new Error("CPCB feed contained no stations");
  return { fetchedAt: new Date().toISOString(), stations };
}

export async function loadSnapshot(
  dynamodb: DynamoDBClient,
  table: string
): Promise<StationSnapshot | null> {
  const result = await dynamodb.send(
    new GetItemCommand({ TableName: table, Key: marshall(SNAPSHOT_KEY) })
  );
  if (!result.Item) return null;
  const item = unmarshall(result.Item) as { data: Uint8Array; fetchedAt: string };
  const stations = JSON.parse(gunzipSync(Buffer.from(item.data)).toString("utf8")) as Station[];
  return { fetchedAt: item.fetchedAt, stations };
}

export async function saveSnapshot(
  dynamodb: DynamoDBClient,
  table: string,
  snapshot: StationSnapshot
): Promise<void> {
  const data = gzipSync(Buffer.from(JSON.stringify(snapshot.stations)));
  await dynamodb.send(
    new PutItemCommand({
      TableName: table,
      Item: marshall({ ...SNAPSHOT_KEY, fetchedAt: snapshot.fetchedAt, data }),
    })
  );
}

let memory: { snapshot: StationSnapshot; at: number } | null = null;
let refreshing: Promise<StationSnapshot | null> | null = null;
let lastInlineRefresh = 0;
const INLINE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Current station snapshot: memory (5 min) -> stored snapshot. Refreshing is
 * the scheduled job's work; a request only fetches CPCB itself when no
 * snapshot exists yet (first run), at most once per 10 minutes per container,
 * so a CPCB outage can't make every request slow. An old snapshot is still
 * served — readings are then labelled "cached" and carry their own source
 * timestamps, so staleness stays visible. Returns null only when nothing is
 * available.
 */
export async function getStationSnapshot(
  dynamodb: DynamoDBClient,
  table: string,
  apiKey: string | undefined
): Promise<StationSnapshot | null> {
  if (memory && Date.now() - memory.at < MEMORY_CACHE_MS) return memory.snapshot;

  let snapshot = await loadSnapshot(dynamodb, table).catch((err) => {
    log("error", "station_snapshot_load_failed", errorFields(err));
    return null;
  });

  if (!snapshot && apiKey && Date.now() - lastInlineRefresh > INLINE_REFRESH_INTERVAL_MS) {
    lastInlineRefresh = Date.now();
    refreshing ??= refreshSnapshot(dynamodb, table, apiKey).finally(() => {
      refreshing = null;
    });
    snapshot = await refreshing;
  }

  if (snapshot) memory = { snapshot, at: Date.now() };
  return snapshot;
}

export async function refreshSnapshot(
  dynamodb: DynamoDBClient,
  table: string,
  apiKey: string
): Promise<StationSnapshot | null> {
  try {
    const snapshot = await fetchStationSnapshot(apiKey);
    await saveSnapshot(dynamodb, table, snapshot);
    memory = { snapshot, at: Date.now() };
    return snapshot;
  } catch (err) {
    // fetch() reports network/TLS problems as "fetch failed"; the cause says which.
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
    console.error(
      JSON.stringify({
        event: "cpcb_refresh_failed",
        message: (err as Error).message,
        causeCode: cause?.code,
        causeMessage: cause?.message,
      })
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Areas: the unit everything (readings, alerts, notices) is keyed by.
//   st-<station>  a CPCB monitoring station (when CPCB data is current)
//   city-<city>   a city from the built-in table
//   geo-<lat>-<lon> a ~11 km grid cell around the user (0.1° rounding), so any
//                 location in India has an area even without a nearby station
// ---------------------------------------------------------------------------

/** CPCB readings older than this are not used; Open-Meteo is used instead. */
const STATION_FRESH_MS = 3 * 60 * 60 * 1000;
const NEAREST_STATION_KM = 15;
const GEO_NAME_RADIUS_KM = 150;
const INDIA_BOUNDS = { minLat: 5, maxLat: 38, minLon: 67, maxLon: 99 };

function isFresh(station: Station, now = Date.now()): boolean {
  return (
    station.aqi !== null &&
    !!station.lastUpdate &&
    now - new Date(station.lastUpdate).getTime() <= STATION_FRESH_MS
  );
}

function stationArea(station: Station, km?: number): Area {
  return {
    id: station.id,
    kind: "station",
    name: station.name,
    city: station.city,
    state: station.state,
    ...(km !== undefined ? { distanceKm: Math.round(km * 10) / 10 } : {}),
  };
}

function cityArea(city: City, km?: number): Area {
  return {
    id: `city-${city.id}`,
    kind: "city",
    name: city.name,
    city: city.name,
    state: city.state,
    ...(km !== undefined ? { distanceKm: Math.round(km * 10) / 10 } : {}),
  };
}

/** Grid cell id for a location: 0.1° cells, e.g. 28.75,77.12 -> "geo-288-771". */
export function geoAreaId(lat: number, lon: number): string {
  return `geo-${Math.round(lat * 10)}-${Math.round(lon * 10)}`;
}

function parseGeoId(id: string): { lat: number; lon: number } | null {
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
  };
}

/** Selectable areas: stations with current CPCB data, then every city. */
export function listAreas(snapshot: StationSnapshot | null): Area[] {
  const stations = (snapshot?.stations ?? [])
    .filter((s) => isFresh(s))
    .map((s) => stationArea(s))
    .sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  return [...stations, ...CITIES.map((c) => cityArea(c))];
}

/**
 * Area for a location. Live mode: a CPCB station with current data within
 * 15 km, otherwise the location's grid cell (any location in India works).
 * Demo mode (no live data source): the nearest city.
 */
export function findNearestArea(
  snapshot: StationSnapshot | null,
  lat: number,
  lon: number,
  live = true
): Area | null {
  let best: { station: Station; km: number } | null = null;
  for (const station of snapshot?.stations ?? []) {
    if (station.lat === undefined || station.lon === undefined || !isFresh(station)) continue;
    const km = distanceKm(lat, lon, station.lat, station.lon);
    if (km <= NEAREST_STATION_KM && (!best || km < best.km)) best = { station, km };
  }
  if (best) return stationArea(best.station, best.km);

  if (live) {
    const id = geoAreaId(lat, lon);
    const cell = parseGeoId(id);
    return cell ? geoArea(id, cell.lat, cell.lon) : null;
  }
  const near = nearestCity(lat, lon, CITY_RADIUS_KM);
  return near ? cityArea(near.city, near.km) : null;
}

export function resolveArea(snapshot: StationSnapshot | null, id: string): Area | null {
  if (id.startsWith("city-")) {
    const city = CITIES.find((c) => `city-${c.id}` === id);
    return city ? cityArea(city) : null;
  }
  if (id.startsWith("geo-")) {
    const cell = parseGeoId(id);
    return cell ? geoArea(id, cell.lat, cell.lon) : null;
  }
  const station = snapshot?.stations.find((s) => s.id === id);
  return station ? stationArea(station) : null;
}

/** Coordinates used to fetch Open-Meteo data for an area. */
export function areaCoordinates(
  snapshot: StationSnapshot | null,
  area: Area
): { lat: number; lon: number } | null {
  if (area.kind === "geo") return parseGeoId(area.id);
  if (area.kind === "city") {
    const city = CITIES.find((c) => `city-${c.id}` === area.id);
    return city ? { lat: city.lat, lon: city.lon } : null;
  }
  const station = snapshot?.stations.find((s) => s.id === area.id);
  return station?.lat !== undefined && station.lon !== undefined
    ? { lat: station.lat, lon: station.lon }
    : null;
}

/**
 * The station that provides measured readings for an area, if its data is
 * current: the station itself, a station in the city, or (for a grid cell)
 * the nearest station within 15 km.
 */
function stationForArea(snapshot: StationSnapshot, area: Area): Station | undefined {
  const fresh = snapshot.stations.filter((s) => isFresh(s));
  if (area.kind === "station") return fresh.find((s) => s.id === area.id);
  if (area.kind === "city") {
    const cityId = area.id.slice("city-".length);
    return fresh
      .filter((s) => matchCity(s.city)?.id === cityId)
      .sort((a, b) => a.name.localeCompare(b.name))[0];
  }
  const cell = parseGeoId(area.id);
  if (!cell) return undefined;
  let best: { station: Station; km: number } | undefined;
  for (const s of fresh) {
    if (s.lat === undefined || s.lon === undefined) continue;
    const km = distanceKm(cell.lat, cell.lon, s.lat, s.lon);
    if (km <= NEAREST_STATION_KM && (!best || km < best.km)) best = { station: s, km };
  }
  return best?.station;
}

/** Measured CPCB reading for an area, only when the station's data is current. */
export function stationReading(
  snapshot: StationSnapshot,
  area: Area
): AQIReading | null {
  const station = stationForArea(snapshot, area);
  if (!station || station.aqi === null || !station.lastUpdate || !station.dominantPollutant) {
    return null;
  }
  const snapshotAge = Date.now() - new Date(snapshot.fetchedAt).getTime();
  return {
    campus: area.id,
    aqi: station.aqi,
    dominantPollutant: station.dominantPollutant,
    pollutants: { ...station.subIndices },
    pollutantScale: "subindex",
    source: "CPCB",
    stationName: station.name,
    timestamp: station.lastUpdate,
    fetchedAt: snapshot.fetchedAt,
    dataMode: snapshotAge > SNAPSHOT_MAX_AGE_MS ? "cached" : "live",
  };
}

/**
 * Stores a reading for trends, keyed by its source observation time so the
 * same hourly CPCB value is only stored once however often it is requested.
 */
/** Stores a reading once per source timestamp; true when this call stored it. */
export async function persistReading(
  dynamodb: DynamoDBClient,
  table: string,
  reading: AQIReading
): Promise<boolean> {
  try {
    await dynamodb.send(
      new PutItemCommand({
        TableName: table,
        Item: marshall(
          {
            PK: `CAMPUS#${reading.campus}`,
            SK: `READING#${reading.timestamp}`,
            ...reading,
            TTL: Math.floor(Date.now() / 1000) + READING_TTL_SECONDS,
          },
          { removeUndefinedValues: true }
        ),
        ConditionExpression: "attribute_not_exists(PK)",
      })
    );
    return true;
  } catch (err) {
    if (!(err instanceof ConditionalCheckFailedException)) {
      log("error", "reading_store_failed", errorFields(err));
    }
    return false;
  }
}
