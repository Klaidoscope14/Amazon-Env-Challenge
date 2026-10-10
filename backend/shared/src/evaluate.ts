import { AQIReading, Recommendation, Ruleset } from "./types.js";
import {
  BUILT_IN_RULESET,
  DISCLAIMER,
  getDataAge,
  getThresholdForAqi,
} from "./aqi-categories.js";

export function evaluate(
  reading: AQIReading,
  ruleset: Ruleset = BUILT_IN_RULESET
): Recommendation {
  const threshold = getThresholdForAqi(reading.aqi, ruleset.thresholds);
  if (!threshold) {
    return evaluateUnavailable(
      "The latest reading has no valid AQI value. Check official CPCB sources directly."
    );
  }

  const age = getDataAge(reading.timestamp);

  // Demo fixtures are stamped at request time and are labelled separately;
  // any other reading that is too old (or has an unusable time) is stale.
  let dataQuality: Recommendation["dataQuality"] = reading.dataMode;
  if (reading.dataMode !== "demo" && age.isStale) {
    dataQuality = "stale";
  }

  let action = threshold.action;
  if (dataQuality === "stale") {
    action = `[Data is ${age.label.toLowerCase()} — verify with official sources] ${action}`;
  }

  return {
    status: threshold.status,
    statusLevel: threshold.statusLevel,
    action,
    evidence: {
      aqi: reading.aqi,
      dominantPollutant: reading.dominantPollutant,
      pollutants: reading.pollutants,
      ...(reading.pollutantScale ? { pollutantScale: reading.pollutantScale } : {}),
      source: reading.source,
      stationName: reading.stationName,
      timestamp: reading.timestamp,
      dataAge: age.label,
    },
    rule: {
      id: ruleset.id,
      config: ruleset.source,
      name: `CPCB AQI Category — ${threshold.status} (${threshold.minAqi}–${threshold.maxAqi})`,
      threshold: `AQI ${threshold.minAqi}–${threshold.maxAqi}`,
      source: "Central Pollution Control Board, India",
    },
    dataQuality,
    disclaimer: DISCLAIMER,
  };
}

export function evaluateUnavailable(
  action = "Air quality data is currently unavailable. Check official CPCB sources directly."
): Recommendation {
  return {
    status: "Unavailable",
    statusLevel: 0,
    action,
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
