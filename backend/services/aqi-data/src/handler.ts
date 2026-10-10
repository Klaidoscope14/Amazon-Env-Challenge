import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AQIReading, AQIReadingResponse } from "../../../shared/src/types.js";
import { getThresholdForAqi } from "../../../shared/src/aqi-categories.js";
import { isDemoScenario } from "../../../shared/src/demo.js";
import { Area, findNearestArea, listAreas } from "../../../shared/src/stations.js";
import {
  dataContextFromEnv,
  getAreaReading,
  isAreaId,
  loadSnapshotFor,
  usesDemo,
} from "../../../shared/src/area-readings.js";

const dynamodb = new DynamoDBClient({});
const ctx = dataContextFromEnv();

// Rough bounding box for India; requests outside it get the area picker.
const LAT_RANGE = [5, 38];
const LON_RANGE = [67, 99];

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (event.path.endsWith("/areas/nearest")) return await handleNearest(event);
    if (event.path.endsWith("/areas")) return await handleListAreas();
    return await handleCurrent(event);
  } catch (err) {
    console.error("AQI handler error:", err);
    return respond(500, { error: "Internal server error" });
  }
}

async function handleCurrent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const qs = event.queryStringParameters ?? {};
  const areaId = qs.campus;
  const scenario = qs.scenario || undefined;

  if (!isAreaId(areaId)) {
    return respond(400, { error: "campus (area id) is required" });
  }
  if (scenario && !isDemoScenario(scenario)) {
    return respond(400, { error: `Unknown demo scenario: ${scenario}` });
  }

  const { area, reading } = await getAreaReading(dynamodb, ctx, areaId, scenario);
  if (!reading) {
    return area || usesDemo(ctx, scenario)
      ? respond(503, {
          error: "No AQI data available",
          message: "The monitoring station has no valid reading right now. Check official CPCB sources.",
          dataMode: "unavailable",
        })
      : respond(404, { error: `Unknown area: ${areaId}` });
  }
  return respond(200, withStatus(reading, area));
}

async function handleListAreas(): Promise<APIGatewayProxyResult> {
  const snapshot = await loadSnapshotFor(dynamodb, ctx);
  return respond(200, {
    areas: listAreas(snapshot),
    source: snapshot ? "cpcb" : "cities",
  });
}

async function handleNearest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const lat = Number(event.queryStringParameters?.lat);
  const lon = Number(event.queryStringParameters?.lon);
  if (
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    lat < LAT_RANGE[0] || lat > LAT_RANGE[1] || lon < LON_RANGE[0] || lon > LON_RANGE[1]
  ) {
    return respond(400, { error: "lat/lon must be a location in India" });
  }

  // Coordinates are used only for this lookup; they are never logged or stored.
  const snapshot = await loadSnapshotFor(dynamodb, ctx);
  const area = findNearestArea(snapshot, lat, lon, ctx.dataMode === "live");
  return area
    ? respond(200, { area })
    : respond(404, { error: "No monitoring station found near this location" });
}

// Status comes from the shared rules engine so the dashboard never derives
// its own (possibly different) category from the raw number.
function withStatus(reading: AQIReading, area: Area | null): AQIReadingResponse {
  const threshold = getThresholdForAqi(reading.aqi);
  return {
    ...reading,
    status: threshold?.status ?? "Unavailable",
    statusLevel: threshold?.statusLevel ?? 0,
    ...(area ? { area } : {}),
  };
}

// `timestamp` in a reading is the source's observation time; responses must
// not overwrite it, or staleness can never be detected.
function respond(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(body),
  };
}
