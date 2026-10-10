"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAlerts } from "@/lib/api";
import { AUDIENCE_LABELS } from "@/lib/constants";
import { describeAge, useNow } from "@/lib/useNow";
import { useSearchParam } from "@/lib/useSearchParam";
import { isValidAreaId } from "@/lib/areaId";
import type { AreaInfo } from "@/lib/types";
import AreaGate from "@/components/AreaGate";
import AreaHeader from "@/components/AreaHeader";
import StatusBadge from "@/components/StatusBadge";
import DataBadge from "@/components/DataBadge";
import NoticeAudioButton from "@/components/NoticeAudioButton";
import WhatsAppShare from "@/components/WhatsAppShare";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatTime(ts: string): string {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return ts;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function NoticePage() {
  // Shared links carry ?area=, so recipients see that area's notice without
  // granting location access; otherwise use the visitor's own area.
  const linkedArea = useSearchParam("area");
  if (linkedArea && isValidAreaId(linkedArea)) {
    return <Notice key={linkedArea} areaId={linkedArea} />;
  }
  return <AreaGate>{(area) => <Notice key={area.id} areaId={area.id} area={area} />}</AreaGate>;
}

function Notice({ areaId, area }: { areaId: string; area?: AreaInfo }) {
  const now = useNow();
  const latestQuery = useQuery({
    queryKey: ["alerts", areaId, "latest"],
    queryFn: () => getAlerts(areaId, 1),
  });

  const alert = latestQuery.data?.alerts[0];
  const issuedAt = alert ? new Date(alert.createdAt).getTime() : NaN;
  const isOld = Number.isFinite(issuedAt) && now - issuedAt > DAY_MS;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {area ? (
        <AreaHeader area={area} title="Air-quality notice for this area" />
      ) : (
        <div>
          <p className="text-sm text-muted">Air-quality notice for this area</p>
          <h1 className="text-2xl font-bold text-foreground">
            {alert?.areaName ?? "Air-quality advisory"}
          </h1>
        </div>
      )}

      {latestQuery.isPending && (
        <div className="rounded-2xl border border-border bg-surface p-6 animate-pulse" aria-hidden="true">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
        </div>
      )}

      {latestQuery.isError && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-6 text-red-800 dark:text-red-200">
          <p className="font-medium">Couldn&apos;t load the latest notice</p>
          <button onClick={() => latestQuery.refetch()} className="mt-2 text-sm font-medium underline">
            Retry
          </button>
        </div>
      )}

      {latestQuery.data && !alert && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-foreground font-medium">No air-quality advisories have been shared for this area yet.</p>
          <p className="text-sm text-muted mt-1">
            Normal activities continue. Check the{" "}
            <Link href="/" className="underline">
              dashboard
            </Link>{" "}
            for current air quality.
          </p>
        </div>
      )}

      {alert && (
        <article className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-5">
          {isOld && (
            <p className="rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-muted-strong">
              This is the most recent advisory, shared over 24 hours ago. See the{" "}
              <Link href="/" className="underline">
                dashboard
              </Link>{" "}
              for current air quality.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <StatusBadge status={alert.recommendation?.status ?? "Unavailable"} large />
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  AQI {alert.aqiSnapshot?.aqi ?? "N/A"} at time of notice
                </p>
                <p className="text-muted">
                  {formatTime(alert.createdAt)} ({describeAge(alert.createdAt, now).label})
                </p>
              </div>
            </div>
            {alert.aqiSnapshot?.dataMode && <DataBadge mode={alert.aqiSnapshot.dataMode} />}
          </div>

          <section aria-label="Notice in English">
            <p className="whitespace-pre-line text-foreground leading-relaxed">{alert.message}</p>
          </section>

          {alert.messageHi && (
            <section aria-label="सूचना हिंदी में" lang="hi" className="border-t border-border pt-5">
              <p className="whitespace-pre-line text-foreground leading-relaxed">{alert.messageHi}</p>
            </section>
          )}

          {alert.decision && (
            <p className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 px-3 py-2 text-sm text-blue-900 dark:text-blue-200">
              <span className="font-medium">Action taken:</span> {alert.decision}
            </p>
          )}

          <p className="text-xs text-muted">
            For: {AUDIENCE_LABELS[alert.audience] ?? alert.audience} &middot; Shared by{" "}
            {alert.adminName}
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <NoticeAudioButton alert={alert} lang="en" label="Listen (English)" />
            {alert.messageHi && (
              <NoticeAudioButton alert={alert} lang="hi" label="सुनें (हिंदी)" />
            )}
            <WhatsAppShare alert={alert} />
          </div>
        </article>
      )}

      <p className="text-xs text-muted">
        This notice was shared by a BreatheSafe user. It is decision support, not medical advice.
        Follow official{" "}
        <a href="https://cpcb.nic.in" target="_blank" rel="noopener noreferrer" className="underline">
          CPCB
        </a>{" "}
        and health-authority guidance.
      </p>
    </div>
  );
}
