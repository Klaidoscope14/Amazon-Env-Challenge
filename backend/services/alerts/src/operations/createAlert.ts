import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";
import { Alert, AQIReading, CreateAlertInput } from "../../../../shared/src/types.js";
import { evaluate } from "../../../../shared/src/evaluate.js";
import { fetchDemoReading } from "../../../../shared/src/demo.js";
import { getLatestReading, getReadingByFetchedAt } from "../../../../shared/src/readings.js";
import { hasConfirmedSubscriber, publishAlertEmail } from "./notify.js";

export class NoReadingError extends Error {
  constructor() {
    super("No AQI reading is available to attach to this alert");
    this.name = "NoReadingError";
  }
}

export interface CreateAlertConfig {
  alertsTable: string;
  aqiTable: string;
  dataMode: string;
  topicArn?: string;
  noticeUrl: string;
}

export async function createAlert(
  dynamodb: DynamoDBClient,
  input: CreateAlertInput,
  config: CreateAlertConfig
): Promise<Alert> {
  const alertId = randomUUID();
  const now = new Date().toISOString();

  const aqiSnapshot = await resolveSnapshot(dynamodb, input, config);
  if (!aqiSnapshot) {
    throw new NoReadingError();
  }

  const canEmail = config.topicArn
    ? await hasConfirmedSubscriber(config.topicArn).catch((err) => {
        console.error("Could not check SNS subscriptions:", err);
        return false;
      })
    : false;

  const alert: Alert = {
    alertId,
    campus: input.campus,
    audience: input.audience,
    message: input.message,
    ...(input.messageHi ? { messageHi: input.messageHi } : {}),
    ...(input.noticeSource ? { noticeSource: input.noticeSource } : {}),
    aqiSnapshot,
    recommendation: evaluate(aqiSnapshot),
    status: "sent",
    delivery: { inApp: true, email: canEmail ? "pending" : "not_configured" },
    decision: null,
    decisionTimestamp: null,
    decisionBy: null,
    adminName: input.adminName,
    createdAt: now,
  };

  const key = { PK: `CAMPUS#${input.campus}`, SK: `ALERT#${now}#${alertId}` };
  await dynamodb.send(
    new PutItemCommand({
      TableName: config.alertsTable,
      Item: marshall({ ...key, ...alert }, { removeUndefinedValues: true }),
    })
  );

  // The alert is recorded first so the audit trail never misses an alert that
  // was emailed; the delivery result is then written back onto it.
  if (canEmail && config.topicArn) {
    const sent = await publishAlertEmail(config.topicArn, alert, config.noticeUrl);
    alert.delivery = { inApp: true, email: sent ? "sent" : "failed" };
    try {
      await dynamodb.send(
        new UpdateItemCommand({
          TableName: config.alertsTable,
          Key: marshall(key),
          UpdateExpression: "SET #delivery.#email = :email",
          ExpressionAttributeNames: { "#delivery": "delivery", "#email": "email" },
          ExpressionAttributeValues: marshall({ ":email": alert.delivery.email }),
        })
      );
    } catch (err) {
      console.error("Failed to record email delivery status:", err);
    }
  }

  return alert;
}

// Demo mode: the scenario on screen. Live mode: the exact reading the admin
// saw (by fetchedAt), falling back to the latest stored reading.
async function resolveSnapshot(
  dynamodb: DynamoDBClient,
  input: CreateAlertInput,
  config: CreateAlertConfig
): Promise<AQIReading | null> {
  if (config.dataMode === "demo") {
    return fetchDemoReading(input.campus, input.scenario);
  }
  if (input.readingFetchedAt) {
    const exact = await getReadingByFetchedAt(
      dynamodb,
      config.aqiTable,
      input.campus,
      input.readingFetchedAt
    );
    if (exact) return exact;
  }
  return getLatestReading(dynamodb, config.aqiTable, input.campus);
}
