"use client";

import { useState } from "react";
import Link from "next/link";
import type { Recommendation } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatPollutant } from "@/lib/constants";
import StatusBadge from "./StatusBadge";
import DataBadge from "./DataBadge";
import Card from "./ui/Card";
import Button, { buttonClasses } from "./ui/Button";

interface RecommendationCardProps {
  recommendation: Recommendation;
  onIssueAlert: () => void;
}

export default function RecommendationCard({
  recommendation,
  onIssueAlert,
}: RecommendationCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const { isAuthenticated } = useAuth();

  if (recommendation.dataQuality === "unavailable") {
    return (
      <Card muted className="p-6 shadow-none">
        <p className="text-muted font-medium">
          Air quality data is currently unavailable.
        </p>
        <p className="text-sm text-muted mt-2">
          Check{" "}
          <a
            href="https://cpcb.nic.in"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            official CPCB sources
          </a>{" "}
          for the latest information.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm text-muted mb-2">Recommended Action</p>
          <StatusBadge status={recommendation.status} large />
        </div>
        <DataBadge mode={recommendation.dataQuality} />
      </div>

      <p
        className="text-lg font-medium text-foreground mt-4"
        aria-live="polite"
        aria-atomic="true"
      >
        {recommendation.action}
      </p>

      {recommendation.aiNarrative && (
        <div className="mt-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-xs font-medium text-indigo-600">
              AI Insight (Amazon Bedrock)
            </span>
          </div>
          <p className="text-sm text-indigo-900 dark:text-indigo-200">{recommendation.aiNarrative}</p>
        </div>
      )}

      <button
        onClick={() => setShowEvidence(!showEvidence)}
        aria-expanded={showEvidence}
        aria-controls="recommendation-evidence"
        className="mt-3 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-200 font-medium flex items-center gap-1"
      >
        {showEvidence ? "Hide" : "See"} evidence and rule
        <svg
          className={`w-4 h-4 transition-transform ${showEvidence ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {showEvidence && (
        <div id="recommendation-evidence" className="mt-4 rounded-lg bg-surface-2 border border-border p-4 space-y-3 text-sm">
          <div>
            <span className="text-muted font-medium">Rule Applied:</span>
            <p className="mt-0.5">{recommendation.rule.name}</p>
            <p className="text-xs text-muted">
              Source: {recommendation.rule.source}
            </p>
          </div>
          <div>
            <span className="text-muted font-medium">Evidence:</span>
            <p className="mt-0.5">
              AQI {recommendation.evidence.aqi} (
              {formatPollutant(recommendation.evidence.dominantPollutant).label}) at{" "}
              {recommendation.evidence.stationName}
            </p>
            <p className="text-xs text-muted">
              {recommendation.evidence.dataAge} &middot; Source:{" "}
              {recommendation.evidence.source}
            </p>
          </div>
          {recommendation.evidence.pollutants &&
            Object.keys(recommendation.evidence.pollutants).length > 0 && (
              <div>
                <span className="text-muted font-medium">Pollutants:</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(recommendation.evidence.pollutants).map(
                    ([k, v]) => (
                      <span key={k} className="bg-surface rounded px-2 py-0.5 text-xs border">
                        {formatPollutant(k).label}: {v}
                        {recommendation.evidence.pollutantScale === "subindex"
                          ? ""
                          : ` ${formatPollutant(k).unit}`}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
        <p className="text-xs text-muted max-w-md">
          {recommendation.disclaimer}
        </p>
        {recommendation.statusLevel >= 3 &&
          (isAuthenticated ? (
            <Button variant="danger" onClick={onIssueAlert} className="shrink-0 ml-4">
              Issue Alert
            </Button>
          ) : (
            <Link
              href="/login?redirect=/"
              className={buttonClasses({ variant: "secondary", className: "shrink-0 ml-4" })}
            >
              Sign in to issue alert
            </Link>
          ))}
      </div>
    </Card>
  );
}
