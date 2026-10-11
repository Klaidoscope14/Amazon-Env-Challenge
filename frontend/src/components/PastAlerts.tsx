"use client";

import { useAuth } from "@/lib/auth";
import { useAudienceLabel } from "@/lib/catalog";
import { EMAIL_DELIVERY, formatPollutant } from "@/lib/constants";
import type { Alert } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import DataBadge from "./DataBadge";
import DecisionRecorder from "./DecisionRecorder";

export function formatAlertTime(ts: string): string {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return ts;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function EmailChip({ alert }: { alert: Alert }) {
  const email = alert.delivery ? EMAIL_DELIVERY[alert.delivery.email] : null;
  if (!email || alert.delivery?.email === "not_configured") return null;
  return <span className={`text-xs px-2 py-0.5 rounded-full ${email.className}`}>{email.label}</span>;
}

function AlertDetails({ alert }: { alert: Alert }) {
  const snap = alert.aqiSnapshot;
  if (!alert.messageHi && !snap) return null;
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer text-sm font-medium text-accent-text hover:text-foreground">
        {alert.messageHi ? "Hindi version & details" : "Details"}
      </summary>
      <div className="mt-2 space-y-3 rounded-lg bg-surface-2 border border-border p-4 text-sm text-foreground">
        {alert.messageHi && (
          <p lang="hi" className="whitespace-pre-line">
            {alert.messageHi}
          </p>
        )}
        {snap && (
          <p className="text-xs text-muted">
            Air when shared: AQI {snap.aqi ?? "N/A"}
            {snap.dominantPollutant ? ` · mainly ${formatPollutant(snap.dominantPollutant).label}` : ""}
            {snap.stationName ? ` · ${snap.stationName}` : ""}
            {snap.timestamp ? ` · ${formatAlertTime(snap.timestamp)}` : ""}
          </p>
        )}
      </div>
    </details>
  );
}

/**
 * Earlier alerts for an area, newest first: what was said, by whom, and what
 * people did about it. Signed-in people can record what they did; visitors
 * just read.
 */
export default function PastAlerts({
  alerts,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  alerts: Alert[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const { isAuthenticated } = useAuth();
  const audienceLabel = useAudienceLabel();

  return (
    <section aria-label="Past alerts" className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-foreground">Past alerts</h2>
      {alerts.map((alert) => (
        <article key={alert.alertId} className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <StatusBadge status={alert.recommendation?.status ?? "Unavailable"} />
              <div>
                <p className="text-sm font-medium text-foreground">
                  AQI {alert.aqiSnapshot?.aqi ?? "N/A"} &middot; {audienceLabel(alert.audience)}
                </p>
                <p className="text-xs text-muted">
                  {formatAlertTime(alert.createdAt)} &middot; by {alert.adminName}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <EmailChip alert={alert} />
              {alert.aqiSnapshot?.dataMode && <DataBadge mode={alert.aqiSnapshot.dataMode} />}
            </div>
          </div>

          <p className="mt-3 whitespace-pre-line rounded-lg bg-surface-2 px-4 py-3 text-sm text-foreground">
            {alert.message}
          </p>

          <AlertDetails alert={alert} />
          {(isAuthenticated || alert.decision) && <DecisionRecorder alert={alert} />}
        </article>
      ))}

      {hasMore && (
        <div className="text-center">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="min-h-11 rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Show older alerts"}
          </button>
        </div>
      )}
    </section>
  );
}
