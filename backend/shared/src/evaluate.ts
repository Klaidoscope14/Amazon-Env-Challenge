import { AQIReading, Recommendation } from "./types.js";
import { getThresholdForAqi, getDataAge, DISCLAIMER } from "./aqi-categories.js";

export function evaluate(reading: AQIReading): Recommendation {
  const threshold = getThresholdForAqi(reading.aqi);
  const age = getDataAge(reading.timestamp);

  let dataQuality: Recommendation["dataQuality"] = reading.dataMode;
  if (reading.dataMode === "live" && age.isStale) {
    dataQuality = "stale";
  }

  let action = threshold.action;
  if (age.isStale) {
    action = `[Data is ${age.label} — verify with official sources] ${action}`;
  }

  return {
    status: threshold.status,
    statusLevel: threshold.statusLevel,
    action,
    evidence: {
      aqi: reading.aqi,
      dominantPollutant: reading.dominantPollutant,
      pollutants: reading.pollutants,
      source: reading.source,
      stationName: reading.stationName,
      timestamp: reading.timestamp,
      dataAge: age.label,
    },
    rule: {
      name: `CPCB AQI Category — ${threshold.status} (${threshold.minAqi}–${threshold.maxAqi})`,
      threshold: `AQI ${threshold.minAqi}–${threshold.maxAqi}`,
      source: "Central Pollution Control Board, India",
    },
    dataQuality,
    disclaimer: DISCLAIMER,
  };
}

export function evaluateUnavailable(): Recommendation {
  return {
    status: "Good",
    statusLevel: 0,
    action:
      "Air quality data is currently unavailable. Check official CPCB sources directly.",
    evidence: {
      aqi: 0,
      dominantPollutant: "Unknown",
      pollutants: {},
      source: "N/A",
      stationName: "N/A",
      timestamp: new Date().toISOString(),
      dataAge: "N/A",
    },
    rule: {
      name: "No data available",
      threshold: "N/A",
      source: "N/A",
    },
    dataQuality: "unavailable",
    disclaimer: DISCLAIMER,
  };
}
