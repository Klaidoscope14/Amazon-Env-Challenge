import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";

// Operations are mocked: this suite is about the handler's authorization gate
// and routing, not DynamoDB/SNS behaviour (covered by the operation tests).
vi.mock("../services/alerts/src/operations/createAlert.js", () => ({
  createAlert: vi.fn(async () => ({ alertId: "a1", status: "sent" })),
  NoReadingError: class NoReadingError extends Error {},
}));
vi.mock("../services/alerts/src/operations/getAlerts.js", () => ({
  getAlerts: vi.fn(async () => []),
}));
vi.mock("../services/alerts/src/operations/recordDecision.js", () => ({
  recordDecision: vi.fn(async () => ({ success: true, alertId: "a1", decisionTimestamp: "t" })),
  AlertNotFoundError: class AlertNotFoundError extends Error {},
  DecisionAlreadyRecordedError: class DecisionAlreadyRecordedError extends Error {},
}));

import { handler } from "../services/alerts/src/handler.js";
import { createAlert } from "../services/alerts/src/operations/createAlert.js";
import { recordDecision } from "../services/alerts/src/operations/recordDecision.js";

const asMock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

function event(opts: {
  method: string;
  path: string;
  claims?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}): APIGatewayProxyEvent {
  return {
    httpMethod: opts.method,
    path: opts.path,
    body: opts.body === undefined ? null : JSON.stringify(opts.body),
    queryStringParameters: opts.query ?? null,
    requestContext: opts.claims ? { authorizer: { claims: opts.claims } } : {},
  } as unknown as APIGatewayProxyEvent;
}

const ADMIN = { name: "Dr Rao", email: "rao@campus.edu", "custom:role": "admin" };
const NON_ADMIN = { name: "Dr Rao", email: "rao@campus.edu" }; // verified, but no role

afterEach(() => vi.clearAllMocks());

describe("alerts handler — role authorization", () => {
  it("rejects alert creation from a verified user without the admin role (403)", async () => {
    const res = await handler(
      event({ method: "POST", path: "/api/v1/alerts", claims: NON_ADMIN, body: { campus: "st-ito", audience: "all", message: "hi" } })
    );
    expect(res.statusCode).toBe(403);
    expect(createAlert).not.toHaveBeenCalled();
  });

  it("rejects recording a decision without the admin role (403)", async () => {
    const res = await handler(
      event({
        method: "PATCH",
        path: "/api/v1/alerts/a1/decision",
        claims: NON_ADMIN,
        query: { campus: "st-ito" },
        body: { decision: "Moved indoors" },
      })
    );
    expect(res.statusCode).toBe(403);
    expect(recordDecision).not.toHaveBeenCalled();
  });

  it("allows an admin to create an alert (201)", async () => {
    const res = await handler(
      event({ method: "POST", path: "/api/v1/alerts", claims: ADMIN, body: { campus: "st-ito", audience: "all", message: "hi" } })
    );
    expect(res.statusCode).toBe(201);
    expect(createAlert).toHaveBeenCalledTimes(1);
  });

  it("allows an admin to record a decision (200)", async () => {
    const res = await handler(
      event({
        method: "PATCH",
        path: "/api/v1/alerts/a1/decision",
        claims: ADMIN,
        query: { campus: "st-ito" },
        body: { decision: "Moved indoors", createdAt: "2026-10-10T00:00:00.000Z" },
      })
    );
    expect(res.statusCode).toBe(200);
    expect(recordDecision).toHaveBeenCalledTimes(1);
  });

  it("leaves the public read route open (no role required)", async () => {
    const res = await handler(event({ method: "GET", path: "/api/v1/alerts", query: { campus: "st-ito" } }));
    expect(res.statusCode).toBe(200);
  });
});
