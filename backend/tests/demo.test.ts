import { describe, expect, it } from "vitest";
import { buildDemoTrend, fetchDemoReading, isDemoScenario } from "../shared/src/demo.js";

describe("demo scenarios", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "unknown", ""])(
    "rejects %s (no prototype keys)",
    (name) => expect(isDemoScenario(name)).toBe(false)
  );
  it("accepts the six CPCB bands", () => {
    for (const name of ["good", "satisfactory", "moderate", "poor", "veryPoor", "severe"]) {
      expect(isDemoScenario(name)).toBe(true);
    }
  });
  it("labels fixtures as demo data named after the area", () => {
    const r = fetchDemoReading("city-pune", "severe", "Pune");
    expect(r).toMatchObject({ aqi: 438, dataMode: "demo", stationName: "Pune (sample values)", campus: "city-pune" });
  });
  it("falls back to the default scenario for unknown names", () => {
    expect(fetchDemoReading("x", "constructor").aqi).toBe(268);
  });
  it("builds a labelled trend that ends at the scenario's AQI", () => {
    const points = buildDemoTrend("moderate", 24);
    expect(points).toHaveLength(25);
    expect(points.at(-1)?.aqi).toBe(167);
    expect(points.every((p) => p.dataMode === "demo")).toBe(true);
  });
});
