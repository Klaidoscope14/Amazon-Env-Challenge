import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { Alert } from "../../../../shared/src/types.js";
import { ValidationError } from "../../../../shared/src/schemas.js";

export interface AlertsPage {
  alerts: Alert[];
  /** Opaque cursor for the next (older) page; absent on the last page. */
  nextCursor?: string;
}

/**
 * One page of an area's alerts, newest first. The cursor wraps DynamoDB's
 * LastEvaluatedKey and is only accepted for the same area's alert items.
 */
export async function getAlertsPage(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string,
  limit: number = 25,
  cursor?: string
): Promise<AlertsPage> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: marshall({
        ":pk": `CAMPUS#${campus}`,
        ":prefix": "ALERT#",
      }),
      ScanIndexForward: false,
      Limit: limit,
      ...(cursor ? { ExclusiveStartKey: marshall(decodeCursor(cursor, campus)) } : {}),
    })
  );

  const alerts = (result.Items ?? []).map((item) => {
    const raw = unmarshall(item) as Alert & { PK: string; SK: string };
    const { PK, SK, ...alert } = raw;
    return alert;
  });

  const last = result.LastEvaluatedKey ? unmarshall(result.LastEvaluatedKey) : null;
  return {
    alerts,
    ...(last ? { nextCursor: encodeCursor({ PK: String(last.PK), SK: String(last.SK) }) } : {}),
  };
}

/** The newest alerts for an area (first page only). */
export async function getAlerts(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string,
  limit: number = 25
): Promise<Alert[]> {
  return (await getAlertsPage(dynamodb, tableName, campus, limit)).alerts;
}

export function encodeCursor(key: { PK: string; SK: string }): string {
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

export function decodeCursor(cursor: string, campus: string): { PK: string; SK: string } {
  try {
    const key = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      key.PK === `CAMPUS#${campus}` &&
      typeof key.SK === "string" &&
      key.SK.startsWith("ALERT#") &&
      key.SK.length <= 120 &&
      Object.keys(key).length === 2
    ) {
      return { PK: key.PK, SK: key.SK };
    }
  } catch {
    // fall through
  }
  throw new ValidationError("Invalid cursor");
}
