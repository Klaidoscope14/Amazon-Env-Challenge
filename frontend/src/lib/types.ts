export interface AQIReading {
  campus: string;
  aqi: number;
  dominantPollutant: string;
  pollutants: Record<string, number>;
  source: string;
  stationName: string;
  timestamp: string;
  fetchedAt: string;
  dataMode: "live" | "cached" | "demo";
}

export type AQIStatus =
  | "Good"
  | "Satisfactory"
  | "Moderate"
  | "Poor"
  | "Very Poor"
  | "Severe";

export interface Recommendation {
  status: AQIStatus;
  statusLevel: number;
  action: string;
  evidence: {
    aqi: number;
    dominantPollutant: string;
    pollutants: Record<string, number>;
    source: string;
    stationName: string;
    timestamp: string;
    dataAge: string;
  };
  rule: {
    name: string;
    threshold: string;
    source: string;
  };
  dataQuality: "live" | "cached" | "demo" | "stale" | "unavailable";
  disclaimer: string;
}

export interface Alert {
  alertId: string;
  campus: string;
  audience: "all" | "students" | "staff" | "parents";
  message: string;
  aqiSnapshot: AQIReading;
  recommendation: Recommendation;
  status: "sent" | "simulated";
  decision: string | null;
  decisionTimestamp: string | null;
  adminName: string;
  createdAt: string;
}
