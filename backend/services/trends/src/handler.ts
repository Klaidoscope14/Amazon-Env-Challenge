import {
  DynamoDBClient,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AQIReading, TrendPoint, TrendResponse } from "../../../shared/src/types.js";
import { buildDemoTrend } from "../../../shared/src/demo.js";
import { dataContextFromEnv, getAreaTrend, usesDemo } from "../../../shared/src/area-readings.js";
import { parse, TrendsQuerySchema, ValidationError } from "../../../shared/src/schemas.js";
import { respond } from "../../../shared/src/http.js";

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
    // Areas without a current CPCB station get Open-Meteo's hourly history.
    const modelled = await getAreaTrend(dynamodb, ctx, campus, hours);
    if (modelled) {
      const response: TrendResponse = { campus, points: modelled, period: `${hours}h`, dataMode: "live" };
      return respond(200, response);
    }

    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    const result = await dynamodb.send(
      new QueryCommand({
        TableName: AQI_TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND SK >= :cutoff",
        ExpressionAttributeValues: marshall({
          ":pk": `CAMPUS#${campus}`,
          ":cutoff": `READING#${cutoff}`,
        }),
        ScanIndexForward: true,
      })
    );

    const points: TrendPoint[] = (result.Items || []).map((item) => {
      const row = unmarshall(item) as AQIReading & { PK: string; SK: string };
      return {
        timestamp: row.timestamp,
        aqi: row.aqi,
        dominantPollutant: row.dominantPollutant,
        source: row.source,
        dataMode: row.dataMode,
      };
    });

    const response: TrendResponse = {
      campus,
      points,
      period: `${hours}h`,
      dataMode: "live",
    };

    return respond(200, response);
  } catch (err) {
    console.error("Trends handler error:", err);
    return respond(500, { error: "Internal server error" });
  }
}
