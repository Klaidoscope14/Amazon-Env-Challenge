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
  /** Pollutant values are concentrations: µg/m³ (CO in mg/m³). */
  pollutantScale?: "concentration";
  /** The AQI was estimated from another scale (IQAir's US/China indices), not reported on India's. */
  estimated?: true;
}

/** The place everything is scoped to: a ~11 km grid cell around the user, or a city. */
export interface AreaInfo {
  id: string;
  kind: "city" | "geo";
  name: string;
  city: string;
  state: string;
  distanceKm?: number;
}

export interface Recommendation {
  status: AQIStatus;
  statusLevel: number;
  action: string;
  evidence: {
    aqi: number;
    dominantPollutant: string;
    pollutants: Record<string, number>;
    pollutantScale?: "concentration";
    source: string;
    stationName: string;
    timestamp: string;
    dataAge: string;
  };
  rule: {
    /** Ruleset the band came from, e.g. "cpcb-india-v1". */
    id?: string;
    /** "dynamodb": the RulesConfig table; "built-in": the bundled defaults. */
    config?: Ruleset["source"];
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
  area?: AreaInfo;
}

export interface TrendPoint {
  timestamp: string;
  aqi: number;
  /** Category under the active ruleset (set by the trends API). */
  status?: AQIStatus;
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

/** A set of AQI bands and actions; stored in the RulesConfig table or built in. */
export interface Ruleset {
  id: string;
  thresholds: AQIThreshold[];
  source: "dynamodb" | "built-in";
}

export type Audience = "all" | "family" | "neighbours" | "group";

/** Audiences from before VayuSaathi opened to everyone; still on older alerts. */
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
  /** Hindi version of the message (absent on older alerts). */
  messageHi?: string;
  /** How the notice text was drafted before the sender reviewed it. */
  noticeSource?: NoticeDraft["source"];
  aqiSnapshot: AQIReading;
  recommendation: Recommendation;
  /** Legacy field; delivery details live in `delivery`. */
  status: "sent" | "simulated";
  delivery?: AlertDelivery;
  decision: string | null;
  decisionTimestamp: string | null;
  decisionBy?: string | null;
  /** Name of the signed-in person who issued the alert (field name kept for stored alerts). */
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
  /** Live mode: source timestamp of the reading on screen, so the snapshot matches it. */
  readingTimestamp?: string;
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

/** Plain-language explanation of the current reading (GET /explain). */
export interface Explanation {
  explanation: string;
  lang: "en" | "hi";
  /** "ai": model-written and passed the guardrails; "template": deterministic text. */
  generatedBy: "ai" | "template";
  /** Why an AI explanation was not used (guardrail rejection, disabled, error). */
  fallbackReason?: string;
  groundedIn: string[];
  status: AQIStatus;
  aqi: number;
  dataQuality: Recommendation["dataQuality"];
  disclaimer: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  dataMode?: "live" | "cached" | "demo";
  timestamp: string;
}

/** POST /plans/evaluate response. */
export interface PlansEvaluation {
  status: AQIStatus;
  aqi: number;
  dataQuality: Recommendation["dataQuality"];
  basedOn: string | null;
  verdicts: { id: string; verdict: "go" | "modify" | "avoid" | "unknown"; reason: string; suggestion: string }[];
  disclaimer: string;
}

export interface CatalogOption {
  value: string;
  label: string;
}

/** GET /catalog: the choices the backend accepts, with display labels. */
export interface Catalog {
  audiences: CatalogOption[];
  /** Labels for every audience value, including those on older alerts. */
  audienceLabels: Record<string, string>;
  activities: CatalogOption[];
  /** Presenter demo scenarios, labelled with the active ruleset's category and range. */
  demoScenarios: CatalogOption[];
  defaultDemoScenario: string;
  /** National emergency numbers offered on the SOS screen. */
  emergencyServices: EmergencyService[];
}

export interface EmergencyService {
  label: string;
  /** Number to dial, e.g. "112". */
  number: string;
}

export interface EmergencyContact {
  name: string;
  /** E.164, e.g. "+919876543210". */
  phone: string;
  relation?: string;
}

/** A signed-in person's own details (GET/PUT /auth/profile). */
export interface UserProfile {
  email: string;
  name: string;
  role?: string;
  mfaEnabled: boolean;
  /** E.164, or absent. */
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  /** Small profile photo as a data URL (resized in the browser). */
  avatar?: string;
  emergencyContacts: EmergencyContact[];
}
