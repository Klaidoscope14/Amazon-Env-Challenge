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

export interface AQIReadingResponse extends AQIReading {
  status: AQIStatus;
  statusLevel: number;
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

export type AQIStatus =
  | "Good"
  | "Satisfactory"
  | "Moderate"
  | "Poor"
  | "Very Poor"
  | "Severe"
  | "Unavailable";

export interface AQIThreshold {
  minAqi: number;
  maxAqi: number;
  status: AQIStatus;
  statusLevel: number;
  action: string;
  color: string;
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

export interface CreateAlertInput {
  campus: string;
  audience: Alert["audience"];
  message: string;
  adminName: string;
  scenario?: string;
}

export interface RecordDecisionInput {
  decision: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  dataMode?: "live" | "cached" | "demo";
  timestamp: string;
}
