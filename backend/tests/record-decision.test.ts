import { describe, expect, it, vi } from "vitest";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import {
  AlertNotFoundError,
  DecisionAlreadyRecordedError,
  recordDecision,
} from "../services/alerts/src/operations/recordDecision.js";

/** A DynamoDBClient whose send() is driven by the supplied handler. */
function fakeClient(handler: (command: unknown) => unknown): DynamoDBClient {
  return { send: vi.fn(async (command: unknown) => handler(command)) } as unknown as DynamoDBClient;
}

function conditionFailure(item?: Record<string, unknown>): ConditionalCheckFailedException {
  const err = new ConditionalCheckFailedException({ $metadata: {}, message: "conditional request failed" });
  if (item) err.Item = marshall(item);
  return err;
}

describe("recordDecision — write-once audit invariant", () => {
  it("records the decision and addresses the item by its exact key when createdAt is known", async () => {
    let seen: UpdateItemCommand | undefined;
    const client = fakeClient((cmd) => {
      seen = cmd as UpdateItemCommand;
      return {};
    });

    const result = await recordDecision(
      client,
      "AlertsTable",
      "st-ito",
      "alert-1",
      "Moved activities indoors",
      "2026-10-10T00:00:00.000Z",
      "Dr Rao"
    );

    expect(result.success).toBe(true);
    expect(result.alertId).toBe("alert-1");
    expect(typeof result.decisionTimestamp).toBe("string");
    expect(Number.isFinite(Date.parse(result.decisionTimestamp))).toBe(true);

    // No Query needed when createdAt is supplied; the SK is built directly.
    expect(seen).toBeInstanceOf(UpdateItemCommand);
    expect(seen!.input.Key).toEqual(
      marshall({ PK: "CAMPUS#st-ito", SK: "ALERT#2026-10-10T00:00:00.000Z#alert-1" })
    );
    // Guards against overwriting an existing decision.
    expect(seen!.input.ConditionExpression).toContain("attribute_not_exists(#decision)");
  });

  it("maps a condition failure WITH an existing item to DecisionAlreadyRecordedError (409)", async () => {
    const client = fakeClient(() => {
      throw conditionFailure({ decision: "Cancelled outdoor events" });
    });

    await expect(
      recordDecision(client, "AlertsTable", "st-ito", "alert-1", "d", "2026-10-10T00:00:00.000Z", "x")
    ).rejects.toBeInstanceOf(DecisionAlreadyRecordedError);
  });

  it("maps a condition failure with NO item to AlertNotFoundError (404)", async () => {
    const client = fakeClient(() => {
      throw conditionFailure(); // alert row did not exist
    });

    await expect(
      recordDecision(client, "AlertsTable", "st-ito", "ghost", "d", "2026-10-10T00:00:00.000Z", "x")
    ).rejects.toBeInstanceOf(AlertNotFoundError);
  });

  it("falls back to paginating the partition when createdAt is not supplied", async () => {
    let queries = 0;
    let update: UpdateItemCommand | undefined;
    const client = fakeClient((cmd) => {
      if (cmd instanceof QueryCommand) {
        queries += 1;
        // First page misses (Limit applies before the filter); second page hits.
        return queries === 1
          ? { Items: [], LastEvaluatedKey: marshall({ PK: "CAMPUS#st-ito", SK: "ALERT#z" }) }
          : { Items: [marshall({ SK: "ALERT#2026-10-10T00:00:00.000Z#alert-1", alertId: "alert-1" })] };
      }
      update = cmd as UpdateItemCommand;
      return {};
    });

    const result = await recordDecision(client, "AlertsTable", "st-ito", "alert-1", "Sent advisory");

    expect(queries).toBe(2);
    expect(result.success).toBe(true);
    // The decision is written against the SK that was discovered by the search.
    expect(update!.input.Key).toEqual(
      marshall({ PK: "CAMPUS#st-ito", SK: "ALERT#2026-10-10T00:00:00.000Z#alert-1" })
    );
  });

  it("throws AlertNotFoundError when the search exhausts the partition without a match", async () => {
    const client = fakeClient((cmd) => {
      if (cmd instanceof QueryCommand) return { Items: [] }; // no more pages
      throw new Error("UpdateItem should never run");
    });

    await expect(
      recordDecision(client, "AlertsTable", "st-ito", "missing", "Sent advisory")
    ).rejects.toBeInstanceOf(AlertNotFoundError);
  });
});
