"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAQI, getRecommendation, getTrends } from "@/lib/api";
import { useLocation } from "@/lib/useLocation";
import AqiHeroCard from "@/components/AqiHeroCard";
import RecommendationCard from "@/components/RecommendationCard";
import TrendChart from "@/components/TrendChart";
import AlertForm from "@/components/AlertForm";

export default function DashboardPage() {
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [scenario, setScenario] = useState("poor");
  const location = useLocation();

  const aqiQuery = useQuery({
    queryKey: ["aqi", location.campus, scenario, location.city],
    queryFn: () => getAQI(location.campus, scenario, location.city),
    enabled: !location.isDetecting,
  });

  const recQuery = useQuery({
    queryKey: ["recommendation", location.campus, scenario],
    queryFn: () => getRecommendation(location.campus),
    enabled: !!aqiQuery.data,
  });

  const [trendHours, setTrendHours] = useState(24);

  const trendQuery = useQuery({
    queryKey: ["trends", location.campus, trendHours],
    queryFn: () => getTrends(location.campus, trendHours),
    enabled: !location.isDetecting,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {location.displayName}
            {location.isDetecting && (
              <span className="text-sm font-normal text-gray-400 ml-2">
                detecting location...
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Campus Air Quality Dashboard
            {location.error && (
              <span className="text-yellow-600 ml-2">
                ({location.error} &mdash; showing Delhi)
              </span>
            )}
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

      {(aqiQuery.isPending || location.isDetecting) && (
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

      {trendQuery.data && (
        <TrendChart
          trends={trendQuery.data}
          selectedHours={trendHours}
          onHoursChange={setTrendHours}
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
