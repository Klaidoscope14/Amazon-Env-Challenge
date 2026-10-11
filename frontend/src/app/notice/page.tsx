"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAlerts, getNoticeTemplate } from "@/lib/api";
import { useAudienceLabel } from "@/lib/catalog";
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
  const audienceLabel = useAudienceLabel();
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
        <AreaHeader area={area} title="वायु गुणवत्ता सूचना · Air-quality notice" />
      ) : (
        <div>
          <p className="text-sm text-muted">
            <span lang="hi">वायु गुणवत्ता सूचना</span> · Air-quality notice
          </p>
          <h1 className="text-2xl font-bold text-foreground">
            {alert?.areaName ?? "Air-quality advisory"}
          </h1>
        </div>
      )}

      <CurrentAir areaId={areaId} />

      <h2 className="text-sm font-medium text-muted pt-2">
        <span lang="hi">आख़िरी साझा सूचना</span> · Latest shared notice
      </h2>

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
          <p className="text-foreground font-medium" lang="hi">इस क्षेत्र के लिए अभी कोई सूचना साझा नहीं की गई है।</p>
          <p className="text-sm text-muted mt-1">No notice has been shared for this area yet. The current air is shown above.</p>
        </div>
      )}

      {alert && (
        <article className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-5">
          {isOld && (
            <p className="rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-muted-strong">
              <span lang="hi">यह सूचना 24 घंटे से अधिक पुरानी है।</span> This notice is over 24 hours
              old; the current air is shown above.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <StatusBadge status={alert.recommendation?.status ?? "Unavailable"} large />
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  AQI {alert.aqiSnapshot?.aqi ?? "N/A"}{" "}
                  <span className="font-normal text-muted">
                    (<span lang="hi">सूचना के समय</span> · at time of notice)
                  </span>
                </p>
                <p className="text-muted">
                  {formatTime(alert.createdAt)} ({describeAge(alert.createdAt, now).label})
                </p>
              </div>
            </div>
            {alert.aqiSnapshot?.dataMode && <DataBadge mode={alert.aqiSnapshot.dataMode} />}
          </div>

          {alert.messageHi && (
            <section aria-label="सूचना हिंदी में" lang="hi">
              <p className="whitespace-pre-line text-lg text-foreground leading-relaxed">{alert.messageHi}</p>
            </section>
          )}

          <section
            aria-label="Notice in English"
            className={alert.messageHi ? "border-t border-border pt-5" : undefined}
          >
            <p className="whitespace-pre-line text-foreground leading-relaxed">{alert.message}</p>
          </section>

          {alert.decision && (
            <p className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 px-3 py-2 text-sm text-blue-900 dark:text-blue-200">
              <span className="font-medium">Action taken:</span> {alert.decision}
            </p>
          )}

          <p className="text-xs text-muted">
            For: {audienceLabel(alert.audience)} &middot; Shared by{" "}
            {alert.adminName}
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            {alert.messageHi && (
              <NoticeAudioButton alert={alert} lang="hi" label="सुनें (हिंदी)" />
            )}
            <NoticeAudioButton alert={alert} lang="en" label="Listen (English)" />
            <WhatsAppShare alert={alert} />
          </div>
        </article>
      )}

      <p className="text-xs text-muted">
        <span lang="hi">यह सलाह है, चिकित्सा परामर्श नहीं।</span> General advice, not medical advice.
      </p>
    </div>
  );
}

/** The current reading and advice for the area, so the page is useful even without a recent notice. */
function CurrentAir({ areaId }: { areaId: string }) {
  const current = useQuery({
    queryKey: ["noticeTemplate", areaId, undefined, "all"],
    queryFn: () => getNoticeTemplate({ campus: areaId, audience: "all" }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  if (!current.data) return null;
  // Reviewed letter layout is "greeting / body / sign-off"; show just the body here.
  const body = (text: string) => {
    const parts = text.split("\n\n");
    return parts.length >= 3 ? parts.slice(1, -1).join("\n\n") : text;
  };
  return (
    <section
      aria-label="अभी की हवा · Air right now"
      className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={current.data.status} large />
        <p className="text-sm">
          <span className="block font-medium text-foreground">
            <span lang="hi">अभी की हवा</span> · Air right now
          </span>
          <span className="text-muted">AQI {current.data.aqi}</span>
        </p>
      </div>
      <p lang="hi" className="text-lg text-foreground leading-relaxed whitespace-pre-line">
        {body(current.data.hi)}
      </p>
      <p className="text-sm text-muted-strong leading-relaxed whitespace-pre-line">{body(current.data.en)}</p>
      <Link href="/" className="inline-block text-sm font-medium text-blue-700 dark:text-blue-300 underline">
        Plan your day with VayuSaathi
      </Link>
    </section>
  );
}
