import {
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

export async function recordDecision(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string,
  alertId: string,
  decision: string
): Promise<{ success: boolean; alertId: string }> {
  const sk = await findAlertSK(dynamodb, tableName, campus, alertId);
  if (!sk) {
    throw new Error(`Alert ${alertId} not found`);
  }

  await dynamodb.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: marshall({ PK: `CAMPUS#${campus}`, SK: sk }),
      UpdateExpression:
        "SET #decision = :decision, #decisionTimestamp = :ts",
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

  return { success: true, alertId };
}

async function findAlertSK(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string,
  alertId: string
): Promise<string | null> {
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
      Limit: 10,
    })
  );

  if (!result.Items || result.Items.length === 0) return null;
  const item = unmarshall(result.Items[0]);
  return item.SK as string;
}
