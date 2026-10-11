import {
  AreaInfo,
  AQIReadingResponse,
  Recommendation,
  Alert,
  Audience,
  NoticeDraft,
  TrendResponse,
  Explanation,
  Ruleset,
  PlansEvaluation,
  Catalog,
  UserProfile,
  PlaceSuggestion,
  Hospital,
} from "./types";
import { API_URL } from "./config";
import type { AirPoint } from "./useAirLayer";


/**
 * Carries the HTTP status (so callers can tell "no data" 503 from failures)
 * and the backend's stable error code, when it sends one.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    // API Gateway's own errors (401, 429) carry "message" instead of "error".
    throw new ApiError(
      error.error || error.message || `API error: ${res.status}`,
      res.status,
      error.code
    );
  }

  return res.json();
}

// Must match lib/auth.tsx.
const TOKENS_KEY = "breathesafe_tokens";

interface StoredTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

function readTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

async function refreshTokens(tokens: StoredTokens): Promise<StoredTokens | null> {
  try {
    const data = await fetchApi<{ accessToken: string; idToken: string }>("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    const next = { ...tokens, accessToken: data.accessToken, idToken: data.idToken };
    localStorage.setItem(TOKENS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

/**
 * For routes behind the Cognito authorizer: sends the ID token, and on a 401
 * (expired token) refreshes once and retries.
 */
async function fetchAuthed<T>(path: string, options?: RequestInit): Promise<T> {
  const tokens = readTokens();
  if (!tokens) throw new ApiError("Please sign in to continue.", 401);
  const call = (idToken: string) =>
    fetchApi<T>(path, { ...options, headers: { ...options?.headers, Authorization: idToken } });
  try {
    return await call(tokens.idToken);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    const refreshed = await refreshTokens(tokens);
    if (!refreshed) throw new ApiError("Your session has expired. Please sign in again.", 401);
    return call(refreshed.idToken);
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

export async function getAQI(
  campus: string,
  scenario?: string
): Promise<AQIReadingResponse> {
  return fetchApi<AQIReadingResponse>(
    `/api/v1/aqi/current?${query({ campus, scenario })}`
  );
}

export async function getAreas(): Promise<{ areas: AreaInfo[]; source: "cities" }> {
  return fetchApi(`/api/v1/areas`);
}

/** Nearest monitoring area. Coordinates should already be rounded (~1 km). */
export async function getNearestArea(lat: number, lon: number): Promise<{ area: AreaInfo }> {
  return fetchApi(`/api/v1/areas/nearest?${query({ lat, lon })}`);
}

/** Readings for many places at once, keyed "lat,lon" (2 decimals); null outside India or without data. */
export async function getAirSites(
  sites: { lat: number; lon: number }[]
): Promise<Record<string, AirPoint>> {
  const points = sites.map((s) => `${s.lat.toFixed(2)},${s.lon.toFixed(2)}`).join(";");
  const { points: found } = await fetchApi<{ points: Record<string, AirPoint | null> }>(
    `/api/v1/aqi/sites?${query({ points })}`
  );
  const out: Record<string, AirPoint> = {};
  for (const [key, point] of Object.entries(found)) if (point) out[key] = point;
  return out;
}

/** Localities in India matching the text (Google Places). `session` groups one search for billing. */
export async function searchPlaces(q: string, session: string): Promise<PlaceSuggestion[]> {
  return (await fetchApi<{ places: PlaceSuggestion[] }>(`/api/v1/places/search?${query({ q, session })}`)).places;
}

/** The area for a place chosen from the search, named after that place. */
export async function resolvePlace(placeId: string, session: string): Promise<{ area: AreaInfo }> {
  return fetchApi(`/api/v1/places/resolve?${query({ placeId, session })}`);
}

/** Nearest hospitals to a location (for SOS). */
export async function getNearbyHospitals(lat: number, lon: number): Promise<Hospital[]> {
  return (await fetchApi<{ hospitals: Hospital[] }>(`/api/v1/places/hospitals?${query({ lat, lon })}`)).hospitals;
}

export async function getRecommendation(
  campus: string,
  scenario?: string
): Promise<Recommendation> {
  return fetchApi<Recommendation>(
    `/api/v1/recommendations/current?${query({ campus, scenario })}`
  );
}

export async function createAlert(data: {
  campus: string;
  audience: Audience;
  message: string;
  messageHi?: string;
  noticeSource?: NoticeDraft["source"];
  /** Demo mode: scenario on screen. */
  scenario?: string;
  /** Live mode: source timestamp of the reading on screen. */
  readingTimestamp?: string;
}, idempotencyKey?: string): Promise<Alert> {
  // The sender's name comes from the sign-in token on the server. The
  // idempotency key makes a retried submit return the same alert.
  return fetchAuthed<Alert>("/api/v1/alerts", {
    method: "POST",
    body: JSON.stringify(data),
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });
}

export interface AlertsPage {
  alerts: Alert[];
  count: number;
  /** Pass back to get the next (older) page; absent on the last page. */
  nextCursor?: string;
}

export async function getAlerts(
  campus: string,
  limit?: number,
  cursor?: string
): Promise<AlertsPage> {
  return fetchApi<AlertsPage>(`/api/v1/alerts?${query({ campus, limit, cursor })}`);
}

export async function recordDecision(
  alert: Pick<Alert, "alertId" | "createdAt" | "campus">,
  decision: string
): Promise<{ success: boolean; decisionTimestamp: string }> {
  return fetchAuthed<{ success: boolean; decisionTimestamp: string }>(
    `/api/v1/alerts/${encodeURIComponent(alert.alertId)}/decision?${query({ campus: alert.campus })}`,
    {
      method: "PATCH",
      // createdAt lets the backend address the alert by its exact key.
      body: JSON.stringify({ decision, createdAt: alert.createdAt }),
    }
  );
}

export async function getNoticeDraft(params: {
  campus: string;
  audience: Audience;
  scenario?: string;
  readingTimestamp?: string;
}): Promise<NoticeDraft> {
  return fetchAuthed<NoticeDraft>(`/api/v1/notices/draft?${query(params)}`);
}

/**
 * The reviewed bilingual notice for an area, with no account needed: no
 * sender name and no AI polish. Used to forward the advice on WhatsApp.
 */
export async function getNoticeTemplate(params: {
  campus: string;
  audience: Audience;
  scenario?: string;
}): Promise<NoticeDraft> {
  return fetchApi<NoticeDraft>(`/api/v1/notices/template?${query(params)}`);
}

/** Spoken version (Amazon Polly) of an issued alert, as a playable data URL. */
export async function getNoticeAudio(
  alert: Pick<Alert, "alertId" | "createdAt" | "campus">,
  lang: "en" | "hi"
): Promise<string> {
  const result = await fetchApi<{ contentType: string; audioBase64: string }>(
    `/api/v1/notices/audio?${query({
      campus: alert.campus,
      alertId: alert.alertId,
      createdAt: alert.createdAt,
      lang,
    })}`
  );
  return `data:${result.contentType};base64,${result.audioBase64}`;
}

/** Plain-language explanation of an area's current reading (AI with guardrails, or a fixed template). */
export async function getExplanation(
  campus: string,
  lang: "en" | "hi",
  scenario?: string
): Promise<Explanation> {
  return fetchApi<Explanation>(`/api/v1/explain?${query({ campus, lang, scenario })}`);
}

export interface PlanInput {
  id: string;
  activity: string;
  durationMinutes: number;
  sensitive?: boolean;
}

/** Go / Modify / Avoid for each of today's plans, from the area's current reading. */
export async function evaluatePlans(
  campus: string,
  plans: PlanInput[],
  scenario?: string
): Promise<PlansEvaluation> {
  return fetchApi<PlansEvaluation>("/api/v1/plans/evaluate", {
    method: "POST",
    body: JSON.stringify({ campus, scenario, plans }),
  });
}

/** Choices the API accepts (audiences, activities, demo scenarios), with labels. */
export async function getCatalog(): Promise<Catalog> {
  return fetchApi<Catalog>("/api/v1/catalog");
}

/** The ruleset the recommendation engine is currently applying. */
export async function getRules(): Promise<Ruleset> {
  return fetchApi<Ruleset>("/api/v1/rules");
}

export async function getTrends(
  campus: string,
  hours: number = 24,
  scenario?: string
): Promise<TrendResponse> {
  return fetchApi<TrendResponse>(
    `/api/v1/trends?${query({ campus, hours, scenario })}`
  );
}

export async function authSignUp(data: {
  email: string;
  password: string;
  name: string;
}): Promise<{ message: string; email: string }> {
  return fetchApi("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function authConfirm(data: {
  email: string;
  code: string;
}): Promise<{ message: string }> {
  return fetchApi("/api/v1/auth/confirm", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Calls an auth route as the signed-in user (Cognito access token). */
async function withAccessToken<T>(path: string, body: unknown = {}, method = "POST"): Promise<T> {
  const tokens = readTokens();
  if (!tokens) throw new ApiError("Please sign in to continue.", 401);
  return fetchApi<T>(path, {
    method,
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
    body: JSON.stringify(body),
  });
}

/** Fields a person can edit on their own profile. `avatar`: omitted keeps it, null removes it. */
export type ProfileUpdate = Pick<UserProfile, "name" | "phone" | "addressLine1" | "addressLine2" | "emergencyContacts"> & {
  avatar?: string | null;
};

export async function updateProfile(update: ProfileUpdate): Promise<UserProfile> {
  return withAccessToken("/api/v1/auth/profile", update, "PUT");
}

export async function mfaSetup(): Promise<{ secret: string; otpauthUri: string }> {
  return withAccessToken("/api/v1/auth/mfa/setup");
}

export async function mfaEnable(code: string): Promise<{ mfaEnabled: boolean }> {
  return withAccessToken("/api/v1/auth/mfa/enable", { code });
}

export async function mfaDisable(): Promise<{ mfaEnabled: boolean }> {
  return withAccessToken("/api/v1/auth/mfa/disable");
}

export async function authForgotPassword(email: string): Promise<{ message: string }> {
  return fetchApi("/api/v1/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export async function authResetPassword(data: {
  email: string;
  code: string;
  password: string;
}): Promise<{ message: string }> {
  return fetchApi("/api/v1/auth/reset-password", { method: "POST", body: JSON.stringify(data) });
}

export async function authResendCode(email: string): Promise<{ message: string }> {
  return fetchApi("/api/v1/auth/resend-code", { method: "POST", body: JSON.stringify({ email }) });
}

/** Revokes the refresh token server-side. Best-effort: never throws. */
export async function authSignOut(refreshToken: string): Promise<void> {
  await fetchApi("/api/v1/auth/signout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);
}
