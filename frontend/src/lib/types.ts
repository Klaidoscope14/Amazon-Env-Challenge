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
  /** "subindex": pollutant values are CPCB sub-indices (live feed); otherwise concentrations. */
  pollutantScale?: "subindex" | "concentration";
}

/** The place everything is scoped to: nearest CPCB station, or a city in demo mode. */
export interface AreaInfo {
  id: string;
  kind: "station" | "city" | "geo";
  name: string;
  city: string;
  state: string;
  distanceKm?: number;
}

/** Shape returned by GET /aqi/current: the reading plus its CPCB band. */
export interface AQIReadingResponse extends AQIReading {
  status: AQIStatus;
  statusLevel: number;
  area?: AreaInfo;
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
    pollutantScale?: "subindex" | "concentration";
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

export type Audience = "all" | "students" | "staff" | "parents";

/** Where an alert actually went. Absent on alerts created before delivery tracking. */
export interface AlertDelivery {
  inApp: true;
  email: "sent" | "failed" | "pending" | "not_configured";
}

export interface Alert {
  alertId: string;
  campus: string;
  /** Display name of the area (station) the alert was issued for. */
  areaName?: string;
  audience: Audience;
  message: string;
  messageHi?: string;
  noticeSource?: NoticeDraft["source"];
  aqiSnapshot: AQIReading;
  recommendation: Recommendation;
  /** Legacy field; delivery details live in `delivery`. */
  status: "sent" | "simulated";
  delivery?: AlertDelivery;
  decision: string | null;
  decisionTimestamp: string | null;
  decisionBy?: string | null;
  adminName: string;
  createdAt: string;
}

export interface NoticeDraft {
  en: string;
  hi: string;
  /** "template" = reviewed fixed wording; "ai" = model-polished, review before sending. */
  source: "template" | "ai";
  status: AQIStatus;
  aqi: number;
}
