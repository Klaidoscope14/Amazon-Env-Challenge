import { AQIReading, TrendPoint } from "./types.js";

type DemoFixture = Pick<
  AQIReading,
  "aqi" | "dominantPollutant" | "pollutants" | "source" | "stationName"
>;

const SOURCE = "Demo fixture";
const STATION = "ITO, Delhi (sample values)";

// One labelled fixture per CPCB band. Values are illustrative, not measured.
const DEMO_FIXTURES = new Map<string, DemoFixture>([
  ["good", { aqi: 42, dominantPollutant: "PM2.5", pollutants: { pm25: 28, pm10: 45, no2: 18, so2: 8, co: 0.6, o3: 22 }, source: SOURCE, stationName: STATION }],
  ["satisfactory", { aqi: 78, dominantPollutant: "PM2.5", pollutants: { pm25: 55, pm10: 82, no2: 32, so2: 12, co: 1.1, o3: 35 }, source: SOURCE, stationName: STATION }],
  ["moderate", { aqi: 167, dominantPollutant: "PM2.5", pollutants: { pm25: 120, pm10: 180, no2: 55, so2: 22, co: 2.3, o3: 48 }, source: SOURCE, stationName: STATION }],
  ["poor", { aqi: 268, dominantPollutant: "PM2.5", pollutants: { pm25: 210, pm10: 290, no2: 78, so2: 35, co: 4.1, o3: 55 }, source: SOURCE, stationName: STATION }],
  ["veryPoor", { aqi: 352, dominantPollutant: "PM2.5", pollutants: { pm25: 310, pm10: 390, no2: 95, so2: 48, co: 6.2, o3: 62 }, source: SOURCE, stationName: STATION }],
  ["severe", { aqi: 438, dominantPollutant: "PM2.5", pollutants: { pm25: 420, pm10: 480, no2: 120, so2: 62, co: 8.5, o3: 70 }, source: SOURCE, stationName: STATION }],
]);

export const DEFAULT_DEMO_SCENARIO = "poor";
export const DEMO_SCENARIOS = [...DEMO_FIXTURES.keys()];

/** The AQI a demo scenario shows (for labelling scenarios by category). */
export function demoScenarioAqi(scenario: string): number | null {
  return DEMO_FIXTURES.get(scenario)?.aqi ?? null;
}

/** True only for the known scenario names (never for inherited object keys). */
export function isDemoScenario(scenario: unknown): scenario is string {
  return typeof scenario === "string" && DEMO_FIXTURES.has(scenario);
}

export function fetchDemoReading(
  campus: string,
  scenario?: string,
  areaName?: string
): AQIReading {
  const key = isDemoScenario(scenario) ? scenario : DEFAULT_DEMO_SCENARIO;
  const fixture = DEMO_FIXTURES.get(key)!;
  const now = new Date().toISOString();

  return {
    ...fixture,
    ...(areaName ? { stationName: `${areaName} (sample values)` } : {}),
    pollutants: { ...fixture.pollutants },
    pollutantScale: "concentration",
    campus,
    timestamp: now,
    fetchedAt: now,
    dataMode: "demo",
  };
}

/**
 * Synthetic, clearly labelled trend for demo mode: a typical Delhi diurnal
 * shape (night/morning peaks, afternoon dip) that ends at the scenario's AQI.
 */
export function buildDemoTrend(scenario: string | undefined, hours: number): TrendPoint[] {
  const reading = fetchDemoReading("demo", scenario);
  const stepHours = hours <= 48 ? 1 : 3;
  const now = Date.now();
  const shape = (ms: number) => {
    const istHour = (new Date(ms).getUTCHours() + 5.5) % 24;
    return (
      1 +
      0.16 * Math.cos((2 * Math.PI * (istHour - 23)) / 24) +
      0.06 * Math.cos((2 * Math.PI * (istHour - 9)) / 12)
    );
  };
  const scale = reading.aqi / shape(now);

  const points: TrendPoint[] = [];
  for (let h = hours; h >= 0; h -= stepHours) {
    const ms = now - h * 3600 * 1000;
    const wobble = 1 + 0.03 * Math.sin(ms / 3.7e6);
    const aqi = h === 0 ? reading.aqi : Math.max(1, Math.round(scale * shape(ms) * wobble));
    points.push({
      timestamp: new Date(ms).toISOString(),
      aqi,
      dominantPollutant: reading.dominantPollutant,
      source: reading.source,
      dataMode: "demo",
    });
  }
  return points;
}
