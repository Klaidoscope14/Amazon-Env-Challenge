import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";
import { Alert, AQIReading, CreateAlertInput } from "../../../../shared/src/types.js";
import { evaluate } from "../../../../shared/src/evaluate.js";
import { getReadingAt } from "../../../../shared/src/readings.js";
import {
  DataContext,
  getAreaReading,
  usesDemo,
} from "../../../../shared/src/area-readings.js";
import { hasConfirmedSubscriber, publishAlertEmail } from "./notify.js";

export class NoReadingError extends Error {
  constructor() {
    super("No AQI reading is available to attach to this alert");
    this.name = "NoReadingError";
  }
}

export interface CreateAlertConfig {
  alertsTable: string;
  data: DataContext;
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

  const { reading: aqiSnapshot, areaName } = await resolveSnapshot(dynamodb, input, config);
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
    areaName,
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

// Demo/presenter mode: the scenario on screen. Live mode: the exact reading
// the admin saw (by source timestamp), falling back to the current reading.
async function resolveSnapshot(
  dynamodb: DynamoDBClient,
  input: CreateAlertInput,
  config: CreateAlertConfig
): Promise<{ reading: AQIReading | null; areaName: string }> {
  const current = await getAreaReading(dynamodb, config.data, input.campus, input.scenario);
  let reading = current.reading;
  if (!usesDemo(config.data, input.scenario) && input.readingTimestamp) {
    reading =
      (await getReadingAt(dynamodb, config.data.aqiTable, input.campus, input.readingTimestamp)) ??
      reading;
  }
  const areaName =
    current.area?.name ?? reading?.stationName.replace(/ \(sample values\)$/, "") ?? input.campus;
  return { reading, areaName };
}
