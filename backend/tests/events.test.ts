import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: vi.fn(() => ({ send })),
  PutEventsCommand: vi.fn((input: unknown) => ({ input })),
}));

const { publishEvents } = await import("../shared/src/events.js");

const event = {
  source: "breathesafe.alerts" as const,
  type: "alert.decision.recorded" as const,
  detail: { alertId: "a1", area: "city-pune", decisionTimestamp: "2026-10-10T10:00:00.000Z" },
};

describe("publishEvents", () => {
  beforeEach(() => {
    send.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does nothing when no bus is configured", async () => {
    await publishEvents([event], undefined);
    expect(send).not.toHaveBeenCalled();
  });

  it("puts events on the bus with source, detail-type and JSON detail", async () => {
    send.mockResolvedValue({ FailedEntryCount: 0 });
    await publishEvents([event], "breathesafe-dev");
    expect(send.mock.calls[0][0].input.Entries).toEqual([
      {
        EventBusName: "breathesafe-dev",
        Source: "breathesafe.alerts",
        DetailType: "alert.decision.recorded",
        Detail: JSON.stringify(event.detail),
      },
    ]);
  });

  it("never throws when EventBridge fails", async () => {
    send.mockRejectedValue(new Error("network down"));
    await expect(publishEvents([event], "breathesafe-dev")).resolves.toBeUndefined();
    send.mockResolvedValue({ FailedEntryCount: 1, Entries: [{ ErrorCode: "InternalFailure" }] });
    await expect(publishEvents([event], "breathesafe-dev")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
