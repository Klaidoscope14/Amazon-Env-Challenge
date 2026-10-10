import {
  AQIReadingResponse,
  Recommendation,
  Alert,
  Audience,
  NoticeDraft,
  TrendResponse,
} from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://auzr0rreg6.execute-api.ap-south-1.amazonaws.com/prod";

/** Carries the HTTP status so callers can tell "no data" (503) from failures. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
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
    throw new ApiError(error.error || `API error: ${res.status}`, res.status);
  }

  return res.json();
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
  scenario?: string,
  city?: string
): Promise<AQIReadingResponse> {
  return fetchApi<AQIReadingResponse>(
    `/api/v1/aqi/current?${query({ campus, scenario, city })}`
  );
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
  adminName: string;
  /** Demo mode: scenario on screen. */
  scenario?: string;
  /** Live mode: fetchedAt of the reading on screen. */
  readingFetchedAt?: string;
}): Promise<Alert> {
  return fetchApi<Alert>("/api/v1/alerts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getAlerts(
  campus: string,
  limit?: number
): Promise<{ alerts: Alert[]; count: number }> {
  return fetchApi<{ alerts: Alert[]; count: number }>(
    `/api/v1/alerts?${query({ campus, limit })}`
  );
}

export async function recordDecision(
  alert: Pick<Alert, "alertId" | "createdAt" | "campus">,
  decision: string,
  decidedBy?: string
): Promise<{ success: boolean; decisionTimestamp: string }> {
  return fetchApi<{ success: boolean; decisionTimestamp: string }>(
    `/api/v1/alerts/${encodeURIComponent(alert.alertId)}/decision?${query({ campus: alert.campus })}`,
    {
      method: "PATCH",
      // createdAt lets the backend address the alert by its exact key.
      body: JSON.stringify({ decision, createdAt: alert.createdAt, decidedBy }),
    }
  );
}

export async function getNoticeDraft(params: {
  campus: string;
  audience: Audience;
  scenario?: string;
  readingFetchedAt?: string;
}): Promise<NoticeDraft> {
  return fetchApi<NoticeDraft>(`/api/v1/notices/draft?${query(params)}`);
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
  institution?: string;
  role?: string;
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

export async function authSignIn(data: {
  email: string;
  password: string;
}): Promise<{
  message: string;
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  return fetchApi("/api/v1/auth/signin", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
