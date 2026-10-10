import { describe, expect, it } from "vitest";
import {
  findNearestArea, geoAreaId, parseCpcbRecords, parseCpcbTime, resolveArea, type StationSnapshot,
} from "../shared/src/stations.js";
import { nearestCity } from "../shared/src/cities.js";

describe("parseCpcbTime", () => {
  it("parses CPCB's dd-mm-yyyy IST format to UTC", () => {
    expect(parseCpcbTime("10-10-2026 18:00:00")).toBe("2026-10-10T12:30:00.000Z");
  });
  it("does not swap day and month", () => {
    expect(parseCpcbTime("03-11-2026 09:00:00")).toBe("2026-11-03T03:30:00.000Z");
  });
  it("handles days above 12", () => {
    expect(parseCpcbTime("25-10-2026 14:00:00")).toBe("2026-10-25T08:30:00.000Z");
  });
  it.each(["31-02-2026 10:00:00", "10-10-2026 25:00:00", "garbage", undefined])("rejects %s", (v) => {
    expect(parseCpcbTime(v)).toBeNull();
  });
});

const row = (station: string, pid: string, avg: string, extra: Record<string, string> = {}) => ({
  station, city: "Delhi", state: "Delhi", latitude: "28.63", longitude: "77.24",
  last_update: "10-10-2026 18:00:00", pollutant_id: pid, pollutant_avg: avg, ...extra,
});

describe("parseCpcbRecords", () => {
  it("takes the highest sub-index as the AQI", () => {
    const [s] = parseCpcbRecords([row("ITO", "PM2.5", "312"), row("ITO", "PM10", "250"), row("ITO", "NO2", "60")]);
    expect(s).toMatchObject({ id: "st-ito", aqi: 312, dominantPollutant: "pm25", lat: 28.63 });
  });
  it("needs three pollutants including PM, and ignores NA", () => {
    const [s] = parseCpcbRecords([row("X", "PM10", "180"), row("X", "OZONE", "40"), row("X", "CO", "NA")]);
    expect(s.aqi).toBeNull();
  });
  it("keeps stations without coordinates but without fake ones", () => {
    const [s] = parseCpcbRecords([row("Y", "PM10", "95", { latitude: "NA", longitude: "NA" })]);
    expect(s.lat).toBeUndefined();
  });
});

describe("areas", () => {
  const snapshot = (hoursOld: number): StationSnapshot => ({
    fetchedAt: new Date().toISOString(),
    stations: [{
      id: "st-rohini", name: "Rohini", city: "Delhi", state: "Delhi", lat: 28.7325, lon: 77.1199,
      lastUpdate: new Date(Date.now() - hoursOld * 3600e3).toISOString(), aqi: 268,
      dominantPollutant: "pm25", subIndices: { pm25: 268 },
    }],
  });

  it("uses a nearby station only when its data is current", () => {
    expect(findNearestArea(snapshot(1), 28.75, 77.12)?.id).toBe("st-rohini");
    expect(findNearestArea(snapshot(72), 28.75, 77.12)?.id).toBe("geo-288-771");
  });
  it("gives every location in India a grid-cell area named after its city", () => {
    expect(findNearestArea(null, 28.75, 77.12)).toMatchObject({ id: "geo-288-771", kind: "geo", name: "Delhi area" });
  });
  it("falls back to the nearest city in demo mode", () => {
    expect(findNearestArea(null, 28.75, 77.12, false)?.id).toBe("city-delhi");
  });
  it("rejects grid cells outside India", () => {
    expect(resolveArea(null, "geo-515-1")).toBeNull();
    expect(resolveArea(null, geoAreaId(51.5, -0.12))).toBeNull();
  });
  it("attributes metro-edge points to the metro, not a nearer small town", () => {
    expect(nearestCity(28.8, 77.1, 150)?.city.name).toBe("Delhi");
  });
});
