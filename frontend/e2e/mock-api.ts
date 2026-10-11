import type { Page, Request } from "@playwright/test";

/** A fake VayuSaathi API served from inside the browser (host api.test). */

/** An unsigned JWT-shaped token (the app only decodes, never verifies, tokens). */
function fakeJwt(claims: Record<string, unknown>): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${part({ alg: "none", kid: "e2e" })}.${part({ iat: now, exp: now + 3600, ...claims })}.sig`;
}

export const TOKENS = {
  AccessToken: fakeJwt({ token_use: "access", sub: "asha-sub", username: "asha-sub" }),
  IdToken: fakeJwt({ token_use: "id", sub: "asha-sub", email: "asha@example.com", name: "Asha Verma", "custom:role": "admin" }),
  RefreshToken: "e2e-refresh-token",
  ExpiresIn: 3600,
  TokenType: "Bearer",
};

const band = (minAqi: number, maxAqi: number, status: string, statusLevel: number) => ({
  minAqi, maxAqi, status, statusLevel, action: `Action for ${status}.`, color: "#000000",
});
const RULESET = {
  id: "cpcb-india-v1",
  source: "dynamodb",
  thresholds: [
    band(0, 50, "Good", 1), band(51, 100, "Satisfactory", 2), band(101, 200, "Moderate", 3),
    band(201, 300, "Poor", 4), band(301, 400, "Very Poor", 5), band(401, 500, "Severe", 6),
  ],
};
const CATALOG = {
  audiences: [
    { value: "all", label: "Everyone" },
    { value: "family", label: "My family" },
    { value: "neighbours", label: "My neighbourhood / society" },
    { value: "group", label: "My team / group" },
  ],
  audienceLabels: { all: "Everyone", family: "My family", neighbours: "My neighbourhood / society", group: "My team / group" },
  activities: [
    { value: "walk", label: "Walk" },
    { value: "run", label: "Run or workout" },
  ],
  demoScenarios: [{ value: "poor", label: "Poor (201–300)" }],
  defaultDemoScenario: "poor",
  emergencyServices: [
    { label: "All emergencies", number: "112" },
    { label: "Ambulance", number: "108" },
  ],
};

export const AREA = { id: "city-delhi", kind: "city", name: "Delhi", city: "Delhi", state: "Delhi" };

const now = () => new Date().toISOString();

const reading = () => ({
  campus: AREA.id,
  aqi: 268,
  dominantPollutant: "pm25",
  pollutants: { pm25: 132.4, pm10: 210.5, no2: 41.2 },
  pollutantScale: "concentration",
  source: "Google Air Quality",
  stationName: "Delhi",
  timestamp: now(),
  fetchedAt: now(),
  dataMode: "live",
  status: "Poor",
  statusLevel: 4,
  area: AREA,
});

const recommendation = () => ({
  status: "Poor",
  statusLevel: 4,
  action: "Avoid prolonged outdoor activity. Keep windows closed at peak hours and let your family and neighbours know.",
  evidence: {
    aqi: 268, dominantPollutant: "pm25", pollutants: { pm25: 132.4 }, pollutantScale: "concentration",
    source: "Google Air Quality", stationName: "Delhi", timestamp: now(), dataAge: "Just now",
  },
  rule: { id: "cpcb-india-v1", config: "dynamodb", name: "CPCB AQI Category — Poor (201–300)", threshold: "AQI 201–300", source: "Central Pollution Control Board, India" },
  dataQuality: "live",
  disclaimer: "This is decision support, not medical advice.",
});

export interface ApiLog {
  createdAlert?: { body: Record<string, unknown>; idempotencyKey?: string };
  decision?: Record<string, unknown>;
  mfaCode?: string;
  /** True if the password itself was ever sent to Cognito (it must not be, with SRP). */
  srpPasswordSent?: boolean;
  srpProofReceived?: boolean;
  /** Last body sent to PUT /auth/profile. */
  savedProfile?: Record<string, unknown>;
}

export async function mockApi(page: Page, options: { mfa?: boolean } = {}): Promise<ApiLog> {
  const log: ApiLog = {};
  let alert: Record<string, unknown> | null = null;
  let profile: Record<string, unknown> = {
    email: "asha@example.com",
    name: "Asha Verma",
    mfaEnabled: !!options.mfa,
    emergencyContacts: [],
  };

  await page.route("http://api.test/**", async (route) => {
    const request: Request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,Idempotency-Key",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,OPTIONS",
    };
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(body) });

    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });

    if (path.endsWith("/aqi/current")) return json(200, reading());
    if (path.endsWith("/recommendations/current")) return json(200, recommendation());
    if (path.endsWith("/trends")) {
      const points = Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600e3).toISOString(),
        aqi: 200 + i * 3, status: "Poor", dominantPollutant: "pm25", source: "Google Air Quality", dataMode: "live",
      }));
      return json(200, { campus: AREA.id, points, period: "24h", dataMode: "live" });
    }
    if (path.endsWith("/plans/evaluate")) {
      const { plans } = request.postDataJSON() as { plans: { id: string; activity: string }[] };
      return json(200, {
        status: "Poor", aqi: 268, dataQuality: "live", basedOn: now(),
        verdicts: plans.map((p) =>
          p.activity === "run"
            ? { id: p.id, verdict: "avoid", reason: "Run or workout: Poor air, strenuous activity.", suggestion: "Work out indoors or reschedule." }
            : { id: p.id, verdict: "modify", reason: "Walk: Poor air, light activity.", suggestion: "Keep it shorter and at an easy pace." }
        ),
        disclaimer: "Based on the current reading, not a forecast. Decision support, not medical advice.",
      });
    }
    if (path.endsWith("/auth/profile")) {
      if (request.headers()["authorization"] !== `Bearer ${TOKENS.AccessToken}`) return json(401, { error: "Unauthorized" });
      if (request.method() === "PUT") {
        const body = request.postDataJSON() as Record<string, unknown>;
        log.savedProfile = body;
        // Mirror the server: Indian mobile numbers come back in +91 form.
        const e164 = (p: unknown) => (typeof p === "string" && /^\d{10}$/.test(p.replace(/\s/g, "")) ? `+91${p.replace(/\s/g, "")}` : p);
        const contacts = (body.emergencyContacts as { name: string; phone: string }[]).map((c) => ({ ...c, phone: e164(c.phone) }));
        profile = { ...profile, ...body, phone: e164(body.phone), emergencyContacts: contacts };
        if (profile.avatar === null) delete profile.avatar;
      }
      return json(200, profile);
    }
    if (path.endsWith("/notices/template")) {
      return json(200, {
        en: "Dear family,\n\nThe Air Quality Index (AQI) for Delhi is 268 (Poor). Please avoid prolonged outdoor activity today.\n\n— VayuSaathi",
        hi: "प्रिय परिवारजनों,\n\nDelhi में वायु गुणवत्ता सूचकांक (AQI) 268 (खराब) है।\n\n— वायुसाथी",
        source: "template", status: "Poor", aqi: 268,
      });
    }
    if (path.endsWith("/notices/draft")) {
      return json(200, {
        en: "Dear family,\n\nThe Air Quality Index (AQI) for Delhi is 268 (Poor). Please avoid prolonged outdoor activity today.\n\n— Asha Verma (via VayuSaathi)",
        hi: "प्रिय परिवारजनों,\n\nDelhi में वायु गुणवत्ता सूचकांक (AQI) 268 (खराब) है।\n\n— Asha Verma (वायुसाथी द्वारा)",
        source: "template", status: "Poor", aqi: 268,
      });
    }
    if (path.endsWith("/alerts") && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      log.createdAlert = { body, idempotencyKey: request.headers()["idempotency-key"] };
      alert = {
        alertId: "alert-1", campus: AREA.id, areaName: "Delhi", audience: body.audience, message: body.message,
        messageHi: body.messageHi, noticeSource: "template", aqiSnapshot: reading(), recommendation: recommendation(),
        status: "sent", delivery: { inApp: true, email: "not_configured" }, decision: null, decisionTimestamp: null,
        decisionBy: null, adminName: "Asha Verma", createdAt: now(),
      };
      return json(201, alert);
    }
    if (path.endsWith("/alerts")) return json(200, { alerts: alert ? [alert] : [], count: alert ? 1 : 0 });
    if (path.endsWith("/decision")) {
      log.decision = request.postDataJSON() as Record<string, unknown>;
      return json(200, { success: true, alertId: "alert-1", decisionTimestamp: now() });
    }
    if (path.endsWith("/rules")) return json(200, RULESET);
    if (path.endsWith("/catalog")) return json(200, CATALOG);
    if (path.endsWith("/explain")) return json(503, { error: "Not mocked" });
    return json(404, { error: `Not mocked: ${path}` });
  });

  // Cognito (SRP sign-in happens in the browser, straight to Cognito).
  await page.route("https://cognito-idp.ap-south-1.amazonaws.com/**", async (route) => {
    const request = route.request();
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const target = (request.headers()["x-amz-target"] ?? "").split(".").pop();
    const body = request.postDataJSON() as {
      ChallengeName?: string;
      ChallengeResponses?: Record<string, string>;
      Session?: string;
    };
    const reply = (status: number, payload: unknown) =>
      route.fulfill({ status, headers: { ...cors, "Content-Type": "application/x-amz-json-1.1" }, body: JSON.stringify(payload) });

    if (target === "InitiateAuth") {
      log.srpPasswordSent = JSON.stringify(body).includes("secret123");
      return reply(200, {
        ChallengeName: "PASSWORD_VERIFIER",
        ChallengeParameters: {
          SALT: "5a1d3c9e8f7b6a5d",
          SECRET_BLOCK: Buffer.from("e2e-secret-block").toString("base64"),
          SRP_B: "ab".repeat(192),
          USERNAME: "asha-sub",
          USER_ID_FOR_SRP: "asha-sub",
        },
      });
    }
    if (target === "RespondToAuthChallenge" && body.ChallengeName === "PASSWORD_VERIFIER") {
      log.srpProofReceived = typeof body.ChallengeResponses?.PASSWORD_CLAIM_SIGNATURE === "string";
      log.srpPasswordSent ||= JSON.stringify(body).includes("secret123");
      return options.mfa
        ? reply(200, { ChallengeName: "SOFTWARE_TOKEN_MFA", Session: "mfa-session", ChallengeParameters: {} })
        : reply(200, { AuthenticationResult: TOKENS, ChallengeParameters: {} });
    }
    if (target === "RespondToAuthChallenge" && body.ChallengeName === "SOFTWARE_TOKEN_MFA") {
      log.mfaCode = body.ChallengeResponses?.SOFTWARE_TOKEN_MFA_CODE;
      return log.mfaCode === "123456" && body.Session === "mfa-session"
        ? reply(200, { AuthenticationResult: TOKENS, ChallengeParameters: {} })
        : reply(400, { __type: "CodeMismatchException", message: "Invalid code received for user" });
    }
    return reply(400, { __type: "InvalidParameterException", message: `Not mocked: ${target}` });
  });

  // The dashboard area is normally detected from location; start with Delhi.
  await page.addInitScript((area) => {
    localStorage.setItem("breathesafe_area", JSON.stringify(area));
  }, AREA);

  return log;
}
