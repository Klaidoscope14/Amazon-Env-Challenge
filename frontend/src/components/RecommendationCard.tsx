"use client";

import { useState } from "react";
import Link from "next/link";
import type { Recommendation } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatPollutant } from "@/lib/constants";
import StatusBadge from "./StatusBadge";
import DataBadge from "./DataBadge";

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
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <p className="text-gray-600 font-medium">
          Air quality data is currently unavailable.
        </p>
        <p className="text-sm text-gray-500 mt-2">
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
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm text-gray-500 mb-2">Recommended Action</p>
          <StatusBadge status={recommendation.status} large />
        </div>
        <DataBadge mode={recommendation.dataQuality} />
      </div>

      <p className="text-lg font-medium text-gray-900 mt-4">
        {recommendation.action}
      </p>

      {recommendation.aiNarrative && (
        <div className="mt-3 rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-xs font-medium text-indigo-600">
              AI Insight (Amazon Bedrock)
            </span>
          </div>
          <p className="text-sm text-indigo-900">{recommendation.aiNarrative}</p>
        </div>
      )}

      <button
        onClick={() => setShowEvidence(!showEvidence)}
        className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
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
        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-100 p-4 space-y-3 text-sm">
          <div>
            <span className="text-gray-500 font-medium">Rule Applied:</span>
            <p className="mt-0.5">{recommendation.rule.name}</p>
            <p className="text-xs text-gray-400">
              Source: {recommendation.rule.source}
            </p>
          </div>
          <div>
            <span className="text-gray-500 font-medium">Evidence:</span>
            <p className="mt-0.5">
              AQI {recommendation.evidence.aqi} (
              {formatPollutant(recommendation.evidence.dominantPollutant).label}) at{" "}
              {recommendation.evidence.stationName}
            </p>
            <p className="text-xs text-gray-400">
              {recommendation.evidence.dataAge} &middot; Source:{" "}
              {recommendation.evidence.source}
            </p>
          </div>
          {recommendation.evidence.pollutants &&
            Object.keys(recommendation.evidence.pollutants).length > 0 && (
              <div>
                <span className="text-gray-500 font-medium">Pollutants:</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(recommendation.evidence.pollutants).map(
                    ([k, v]) => (
                      <span key={k} className="bg-white rounded px-2 py-0.5 text-xs border">
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

      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400 max-w-md">
          {recommendation.disclaimer}
        </p>
        {recommendation.statusLevel >= 3 &&
          (isAuthenticated ? (
            <button
              onClick={onIssueAlert}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors shrink-0 ml-4"
            >
              Issue Alert
            </button>
          ) : (
            <Link
              href="/login?redirect=/"
              className="px-4 py-2 bg-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors shrink-0 ml-4"
            >
              Sign in to issue alert
            </Link>
          ))}
      </div>
    </div>
  );
}
