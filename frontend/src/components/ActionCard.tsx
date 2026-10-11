"use client";

import Link from "next/link";
import type { AQIReading, Recommendation } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { useBands } from "@/lib/catalog";
import { formatPollutant } from "@/lib/constants";
import { describeAge, useNow } from "@/lib/useNow";
import { bandFill, bandInk, bandText } from "@/lib/bands";
import DataBadge from "./DataBadge";
import QuickShare from "./QuickShare";
import ExplainPanel from "./ExplainPanel";

interface ActionCardProps {
  recommendation: Recommendation;
  /** Where the reading applies, e.g. "Lajpat Nagar". */
  placeName: string;
  /** "demo" adds the sample-data badge. */
  dataMode?: AQIReading["dataMode"];
  areaId: string;
  scenario?: string;
  onIssueAlert: () => void;
}

/**
 * The one card that answers "how is the air, and what should I do?": the AQI
 * and where it sits on India's scale, the action, and ways to tell others.
 * The number comes from the same reading as the action, so they always agree.
 * The card takes its tint from the band, so the colour itself says how
 * serious things are.
 */
export default function ActionCard({
  recommendation,
  placeName,
  dataMode,
  areaId,
  scenario,
  onIssueAlert,
}: ActionCardProps) {
  const { isAuthenticated } = useAuth();
  const bands = useBands();
  const now = useNow();

  if (recommendation.dataQuality === "unavailable") {
    return (
      <section className="glass rounded-3xl p-5 sm:p-6">
        <p className="font-medium text-foreground">We can&apos;t get a reading for this area right now.</p>
        <p className="mt-1.5 text-sm text-muted">Please check again in a little while.</p>
      </section>
    );
  }

  const tint = bandFill(recommendation.status);
  const { aqi, dominantPollutant, timestamp } = recommendation.evidence;
  const max = bands.at(-1)?.to;
  const markerPct = max ? Math.max(0, Math.min(aqi / max, 1)) * 100 : null;
  const facts = [
    `Mainly ${formatPollutant(dominantPollutant).label}`,
    placeName,
    `Updated ${describeAge(timestamp, now).label.toLowerCase()}`,
  ];

  return (
    <section
      aria-label="Air quality and what to do"
      className="relative overflow-hidden rounded-3xl border p-5 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.55)] sm:p-6"
      style={{
        background: `linear-gradient(140deg, color-mix(in srgb, ${tint} 22%, var(--surface)) 0%, var(--surface) 82%)`,
        borderColor: `color-mix(in srgb, ${tint} 38%, var(--border))`,
      }}
    >
      {/* Soft wind-streak motif. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 200 120"
        className="pointer-events-none absolute -bottom-4 -right-4 h-36 w-56 text-foreground/[0.06]"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      >
        <path d="M10 40h110a18 18 0 1 0-18-18" />
        <path d="M30 70h130a20 20 0 1 1-20 20" />
        <path d="M0 100h80" />
      </svg>

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-strong">Air quality now</h2>
          <DataBadge mode={dataMode ?? "live"} />
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
          <p
            className="font-display text-7xl font-bold leading-none tabular-nums"
            style={{ color: bandText(recommendation.status) }}
            aria-label={`AQI ${aqi}, ${recommendation.status}`}
          >
            {aqi}
          </p>
          <span
            className="mb-1.5 rounded-full px-3 py-1 text-sm font-semibold"
            style={{ background: tint, color: bandInk(recommendation.status) }}
          >
            {recommendation.status}
          </span>
        </div>

        {/* India's AQI scale with a marker at the current value. */}
        {max && (
          <div className="mt-4 max-w-md" aria-hidden="true">
            <div className="relative pt-2">
              <div
                className="absolute top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent"
                style={{ left: `${markerPct}%`, borderTopColor: "var(--foreground)" }}
              />
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                {bands.map((b) => (
                  <div key={b.status} style={{ width: `${((b.to - b.from) / max) * 100}%`, background: bandFill(b.status) }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-muted">{facts.join(" · ")}</p>

        <h3 className="mt-6 text-sm font-medium text-muted-strong">What to do</h3>
        <p
          className="mt-1.5 font-display text-xl font-semibold leading-snug text-foreground sm:text-2xl"
          aria-live="polite"
          aria-atomic="true"
        >
          {recommendation.action}
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <QuickShare areaId={areaId} scenario={scenario} />
          {recommendation.statusLevel >= 3 &&
            (isAuthenticated ? (
              <button
                type="button"
                onClick={onIssueAlert}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
              >
                Post an alert for your area
              </button>
            ) : (
              <Link
                href="/login?redirect=/"
                className="text-sm font-medium text-accent-text underline underline-offset-2 sm:ml-2"
              >
                Sign in to post an alert for your area
              </Link>
            ))}
        </div>

        <ExplainPanel areaId={areaId} scenario={scenario} />

      </div>
    </section>
  );
}
