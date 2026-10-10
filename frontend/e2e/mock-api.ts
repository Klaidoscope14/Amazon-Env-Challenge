import type { Page, Request } from "@playwright/test";

/** A fake BreatheSafe API served from inside the browser (host api.test). */

export const AREA = { id: "city-delhi", kind: "city", name: "Delhi", city: "Delhi", state: "Delhi" };

const now = () => new Date().toISOString();

const reading = () => ({
  campus: AREA.id,
  aqi: 268,
  dominantPollutant: "pm25",
  pollutants: { pm25: 132.4, pm10: 210.5, no2: 41.2 },
  pollutantScale: "concentration",
  source: "Open-Meteo",
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
    source: "Open-Meteo", stationName: "Delhi", timestamp: now(), dataAge: "Just now",
  },
  rule: { id: "cpcb-india-v1", config: "dynamodb", name: "CPCB AQI Category — Poor (201–300)", threshold: "AQI 201–300", source: "Central Pollution Control Board, India" },
  dataQuality: "live",
  disclaimer: "This is decision support, not medical advice.",
});

export interface ApiLog {
  createdAlert?: { body: Record<string, unknown>; idempotencyKey?: string };
  decision?: Record<string, unknown>;
}

export async function mockApi(page: Page): Promise<ApiLog> {
  const log: ApiLog = {};
  let alert: Record<string, unknown> | null = null;

  await page.route("http://api.test/**", async (route) => {
    const request: Request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,Idempotency-Key",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    };
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(body) });

    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });

    if (path.endsWith("/aqi/current")) return json(200, reading());
    if (path.endsWith("/recommendations/current")) return json(200, recommendation());
    if (path.endsWith("/trends")) {
      const points = Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600e3).toISOString(),
        aqi: 200 + i * 3, dominantPollutant: "pm25", source: "Open-Meteo", dataMode: "live",
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
    if (path.endsWith("/auth/signin")) {
      return json(200, { message: "ok", accessToken: "access-token", idToken: "id-token", refreshToken: "refresh-token", expiresIn: 3600 });
    }
    if (path.endsWith("/auth/profile")) {
      return request.headers()["authorization"] === "Bearer access-token"
        ? json(200, { email: "asha@example.com", name: "Asha Verma" })
        : json(401, { error: "Unauthorized" });
    }
    if (path.endsWith("/notices/draft")) {
      return json(200, {
        en: "Dear family,\n\nThe Air Quality Index (AQI) for Delhi is 268 (Poor). Please avoid prolonged outdoor activity today.\n\n— Asha Verma (via BreatheSafe)",
        hi: "प्रिय परिवारजनों,\n\nDelhi में वायु गुणवत्ता सूचकांक (AQI) 268 (खराब) है।\n\n— Asha Verma (BreatheSafe द्वारा)",
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
    if (path.endsWith("/rules")) return json(404, { error: "Not mocked" });
    if (path.endsWith("/explain")) return json(503, { error: "Not mocked" });
    return json(404, { error: `Not mocked: ${path}` });
  });

  // The dashboard area is normally detected from location; start with Delhi.
  await page.addInitScript((area) => {
    localStorage.setItem("breathesafe_area", JSON.stringify(area));
  }, AREA);

  return log;
}
