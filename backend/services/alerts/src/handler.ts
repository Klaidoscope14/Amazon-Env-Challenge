import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { CreateAlertInput } from "../../../shared/src/types.js";
import { isDemoScenario } from "../../../shared/src/demo.js";
import { isAudience } from "../../../shared/src/notice-templates.js";
import { dataContextFromEnv, isAreaId } from "../../../shared/src/area-readings.js";
import { createAlert, NoReadingError } from "./operations/createAlert.js";
import { getAlerts } from "./operations/getAlerts.js";
import {
  AlertNotFoundError,
  DecisionAlreadyRecordedError,
  recordDecision,
} from "./operations/recordDecision.js";

const dynamodb = new DynamoDBClient({});
const ALERTS_TABLE = process.env.ALERTS_TABLE_NAME!;
const DATA = dataContextFromEnv();
const TOPIC_ARN = process.env.ALERTS_TOPIC_ARN || undefined;
const NOTICE_URL = process.env.NOTICE_URL || "";

const MAX_MESSAGE = 2000;
const MAX_NAME = 100;
const MAX_DECISION = 500;
const MAX_TIMESTAMP = 40;

class BadRequestError extends Error {}
class UnauthorizedError extends Error {}

/**
 * The signed-in admin, from the claims API Gateway's Cognito authorizer
 * verified. Names in the audit trail come from here, never from the request
 * body, so they can't be spoofed.
 */
function signedInName(event: APIGatewayProxyEvent): string {
  const claims = (event.requestContext?.authorizer?.claims ?? {}) as Record<string, unknown>;
  const name = [claims.name, claims.email].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  if (!name) throw new UnauthorizedError("Sign in to perform this action");
  return name.trim().slice(0, MAX_NAME);
}

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
    if (err instanceof BadRequestError) {
      return respond(400, { error: err.message });
    }
    if (err instanceof UnauthorizedError) {
      return respond(401, { error: err.message });
    }
    if (err instanceof AlertNotFoundError) {
      return respond(404, { error: err.message });
    }
    if (err instanceof DecisionAlreadyRecordedError) {
      return respond(409, { error: err.message });
    }
    if (err instanceof NoReadingError) {
      return respond(422, { error: err.message });
    }
    console.error("Alerts handler error:", err);
    return respond(500, {
      error: "Internal server error",
    });
  }
}

function parseBody(event: APIGatewayProxyEvent): Record<string, unknown> {
  try {
    const parsed = JSON.parse(event.body || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }
  throw new BadRequestError("Request body must be a JSON object");
}

/** Trimmed string within limits, or undefined when absent and optional. */
function readString(
  body: Record<string, unknown>,
  field: string,
  max: number,
  required: boolean
): string | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === "") {
    if (required) throw new BadRequestError(`Missing required field: ${field}`);
    return undefined;
  }
  if (typeof value !== "string") throw new BadRequestError(`${field} must be a string`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new BadRequestError(`Missing required field: ${field}`);
  if (trimmed.length > max) throw new BadRequestError(`${field} must be at most ${max} characters`);
  return trimmed || undefined;
}

async function handleCreateAlert(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const adminName = signedInName(event);
  const body = parseBody(event);

  const campus = readString(body, "campus", 90, true)!;
  if (!isAreaId(campus)) throw new BadRequestError("campus must be an area id");
  const audience = readString(body, "audience", 20, true)!;
  if (!isAudience(audience)) {
    throw new BadRequestError(`Unknown audience: ${audience}`);
  }
  const scenario = readString(body, "scenario", 40, false);
  if (scenario !== undefined && !isDemoScenario(scenario)) {
    throw new BadRequestError(`Unknown demo scenario: ${scenario}`);
  }
  const noticeSource = readString(body, "noticeSource", 20, false);
  if (noticeSource !== undefined && noticeSource !== "template" && noticeSource !== "ai") {
    throw new BadRequestError("noticeSource must be template or ai");
  }

  const input: CreateAlertInput = {
    campus,
    audience,
    message: readString(body, "message", MAX_MESSAGE, true)!,
    messageHi: readString(body, "messageHi", MAX_MESSAGE, false),
    noticeSource,
    adminName,
    scenario,
    readingTimestamp: readString(body, "readingTimestamp", MAX_TIMESTAMP, false),
  };

  const alert = await createAlert(dynamodb, input, {
    alertsTable: ALERTS_TABLE,
    data: DATA,
    topicArn: TOPIC_ARN,
    noticeUrl: NOTICE_URL,
  });
  return respond(201, alert);
}

async function handleGetAlerts(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const campus = event.queryStringParameters?.campus;
  if (!isAreaId(campus)) {
    return respond(400, { error: "campus (area id) is required" });
  }
  const requested = Number.parseInt(event.queryStringParameters?.limit || "25", 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 50) : 25;

  const alerts = await getAlerts(dynamodb, ALERTS_TABLE, campus, limit);
  return respond(200, { alerts, count: alerts.length });
}

async function handleRecordDecision(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const pathParts = event.path.split("/").filter(Boolean);
  const alertIdIndex = pathParts.indexOf("alerts") + 1;
  const alertId = pathParts[alertIdIndex];

  if (!alertId || alertId === "decision" || alertId.length > 64) {
    return respond(400, { error: "Missing alert ID in path" });
  }

  const decidedBy = signedInName(event);
  const body = parseBody(event);
  const decision = readString(body, "decision", MAX_DECISION, true)!;
  const createdAt = readString(body, "createdAt", MAX_TIMESTAMP, false);

  const campus = event.queryStringParameters?.campus;
  if (!isAreaId(campus)) {
    return respond(400, { error: "campus (area id) is required" });
  }
  const result = await recordDecision(
    dynamodb,
    ALERTS_TABLE,
    campus,
    alertId,
    decision,
    createdAt,
    decidedBy
  );

  return respond(200, result);
}

function respond(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}
