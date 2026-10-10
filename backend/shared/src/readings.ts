import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { AQIReading } from "./types.js";

type StoredReading = AQIReading & { PK?: string; SK?: string; TTL?: number };

function toReading(item: Record<string, unknown>): AQIReading {
  // Strip storage-only attributes so they never leak into snapshots.
  const { PK, SK, TTL, ...reading } = item as unknown as StoredReading;
  return reading;
}

export async function getLatestReading(
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
  const item = result.Items?.[0];
  return item ? toReading(unmarshall(item)) : null;
}

/** The exact reading identified by its fetchedAt (the sort key suffix). */
export async function getReadingByFetchedAt(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string,
  fetchedAt: string
): Promise<AQIReading | null> {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: marshall({ PK: `CAMPUS#${campus}`, SK: `READING#${fetchedAt}` }),
    })
  );
  return result.Item ? toReading(unmarshall(result.Item)) : null;
}
