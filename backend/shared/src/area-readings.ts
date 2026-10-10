import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { AQIReading, TrendPoint } from "./types.js";
import { fetchDemoReading } from "./demo.js";
import { Area, areaCoordinates, readingPlaceName, resolveArea } from "./areas.js";
import { getGoogleReading, getGoogleTrend, GOOGLE_SOURCE } from "./google-aq.js";
import { getLatestReading, getReadingBefore, persistReading } from "./readings.js";
import { getThresholdForAqi } from "./aqi-categories.js";
import { getActiveRuleset } from "./rules.js";
import { BreatheSafeEvent, eventBusFromEnv, publishEvents, ReadingEventDetail } from "./events.js";

export interface DataContext {
  /** "live": Google Air Quality API. "demo": labelled fixtures for every request. */
  dataMode: string;
  /** In live mode, allow presenter requests with ?scenario= to use fixtures. */
  demoScenariosEnabled: boolean;
  aqiTable: string;
}

export function dataContextFromEnv(): DataContext {
  return {
    dataMode: process.env.DATA_MODE || "demo",
    demoScenariosEnabled: process.env.DEMO_SCENARIOS_ENABLED !== "false",
    aqiTable: process.env.AQI_TABLE_NAME!,
  };
}

/** Area ids are slugs: "geo-<lat>-<lon>", "city-<city>" (and legacy ids on old alerts). */
export function isAreaId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,89}$/.test(value);
}

/** Display name for where a reading applies: the area's name, else the reading's place without the demo suffix. */
export function areaDisplayName(
  area: Area | null,
  reading: AQIReading | null,
  fallback: string
): string {
  return area?.name ?? (reading ? readingPlaceName(reading) : fallback);
}

/** True when this request should be served from labelled demo fixtures. */
export function usesDemo(ctx: DataContext, scenario?: string): boolean {
  return ctx.dataMode !== "live" || (!!scenario && ctx.demoScenariosEnabled);
}

export interface AreaReading {
  /** null when the area id is not known */
  area: Area | null;
  /** null when no valid reading is available for a known area */
  reading: AQIReading | null;
}

/** A stored Google reading younger than this is reused instead of calling the API. */
const REUSE_STORED_MS = 30 * 60 * 1000;
/** Without a fresh reading, the last stored one is shown (labelled cached) for this long. */
const CACHED_FALLBACK_MS = 3 * 60 * 60 * 1000;

/**
 * The current reading for an area. Demo/presenter requests get a labelled
 * fixture named after the area. Live requests use the Google Air Quality API
 * (India's National AQI for the area's location); a reading stored in the
 * last 30 minutes is reused, which keeps API calls (and cost) low across
 * Lambda containers. New readings are stored once per source timestamp.
 */
export async function getAreaReading(
  dynamodb: DynamoDBClient,
  ctx: DataContext,
  areaId: string,
  scenario?: string
): Promise<AreaReading> {
  const area = resolveArea(areaId);

  if (usesDemo(ctx, scenario)) {
    return { area, reading: fetchDemoReading(areaId, scenario, area?.name) };
  }
  if (!area) return { area: null, reading: null };

  const last = await getLatestReading(dynamodb, ctx.aqiTable, area.id).catch(() => null);
  if (
    last &&
    last.source === GOOGLE_SOURCE &&
    last.dataMode === "live" &&
    Date.now() - new Date(last.fetchedAt).getTime() < REUSE_STORED_MS
  ) {
    return { area, reading: last };
  }

  const coords = areaCoordinates(area);
  const reading = coords ? await getGoogleReading(area.id, { ...coords, name: area.name }) : null;
  if (reading) {
    if (await persistReading(dynamodb, ctx.aqiTable, reading)) {
      await announceReading(dynamodb, ctx, area, reading);
    }
    return { area, reading };
  }

  // Source unavailable right now: fall back to this area's last stored
  // reading if it is recent, clearly labelled as cached.
  const recent =
    last && last.dataMode !== "demo" && Date.now() - new Date(last.timestamp).getTime() <= CACHED_FALLBACK_MS;
  return { area, reading: recent ? { ...last, dataMode: "cached" } : null };
}

/**
 * Emits aqi.reading.received for a newly stored reading, plus
 * aqi.threshold.crossed when its category differs from the area's previous
 * stored reading. Never throws: events must not break the request.
 */
async function announceReading(
  dynamodb: DynamoDBClient,
  ctx: DataContext,
  area: Area,
  reading: AQIReading
): Promise<void> {
  const bus = eventBusFromEnv();
  if (!bus) return;
  try {
    const { thresholds } = await getActiveRuleset(dynamodb);
    const band = getThresholdForAqi(reading.aqi, thresholds);
    if (!band) return;

    const detail: ReadingEventDetail = {
      area: area.id,
      areaName: area.name,
      aqi: reading.aqi,
      status: band.status,
      dominantPollutant: reading.dominantPollutant,
      source: reading.source,
      timestamp: reading.timestamp,
    };
    const events: BreatheSafeEvent[] = [{ source: "breathesafe.aqi", type: "aqi.reading.received", detail }];

    const previous = await getReadingBefore(dynamodb, ctx.aqiTable, area.id, reading.timestamp);
    const previousBand = previous ? getThresholdForAqi(previous.aqi, thresholds) : null;
    if (previous && previousBand && previousBand.status !== band.status) {
      events.push({
        source: "breathesafe.aqi",
        type: "aqi.threshold.crossed",
        detail: {
          ...detail,
          previousStatus: previousBand.status,
          previousAqi: previous.aqi,
          previousTimestamp: previous.timestamp,
          direction: band.statusLevel > previousBand.statusLevel ? "worse" : "better",
        },
      });
    }
    await publishEvents(events, bus);
  } catch (err) {
    console.error(JSON.stringify({ event: "reading_event_failed", error: (err as Error).name }));
  }
}

/**
 * Hourly trend for an area from Google's history (one call per area per hour,
 * sliced for every window); null means "use stored readings instead".
 */
export async function getAreaTrend(
  ctx: DataContext,
  areaId: string,
  hours: number
): Promise<TrendPoint[] | null> {
  if (ctx.dataMode !== "live") return null;
  const area = resolveArea(areaId);
  const coords = area ? areaCoordinates(area) : null;
  return coords ? getGoogleTrend(areaId, coords, hours) : null;
}
