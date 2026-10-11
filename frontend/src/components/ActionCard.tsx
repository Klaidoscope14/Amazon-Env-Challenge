"use client";

import { useState } from "react";
import Link from "next/link";
import type { Recommendation } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatPollutant } from "@/lib/constants";
import { bandFill, bandInk } from "@/lib/bands";
import QuickShare from "./QuickShare";
import ExplainPanel from "./ExplainPanel";

interface ActionCardProps {
  recommendation: Recommendation;
  areaId: string;
  scenario?: string;
  onIssueAlert: () => void;
}

/**
 * The decision: what to do right now, with the evidence one tap away. The card
 * takes its tint from the current air-quality band, so the colour itself says
 * how serious things are.
 */
export default function ActionCard({ recommendation, areaId, scenario, onIssueAlert }: ActionCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const { isAuthenticated } = useAuth();

  if (recommendation.dataQuality === "unavailable") {
    return (
      <section className="glass rounded-3xl p-5 sm:p-6">
        <p className="font-medium text-foreground">Air quality data is currently unavailable.</p>
        <p className="mt-1.5 text-sm text-muted">
          Check{" "}
          <a href="https://cpcb.nic.in" target="_blank" rel="noopener noreferrer" className="underline">
            official CPCB sources
          </a>{" "}
          for the latest information.
        </p>
      </section>
    );
  }

  const ev = recommendation.evidence;
  const tint = bandFill(recommendation.status);

  return (
    <section
      aria-label="Recommended action"
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-foreground">Recommended action</h2>
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            aria-expanded={showEvidence}
            aria-controls="action-evidence"
            className="min-h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: tint, color: bandInk(recommendation.status) }}
          >
            {showEvidence ? "Hide details" : "Details"}
          </button>
        </div>

        <p
          className="mt-4 font-display text-xl font-semibold leading-snug text-foreground sm:text-2xl"
          aria-live="polite"
          aria-atomic="true"
        >
          {recommendation.action}
        </p>

        {showEvidence && (
          <div id="action-evidence" className="mt-4 space-y-3 rounded-2xl bg-surface-2/80 p-4 text-sm text-foreground">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Rule applied</p>
              <p className="mt-0.5">{recommendation.rule.name}</p>
              <p className="text-xs text-muted">
                Source: {recommendation.rule.source}
                {recommendation.rule.id && <> · Ruleset {recommendation.rule.id}</>}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Evidence</p>
              <p className="mt-0.5">
                AQI {ev.aqi} ({formatPollutant(ev.dominantPollutant).label}) at {ev.stationName}
              </p>
              <p className="text-xs text-muted">
                {ev.dataAge} · Source: {ev.source}
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <QuickShare areaId={areaId} scenario={scenario} />
          {recommendation.statusLevel >= 3 &&
            (isAuthenticated ? (
              <button
                type="button"
                onClick={onIssueAlert}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
              >
                Publish a public alert
              </button>
            ) : (
              <Link
                href="/login?redirect=/"
                className="text-sm font-medium text-accent-text underline underline-offset-2 sm:ml-2"
              >
                Sign in to publish a public alert for your area
              </Link>
            ))}
        </div>

        <ExplainPanel areaId={areaId} scenario={scenario} />

        <p className="mt-4 text-xs text-muted">{recommendation.disclaimer}</p>
      </div>
    </section>
  );
}
