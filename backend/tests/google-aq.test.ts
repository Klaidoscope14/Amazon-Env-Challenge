import { beforeEach, describe, expect, it, vi } from "vitest";
import { SSMClient } from "@aws-sdk/client-ssm";
import {
  getGoogleEstimate,
  getGoogleReading,
  getGoogleTrend,
  resetGoogleAq,
  toAqiUnits,
  toEstimate,
  toReading,
  toTrendPoints,
} from "../shared/src/google-aq.js";
import { indianAqiFromParticles } from "../shared/src/aqi-scales.js";

const ssmSend = vi.spyOn(SSMClient.prototype, "send");
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  resetGoogleAq();
  fetchMock.mockReset();
  ssmSend.mockReset();
  ssmSend.mockImplementation((async () => ({ Parameter: { Value: "k" } })) as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const current = {
  dateTime: "2026-10-11T05:00:00Z",
  regionCode: "in",
  indexes: [
    { code: "uaqi", aqi: 40, dominantPollutant: "pm25" },
    { code: "ind_cpcb", aqi: 182, category: "Moderate air quality", dominantPollutant: "pm10" },
  ],
  pollutants: [
    { code: "pm10", concentration: { value: 210.4, units: "MICROGRAMS_PER_CUBIC_METER" } },
    { code: "co", concentration: { value: 873.6, units: "PARTS_PER_BILLION" } },
    { code: "o3", concentration: { value: 30, units: "PARTS_PER_BILLION" } },
  ],
};

describe("units", () => {
  it("converts ppb to the Indian AQI's units", () => {
    expect(toAqiUnits("no2", 21.3, "PARTS_PER_BILLION")).toBe(40.1);
    expect(toAqiUnits("o3", 30, "PARTS_PER_BILLION")).toBe(58.9);
    expect(toAqiUnits("co", 873.6, "PARTS_PER_BILLION")).toBe(1); // mg/m³
    expect(toAqiUnits("pm25", 61.9, "MICROGRAMS_PER_CUBIC_METER")).toBe(61.9);
  });
  it("drops values it can't convert", () => {
    expect(toAqiUnits("pm25", 10, "UNIT_UNSPECIFIED")).toBeNull();
    expect(toAqiUnits("no2", -1, "PARTS_PER_BILLION")).toBeNull();
  });
});

describe("response parsing", () => {
  it("uses India's National AQI (ind_cpcb), not the universal index", () => {
    expect(toReading("geo-288-771", "Delhi area", current)).toMatchObject({
      aqi: 182,
      dominantPollutant: "pm10",
      pollutants: { pm10: 210.4, co: 1, o3: 58.9 },
      source: "Google Air Quality",
      stationName: "Delhi area",
      timestamp: "2026-10-11T05:00:00.000Z",
      dataMode: "live",
    });
  });
  it("returns null without an Indian index, and rejects malformed responses", () => {
    expect(toReading("a", "b", { ...current, indexes: [current.indexes[0]] })).toBeNull();
    expect(() => toReading("a", "b", { indexes: "nope" })).toThrow(/validation/);
  });
  it("turns history into oldest-first trend points", () => {
    const points = toTrendPoints({
      hoursInfo: [
        { dateTime: "2026-10-11T05:00:00Z", indexes: [{ code: "ind_cpcb", aqi: 182, dominantPollutant: "pm10" }] },
        { dateTime: "2026-10-11T04:00:00Z", indexes: [{ code: "ind_cpcb", aqi: 175, dominantPollutant: "pm10" }] },
        { dateTime: "2026-10-11T03:00:00Z" },
      ],
    });
    expect(points.map((p) => p.aqi)).toEqual([175, 182]);
  });
});

// A place outside India: Google returns its own index and concentrations,
// but no Indian index.
const beijing = {
  dateTime: "2026-10-11T05:00:00Z",
  regionCode: "cn",
  indexes: [{ code: "uaqi", aqi: 40, dominantPollutant: "pm10" }],
  pollutants: [
    { code: "pm25", concentration: { value: 55.28, units: "MICROGRAMS_PER_CUBIC_METER" } },
    { code: "pm10", concentration: { value: 111.16, units: "MICROGRAMS_PER_CUBIC_METER" } },
    { code: "o3", concentration: { value: 400, units: "PARTS_PER_BILLION" } },
  ],
};

describe("estimated Indian AQI (places outside India)", () => {
  it("takes the worst of PM2.5 and PM10 through CPCB's breakpoints", () => {
    expect(indianAqiFromParticles({ pm25: 55.28, pm10: 111.16 })).toEqual({ aqi: 107, dominant: "pm10" });
    expect(indianAqiFromParticles({ pm25: 100 })).toEqual({ aqi: 233, dominant: "pm25" });
    expect(indianAqiFromParticles({ pm25: 0, pm10: 0 })).toEqual({ aqi: 0, dominant: "pm25" });
  });
  it("needs a particulate reading", () => {
    expect(indianAqiFromParticles({})).toBeNull();
    expect(indianAqiFromParticles({ pm25: null, pm10: Number.NaN })).toBeNull();
    expect(indianAqiFromParticles({ pm25: -3 })).toBeNull();
  });
  it("builds a labelled estimate and ignores ozone", () => {
    expect(toEstimate("est:39.90,116.40", beijing)).toMatchObject({
      aqi: 107,
      dominantPollutant: "pm10",
      source: "Google Air Quality (estimated Indian AQI)",
      timestamp: "2026-10-11T05:00:00.000Z",
      dataMode: "live",
    });
  });
  it("returns null without particulates, and rejects malformed responses", () => {
    expect(toEstimate("e", { ...beijing, pollutants: [beijing.pollutants[2]] })).toBeNull();
    expect(() => toEstimate("e", { indexes: "nope" })).toThrow(/validation/);
  });
  it("looks a place up once, asking Google for concentrations", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(beijing)));
    const place = { lat: 39.9042, lon: 116.4074 };
    expect((await getGoogleEstimate(place))?.aqi).toBe(107);
    await getGoogleEstimate(place);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      location: { latitude: 39.9042, longitude: 116.4074 },
      extraComputations: ["POLLUTANT_CONCENTRATION"],
    });
  });
  it("returns null (never throws) on API errors", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    expect(await getGoogleEstimate({ lat: 39.9, lon: 116.4 })).toBeNull();
  });
});

describe("API calls", () => {
  it("caches the current reading per area", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(current)));
    const place = { lat: 28.8, lon: 77.1, name: "Delhi area" };
    expect((await getGoogleReading("geo-288-771", place))?.aqi).toBe(182);
    await getGoogleReading("geo-288-771", place);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ssmSend).toHaveBeenCalledTimes(1);
  });

  it("reloads the key from SSM after 15 minutes, so a rotated key is picked up", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(async () => new Response(JSON.stringify(current)));
      await getGoogleReading("geo-a", { lat: 28, lon: 77, name: "x" });
      vi.advanceTimersByTime(16 * 60 * 1000);
      ssmSend.mockImplementation((async () => ({ Parameter: { Value: "rotated" } })) as never);
      await getGoogleReading("geo-b", { lat: 28, lon: 77, name: "x" });
      expect(ssmSend).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.at(-1)![1].headers["X-Goog-Api-Key"]).toBe("rotated");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null (never throws) on API errors and without a key", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403 }));
    expect(await getGoogleReading("geo-1", { lat: 28, lon: 77, name: "x" })).toBeNull();

    resetGoogleAq();
    ssmSend.mockRejectedValue(Object.assign(new Error("missing"), { name: "ParameterNotFound" }));
    expect(await getGoogleReading("geo-2", { lat: 28, lon: 77, name: "x" })).toBeNull();
  });

  it("fetches history once and slices it per window", async () => {
    const hoursInfo = Array.from({ length: 168 }, (_, i) => ({
      // 1 s older than each whole hour, so exactly 24 points fall inside a 24-hour window.
      dateTime: new Date(Date.now() - i * 3600e3 - 1000).toISOString(),
      indexes: [{ code: "ind_cpcb", aqi: 100 + i, dominantPollutant: "pm25" }],
    }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ hoursInfo })));
    const place = { lat: 28.8, lon: 77.1 };
    expect(await getGoogleTrend("geo-288-771", place, 24)).toHaveLength(24);
    expect(await getGoogleTrend("geo-288-771", place, 168)).toHaveLength(168);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ hours: 168, pageSize: 168 });
  });
});
