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

/** Shape returned by GET /aqi/current: the reading plus its CPCB band. */
export interface AQIReadingResponse extends AQIReading {
  status: AQIStatus;
  statusLevel: number;
}

export type AQIStatus =
  | "Good"
  | "Satisfactory"
  | "Moderate"
  | "Poor"
  | "Very Poor"
  | "Severe"
  | "Unavailable";

export interface Recommendation {
  status: AQIStatus;
  statusLevel: number;
  action: string;
  aiNarrative?: string;
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

export interface TrendPoint {
  timestamp: string;
  aqi: number;
  dominantPollutant: string;
  source: string;
  dataMode: AQIReading["dataMode"];
}

export interface TrendResponse {
  campus: string;
  points: TrendPoint[];
  period: string;
  dataMode: "live" | "demo";
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
