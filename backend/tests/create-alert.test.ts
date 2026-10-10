import { afterEach, describe, expect, it, vi } from "vitest";
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import type { AQIReading } from "../shared/src/types.js";

// Collaborators are mocked so the test exercises only createAlert's own logic:
// snapshot resolution, delivery-state selection, and the email write-back.
vi.mock("../shared/src/area-readings.js", () => ({
  getAreaReading: vi.fn(),
  usesDemo: vi.fn(() => true),
}));
vi.mock("../shared/src/readings.js", () => ({ getReadingAt: vi.fn() }));
vi.mock("../shared/src/evaluate.js", () => ({
  evaluate: vi.fn(() => ({ status: "Poor", action: "stay indoors" })),
}));
vi.mock("../services/alerts/src/operations/notify.js", () => ({
  hasConfirmedSubscriber: vi.fn(),
  publishAlertEmail: vi.fn(),
}));

import { createAlert, NoReadingError } from "../services/alerts/src/operations/createAlert.js";
import { getAreaReading } from "../shared/src/area-readings.js";
import { hasConfirmedSubscriber, publishAlertEmail } from "../services/alerts/src/operations/notify.js";

const asMock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const READING: AQIReading = {
  aqi: 280,
  status: "Poor",
  dominantPollutant: "pm25",
  stationName: "ITO",
  source: "CPCB",
  timestamp: "2026-10-10T10:00:00.000Z",
  pollutants: { pm25: 280 },
} as unknown as AQIReading;

const INPUT = {
  campus: "st-ito",
  audience: "all" as const,
  message: "Air quality is poor.",
  adminName: "Dr Rao",
};

function fakeClient(handler: (command: unknown) => unknown): DynamoDBClient {
  return { send: vi.fn(async (command: unknown) => handler(command)) } as unknown as DynamoDBClient;
}

afterEach(() => vi.clearAllMocks());

describe("createAlert", () => {
  it("throws NoReadingError when no reading can be attached", async () => {
    asMock(getAreaReading).mockResolvedValue({ area: { name: "ITO" }, reading: null });
    const client = fakeClient(() => ({}));
    await expect(createAlert(client, INPUT, { alertsTable: "T", data: {} as never, noticeUrl: "" }))
      .rejects.toBeInstanceOf(NoReadingError);
  });

  it("marks email 'not_configured' and writes a single item when there is no SNS topic", async () => {
    asMock(getAreaReading).mockResolvedValue({ area: { name: "ITO" }, reading: READING });
    const commands: unknown[] = [];
    const client = fakeClient((cmd) => {
      commands.push(cmd);
      return {};
    });

    const alert = await createAlert(client, INPUT, { alertsTable: "T", data: {} as never, noticeUrl: "" });

    expect(alert.delivery).toEqual({ inApp: true, email: "not_configured" });
    expect(alert.status).toBe("sent");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(PutItemCommand);
    expect(hasConfirmedSubscriber).not.toHaveBeenCalled();
  });

  it("records 'sent' and writes the delivery status back when the email is delivered", async () => {
    asMock(getAreaReading).mockResolvedValue({ area: { name: "ITO" }, reading: READING });
    asMock(hasConfirmedSubscriber).mockResolvedValue(true);
    asMock(publishAlertEmail).mockResolvedValue(true);
    const commands: unknown[] = [];
    const client = fakeClient((cmd) => {
      commands.push(cmd);
      return {};
    });

    const alert = await createAlert(client, INPUT, {
      alertsTable: "T",
      data: {} as never,
      topicArn: "arn:topic",
      noticeUrl: "https://notice",
    });

    expect(alert.delivery).toEqual({ inApp: true, email: "sent" });
    // First the Put (so the audit trail never misses an emailed alert), then
    // the write-back of the delivery result.
    expect(commands[0]).toBeInstanceOf(PutItemCommand);
    expect(commands[1]).toBeInstanceOf(UpdateItemCommand);
  });

  it("records 'failed' when the subscriber exists but publishing fails", async () => {
    asMock(getAreaReading).mockResolvedValue({ area: { name: "ITO" }, reading: READING });
    asMock(hasConfirmedSubscriber).mockResolvedValue(true);
    asMock(publishAlertEmail).mockResolvedValue(false);
    const client = fakeClient(() => ({}));

    const alert = await createAlert(client, INPUT, {
      alertsTable: "T",
      data: {} as never,
      topicArn: "arn:topic",
      noticeUrl: "",
    });

    expect(alert.delivery).toEqual({ inApp: true, email: "failed" });
  });
});
