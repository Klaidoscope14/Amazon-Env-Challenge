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

export type Audience = "all" | "students" | "staff" | "parents";

/** Where an alert actually went. Absent on alerts created before delivery tracking. */
export interface AlertDelivery {
  inApp: true;
  email: "sent" | "failed" | "pending" | "not_configured";
}

export interface Alert {
  alertId: string;
  campus: string;
  audience: Audience;
  message: string;
  /** Hindi version of the message (absent on older alerts). */
  messageHi?: string;
  /** How the notice text was drafted before the admin reviewed it. */
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

export interface CreateAlertInput {
  campus: string;
  audience: Audience;
  message: string;
  messageHi?: string;
  noticeSource?: NoticeDraft["source"];
  adminName: string;
  /** Demo mode: the scenario on screen. */
  scenario?: string;
  /** Live mode: fetchedAt of the reading on screen, so the snapshot matches it. */
  readingFetchedAt?: string;
}

export interface RecordDecisionInput {
  decision: string;
  createdAt?: string;
  decidedBy?: string;
}

export interface NoticeDraft {
  en: string;
  hi: string;
  /** "template" = reviewed fixed wording; "ai" = model-polished, review before sending. */
  source: "template" | "ai";
  status: AQIStatus;
  aqi: number;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  dataMode?: "live" | "cached" | "demo";
  timestamp: string;
}
