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
        <AreaHeader area={area} title="Campus Air Quality Notice · for students, staff and parents" />
      ) : (
        <div>
          <p className="text-sm text-gray-600">Campus Air Quality Notice · for students, staff and parents</p>
          <h1 className="text-2xl font-bold text-gray-900">
            {alert?.areaName ?? "Air-quality advisory"}
          </h1>
        </div>
      )}

      {latestQuery.isPending && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse" aria-hidden="true">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4" />
          <div className="h-4 bg-gray-200 rounded w-full mb-2" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      )}

      {latestQuery.isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="font-medium">Couldn&apos;t load the latest notice</p>
          <button onClick={() => latestQuery.refetch()} className="mt-2 text-sm font-medium underline">
            Retry
          </button>
        </div>
      )}

      {latestQuery.data && !alert && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-800 font-medium">No air-quality advisories have been issued for this area.</p>
          <p className="text-sm text-gray-600 mt-1">
            Normal activities continue. Check the{" "}
            <Link href="/" className="underline">
              dashboard
            </Link>{" "}
            for current air quality.
          </p>
        </div>
      )}

      {alert && (
        <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          {isOld && (
            <p className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
              This is the most recent advisory, issued over 24 hours ago. See the{" "}
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
                <p className="font-medium text-gray-900">
                  AQI {alert.aqiSnapshot?.aqi ?? "N/A"} at time of notice
                </p>
                <p className="text-gray-600">
                  {formatTime(alert.createdAt)} ({describeAge(alert.createdAt, now).label})
                </p>
              </div>
            </div>
            {alert.aqiSnapshot?.dataMode && <DataBadge mode={alert.aqiSnapshot.dataMode} />}
          </div>

          <section aria-label="Notice in English">
            <p className="whitespace-pre-line text-gray-900 leading-relaxed">{alert.message}</p>
          </section>

          {alert.messageHi && (
            <section aria-label="सूचना हिंदी में" lang="hi" className="border-t border-gray-100 pt-5">
              <p className="whitespace-pre-line text-gray-900 leading-relaxed">{alert.messageHi}</p>
            </section>
          )}

          {alert.decision && (
            <p className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-900">
              <span className="font-medium">Action taken:</span> {alert.decision}
            </p>
          )}

          <p className="text-xs text-gray-600">
            For: {AUDIENCE_LABELS[alert.audience] ?? alert.audience} &middot; Issued by{" "}
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

      <p className="text-xs text-gray-600">
        This notice is decision support from campus administration, not medical advice.
        Follow official{" "}
        <a href="https://cpcb.nic.in" target="_blank" rel="noopener noreferrer" className="underline">
          CPCB
        </a>{" "}
        and health-authority guidance.
      </p>
    </div>
  );
}
