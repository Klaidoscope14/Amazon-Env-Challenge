import {
  DynamoDBClient,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AQIReading } from "../../../shared/src/types.js";
import { evaluate, evaluateUnavailable } from "../../../shared/src/evaluate.js";
import { fetchDemoReading, isDemoScenario } from "../../../shared/src/demo.js";

const dynamodb = new DynamoDBClient({});
const bedrock = new BedrockRuntimeClient({ region: "ap-south-1" });
const AQI_TABLE_NAME = process.env.AQI_TABLE_NAME!;
const BEDROCK_ENABLED = process.env.BEDROCK_ENABLED === "true";
const DATA_MODE = process.env.DATA_MODE || "demo";

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const campus = event.queryStringParameters?.campus || "dtu-delhi";
  const scenario = event.queryStringParameters?.scenario;

  if (DATA_MODE === "demo" && scenario && !isDemoScenario(scenario)) {
    return respond(400, { error: `Unknown demo scenario: ${scenario}` });
  }

  try {
    // In demo mode, evaluate the same fixture the dashboard is showing rather
    // than whatever reading happens to be newest in the table.
    const reading =
      DATA_MODE === "demo"
        ? fetchDemoReading(campus, scenario)
        : await getLatestReading(campus);

    if (!reading) {
      return respond(200, evaluateUnavailable());
    }

    const recommendation = evaluate(reading);

    if (BEDROCK_ENABLED && DATA_MODE !== "demo" && recommendation.statusLevel >= 2) {
      try {
        const recentReadings = await getRecentReadings(campus, 6);
        recommendation.aiNarrative = await generateNarrative(
          reading,
          recommendation,
          recentReadings
        );
      } catch (err) {
        console.error("Bedrock narrative failed, continuing without:", err);
      }
    }

    return respond(200, recommendation);
  } catch (err) {
    console.error("Recommendation handler error:", err);
    return respond(500, { error: "Internal server error" });
  }
}

async function generateNarrative(
  reading: AQIReading,
  recommendation: ReturnType<typeof evaluate>,
  recentReadings: AQIReading[]
): Promise<string> {
  const trendSummary = recentReadings.length > 1
    ? recentReadings.map((r) => `AQI ${r.aqi} at ${r.timestamp}`).join("; ")
    : "No historical data available";

  const pollutantsList = Object.entries(reading.pollutants)
    .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
    .join(", ");

  const prompt = `You are an air quality advisor for a campus administrator in India. Based on the following data, write a 2-3 sentence actionable narrative. Be specific, practical, and reference the data. Do not repeat the AQI number or status category — the administrator already sees those. Focus on what makes THIS reading notable and what specific action to take NOW.

Current reading:
- AQI: ${reading.aqi} (${recommendation.status})
- Dominant pollutant: ${reading.dominantPollutant}
- Pollutants: ${pollutantsList}
- Station: ${reading.stationName}
- Data source: ${reading.source}

Recent trend: ${trendSummary}

CPCB rule applied: ${recommendation.rule.name}
Standard action: ${recommendation.action}

Write the narrative now. Be concise.`;

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    })
  );

  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.content?.[0]?.text || "";
}

async function getLatestReading(campus: string): Promise<AQIReading | null> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: AQI_TABLE_NAME,
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

async function getRecentReadings(
  campus: string,
  limit: number
): Promise<AQIReading[]> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: AQI_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: marshall({
        ":pk": `CAMPUS#${campus}`,
        ":prefix": "READING#",
      }),
      ScanIndexForward: false,
      Limit: limit,
    })
  );

  if (!result.Items) return [];
  return result.Items.map((item) => {
    const { PK, SK, ...reading } = unmarshall(item) as AQIReading & {
      PK: string;
      SK: string;
    };
    return reading;
  });
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
