import {
  DynamoDBClient,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AQIReading } from "../../../shared/src/types.js";
import { evaluate, evaluateUnavailable } from "../../../shared/src/evaluate.js";

const dynamodb = new DynamoDBClient({});
const AQI_TABLE_NAME = process.env.AQI_TABLE_NAME!;

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const campus = event.queryStringParameters?.campus || "dtu-delhi";

  try {
    const reading = await getLatestReading(campus);

    if (!reading) {
      return respond(200, evaluateUnavailable());
    }

    const recommendation = evaluate(reading);
    return respond(200, recommendation);
  } catch (err) {
    console.error("Recommendation handler error:", err);
    return respond(500, { error: "Internal server error" });
  }
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
