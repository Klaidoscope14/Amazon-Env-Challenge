import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  QueryCommand,
  QueryCommandOutput,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

export class AlertNotFoundError extends Error {
  constructor(alertId: string) {
    super(`Alert ${alertId} not found`);
    this.name = "AlertNotFoundError";
  }
}

export async function recordDecision(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string,
  alertId: string,
  decision: string,
  createdAt?: string
): Promise<{ success: boolean; alertId: string }> {
  // The sort key is ALERT#<createdAt>#<alertId>; when the client knows
  // createdAt (it always has it from GET /alerts) we can address the item
  // directly instead of searching for it.
  const sk = createdAt
    ? `ALERT#${createdAt}#${alertId}`
    : await findAlertSK(dynamodb, tableName, campus, alertId);
  if (!sk) {
    throw new AlertNotFoundError(alertId);
  }

  try {
    await dynamodb.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({ PK: `CAMPUS#${campus}`, SK: sk }),
        UpdateExpression:
          "SET #decision = :decision, #decisionTimestamp = :ts",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: {
          "#decision": "decision",
          "#decisionTimestamp": "decisionTimestamp",
        },
        ExpressionAttributeValues: marshall({
          ":decision": decision,
          ":ts": new Date().toISOString(),
        }),
      })
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new AlertNotFoundError(alertId);
    }
    throw err;
  }

  return { success: true, alertId };
}

// Fallback for clients that don't send createdAt. Pages through the whole
// partition: a Query's Limit applies before the FilterExpression, so a single
// limited page can miss the alert entirely.
async function findAlertSK(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string,
  alertId: string
): Promise<string | null> {
  let startKey: QueryCommandOutput["LastEvaluatedKey"];
  do {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        FilterExpression: "alertId = :alertId",
        ExpressionAttributeValues: marshall({
          ":pk": `CAMPUS#${campus}`,
          ":prefix": "ALERT#",
          ":alertId": alertId,
        }),
        ScanIndexForward: false,
        ExclusiveStartKey: startKey,
      })
    );

    if (result.Items && result.Items.length > 0) {
      return unmarshall(result.Items[0]).SK as string;
    }
    startKey = result.LastEvaluatedKey;
  } while (startKey);

  return null;
}
