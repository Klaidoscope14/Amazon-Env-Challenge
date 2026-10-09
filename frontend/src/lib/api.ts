import { AQIReading, Recommendation, Alert } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://auzr0rreg6.execute-api.ap-south-1.amazonaws.com/prod";

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
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json();
}

export async function getAQI(
  campus: string,
  scenario?: string
): Promise<AQIReading> {
  const params = new URLSearchParams({ campus });
  if (scenario) params.set("scenario", scenario);
  return fetchApi<AQIReading>(`/api/v1/aqi/current?${params}`);
}

export async function getRecommendation(
  campus: string
): Promise<Recommendation> {
  return fetchApi<Recommendation>(
    `/api/v1/recommendations/current?campus=${campus}`
  );
}

export async function createAlert(data: {
  campus: string;
  audience: string;
  message: string;
  adminName: string;
}): Promise<Alert> {
  return fetchApi<Alert>("/api/v1/alerts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getAlerts(
  campus: string
): Promise<{ alerts: Alert[]; count: number }> {
  return fetchApi<{ alerts: Alert[]; count: number }>(
    `/api/v1/alerts?campus=${campus}`
  );
}

export async function recordDecision(
  alertId: string,
  decision: string,
  campus: string
): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(
    `/api/v1/alerts/${alertId}/decision?campus=${campus}`,
    {
      method: "PATCH",
      body: JSON.stringify({ decision }),
    }
  );
}
