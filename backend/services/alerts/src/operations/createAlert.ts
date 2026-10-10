import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";
import { Alert, AQIReading, CreateAlertInput } from "../../../../shared/src/types.js";
import { evaluate } from "../../../../shared/src/evaluate.js";
import { fetchDemoReading } from "../../../../shared/src/demo.js";

export async function createAlert(
  dynamodb: DynamoDBClient,
  alertsTable: string,
  aqiTable: string,
  input: CreateAlertInput,
  dataMode: string
): Promise<Alert> {
  const alertId = randomUUID();
  const now = new Date().toISOString();

  // In demo mode readings aren't persisted; snapshot the scenario the admin
  // was looking at so the audit log matches the screen.
  const aqiSnapshot =
    dataMode === "demo"
      ? fetchDemoReading(input.campus, input.scenario)
      : await getLatestReading(dynamodb, aqiTable, input.campus);
  const recommendation = aqiSnapshot ? evaluate(aqiSnapshot) : null;

  const alert: Alert = {
    alertId,
    campus: input.campus,
    audience: input.audience,
    message: input.message,
    aqiSnapshot: aqiSnapshot || ({} as AQIReading),
    recommendation: recommendation || ({} as any),
    status: "sent",
    decision: null,
    decisionTimestamp: null,
    adminName: input.adminName,
    createdAt: now,
  };

  await dynamodb.send(
    new PutItemCommand({
      TableName: alertsTable,
      Item: marshall(
        {
          PK: `CAMPUS#${input.campus}`,
          SK: `ALERT#${now}#${alertId}`,
          ...alert,
        },
        { removeUndefinedValues: true }
      ),
    })
  );

  return alert;
}

async function getLatestReading(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string
): Promise<AQIReading | null> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
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
