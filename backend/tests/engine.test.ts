import { describe, expect, it } from "vitest";
import { getDataAge, getThresholdForAqi } from "../shared/src/aqi-categories.js";
import { evaluate } from "../shared/src/evaluate.js";
import type { AQIReading } from "../shared/src/types.js";

describe("getThresholdForAqi", () => {
  it.each([
    [0, "Good"], [50, "Good"], [50.4, "Good"], [50.5, "Satisfactory"], [100, "Satisfactory"],
    [100.6, "Moderate"], [200, "Moderate"], [200.7, "Poor"], [300.2, "Poor"], [301, "Very Poor"],
    [400.5, "Severe"], [500, "Severe"], [650, "Severe"],
  ])("AQI %s -> %s (fractional values never fall between bands)", (aqi, status) => {
    expect(getThresholdForAqi(aqi)?.status).toBe(status);
  });

  it.each([-5, Number.NaN, undefined, "268", null])("rejects unusable value %s", (value) => {
    expect(getThresholdForAqi(value)).toBeNull();
  });
});

describe("getDataAge", () => {
  it("treats unparseable timestamps as stale, never fresh", () => {
    expect(getDataAge("garbage")).toMatchObject({ label: "Unknown time", isStale: true });
  });
  it("treats timestamps far in the future as stale", () => {
    expect(getDataAge(new Date(Date.now() + 3600e3).toISOString()).isStale).toBe(true);
  });
  it("tolerates small clock skew", () => {
    expect(getDataAge(new Date(Date.now() + 2 * 60e3).toISOString())).toMatchObject({ label: "Just now", isStale: false });
  });
  it("is stale after two hours", () => {
    expect(getDataAge(new Date(Date.now() - 3 * 3600e3).toISOString()).isStale).toBe(true);
  });
});

const reading = (overrides: Partial<AQIReading> = {}): AQIReading => ({
  campus: "geo-288-771", aqi: 150, dominantPollutant: "pm10", pollutants: { pm10: 175 },
  source: "Open-Meteo", stationName: "Delhi area", timestamp: new Date().toISOString(),
  fetchedAt: new Date().toISOString(), dataMode: "live", ...overrides,
});

describe("evaluate", () => {
  it("returns the CPCB band, rule and disclaimer", () => {
    const rec = evaluate(reading());
    expect(rec.status).toBe("Moderate");
    expect(rec.rule.name).toContain("101–200");
    expect(rec.disclaimer).toMatch(/not medical advice/);
  });
  it("marks old cached data as stale and says so in the action", () => {
    const rec = evaluate(reading({ dataMode: "cached", timestamp: new Date(Date.now() - 3 * 3600e3).toISOString() }));
    expect(rec.dataQuality).toBe("stale");
    expect(rec.action).toMatch(/verify with official sources/);
  });
  it("never turns an invalid AQI into a category", () => {
    const rec = evaluate(reading({ aqi: undefined as unknown as number }));
    expect(rec).toMatchObject({ status: "Unavailable", statusLevel: 0, dataQuality: "unavailable" });
  });
  it("passes the pollutant scale through to the evidence", () => {
    expect(evaluate(reading({ pollutantScale: "subindex" })).evidence.pollutantScale).toBe("subindex");
  });
});
