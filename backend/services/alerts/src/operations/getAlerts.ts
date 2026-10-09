import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { Alert } from "../../../../shared/src/types.js";

export async function getAlerts(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string,
  limit: number = 25
): Promise<Alert[]> {
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
    })
  );

  if (!result.Items) return [];

  return result.Items.map((item) => {
    const raw = unmarshall(item) as Alert & { PK: string; SK: string };
    const { PK, SK, ...alert } = raw;
    return alert;
  });
}
