import { describe, expect, it, vi } from "vitest";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { getAlerts } from "../services/alerts/src/operations/getAlerts.js";

function fakeClient(handler: (command: unknown) => unknown): DynamoDBClient {
  return { send: vi.fn(async (command: unknown) => handler(command)) } as unknown as DynamoDBClient;
}

describe("getAlerts", () => {
  it("returns an empty list when the partition has no items", async () => {
    const client = fakeClient(() => ({})); // no Items key
    expect(await getAlerts(client, "AlertsTable", "st-ito")).toEqual([]);
  });

  it("unmarshals alerts and strips the DynamoDB key attributes", async () => {
    const client = fakeClient(() => ({
      Items: [
        marshall({
          PK: "CAMPUS#st-ito",
          SK: "ALERT#2026-10-10T10:00:00.000Z#a1",
          alertId: "a1",
          campus: "st-ito",
          message: "hello",
        }),
      ],
    }));

    const alerts = await getAlerts(client, "AlertsTable", "st-ito");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual({ alertId: "a1", campus: "st-ito", message: "hello" });
    expect(alerts[0]).not.toHaveProperty("PK");
    expect(alerts[0]).not.toHaveProperty("SK");
  });

  it("queries the campus partition newest-first with the requested limit", async () => {
    let seen: QueryCommand | undefined;
    const client = fakeClient((cmd) => {
      seen = cmd as QueryCommand;
      return { Items: [] };
    });

    await getAlerts(client, "AlertsTable", "st-ito", 10);

    expect(seen!.input.Limit).toBe(10);
    expect(seen!.input.ScanIndexForward).toBe(false);
    expect(seen!.input.ExpressionAttributeValues).toEqual(
      marshall({ ":pk": "CAMPUS#st-ito", ":prefix": "ALERT#" })
    );
  });
});
