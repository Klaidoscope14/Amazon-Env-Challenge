import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { dataContextFromEnv } from "../../../shared/src/area-readings.js";
import {
  AlertsQuerySchema,
  CreateAlertBodySchema,
  parse,
  RecordDecisionBodySchema,
  ValidationError,
} from "../../../shared/src/schemas.js";
import {
  ForbiddenError,
  parseJsonBody,
  requireRole,
  respond,
  signedInName,
  UnauthorizedError,
} from "../../../shared/src/http.js";
import { publishEvents } from "../../../shared/src/events.js";
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
    if (err instanceof ValidationError) {
      return respond(400, { error: err.message });
    }
    if (err instanceof UnauthorizedError) {
      return respond(401, { error: err.message });
    }
    if (err instanceof ForbiddenError) {
      return respond(403, { error: err.message });
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

async function handleCreateAlert(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const adminName = signedInName(event);
  requireRole(event);
  const body = parse(CreateAlertBodySchema, parseJsonBody(event));

  const alert = await createAlert(
    dynamodb,
    { ...body, adminName },
    {
      alertsTable: ALERTS_TABLE,
      data: DATA,
      topicArn: TOPIC_ARN,
      noticeUrl: NOTICE_URL,
    }
  );
  return respond(201, alert);
}

async function handleGetAlerts(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const { campus, limit } = parse(AlertsQuerySchema, event.queryStringParameters ?? {});
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
  requireRole(event);
  const { decision, createdAt } = parse(RecordDecisionBodySchema, parseJsonBody(event));
  const { campus } = parse(AlertsQuerySchema, event.queryStringParameters ?? {});

  const result = await recordDecision(
    dynamodb,
    ALERTS_TABLE,
    campus,
    alertId,
    decision,
    createdAt,
    decidedBy
  );

  await publishEvents([
    {
      source: "breathesafe.alerts",
      type: "alert.decision.recorded",
      detail: { alertId, area: campus, decisionTimestamp: result.decisionTimestamp },
    },
  ]);

  return respond(200, result);
}
