import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  QueryCommandOutput,
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

/** The stored reading for an area at a given source timestamp (the sort key suffix). */
export async function getReadingAt(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string,
  timestamp: string
): Promise<AQIReading | null> {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: marshall({ PK: `CAMPUS#${campus}`, SK: `READING#${timestamp}` }),
    })
  );
  return result.Item ? toReading(unmarshall(result.Item)) : null;
}

/** The most recent stored reading for an area before the given source timestamp. */
export async function getReadingBefore(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string,
  timestamp: string
): Promise<AQIReading | null> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
      ExpressionAttributeValues: marshall({
        ":pk": `CAMPUS#${campus}`,
        ":from": "READING#",
        ":to": `READING#${timestamp}`,
      }),
      ScanIndexForward: false,
      Limit: 2,
    })
  );
  const item = (result.Items ?? [])
    .map((raw) => toReading(unmarshall(raw)))
    .find((reading) => reading.timestamp !== timestamp);
  return item ?? null;
}

/**
 * Every stored reading for an area since a time, oldest first. Follows
 * LastEvaluatedKey, so results past DynamoDB's 1 MB page limit aren't lost;
 * `maxItems` caps the total.
 */
export async function getReadingsSince(
  dynamodb: DynamoDBClient,
  tableName: string,
  campus: string,
  sinceIso: string,
  maxItems = 2000
): Promise<AQIReading[]> {
  const readings: AQIReading[] = [];
  let startKey: QueryCommandOutput["LastEvaluatedKey"];
  do {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
        ExpressionAttributeValues: marshall({
          ":pk": `CAMPUS#${campus}`,
          ":from": `READING#${sinceIso}`,
          // "~" sorts after every timestamp character.
          ":to": "READING#~",
        }),
        ScanIndexForward: true,
        ExclusiveStartKey: startKey,
      })
    );
    for (const item of result.Items ?? []) readings.push(toReading(unmarshall(item)));
    startKey = result.LastEvaluatedKey;
  } while (startKey && readings.length < maxItems);
  return readings.slice(0, maxItems);
}
