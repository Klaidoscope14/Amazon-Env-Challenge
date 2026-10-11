import { beforeEach, describe, expect, it, vi } from "vitest";
import { SSMClient } from "@aws-sdk/client-ssm";
import {
  estimateIndianAqi,
  getIqAirReading,
  IQAIR_SOURCE,
  resetIqAir,
  toIqAirReading,
} from "../shared/src/iqair.js";

const ssmSend = vi.spyOn(SSMClient.prototype, "send");
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  resetIqAir();
  fetchMock.mockReset();
  ssmSend.mockReset();
  ssmSend.mockImplementation((async () => ({ Parameter: { Value: "k" } })) as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// Delhi, 11 Oct 2026 08:00 UTC, as returned by the free plan.
const delhi = {
  status: "success",
  data: {
    city: "New Delhi",
    current: { pollution: { ts: "2026-10-11T08:00:00.000Z", aqius: 160, mainus: "p2", aqicn: 144, maincn: "p1" } },
  },
};
const place = { lat: 28.6, lon: 77.2, name: "Delhi" };

describe("estimating the Indian AQI", () => {
  it("converts each index's main pollutant back to a concentration and applies CPCB breakpoints", () => {
    // US 160 (PM2.5) -> ~69 µg/m³ -> India 131; China 144 (PM10) -> 238 µg/m³ -> India 192.
    expect(estimateIndianAqi(delhi.data.current.pollution)).toEqual({ aqi: 192, dominantPollutant: "pm10" });
  });

  it("uses the higher concentration when both indices are driven by the same pollutant", () => {
    // US 160 -> ~69 µg/m³ beats China 80 -> 59 µg/m³.
    expect(estimateIndianAqi({ aqius: 160, mainus: "p2", aqicn: 80, maincn: "p2" })).toEqual({
      aqi: 131,
      dominantPollutant: "pm25",
    });
  });

  it("caps at the top of the scale", () => {
    expect(estimateIndianAqi({ aqius: 500, mainus: "p2", aqicn: 500, maincn: "p2" })!.aqi).toBe(500);
  });

  it("converts ozone from the US index (8-hour scale), not China's 1-hour one", () => {
    // Mumbai, 11 Oct 2026: US 130 (ozone) -> ~79 ppb -> ~155 µg/m³ -> India 181.
    expect(estimateIndianAqi({ aqius: 130, mainus: "o3", aqicn: 125, maincn: "o3" })).toEqual({
      aqi: 181,
      dominantPollutant: "o3",
    });
  });

  it("gives no estimate when no index is driven by a pollutant it can convert", () => {
    expect(estimateIndianAqi({ aqius: 80, mainus: "n2", aqicn: 60, maincn: "n2" })).toBeNull();
  });
});

describe("IQAir readings", () => {
  it("builds a labelled estimate without a pollutant breakdown", () => {
    expect(toIqAirReading("city-delhi", "Delhi", delhi)).toMatchObject({
      campus: "city-delhi",
      aqi: 192,
      dominantPollutant: "pm10",
      pollutants: {},
      source: IQAIR_SOURCE,
      timestamp: "2026-10-11T08:00:00.000Z",
      dataMode: "live",
      estimated: true,
    });
  });

  it("rejects malformed responses", () => {
    expect(() => toIqAirReading("city-delhi", "Delhi", { status: "success", data: {} })).toThrow(/validation/);
  });

  it("caches per area, so repeated requests make one call", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(delhi)));
    expect((await getIqAirReading("city-delhi", place))?.aqi).toBe(192);
    await getIqAirReading("city-delhi", place);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ssmSend).toHaveBeenCalledTimes(1);
  });

  it("returns null (never throws) on API errors and without a key", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "fail", data: { message: "call_limit_reached" } }), { status: 429 })
    );
    expect(await getIqAirReading("geo-1", place)).toBeNull();

    resetIqAir();
    ssmSend.mockRejectedValue(Object.assign(new Error("missing"), { name: "ParameterNotFound" }));
    expect(await getIqAirReading("geo-2", place)).toBeNull();
  });
});
