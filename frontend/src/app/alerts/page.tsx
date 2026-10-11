"use client";

import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getAlerts } from "@/lib/api";
import { useAudienceLabel } from "@/lib/catalog";
import {
  EMAIL_DELIVERY,
  formatPollutant,
} from "@/lib/constants";
import type { Alert, AreaInfo } from "@/lib/types";
import AreaGate from "@/components/AreaGate";
import AreaHeader from "@/components/AreaHeader";
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
      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted-strong">
        In-app
      </span>
    );
  }
  const email = EMAIL_DELIVERY[alert.delivery.email];
  return (
    <>
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200">In-app</span>
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
      <summary className="cursor-pointer text-sm font-medium text-accent-text hover:text-foreground">
        Evidence{alert.messageHi ? " & Hindi notice" : ""}
      </summary>
      <div className="mt-2 space-y-3 rounded-lg bg-surface-2 border border-border p-4 text-sm text-foreground">
        {alert.messageHi && (
          <div lang="hi">
            <p className="text-xs font-medium text-muted mb-1">Hindi notice</p>
            <p className="whitespace-pre-line">{alert.messageHi}</p>
          </div>
        )}
        {rec?.rule && (
          <div>
            <p className="text-xs font-medium text-muted">Rule applied</p>
            <p>{rec.rule.name}</p>
            <p className="text-xs text-muted">{rec.action}</p>
          </div>
        )}
        {snap && (
          <div>
            <p className="text-xs font-medium text-muted">Reading at time of alert</p>
            <p>
              AQI {snap.aqi ?? "N/A"}
              {snap.dominantPollutant ? ` · ${formatPollutant(snap.dominantPollutant).label}` : ""}
              {snap.stationName ? ` · ${snap.stationName}` : ""}
            </p>
            <p className="text-xs text-muted">
              Source: {snap.source ?? "unknown"}
              {snap.timestamp ? ` · observed ${formatTime(snap.timestamp)}` : ""}
            </p>
          </div>
        )}
        {alert.noticeSource && (
          <p className="text-xs text-muted">
            Notice text: {alert.noticeSource === "ai" ? "AI-assisted draft, reviewed by the sender" : "approved template"}
          </p>
        )}
      </div>
    </details>
  );
}

export default function AlertsPage() {
  return <AreaGate>{(area) => <AlertsLog key={area.id} area={area} />}</AreaGate>;
}

function AlertsLog({ area }: { area: AreaInfo }) {
  const audienceLabel = useAudienceLabel();
  // Newest first, 10 at a time; "Show older alerts" fetches the next page.
  const alertsQuery = useInfiniteQuery({
    queryKey: ["alerts", area.id],
    queryFn: ({ pageParam }) => getAlerts(area.id, 10, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const alerts = alertsQuery.data?.pages.flatMap((page) => page.alerts) ?? [];

  return (
    <div className="space-y-6">
      <AreaHeader
        area={area}
        title="Alerts & Decision Log — every alert with its AQI evidence and the decision taken"
        actions={
          <Link
            href={`/notice?area=${encodeURIComponent(area.id)}`}
            className="text-sm font-medium text-accent-text underline"
          >
            View public notice
          </Link>
        }
      />

      {alertsQuery.isPending && (
        <div className="space-y-4" aria-hidden="true">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-surface p-6 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {alertsQuery.isError && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-6 text-red-800 dark:text-red-200">
          <p className="font-medium">Failed to load alerts</p>
          <button onClick={() => alertsQuery.refetch()} className="mt-2 text-sm underline">
            Retry
          </button>
        </div>
      )}

      {alertsQuery.isSuccess && alerts.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-muted-strong">No alerts shared for this area yet.</p>
          <p className="text-sm text-muted mt-1">
            Go to the Dashboard to share an alert when AQI is elevated.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {alerts.map((alert) => (
          <article
            key={alert.alertId}
            className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <StatusBadge status={alert.recommendation?.status ?? "Unavailable"} />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    AQI {alert.aqiSnapshot?.aqi ?? "N/A"} &middot;{" "}
                    {audienceLabel(alert.audience)}
                  </p>
                  <p className="text-xs text-muted">
                    {formatTime(alert.createdAt)} &middot; by {alert.adminName}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DeliveryChips alert={alert} />
                {alert.aqiSnapshot?.dataMode && <DataBadge mode={alert.aqiSnapshot.dataMode} />}
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-surface-2 px-4 py-3">
              <p className="text-sm text-foreground whitespace-pre-line">{alert.message}</p>
            </div>

            <EvidenceDetails alert={alert} />
            <DecisionRecorder alert={alert} />
          </article>
        ))}
      </div>

      {alertsQuery.hasNextPage && (
        <div className="text-center">
          <button
            onClick={() => alertsQuery.fetchNextPage()}
            disabled={alertsQuery.isFetchingNextPage}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border-strong text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            {alertsQuery.isFetchingNextPage ? "Loading…" : "Show older alerts"}
          </button>
        </div>
      )}
    </div>
  );
}
