import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { AQIReading, TrendPoint } from "./types.js";
import { fetchDemoReading } from "./demo.js";
import {
  Area,
  areaCoordinates,
  getStationSnapshot,
  persistReading,
  resolveArea,
  StationSnapshot,
  stationReading,
} from "./stations.js";
import { getOpenMeteoReading, getOpenMeteoTrend } from "./open-meteo.js";

export interface DataContext {
  /** "live": CPCB stations. "demo": labelled fixtures for every request. */
  dataMode: string;
  /** In live mode, allow presenter requests with ?scenario= to use fixtures. */
  demoScenariosEnabled: boolean;
  aqiTable: string;
  cpcbApiKey?: string;
}

export function dataContextFromEnv(): DataContext {
  const key = process.env.CPCB_API_KEY;
  return {
    dataMode: process.env.DATA_MODE || "demo",
    demoScenariosEnabled: process.env.DEMO_SCENARIOS_ENABLED !== "false",
    aqiTable: process.env.AQI_TABLE_NAME!,
    cpcbApiKey: key && key !== "none" ? key : undefined,
  };
}

/** Area ids are slugs: "st-<station>", "city-<city>" (and legacy campus ids). */
export function isAreaId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,89}$/.test(value);
}

/** True when this request should be served from labelled demo fixtures. */
export function usesDemo(ctx: DataContext, scenario?: string): boolean {
  return ctx.dataMode !== "live" || (!!scenario && ctx.demoScenariosEnabled);
}

export async function loadSnapshotFor(
  dynamodb: DynamoDBClient,
  ctx: DataContext
): Promise<StationSnapshot | null> {
  return ctx.dataMode === "live"
    ? getStationSnapshot(dynamodb, ctx.aqiTable, ctx.cpcbApiKey)
    : null;
}

export interface AreaReading {
  /** null when the area id is not known (live mode) */
  area: Area | null;
  /** null when no valid reading is available for a known area */
  reading: AQIReading | null;
}

/**
 * The current reading for an area. Demo/presenter requests get a labelled
 * fixture named after the area. Live requests use a CPCB station's measured
 * reading when it is current, otherwise Open-Meteo data for the area's
 * location. Live readings are stored (once per source timestamp) for trends.
 */
export async function getAreaReading(
  dynamodb: DynamoDBClient,
  ctx: DataContext,
  areaId: string,
  scenario?: string
): Promise<AreaReading> {
  const snapshot = await loadSnapshotFor(dynamodb, ctx);
  const area = resolveArea(snapshot, areaId);

  if (usesDemo(ctx, scenario)) {
    return { area, reading: fetchDemoReading(areaId, scenario, area?.name) };
  }
  if (!area) return { area: null, reading: null };

  let reading = snapshot ? stationReading(snapshot, area) : null;
  if (!reading) {
    const coords = areaCoordinates(snapshot, area);
    reading = coords ? await getOpenMeteoReading(area.id, { ...coords, name: area.name }) : null;
  }
  if (reading) await persistReading(dynamodb, ctx.aqiTable, reading);
  return { area, reading };
}

/**
 * Live trend from Open-Meteo's hourly history when the area has no current
 * CPCB station; null means "use stored readings instead".
 */
export async function getAreaTrend(
  dynamodb: DynamoDBClient,
  ctx: DataContext,
  areaId: string,
  hours: number
): Promise<TrendPoint[] | null> {
  const snapshot = await loadSnapshotFor(dynamodb, ctx);
  const area = resolveArea(snapshot, areaId);
  if (!area) return null;
  if (snapshot && stationReading(snapshot, area)) return null;
  const coords = areaCoordinates(snapshot, area);
  return coords ? getOpenMeteoTrend(coords, hours) : null;
}
