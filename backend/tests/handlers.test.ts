import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SSMClient } from "@aws-sdk/client-ssm";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { marshall } from "@aws-sdk/util-dynamodb";
import { CPCB_THRESHOLDS } from "../shared/src/aqi-categories.js";
import { rulesetItems } from "../shared/src/rules.js";

/*
 * Handler-level tests: real handlers, AWS SDK clients and fetch stubbed.
 * Live mode, so requests without ?scenario= go through the Google Air Quality path
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

const defaultDb = async (command: {
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
};
const dbSend = vi.spyOn(DynamoDBClient.prototype, "send").mockImplementation(defaultDb as never);

const eventSend = vi
  .spyOn(EventBridgeClient.prototype, "send")
  .mockImplementation((async () => ({ FailedEntryCount: 0 })) as never);
const cognitoSend = vi.spyOn(CognitoIdentityProviderClient.prototype, "send");
vi.spyOn(SSMClient.prototype, "send").mockImplementation((async () => ({ Parameter: { Value: "test-key" } })) as never);

let geminiText = "";
function googleCurrent() {
  const hour = new Date();
  hour.setUTCMinutes(0, 0, 0);
  return {
    dateTime: hour.toISOString(),
    regionCode: "in",
    indexes: [{ code: "ind_cpcb", aqi: 233, category: "Poor air quality", dominantPollutant: "pm25" }],
    pollutants: [
      { code: "pm25", concentration: { value: 100, units: "MICROGRAMS_PER_CUBIC_METER" } },
      { code: "no2", concentration: { value: 21.3, units: "PARTS_PER_BILLION" } },
    ],
  };
}
const googleRequests: { path: string; key: string | null; body: Record<string, unknown> }[] = [];
let googleDown = false;
const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
  const href = String(url);
  if (href.includes("airquality.googleapis.com") && googleDown) {
    return new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403 });
  }
  if (href.includes("api.airvisual.com")) {
    return new Response(
      JSON.stringify({
        status: "success",
        data: { current: { pollution: { ts: new Date().toISOString(), aqius: 160, mainus: "p2", aqicn: 144, maincn: "p1" } } },
      })
    );
  }
  if (href.includes("airquality.googleapis.com")) {
    googleRequests.push({
      path: new URL(href).pathname,
      key: new Headers(init?.headers).get("X-Goog-Api-Key"),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify(googleCurrent()));
  }
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
const alerts_ = alerts;
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
      ? { authorizer: { claims: { name: options.user, sub: `sub-${options.user}`, "custom:role": "admin" } } }
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
      dominantPollutant: "pm10", pollutants: {}, source: "Google Air Quality", stationName: "Pune",
      timestamp: "2026-01-01T00:00:00.000Z", fetchedAt: "", dataMode: "live",
    };
    const res = await aqi(request("GET", "/api/v1/aqi/current", { query: { campus: "city-pune" } }));
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({
      aqi: 233,
      status: "Poor",
      source: "Google Air Quality",
      pollutants: { pm25: 100, no2: 40.1 },
    });
    const call = googleRequests.at(-1)!;
    expect(call.path).toBe("/v1/currentConditions:lookup");
    expect(call.key).toBe("test-key");
    expect(call.body).toMatchObject({ customLocalAqis: [{ regionCode: "IN", aqi: "ind_cpcb" }], universalAqi: false });

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

  it("reuses a reading stored in the last 30 minutes instead of calling Google", async () => {
    const stored = {
      PK: "CAMPUS#city-jaipur", SK: "READING#x", campus: "city-jaipur", aqi: 120, dominantPollutant: "pm10",
      pollutants: {}, source: "Google Air Quality", stationName: "Jaipur", timestamp: new Date().toISOString(),
      fetchedAt: new Date(Date.now() - 5 * 60e3).toISOString(), dataMode: "live",
    };
    previousReading = stored;
    const before = googleRequests.length;
    try {
      const res = await aqi(request("GET", "/api/v1/aqi/current", { query: { campus: "city-jaipur" } }));
      expect(json(res)).toMatchObject({ aqi: 120, source: "Google Air Quality" });
      expect(googleRequests.length).toBe(before);
    } finally {
      previousReading = null;
    }
  });

  it("falls back to an estimated Indian AQI from IQAir when Google is unavailable", async () => {
    googleDown = true;
    try {
      const res = await aqi(request("GET", "/api/v1/aqi/current", { query: { campus: "city-lucknow" } }));
      expect(res.statusCode).toBe(200);
      expect(json(res)).toMatchObject({
        aqi: 192,
        status: "Moderate",
        dominantPollutant: "pm10",
        source: "IQAir (estimated Indian AQI)",
        pollutants: {},
        dataMode: "live",
      });
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes("api.airvisual.com/v2/nearest_city"))).toBe(true);
    } finally {
      googleDown = false;
    }
  });

  it("serves many places at once for the globe", async () => {
    const res = await aqi(
      request("GET", "/api/v1/aqi/sites", { query: { points: "26.92,75.79;26.93,75.80;51.51,-0.13" } })
    );
    expect(res.statusCode).toBe(200);
    const { points } = json(res);
    // Both Jaipur points share one area (one lookup).
    expect(points["26.92,75.79"]).toMatchObject({ aqi: 233, dominant: "pm25", pm25: 100 });
    expect(points["26.92,75.79"]).not.toHaveProperty("usAqi");
    expect(points["26.93,75.80"]).toEqual(points["26.92,75.79"]);
    expect(points["51.51,-0.13"]).toBeNull(); // outside India
  });

  it("rejects malformed site lists", async () => {
    const res = await aqi(request("GET", "/api/v1/aqi/sites", { query: { points: "28.6;77.2" } }));
    expect(res.statusCode).toBe(400);
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
    expect(draft.en).toMatch(/— Asha \(via VayuSaathi\)$/);
  });

  it("serves the reviewed template without sign-in, unsigned", async () => {
    const res = await notices(
      request("GET", "/api/v1/notices/template", { query: { campus: "city-delhi", scenario: "poor", audience: "family" } })
    );
    const draft = json(res);
    expect(res.statusCode).toBe(200);
    expect(draft.source).toBe("template");
    expect(draft.en).toMatch(/— VayuSaathi$/);
    expect(draft.hi).toMatch(/— वायुसाथी$/);
  });

  it("still requires sign-in for the personalised draft", async () => {
    const res = await notices(
      request("GET", "/api/v1/notices/draft", { query: { campus: "city-delhi", scenario: "poor", audience: "family" } })
    );
    expect(res.statusCode).toBe(401);
  });

  it("validates sign-up input before calling Cognito", async () => {
    const res = await auth(request("POST", "/api/v1/auth/signup", { body: { email: "not-an-email", password: "secret123", name: "A" } }));
    expect(res.statusCode).toBe(400);
    expect(json(res)).toEqual({ error: "Enter a valid email address", code: "INVALID_INPUT" });
  });
});

describe("idempotent alert creation", () => {
  const body = { campus: "city-delhi", audience: "family", message: "Please stay indoors.", scenario: "poor" };
  const withKey = (key: string, b: unknown = body) => {
    const e = request("POST", "/api/v1/alerts", { body: b, user: "Asha" });
    return { ...e, headers: { "Idempotency-Key": key } } as APIGatewayProxyEvent;
  };

  it("returns the original alert when the same key is retried", async () => {
    const records = new Map<string, Record<string, unknown>>();
    const alerts = new Map<string, Record<string, unknown>>();
    dbSend.mockImplementation((async (command: { constructor: { name: string }; input: Record<string, any> }) => {
      const name = command.constructor.name;
      const { unmarshall } = await import("@aws-sdk/util-dynamodb");
      if (name === "PutItemCommand" && command.input.TableName === "alerts") {
        const item = unmarshall(command.input.Item);
        const id = `${item.PK}|${item.SK}`;
        if (String(item.PK).startsWith("IDEMPOTENCY#")) {
          if (records.has(id)) {
            throw new ConditionalCheckFailedException({ message: "exists", $metadata: {}, Item: marshall(records.get(id)!) } as never);
          }
          records.set(id, item);
        } else {
          alerts.set(id, item);
        }
        return {};
      }
      if (name === "UpdateItemCommand" && command.input.TableName === "alerts") {
        const key = unmarshall(command.input.Key);
        const values = unmarshall(command.input.ExpressionAttributeValues);
        const record = records.get(`${key.PK}|${key.SK}`);
        if (record && values[":done"]) Object.assign(record, { status: "done", alertPK: values[":pk"], alertSK: values[":sk"] });
        return {};
      }
      if (name === "GetItemCommand" && command.input.TableName === "alerts") {
        const key = unmarshall(command.input.Key);
        const item = alerts.get(`${key.PK}|${key.SK}`);
        return item ? { Item: marshall(item, { removeUndefinedValues: true }) } : {};
      }
      if (name === "QueryCommand" && command.input.TableName === "rules") {
        return { Items: rulesetItems("cpcb-india-v1", storedRules).map((i) => marshall(i)) };
      }
      return {};
    }) as never);

    try {
      const first = await alerts_(withKey("key-12345678"));
      const second = await alerts_(withKey("key-12345678"));
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(200);
      expect(second.headers?.["Idempotent-Replayed"]).toBe("true");
      expect(json(second).alertId).toBe(json(first).alertId);
      expect(alerts.size).toBe(1);

      const reused = await alerts_(withKey("key-12345678", { ...body, message: "Different text" }));
      expect(reused.statusCode).toBe(422);
      const bad = await alerts_(withKey("short"));
      expect(bad.statusCode).toBe(400);
    } finally {
      dbSend.mockImplementation(defaultDb as never);
    }
  });
});

describe("POST /plans/evaluate", () => {
  it("returns a verdict per plan from the current reading", async () => {
    const res = await recommendation(
      request("POST", "/api/v1/plans/evaluate", {
        body: {
          campus: "city-delhi",
          scenario: "poor",
          plans: [
            { id: "a", activity: "commute", durationMinutes: 20 },
            { id: "b", activity: "run", durationMinutes: 45 },
          ],
        },
      })
    );
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({
      status: "Poor",
      verdicts: [
        { id: "a", verdict: "modify" },
        { id: "b", verdict: "avoid" },
      ],
    });
  });
});

describe("account recovery and sign-out", () => {
  beforeEach(() => {
    cognitoSend.mockReset();
    cognitoSend.mockImplementation((async () => ({})) as never);
  });

  it("answers forgot-password the same way for unknown emails", async () => {
    cognitoSend.mockRejectedValueOnce(Object.assign(new Error("no user"), { name: "UserNotFoundException" }));
    const res = await auth(request("POST", "/api/v1/auth/forgot-password", { body: { email: "nobody@example.com" } }));
    expect(res.statusCode).toBe(200);
    expect(json(res).message).toMatch(/If an account exists/);
  });

  it("resets the password with the emailed code", async () => {
    cognitoSend.mockResolvedValueOnce({} as never);
    const res = await auth(
      request("POST", "/api/v1/auth/reset-password", { body: { email: "a@b.co", code: "123456", password: "newpass123" } })
    );
    expect(res.statusCode).toBe(200);
    expect((cognitoSend.mock.calls[0][0] as { constructor: { name: string } }).constructor.name).toBe("ConfirmForgotPasswordCommand");
  });

  it("maps a wrong reset code to a stable error", async () => {
    cognitoSend.mockRejectedValueOnce(Object.assign(new Error("bad code"), { name: "CodeMismatchException" }));
    const res = await auth(
      request("POST", "/api/v1/auth/reset-password", { body: { email: "a@b.co", code: "000000", password: "newpass123" } })
    );
    expect(res.statusCode).toBe(400);
    expect(json(res).code).toBe("INVALID_CODE");
  });

  it("revokes the refresh token on sign-out, and still succeeds if revocation fails", async () => {
    cognitoSend.mockRejectedValueOnce(Object.assign(new Error("x"), { name: "UnsupportedTokenTypeException" }));
    const res = await auth(request("POST", "/api/v1/auth/signout", { body: { refreshToken: "rt" } }));
    expect(res.statusCode).toBe(200);
    expect((cognitoSend.mock.calls[0][0] as { constructor: { name: string } }).constructor.name).toBe("RevokeTokenCommand");
  });
});

describe("two-step verification setup", () => {
  const sent = () => cognitoSend.mock.calls.map(([c]) => (c as { constructor: { name: string } }).constructor.name);
  beforeEach(() => {
    cognitoSend.mockReset();
    cognitoSend.mockImplementation((async () => ({})) as never);
  });
  const bearer = (e: APIGatewayProxyEvent) => ({ ...e, headers: { Authorization: "Bearer access" } }) as APIGatewayProxyEvent;

  it("rejects codes that aren't 6 digits", async () => {
    const res = await auth(bearer(request("POST", "/api/v1/auth/mfa/enable", { body: { code: "12ab" } })));
    expect(res.statusCode).toBe(400);
  });

  it("sets up an authenticator app and enables MFA after a correct code", async () => {
    cognitoSend.mockImplementation((async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === "AssociateSoftwareTokenCommand") return { SecretCode: "ABCDEF" };
      if (cmd.constructor.name === "GetUserCommand") return { UserAttributes: [{ Name: "email", Value: "a@b.co" }] };
      if (cmd.constructor.name === "VerifySoftwareTokenCommand") return { Status: "SUCCESS" };
      return {};
    }) as never);
    const setup = await auth(bearer(request("POST", "/api/v1/auth/mfa/setup", { body: {} })));
    expect(json(setup)).toEqual({ secret: "ABCDEF", otpauthUri: "otpauth://totp/VayuSaathi%3Aa%40b.co?secret=ABCDEF&issuer=VayuSaathi" });
    const enable = await auth(bearer(request("POST", "/api/v1/auth/mfa/enable", { body: { code: "123456" } })));
    expect(json(enable)).toMatchObject({ mfaEnabled: true });
    expect(sent()).toContain("SetUserMFAPreferenceCommand");
  });

  it("requires a signed-in user for setup", async () => {
    const res = await auth(request("POST", "/api/v1/auth/mfa/setup", { body: {} }));
    expect(res.statusCode).toBe(401);
    expect(json(res)).toEqual({ error: "Please sign in to continue.", code: "SIGN_IN_REQUIRED" });
  });

  it("tells an expired session to sign in again", async () => {
    cognitoSend.mockRejectedValue(Object.assign(new Error("Access Token has expired"), { name: "NotAuthorizedException" }));
    const res = await auth(bearer(request("POST", "/api/v1/auth/mfa/setup", { body: {} })));
    expect(json(res)).toEqual({ error: "Your session has expired. Please sign in again.", code: "SESSION_EXPIRED" });
  });
});

describe("catalog and trend statuses", () => {
  it("serves the choices the API accepts, labelled from the active rules", async () => {
    const res = await recommendation(request("GET", "/api/v1/catalog"));
    const catalog = json(res);
    expect(res.statusCode).toBe(200);
    expect(catalog.audiences.map((a: { value: string }) => a.value)).toEqual(["all", "family", "neighbours", "group"]);
    expect(catalog.audienceLabels).toMatchObject({ family: "My family", parents: "Parents" });
    expect(catalog.activities).toContainEqual({ value: "kids_play", label: "Children playing outside" });
    expect(catalog.demoScenarios).toContainEqual({ value: "poor", label: "Poor (201–300)" });
    expect(catalog.defaultDemoScenario).toBe("poor");
    // Reference data and limits the browser would otherwise copy.
    expect(catalog.pollutantLimits.pm25).toEqual({ limit: 60, averaging: "24-hour" });
    expect(catalog.decisionOptions).toContain("Moved plans indoors");
    expect(catalog.limits).toEqual({ maxEmergencyContacts: 5, maxAlertMessage: 2000, maxPlans: 12, maxPlaces: 5 });
    expect(catalog.indiaBounds).toMatchObject({ minLat: 5, maxLon: 99 });
  });

  it("gives every area its coordinates", async () => {
    const { handler: areas } = await import("../services/aqi-data/src/handler.js");
    const listed = json(await areas(request("GET", "/api/v1/areas"))).areas as { id: string; lat: number; lon: number }[];
    expect(listed.find((a) => a.id === "city-delhi")).toMatchObject({ lat: expect.any(Number), lon: expect.any(Number) });
    expect(listed.every((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))).toBe(true);
  });

  it("labels each trend point with its category", async () => {
    const { handler: trends } = await import("../services/trends/src/handler.js");
    const res = await trends(request("GET", "/api/v1/trends", { query: { campus: "city-delhi", scenario: "severe", hours: "6" } }));
    const points = json(res).points as { aqi: number; status: string }[];
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(p.status).toBe(p.aqi > 400 ? "Severe" : p.aqi > 300 ? "Very Poor" : p.aqi > 200 ? "Poor" : p.aqi > 100 ? "Moderate" : p.aqi > 50 ? "Satisfactory" : "Good");
  });
});
