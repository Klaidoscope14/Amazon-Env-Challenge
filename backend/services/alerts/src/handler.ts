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
  callerId,
  ForbiddenError,
  header,
  parseJsonBody,
  requireRole,
  respond,
  signedInName,
  UnauthorizedError,
} from "../../../shared/src/http.js";
import { publishEvents } from "../../../shared/src/events.js";
import { createAlert, NoReadingError } from "./operations/createAlert.js";
import { getAlertsPage } from "./operations/getAlerts.js";
import {
  claimIdempotencyKey,
  IDEMPOTENCY_KEY_PATTERN,
  IdempotencyConflictError,
  requestHash,
} from "./operations/idempotency.js";
import {
  AlertNotFoundError,
  DecisionAlreadyRecordedError,
  recordDecision,
} from "./operations/recordDecision.js";
import { errorFields, log, metric } from "../../../shared/src/observability.js";

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
    if (err instanceof IdempotencyConflictError) {
      return respond(err.status, { error: err.message });
    }
    if (err instanceof NoReadingError) {
      return respond(422, { error: err.message });
    }
    log("error", "unhandled_error", { route: event.path, ...errorFields(err) });
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

  // Optional Idempotency-Key: a retry with the same key and body returns the
  // alert the first request created instead of creating (and emailing) a duplicate.
  const key = header(event, "Idempotency-Key");
  if (key !== undefined && !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ValidationError("Idempotency-Key must be 8–64 letters, digits, '-' or '_'");
  }
  const claim = key
    ? await claimIdempotencyKey(dynamodb, ALERTS_TABLE, callerId(event), key, requestHash(body))
    : null;
  if (claim?.state === "replay") {
    const replay = respond(200, claim.alert);
    replay.headers = { ...replay.headers, "Idempotent-Replayed": "true" };
    return replay;
  }

  let alert;
  try {
    alert = await createAlert(
      dynamodb,
      { ...body, adminName },
      {
        alertsTable: ALERTS_TABLE,
        data: DATA,
        topicArn: TOPIC_ARN,
        noticeUrl: NOTICE_URL,
      }
    );
  } catch (err) {
    await claim?.release(null);
    throw err;
  }
  await claim?.release(alert);
  metric("AlertsCreated");
  return respond(201, alert);
}

async function handleGetAlerts(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const { campus, limit, cursor } = parse(AlertsQuerySchema, event.queryStringParameters ?? {});
  const page = await getAlertsPage(dynamodb, ALERTS_TABLE, campus, limit, cursor);
  return respond(200, { ...page, count: page.alerts.length });
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

  metric("DecisionsRecorded");
  await publishEvents([
    {
      source: "breathesafe.alerts",
      type: "alert.decision.recorded",
      detail: { alertId, area: campus, decisionTimestamp: result.decisionTimestamp },
    },
  ]);

  return respond(200, result);
}
