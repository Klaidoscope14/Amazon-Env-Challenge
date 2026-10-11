import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ValidationError } from "./schemas.js";

/** JSON response with the CORS headers every route needs. */
export function respond(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,Idempotency-Key",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

/** The request body as a JSON object; anything else is a 400. */
export function parseJsonBody(event: APIGatewayProxyEvent): Record<string, unknown> {
  try {
    const parsed = JSON.parse(event.body || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }
  throw new ValidationError("Request body must be a JSON object");
}

export class UnauthorizedError extends Error {
  constructor(message = "Sign in to perform this action") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Your account is not allowed to perform this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Requires the server-assigned "admin" role claim. Users can't set
 * custom:role themselves; the auth service grants it to every verified
 * account, so in practice this means "a verified VayuSaathi account" — and
 * access can be narrowed later by promoting accounts manually instead.
 */
export function requireRole(event: APIGatewayProxyEvent): void {
  const claims = (event.requestContext?.authorizer?.claims ?? {}) as Record<string, unknown>;
  if (claims["custom:role"] !== "admin") throw new ForbiddenError();
}

const MAX_NAME = 100;

/**
 * The signed-in person's name, from the claims API Gateway's Cognito
 * authorizer verified. Names in the audit trail come from here, never from
 * the request body, so they can't be spoofed.
 */
export function signedInName(event: APIGatewayProxyEvent): string {
  const claims = (event.requestContext?.authorizer?.claims ?? {}) as Record<string, unknown>;
  const name = [claims.name, claims.email].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  if (!name) throw new UnauthorizedError();
  return name.trim().slice(0, MAX_NAME);
}

/** Stable id of the signed-in caller (Cognito "sub"), for per-user records. */
export function callerId(event: APIGatewayProxyEvent): string {
  const claims = (event.requestContext?.authorizer?.claims ?? {}) as Record<string, unknown>;
  const id = [claims.sub, claims.email].find((v): v is string => typeof v === "string" && v.length > 0);
  if (!id) throw new UnauthorizedError();
  return id;
}

/** A request header, case-insensitively. */
export function header(event: APIGatewayProxyEvent, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (key.toLowerCase() === wanted && value) return value;
  }
  return undefined;
}
