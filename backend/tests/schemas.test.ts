import { describe, expect, it } from "vitest";
import {
  AlertsQuerySchema,
  CreateAlertBodySchema,
  ExplainQuerySchema,
  NearestQuerySchema,
  NoticeDraftQuerySchema,
  parse,
  RecordDecisionBodySchema,
  SignUpBodySchema,
  TrendsQuerySchema,
  ValidationError,
} from "../shared/src/schemas.js";

const message = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof ValidationError) return err.message;
    throw err;
  }
  return null;
};

describe("create alert body", () => {
  const valid = { campus: "geo-288-771", audience: "family", message: "  Stay indoors today.  " };

  it("accepts a valid body, trims text and drops blank optionals", () => {
    expect(parse(CreateAlertBodySchema, { ...valid, messageHi: "  ", scenario: "" })).toEqual({
      campus: "geo-288-771",
      audience: "family",
      message: "Stay indoors today.",
    });
  });

  it("ignores fields the server sets itself", () => {
    expect(parse(CreateAlertBodySchema, { ...valid, adminName: "Mallory" })).not.toHaveProperty("adminName");
  });

  it.each([
    [{ ...valid, message: "   " }, "Missing required field: message"],
    [{ ...valid, audience: "students" }, "Unknown audience: students"],
    [{ ...valid, campus: "../etc" }, "campus (area id) is required"],
    [{ ...valid, scenario: "toString" }, "Unknown demo scenario: toString"],
    [{ ...valid, message: "x".repeat(2001) }, "message must be at most 2000 characters"],
    [{ ...valid, noticeSource: "gpt" }, "noticeSource must be template or ai"],
    [{ ...valid, message: 42 }, "message must be a string"],
  ])("rejects %o", (body, expected) => {
    expect(message(() => parse(CreateAlertBodySchema, body))).toBe(expected);
  });
});

describe("query strings", () => {
  it("defaults and caps trend hours", () => {
    expect(parse(TrendsQuerySchema, { campus: "city-pune" }).hours).toBe(24);
    expect(parse(TrendsQuerySchema, { campus: "city-pune", hours: "500" }).hours).toBe(168);
    expect(message(() => parse(TrendsQuerySchema, { campus: "city-pune", hours: "0" }))).toBe("hours must be a positive integer");
  });

  it("only accepts coordinates in India", () => {
    expect(parse(NearestQuerySchema, { lat: "28.75", lon: "77.12" })).toEqual({ lat: 28.75, lon: 77.12 });
    expect(message(() => parse(NearestQuerySchema, { lat: "51.5", lon: "-0.1" }))).toBe("lat/lon must be a location in India");
    expect(message(() => parse(NearestQuerySchema, {}))).toBe("lat/lon must be a location in India");
  });

  it("clamps the alert list limit", () => {
    expect(parse(AlertsQuerySchema, { campus: "city-pune", limit: "999" }).limit).toBe(50);
    expect(parse(AlertsQuerySchema, { campus: "city-pune", limit: "abc" }).limit).toBe(25);
  });

  it("defaults the notice audience and explanation language", () => {
    expect(parse(NoticeDraftQuerySchema, { campus: "city-pune" }).audience).toBe("all");
    expect(parse(ExplainQuerySchema, { campus: "city-pune" }).lang).toBe("en");
    expect(message(() => parse(ExplainQuerySchema, { campus: "city-pune", lang: "fr" }))).toBe("lang must be en or hi");
  });
});

describe("other bodies", () => {
  it("requires a decision", () => {
    expect(message(() => parse(RecordDecisionBodySchema, { decision: "" }))).toBe("Missing required field: decision");
  });

  it("validates sign-up details and drops unknown attributes", () => {
    const body = parse(SignUpBodySchema, { email: "a@b.co", password: "secret123", name: " Asha ", role: "admin" });
    expect(body).toEqual({ email: "a@b.co", password: "secret123", name: "Asha" });
    expect(message(() => parse(SignUpBodySchema, { email: "nope", password: "secret123", name: "A" }))).toBe("Enter a valid email address");
    expect(message(() => parse(SignUpBodySchema, { email: "a@b.co", password: "short", name: "A" }))).toBe("Password must be at least 8 characters");
  });
});
