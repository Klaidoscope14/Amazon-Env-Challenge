import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AQIReading, AQIReadingResponse, Ruleset } from "../../../shared/src/types.js";
import { getThresholdForAqi } from "../../../shared/src/aqi-categories.js";
import { Area, findNearestArea, listAreas } from "../../../shared/src/stations.js";
import { getActiveRuleset } from "../../../shared/src/rules.js";
import {
  AreaQuerySchema,
  NearestQuerySchema,
  parse,
  ValidationError,
} from "../../../shared/src/schemas.js";
import { respond } from "../../../shared/src/http.js";
import {
  dataContextFromEnv,
  getAreaReading,
  loadSnapshotFor,
  usesDemo,
} from "../../../shared/src/area-readings.js";

const dynamodb = new DynamoDBClient({});
const ctx = dataContextFromEnv();

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (event.path.endsWith("/areas/nearest")) return await handleNearest(event);
    if (event.path.endsWith("/areas")) return await handleListAreas();
    return await handleCurrent(event);
  } catch (err) {
    if (err instanceof ValidationError) return respond(400, { error: err.message });
    console.error("AQI handler error:", err);
    return respond(500, { error: "Internal server error" });
  }
}

async function handleCurrent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { campus: areaId, scenario } = parse(AreaQuerySchema, event.queryStringParameters ?? {});

  const [{ area, reading }, ruleset] = await Promise.all([
    getAreaReading(dynamodb, ctx, areaId, scenario),
    getActiveRuleset(dynamodb),
  ]);
  if (!reading) {
    return area || usesDemo(ctx, scenario)
      ? respond(503, {
          error: "No AQI data available",
          message: "The monitoring station has no valid reading right now. Check official CPCB sources.",
          dataMode: "unavailable",
        })
      : respond(404, { error: `Unknown area: ${areaId}` });
  }
  return respond(200, withStatus(reading, area, ruleset));
}

async function handleListAreas(): Promise<APIGatewayProxyResult> {
  const snapshot = await loadSnapshotFor(dynamodb, ctx);
  return respond(200, {
    areas: listAreas(snapshot),
    source: snapshot ? "cpcb" : "cities",
  });
}

async function handleNearest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { lat, lon } = parse(NearestQuerySchema, event.queryStringParameters ?? {});

  // Coordinates are used only for this lookup; they are never logged or stored.
  const snapshot = await loadSnapshotFor(dynamodb, ctx);
  const area = findNearestArea(snapshot, lat, lon, ctx.dataMode === "live");
  return area
    ? respond(200, { area })
    : respond(404, { error: "No monitoring station found near this location" });
}

// Status comes from the shared rules engine so the dashboard never derives
// its own (possibly different) category from the raw number.
function withStatus(reading: AQIReading, area: Area | null, ruleset: Ruleset): AQIReadingResponse {
  const threshold = getThresholdForAqi(reading.aqi, ruleset.thresholds);
  return {
    ...reading,
    status: threshold?.status ?? "Unavailable",
    statusLevel: threshold?.statusLevel ?? 0,
    ...(area ? { area } : {}),
  };
}
