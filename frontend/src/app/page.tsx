"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAQI, getRecommendation } from "@/lib/api";
import { DEFAULT_CAMPUS, CAMPUS_DISPLAY_NAME } from "@/lib/constants";
import AqiHeroCard from "@/components/AqiHeroCard";
import RecommendationCard from "@/components/RecommendationCard";
import AlertForm from "@/components/AlertForm";

export default function DashboardPage() {
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [scenario, setScenario] = useState("poor");

  const aqiQuery = useQuery({
    queryKey: ["aqi", DEFAULT_CAMPUS, scenario],
    queryFn: () => getAQI(DEFAULT_CAMPUS, scenario),
  });

  const recQuery = useQuery({
    queryKey: ["recommendation", DEFAULT_CAMPUS, scenario],
    queryFn: () => getRecommendation(DEFAULT_CAMPUS),
    enabled: !!aqiQuery.data,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {CAMPUS_DISPLAY_NAME}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Campus Air Quality Dashboard
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Demo scenario:</label>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
          >
            <option value="good">Good (0-50)</option>
            <option value="satisfactory">Satisfactory (51-100)</option>
            <option value="moderate">Moderate (101-200)</option>
            <option value="poor">Poor (201-300)</option>
            <option value="veryPoor">Very Poor (301-400)</option>
            <option value="severe">Severe (401-500)</option>
          </select>
        </div>
      </div>

      {alertSent && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center justify-between">
          <span>
            Alert sent successfully.{" "}
            <Link href="/alerts" className="underline font-medium">
              View in Alerts & Decisions
            </Link>
          </span>
          <button
            onClick={() => setAlertSent(false)}
            className="text-green-600 hover:text-green-800 ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {aqiQuery.isPending && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
          <div className="h-16 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      )}

      {aqiQuery.isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="font-medium">Failed to load air quality data</p>
          <p className="text-sm mt-1">
            The API may be temporarily unavailable. Please try again.
          </p>
          <button
            onClick={() => aqiQuery.refetch()}
            className="mt-3 text-sm text-red-600 underline"
          >
            Retry
          </button>
        </div>
      )}

      {aqiQuery.data && <AqiHeroCard reading={aqiQuery.data} />}

      {recQuery.isPending && aqiQuery.data && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-6 bg-gray-200 rounded w-2/3" />
        </div>
      )}

      {recQuery.data && (
        <RecommendationCard
          recommendation={recQuery.data}
          onIssueAlert={() => setShowAlertForm(true)}
        />
      )}

      {showAlertForm && (
        <AlertForm
          recommendation={recQuery.data || null}
          onClose={() => setShowAlertForm(false)}
          onSuccess={() => {
            setShowAlertForm(false);
            setAlertSent(true);
          }}
        />
      )}
    </div>
  );
}
