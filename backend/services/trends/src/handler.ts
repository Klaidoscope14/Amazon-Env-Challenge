import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Ruleset, TrendPoint, TrendResponse } from "../../../shared/src/types.js";
import { getThresholdForAqi } from "../../../shared/src/aqi-categories.js";
import { getActiveRuleset } from "../../../shared/src/rules.js";
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
  const ruleset = await getActiveRuleset(dynamodb);

  if (usesDemo(ctx, scenario)) {
    const response: TrendResponse = {
      campus,
      points: withStatus(buildDemoTrend(scenario, hours), ruleset),
      period: `${hours}h`,
      dataMode: "demo",
    };
    return respond(200, response);
  }

  try {
    // Hourly history from the Google Air Quality API; stored readings otherwise.
    const hourly = await getAreaTrend(ctx, campus, hours);
    if (hourly) {
      const response: TrendResponse = { campus, points: withStatus(hourly, ruleset), period: `${hours}h`, dataMode: "live" };
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
      points: withStatus(points, ruleset),
      period: `${hours}h`,
      dataMode: "live",
    };

    return respond(200, response);
  } catch (err) {
    log("error", "unhandled_error", { route: event.path, ...errorFields(err) });
    return respond(500, { error: "Internal server error" });
  }
}

/** Each point's category under the active ruleset, so clients never re-derive it. */
function withStatus(points: TrendPoint[], ruleset: Ruleset): TrendPoint[] {
  return points.map((point) => ({
    ...point,
    status: getThresholdForAqi(point.aqi, ruleset.thresholds)?.status ?? "Unavailable",
  }));
}
