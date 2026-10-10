import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SSMClient } from "@aws-sdk/client-ssm";
import { marshall } from "@aws-sdk/util-dynamodb";
import { CPCB_THRESHOLDS } from "../shared/src/aqi-categories.js";
import { rulesetItems } from "../shared/src/rules.js";

/*
 * Handler-level tests: real handlers, AWS SDK clients and fetch stubbed.
 * Live mode, so requests without ?scenario= go through the Open-Meteo path
 * (and store readings / emit events); ?scenario= requests use demo fixtures.
 */

Object.assign(process.env, {
  DATA_MODE: "live",
  DEMO_SCENARIOS_ENABLED: "true",
  AQI_TABLE_NAME: "aqi",
  ALERTS_TABLE_NAME: "alerts",
  RULES_TABLE_NAME: "rules",
  EVENT_BUS_NAME: "breathesafe-test",
  EXPLAIN_AI_ENABLED: "true",
});

// ---- AWS + HTTP stubs ------------------------------------------------------

const editedPoor = "Custom Poor action from the RulesConfig table, for this test.";
const storedRules = CPCB_THRESHOLDS.map((t) => (t.status === "Poor" ? { ...t, action: editedPoor } : t));
let previousReading: Record<string, unknown> | null = null;
let readingAlreadyStored = false;
const { ConditionalCheckFailedException } = await import("@aws-sdk/client-dynamodb");

const dbSend = vi.spyOn(DynamoDBClient.prototype, "send").mockImplementation((async (command: {
  constructor: { name: string };
  input: { TableName?: string };
}) => {
  const name = command.constructor.name;
  if (name === "PutItemCommand" && command.input.TableName === "aqi" && readingAlreadyStored) {
    throw new ConditionalCheckFailedException({ message: "exists", $metadata: {} });
  }
  if (name === "QueryCommand" && command.input.TableName === "rules") {
    return { Items: rulesetItems("cpcb-india-v1", storedRules).map((i) => marshall(i)) };
  }
  if (name === "QueryCommand" && command.input.TableName === "aqi") {
    return { Items: previousReading ? [marshall(previousReading)] : [] };
  }
  return {};
}) as never);

const eventSend = vi
  .spyOn(EventBridgeClient.prototype, "send")
  .mockImplementation((async () => ({ FailedEntryCount: 0 })) as never);
vi.spyOn(SSMClient.prototype, "send").mockImplementation((async () => ({ Parameter: { Value: "test-key" } })) as never);

let geminiText = "";
function openMeteoSeries() {
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  start.setUTCHours(start.getUTCHours() - 48);
  const time = Array.from({ length: 72 }, (_, i) =>
    new Date(start.getTime() + i * 3600e3).toISOString().slice(0, 16)
  );
  const constant = (v: number) => time.map(() => v);
  return { hourly: { time, pm2_5: constant(100), pm10: constant(150), nitrogen_dioxide: constant(40) } };
}
const fetchMock = vi.fn(async (url: string | URL) => {
  const href = String(url);
  if (href.includes("open-meteo")) return new Response(JSON.stringify(openMeteoSeries()));
  if (href.includes("generativelanguage")) {
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ explanation: geminiText }) }] } }] })
    );
  }
  return new Response("not found", { status: 404 });
});
vi.stubGlobal("fetch", fetchMock);

afterAll(() => vi.unstubAllGlobals());

const { handler: aqi } = await import("../services/aqi-data/src/handler.js");
const { handler: recommendation } = await import("../services/recommendation/src/handler.js");
const { handler: explain } = await import("../services/explain/src/handler.js");
const { handler: alerts } = await import("../services/alerts/src/handler.js");
const { handler: notices } = await import("../services/notices/src/handler.js");
const { handler: auth } = await import("../services/auth/src/handler.js");

function request(
  method: string,
  path: string,
  options: { query?: Record<string, string>; body?: unknown; user?: string } = {}
): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    path,
    queryStringParameters: options.query ?? null,
    body: options.body === undefined ? null : JSON.stringify(options.body),
    headers: {},
    requestContext: options.user
      ? { authorizer: { claims: { name: options.user, "custom:role": "admin" } } }
      : {},
  } as unknown as APIGatewayProxyEvent;
}

const json = (res: { body: string }) => JSON.parse(res.body);
const publishedEvents = () =>
  eventSend.mock.calls.flatMap(([command]) =>
    ((command as unknown as { input: { Entries: { DetailType: string; Detail: string }[] } }).input.Entries ?? []).map((e) => ({
      type: e.DetailType,
      detail: JSON.parse(e.Detail),
    }))
  );

beforeEach(() => {
  eventSend.mockClear();
  dbSend.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---- Tests -----------------------------------------------------------------

describe("rules from the RulesConfig table", () => {
  it("serves the active ruleset", async () => {
    const res = await recommendation(request("GET", "/api/v1/rules"));
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({ id: "cpcb-india-v1", source: "dynamodb" });
  });

  it("applies table edits to recommendations", async () => {
    const res = await recommendation(
      request("GET", "/api/v1/recommendations/current", { query: { campus: "city-delhi", scenario: "poor" } })
    );
    expect(json(res)).toMatchObject({ status: "Poor", action: editedPoor, rule: { config: "dynamodb" } });
  });
});

describe("live readings and events", () => {
  it("stores a new reading and emits reading + threshold-crossed events", async () => {
    previousReading = {
      PK: "CAMPUS#city-pune", SK: "READING#2026-01-01T00:00:00.000Z", campus: "city-pune", aqi: 150,
      dominantPollutant: "pm10", pollutants: {}, source: "Open-Meteo", stationName: "Pune",
      timestamp: "2026-01-01T00:00:00.000Z", fetchedAt: "", dataMode: "live",
    };
    const res = await aqi(request("GET", "/api/v1/aqi/current", { query: { campus: "city-pune" } }));
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({ aqi: 233, status: "Poor", source: "Open-Meteo" });

    const events = publishedEvents();
    expect(events.map((e) => e.type)).toEqual(["aqi.reading.received", "aqi.threshold.crossed"]);
    expect(events[1].detail).toMatchObject({
      area: "city-pune", previousStatus: "Moderate", status: "Poor", direction: "worse",
    });
  });

  it("does not emit when the reading was already stored", async () => {
    readingAlreadyStored = true;
    try {
      const res = await aqi(request("GET", "/api/v1/aqi/current", { query: { campus: "city-pune" } }));
      expect(res.statusCode).toBe(200);
      expect(publishedEvents()).toEqual([]);
    } finally {
      readingAlreadyStored = false;
    }
  });

  it("serves readings even when EventBridge is down", async () => {
    eventSend.mockRejectedValueOnce(new Error("EventBridge unavailable"));
    const res = await aqi(request("GET", "/api/v1/aqi/current", { query: { campus: "city-nagpur" } }));
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /explain", () => {
  it("returns a guardrail-checked AI explanation", async () => {
    geminiText =
      "Air quality in Delhi is Poor, with an AQI of 268, mostly from PM2.5. Avoid long outdoor activity today and keep windows closed at peak hours.";
    const res = await explain(request("GET", "/api/v1/explain", { query: { campus: "city-delhi", scenario: "poor" } }));
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({ generatedBy: "ai", explanation: geminiText, aqi: 268, status: "Poor" });
    expect(json(res).groundedIn).toContain("rule:cpcb-india-v1/Poor");
  });

  it("falls back to the deterministic explanation when the guardrails reject the output", async () => {
    geminiText = "Air quality in Delhi is Poor (AQI 268). Take your inhaler and stay home for 3 days.";
    const res = await explain(
      request("GET", "/api/v1/explain", { query: { campus: "city-delhi", scenario: "poor", lang: "hi" } })
    );
    const body = json(res);
    expect(body).toMatchObject({ generatedBy: "template", fallbackReason: "guardrail:medical_or_safety_claim" });
    expect(body.explanation).toContain("वायु गुणवत्ता सूचकांक (AQI) 268");
  });

  it("validates the query", async () => {
    const res = await explain(request("GET", "/api/v1/explain", { query: { campus: "city-delhi", lang: "fr" } }));
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toBe("lang must be en or hi");
  });
});

describe("alerts", () => {
  const body = { campus: "city-delhi", audience: "neighbours", message: "Please stay indoors.", scenario: "poor" };

  it("requires a signed-in user", async () => {
    const res = await alerts(request("POST", "/api/v1/alerts", { body }));
    expect(res.statusCode).toBe(401);
  });

  it("rejects old institutional audiences and malformed JSON", async () => {
    const res = await alerts(request("POST", "/api/v1/alerts", { body: { ...body, audience: "parents" }, user: "Asha" }));
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toBe("Unknown audience: parents");
    const bad = await alerts({ ...request("POST", "/api/v1/alerts", { user: "Asha" }), body: "{oops" });
    expect(bad.statusCode).toBe(400);
  });

  it("creates the alert with the signed-in name and emits alert.created", async () => {
    const res = await alerts(request("POST", "/api/v1/alerts", { body: { ...body, adminName: "Mallory" }, user: "Asha" }));
    expect(res.statusCode).toBe(201);
    expect(json(res)).toMatchObject({ adminName: "Asha", audience: "neighbours", recommendation: { action: editedPoor } });
    expect(publishedEvents()).toEqual([
      expect.objectContaining({ type: "alert.created", detail: expect.objectContaining({ audience: "neighbours", status: "Poor" }) }),
    ]);
  });

  it("emits alert.decision.recorded", async () => {
    const res = await alerts({
      ...request("PATCH", "/api/v1/alerts/abc/decision", {
        body: { decision: "Moved the walk indoors", createdAt: "2026-10-10T10:00:00.000Z" },
        user: "Asha",
        query: { campus: "city-delhi" },
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(publishedEvents().map((e) => e.type)).toEqual(["alert.decision.recorded"]);
  });
});

describe("notice drafts and auth", () => {
  it("drafts for the chosen audience, signed by the sender", async () => {
    const res = await notices(
      request("GET", "/api/v1/notices/draft", { query: { campus: "city-delhi", scenario: "poor", audience: "family" }, user: "Asha" })
    );
    const draft = json(res);
    expect(res.statusCode).toBe(200);
    expect(draft.en).toMatch(/^Dear family,/);
    expect(draft.en).toMatch(/— Asha \(via BreatheSafe\)$/);
  });

  it("validates sign-up input before calling Cognito", async () => {
    const res = await auth(request("POST", "/api/v1/auth/signup", { body: { email: "not-an-email", password: "secret123", name: "A" } }));
    expect(res.statusCode).toBe(400);
    expect(json(res)).toEqual({ error: "Enter a valid email address", code: "INVALID_INPUT" });
  });
});
