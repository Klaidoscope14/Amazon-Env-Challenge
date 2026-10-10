import { afterEach, describe, expect, it, vi } from "vitest";
import { getOpenMeteoReading, subIndex } from "../shared/src/open-meteo.js";

describe("CPCB sub-index", () => {
  it.each([
    ["pm25", 61, 103], ["pm10", 187, 158], ["pm25", 30.5, 51], ["pm10", 600, 500],
    ["pm10", 700, 500], ["co", 1.5, 75], ["o3", 102, 103],
  ] as const)("%s %s -> %s", (pollutant, concentration, expected) => {
    expect(subIndex(pollutant, concentration)).toBe(expected);
  });
});

describe("getOpenMeteoReading", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("computes the Indian AQI from 24h/8h averages and converts CO to mg/m³", async () => {
    const hours = 72;
    const start = Date.now() - 48 * 3600e3;
    const time = Array.from({ length: hours }, (_, i) =>
      new Date(start + i * 3600e3).toISOString().slice(0, 13) + ":00");
    const flat = (v: number | null) => Array(hours).fill(v);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      hourly: {
        time, pm10: flat(187), pm2_5: flat(61), nitrogen_dioxide: flat(30), sulphur_dioxide: flat(20),
        ammonia: flat(null), ozone: flat(60), carbon_monoxide: flat(1500),
      },
    }))));

    const reading = await getOpenMeteoReading("geo-test-1", { lat: 28.8, lon: 77.1, name: "Test area" });
    expect(reading).toMatchObject({
      aqi: 158, dominantPollutant: "pm10", source: "Open-Meteo", dataMode: "live", pollutantScale: "concentration",
    });
    expect(reading?.pollutants.co).toBe(1.5);
  });

  it("returns null when the source fails (caller falls back)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await getOpenMeteoReading("geo-test-2", { lat: 19, lon: 72.9, name: "x" })).toBeNull();
  });
});
