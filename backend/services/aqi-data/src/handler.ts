import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AQIReading } from "../../../shared/src/types.js";
import { fetchFromCPCB } from "./providers/cpcb.js";
import { fetchFromOpenAQ } from "./providers/openaq.js";
import { fetchDemoReading } from "./providers/demo.js";

const dynamodb = new DynamoDBClient({});
const TABLE_NAME = process.env.AQI_TABLE_NAME!;
const DATA_MODE = process.env.DATA_MODE || "demo";
const CPCB_API_KEY = process.env.CPCB_API_KEY || "";
const CACHE_FRESH_MS = 5 * 60 * 1000;

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const campus = event.queryStringParameters?.campus || "dtu-delhi";
  const scenario = event.queryStringParameters?.scenario;

  try {
    let reading: AQIReading | null = null;

    if (DATA_MODE === "demo") {
      reading = fetchDemoReading(campus, scenario || undefined);
      await cacheReading(reading);
    } else {
      reading = await getCachedReading(campus);

      if (reading && !isCacheStale(reading.fetchedAt)) {
        reading.dataMode = "cached";
        return respond(200, reading);
      }

      reading = await fetchFromCPCB(campus, CPCB_API_KEY);
      if (!reading) {
        reading = await fetchFromOpenAQ(campus);
      }

      if (reading) {
        await cacheReading(reading);
      } else {
        const cached = await getCachedReading(campus);
        if (cached) {
          cached.dataMode = "cached";
          return respond(200, cached);
        }
        return respond(503, {
          error: "No AQI data available",
          message:
            "Unable to fetch air quality data. External sources may be temporarily unavailable.",
          dataMode: "unavailable",
        });
      }
    }

    return respond(200, reading);
  } catch (err) {
    console.error("AQI handler error:", err);
    return respond(500, { error: "Internal server error" });
  }
}

async function cacheReading(reading: AQIReading): Promise<void> {
  await dynamodb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(
        {
          PK: `CAMPUS#${reading.campus}`,
          SK: `READING#${reading.fetchedAt}`,
          ...reading,
          TTL: Math.floor(Date.now() / 1000) + 48 * 3600,
        },
        { removeUndefinedValues: true }
      ),
    })
  );
}

async function getCachedReading(campus: string): Promise<AQIReading | null> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: marshall({
        ":pk": `CAMPUS#${campus}`,
        ":prefix": "READING#",
      }),
      ScanIndexForward: false,
      Limit: 1,
    })
  );

  if (!result.Items || result.Items.length === 0) return null;

  const item = unmarshall(result.Items[0]) as AQIReading & {
    PK: string;
    SK: string;
  };
  const { PK, SK, ...reading } = item;
  return reading;
}

function isCacheStale(fetchedAt: string): boolean {
  return Date.now() - new Date(fetchedAt).getTime() > CACHE_FRESH_MS;
}

function respond(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify({ ...Object(body), timestamp: new Date().toISOString() }),
  };
}
