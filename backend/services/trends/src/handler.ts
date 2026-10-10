import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TrendPoint, TrendResponse } from "../../../shared/src/types.js";
import { buildDemoTrend } from "../../../shared/src/demo.js";
import { dataContextFromEnv, getAreaTrend, usesDemo } from "../../../shared/src/area-readings.js";
import { parse, TrendsQuerySchema, ValidationError } from "../../../shared/src/schemas.js";
import { respond } from "../../../shared/src/http.js";
import { getReadingsSince } from "../../../shared/src/readings.js";
import { errorFields, log } from "../../../shared/src/observability.js";

const dynamodb = new DynamoDBClient({});
const AQI_TABLE_NAME = process.env.AQI_TABLE_NAME!;
const ctx = dataContextFromEnv();

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  let query;
  try {
    query = parse(TrendsQuerySchema, event.queryStringParameters ?? {});
  } catch (err) {
    if (err instanceof ValidationError) return respond(400, { error: err.message });
    throw err;
  }
  const { campus, scenario, hours } = query;

  if (usesDemo(ctx, scenario)) {
    const response: TrendResponse = {
      campus,
      points: buildDemoTrend(scenario, hours),
      period: `${hours}h`,
      dataMode: "demo",
    };
    return respond(200, response);
  }

  try {
    // Hourly history from the Google Air Quality API; stored readings otherwise.
    const hourly = await getAreaTrend(ctx, campus, hours);
    if (hourly) {
      const response: TrendResponse = { campus, points: hourly, period: `${hours}h`, dataMode: "live" };
      return respond(200, response);
    }

    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const readings = await getReadingsSince(dynamodb, AQI_TABLE_NAME, campus, cutoff);
    const points: TrendPoint[] = readings.map((row) => ({
      timestamp: row.timestamp,
      aqi: row.aqi,
      dominantPollutant: row.dominantPollutant,
      source: row.source,
      dataMode: row.dataMode,
    }));

    const response: TrendResponse = {
      campus,
      points,
      period: `${hours}h`,
      dataMode: "live",
    };

    return respond(200, response);
  } catch (err) {
    log("error", "unhandled_error", { route: event.path, ...errorFields(err) });
    return respond(500, { error: "Internal server error" });
  }
}
