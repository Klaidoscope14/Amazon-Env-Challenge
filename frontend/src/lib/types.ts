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
    /** Ruleset id, e.g. "cpcb-india-v1". */
    id?: string;
    /** "dynamodb": the RulesConfig table; "built-in": bundled defaults. */
    config?: "dynamodb" | "built-in";
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

export type Audience = "all" | "family" | "neighbours" | "group";

/** Audiences from before BreatheSafe opened to everyone; still on older alerts. */
export type LegacyAudience = "students" | "staff" | "parents";

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
  audience: Audience | LegacyAudience;
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
  /** Name of the signed-in person who shared the alert. */
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

export interface AQIThreshold {
  minAqi: number;
  maxAqi: number;
  status: AQIStatus;
  statusLevel: number;
  action: string;
  color: string;
}

/** GET /rules: the ruleset the engine is applying. */
export interface Ruleset {
  id: string;
  thresholds: AQIThreshold[];
  source: "dynamodb" | "built-in";
}

/** GET /explain: plain-language explanation of the current reading. */
export interface Explanation {
  explanation: string;
  lang: "en" | "hi";
  generatedBy: "ai" | "template";
  fallbackReason?: string;
  groundedIn: string[];
  status: AQIStatus;
  aqi: number;
  dataQuality: Recommendation["dataQuality"];
  disclaimer: string;
}
