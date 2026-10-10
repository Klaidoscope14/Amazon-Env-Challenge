import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { createHash } from "crypto";
import { Alert } from "../../../../shared/src/types.js";

/*
 * Idempotent alert creation. A client sends the same Idempotency-Key header
 * when it retries (double click, flaky network); the first request creates
 * the alert, later ones get that alert back instead of a duplicate.
 *
 * Records live in the alerts table under the caller's own partition
 *   PK "IDEMPOTENCY#<user>"  SK "KEY#<key>"
 * and expire after 24 hours (table TTL attribute "TTL").
 */

const RECORD_TTL_SECONDS = 24 * 60 * 60;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export class IdempotencyConflictError extends Error {
  constructor(message: string, readonly status: 409 | 422) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export type IdempotencyClaim =
  | { state: "new"; release: (alert: Alert | null) => Promise<void> }
  | { state: "replay"; alert: Alert };

export function requestHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export async function claimIdempotencyKey(
  dynamodb: DynamoDBClient,
  tableName: string,
  owner: string,
  key: string,
  hash: string
): Promise<IdempotencyClaim> {
  const recordKey = { PK: `IDEMPOTENCY#${owner}`, SK: `KEY#${key}` };
  try {
    await dynamodb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          ...recordKey,
          requestHash: hash,
          status: "pending",
          createdAt: new Date().toISOString(),
          TTL: Math.floor(Date.now() / 1000) + RECORD_TTL_SECONDS,
        }),
        ConditionExpression: "attribute_not_exists(PK)",
        ReturnValuesOnConditionCheckFailure: "ALL_OLD",
      })
    );
  } catch (err) {
    if (!(err instanceof ConditionalCheckFailedException)) throw err;
    const existing = err.Item ? unmarshall(err.Item) : null;
    if (!existing) throw err;
    if (existing.requestHash !== hash) {
      throw new IdempotencyConflictError(
        "This Idempotency-Key was already used for a different request",
        422
      );
    }
    if (existing.status !== "done") {
      throw new IdempotencyConflictError(
        "A request with this Idempotency-Key is still being processed",
        409
      );
    }
    const stored = await dynamodb.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ PK: existing.alertPK, SK: existing.alertSK }),
      })
    );
    if (!stored.Item) {
      throw new IdempotencyConflictError("The original alert for this Idempotency-Key no longer exists", 409);
    }
    const { PK, SK, ...alert } = unmarshall(stored.Item);
    return { state: "replay", alert: alert as Alert };
  }

  return {
    state: "new",
    // Success: remember which alert this key created. Failure: free the key
    // so the client can retry with it.
    release: async (alert) => {
      try {
        if (alert) {
          await dynamodb.send(
            new UpdateItemCommand({
              TableName: tableName,
              Key: marshall(recordKey),
              UpdateExpression: "SET #status = :done, alertPK = :pk, alertSK = :sk",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: marshall({
                ":done": "done",
                ":pk": `CAMPUS#${alert.campus}`,
                ":sk": `ALERT#${alert.createdAt}#${alert.alertId}`,
              }),
            })
          );
        } else {
          await dynamodb.send(new DeleteItemCommand({ TableName: tableName, Key: marshall(recordKey) }));
        }
      } catch (err) {
        console.error(JSON.stringify({ event: "idempotency_release_failed", error: (err as Error).name }));
      }
    },
  };
}
