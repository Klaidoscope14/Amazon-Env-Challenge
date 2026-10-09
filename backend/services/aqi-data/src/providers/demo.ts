import { AQIReading } from "../../../../shared/src/types.js";
import demoReadings from "../../fixtures/demo-readings.json" with { type: "json" };

type DemoScenario = keyof typeof demoReadings;

export function fetchDemoReading(
  campus: string,
  scenario?: string
): AQIReading {
  const key = (scenario || "poor") as DemoScenario;
  const fixture = demoReadings[key] || demoReadings.poor;

  return {
    ...fixture,
    campus,
    timestamp: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    dataMode: "demo" as const,
  };
}
