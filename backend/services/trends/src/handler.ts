import {
  DynamoDBClient,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AQIReading, TrendPoint, TrendResponse } from "../../../shared/src/types.js";
import { buildDemoTrend, isDemoScenario } from "../../../shared/src/demo.js";

const dynamodb = new DynamoDBClient({});
const AQI_TABLE_NAME = process.env.AQI_TABLE_NAME!;
const DATA_MODE = process.env.DATA_MODE || "demo";
const MAX_HOURS = 168;

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const campus = event.queryStringParameters?.campus || "dtu-delhi";
  const scenario = event.queryStringParameters?.scenario;
  const requested = Number.parseInt(event.queryStringParameters?.hours || "24", 10);
  if (!Number.isFinite(requested) || requested < 1) {
    return respond(400, { error: "hours must be a positive integer" });
  }
  const hours = Math.min(requested, MAX_HOURS);

  if (DATA_MODE === "demo") {
    if (scenario && !isDemoScenario(scenario)) {
      return respond(400, { error: `Unknown demo scenario: ${scenario}` });
    }
    const response: TrendResponse = {
      campus,
      points: buildDemoTrend(scenario, hours),
      period: `${hours}h`,
      dataMode: "demo",
    };
    return respond(200, response);
  }

  try {
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

function respond(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(body),
  };
}
