"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAlerts } from "@/lib/api";
import {
  AUDIENCE_LABELS,
  DEFAULT_CAMPUS,
  EMAIL_DELIVERY,
  formatPollutant,
} from "@/lib/constants";
import type { Alert } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import DataBadge from "@/components/DataBadge";
import DecisionRecorder from "@/components/DecisionRecorder";

function formatTime(ts: string): string {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return ts;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function DeliveryChips({ alert }: { alert: Alert }) {
  // Alerts created before delivery tracking only have the legacy status.
  if (!alert.delivery) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
        In-app
      </span>
    );
  }
  const email = EMAIL_DELIVERY[alert.delivery.email];
  return (
    <>
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">In-app</span>
      {alert.delivery.email !== "not_configured" && (
        <span className={`text-xs px-2 py-0.5 rounded-full ${email.className}`}>{email.label}</span>
      )}
    </>
  );
}

function EvidenceDetails({ alert }: { alert: Alert }) {
  const rec = alert.recommendation;
  const snap = alert.aqiSnapshot;
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:text-blue-900">
        Evidence{alert.messageHi ? " & Hindi notice" : ""}
      </summary>
      <div className="mt-2 space-y-3 rounded-lg bg-gray-50 border border-gray-100 p-4 text-sm text-gray-800">
        {alert.messageHi && (
          <div lang="hi">
            <p className="text-xs font-medium text-gray-600 mb-1">Hindi notice</p>
            <p className="whitespace-pre-line">{alert.messageHi}</p>
          </div>
        )}
        {rec?.rule && (
          <div>
            <p className="text-xs font-medium text-gray-600">Rule applied</p>
            <p>{rec.rule.name}</p>
            <p className="text-xs text-gray-600">{rec.action}</p>
          </div>
        )}
        {snap && (
          <div>
            <p className="text-xs font-medium text-gray-600">Reading at time of alert</p>
            <p>
              AQI {snap.aqi ?? "N/A"}
              {snap.dominantPollutant ? ` · ${formatPollutant(snap.dominantPollutant).label}` : ""}
              {snap.stationName ? ` · ${snap.stationName}` : ""}
            </p>
            <p className="text-xs text-gray-600">
              Source: {snap.source ?? "unknown"}
              {snap.timestamp ? ` · observed ${formatTime(snap.timestamp)}` : ""}
            </p>
          </div>
        )}
        {alert.noticeSource && (
          <p className="text-xs text-gray-600">
            Notice text: {alert.noticeSource === "ai" ? "AI-assisted draft, reviewed by admin" : "approved template"}
          </p>
        )}
      </div>
    </details>
  );
}

export default function AlertsPage() {
  const alertsQuery = useQuery({
    queryKey: ["alerts", DEFAULT_CAMPUS],
    queryFn: () => getAlerts(DEFAULT_CAMPUS),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts & Decision Log</h1>
          <p className="text-sm text-gray-600 mt-1">
            Every alert with the AQI evidence behind it and the decision taken
          </p>
        </div>
        <Link href="/notice" className="text-sm font-medium text-blue-700 underline">
          View public notice
        </Link>
      </div>

      {alertsQuery.isPending && (
        <div className="space-y-4" aria-hidden="true">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {alertsQuery.isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="font-medium">Failed to load alerts</p>
          <button onClick={() => alertsQuery.refetch()} className="mt-2 text-sm underline">
            Retry
          </button>
        </div>
      )}

      {alertsQuery.data?.alerts.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-700">No alerts issued yet.</p>
          <p className="text-sm text-gray-600 mt-1">
            Go to the Dashboard to issue an alert when AQI is elevated.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {alertsQuery.data?.alerts.map((alert) => (
          <article
            key={alert.alertId}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <StatusBadge status={alert.recommendation?.status ?? "Unavailable"} />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    AQI {alert.aqiSnapshot?.aqi ?? "N/A"} &middot;{" "}
                    {AUDIENCE_LABELS[alert.audience] ?? alert.audience}
                  </p>
                  <p className="text-xs text-gray-600">
                    {formatTime(alert.createdAt)} &middot; by {alert.adminName}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DeliveryChips alert={alert} />
                {alert.aqiSnapshot?.dataMode && <DataBadge mode={alert.aqiSnapshot.dataMode} />}
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-gray-50 px-4 py-3">
              <p className="text-sm text-gray-900 whitespace-pre-line">{alert.message}</p>
            </div>

            <EvidenceDetails alert={alert} />
            <DecisionRecorder alert={alert} />
          </article>
        ))}
      </div>
    </div>
  );
}
