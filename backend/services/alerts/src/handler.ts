import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { CreateAlertInput } from "../../../shared/src/types.js";
import { isDemoScenario } from "../../../shared/src/demo.js";
import { createAlert } from "./operations/createAlert.js";
import { getAlerts } from "./operations/getAlerts.js";
import { AlertNotFoundError, recordDecision } from "./operations/recordDecision.js";

const dynamodb = new DynamoDBClient({});
const ALERTS_TABLE = process.env.ALERTS_TABLE_NAME!;
const AQI_TABLE = process.env.AQI_TABLE_NAME!;
const DATA_MODE = process.env.DATA_MODE || "demo";

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;
  const pathParts = path.split("/").filter(Boolean);

  try {
    if (method === "POST" && pathParts[pathParts.length - 1] === "alerts") {
      return await handleCreateAlert(event);
    }

    if (method === "GET" && pathParts[pathParts.length - 1] === "alerts") {
      return await handleGetAlerts(event);
    }

    if (
      method === "PATCH" &&
      pathParts.includes("alerts") &&
      pathParts[pathParts.length - 1] === "decision"
    ) {
      return await handleRecordDecision(event);
    }

    return respond(404, { error: "Not found" });
  } catch (err) {
    if (err instanceof AlertNotFoundError) {
      return respond(404, { error: err.message });
    }
    console.error("Alerts handler error:", err);
    return respond(500, {
      error: "Internal server error",
    });
  }
}

async function handleCreateAlert(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || "{}") as CreateAlertInput;

  if (!body.campus || !body.audience || !body.message || !body.adminName) {
    return respond(400, {
      error: "Missing required fields: campus, audience, message, adminName",
    });
  }

  if (body.scenario !== undefined && !isDemoScenario(body.scenario)) {
    return respond(400, { error: `Unknown demo scenario: ${body.scenario}` });
  }

  const alert = await createAlert(dynamodb, ALERTS_TABLE, AQI_TABLE, body, DATA_MODE);
  return respond(201, alert);
}

async function handleGetAlerts(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const campus = event.queryStringParameters?.campus || "dtu-delhi";
  const limit = parseInt(event.queryStringParameters?.limit || "25", 10);

  const alerts = await getAlerts(dynamodb, ALERTS_TABLE, campus, limit);
  return respond(200, { alerts, count: alerts.length });
}

async function handleRecordDecision(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const pathParts = event.path.split("/").filter(Boolean);
  const alertIdIndex = pathParts.indexOf("alerts") + 1;
  const alertId = pathParts[alertIdIndex];

  if (!alertId) {
    return respond(400, { error: "Missing alert ID in path" });
  }

  const body = JSON.parse(event.body || "{}");
  if (!body.decision) {
    return respond(400, { error: "Missing required field: decision" });
  }

  const campus = event.queryStringParameters?.campus || "dtu-delhi";
  const createdAt =
    typeof body.createdAt === "string" ? body.createdAt : undefined;
  const result = await recordDecision(
    dynamodb,
    ALERTS_TABLE,
    campus,
    alertId,
    body.decision,
    createdAt
  );

  return respond(200, result);
}

function respond(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}
