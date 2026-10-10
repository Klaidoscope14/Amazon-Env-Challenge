import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { evaluate, evaluateUnavailable } from "../../../shared/src/evaluate.js";
import { isDemoScenario } from "../../../shared/src/demo.js";
import {
  dataContextFromEnv,
  getAreaReading,
  isAreaId,
} from "../../../shared/src/area-readings.js";

const dynamodb = new DynamoDBClient({});
const ctx = dataContextFromEnv();

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const areaId = event.queryStringParameters?.campus;
  const scenario = event.queryStringParameters?.scenario || undefined;

  if (!isAreaId(areaId)) {
    return respond(400, { error: "campus (area id) is required" });
  }
  if (scenario && !isDemoScenario(scenario)) {
    return respond(400, { error: `Unknown demo scenario: ${scenario}` });
  }

  try {
    // Same resolution as GET /aqi/current, so the recommendation always
    // evaluates the reading the dashboard is showing.
    const { reading } = await getAreaReading(dynamodb, ctx, areaId, scenario);
    return respond(200, reading ? evaluate(reading) : evaluateUnavailable());
  } catch (err) {
    console.error("Recommendation handler error:", err);
    return respond(500, { error: "Internal server error" });
  }
}

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
