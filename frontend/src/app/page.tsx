"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ApiError, getAQI, getRecommendation, getTrends } from "@/lib/api";
import {
  CAMPUS_CITY,
  CAMPUS_DISPLAY_NAME,
  CAMPUS_LOCATION,
  DEFAULT_CAMPUS,
  DEFAULT_DEMO_SCENARIO,
  DEMO_SCENARIO_OPTIONS,
} from "@/lib/constants";
import AqiHeroCard from "@/components/AqiHeroCard";
import RecommendationCard from "@/components/RecommendationCard";
import TrendChart from "@/components/TrendChart";
import AlertForm from "@/components/AlertForm";

const CPCB_URL = "https://cpcb.nic.in";

export default function DashboardPage() {
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [scenario, setScenario] = useState<string>(DEFAULT_DEMO_SCENARIO);
  const [trendHours, setTrendHours] = useState(24);

  // All three requests are independent, so they load in parallel. In demo
  // mode the backend evaluates the same scenario for each of them.
  const aqiQuery = useQuery({
    queryKey: ["aqi", DEFAULT_CAMPUS, scenario],
    queryFn: () => getAQI(DEFAULT_CAMPUS, scenario, CAMPUS_CITY),
  });

  const recQuery = useQuery({
    queryKey: ["recommendation", DEFAULT_CAMPUS, scenario],
    queryFn: () => getRecommendation(DEFAULT_CAMPUS, scenario),
  });

  const trendQuery = useQuery({
    queryKey: ["trends", DEFAULT_CAMPUS, trendHours, scenario],
    queryFn: () => getTrends(DEFAULT_CAMPUS, trendHours, scenario),
  });

  const isDemo = aqiQuery.data?.dataMode === "demo";
  const aqiUnavailable =
    aqiQuery.error instanceof ApiError && aqiQuery.error.status === 503;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {CAMPUS_DISPLAY_NAME}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {CAMPUS_LOCATION} &middot; Campus Air Quality Dashboard
          </p>
        </div>

        {isDemo && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 max-w-full">
            <label
              htmlFor="demo-scenario"
              className="text-xs font-medium text-purple-800 whitespace-nowrap"
            >
              Presenter control &middot; demo scenario
            </label>
            <select
              id="demo-scenario"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="text-xs border border-purple-300 rounded px-2 py-1 bg-white text-gray-900"
            >
              {DEMO_SCENARIO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
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
            aria-label="Dismiss"
            className="text-green-600 hover:text-green-800 ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {aqiQuery.isPending && <CardSkeleton tall />}

      {aqiUnavailable && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="font-medium text-gray-900">
            Air quality data unavailable
          </p>
          <p className="text-sm text-gray-600 mt-1">
            We couldn&apos;t get a reading from CPCB or the fallback source,
            and no earlier reading is stored. Check{" "}
            <a
              href={CPCB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              official CPCB sources
            </a>{" "}
            for the latest information.
          </p>
          <RetryButton onClick={() => aqiQuery.refetch()} />
        </div>
      )}

      {aqiQuery.isError && !aqiUnavailable && (
        <ErrorCard
          title="Failed to load air quality data"
          onRetry={() => aqiQuery.refetch()}
        />
      )}

      {aqiQuery.data && <AqiHeroCard reading={aqiQuery.data} />}

      {recQuery.isPending && <CardSkeleton />}

      {recQuery.isError && (
        <ErrorCard
          title="Failed to load the recommendation"
          onRetry={() => recQuery.refetch()}
        />
      )}

      {recQuery.data && (
        <RecommendationCard
          recommendation={recQuery.data}
          onIssueAlert={() => setShowAlertForm(true)}
        />
      )}

      {trendQuery.isError && (
        <ErrorCard
          title="Failed to load the AQI trend"
          onRetry={() => trendQuery.refetch()}
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
          scenario={isDemo ? scenario : undefined}
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

function CardSkeleton({ tall }: { tall?: boolean }) {
  return (
    <div
      className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse"
      aria-hidden="true"
    >
      <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
      <div className={`${tall ? "h-16" : "h-6"} bg-gray-200 rounded w-1/3 mb-4`} />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
    </div>
  );
}

function ErrorCard({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
      <p className="font-medium">{title}</p>
      <p className="text-sm mt-1">
        The API may be temporarily unavailable. Please try again.
      </p>
      <RetryButton onClick={onRetry} />
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 text-sm font-medium underline"
    >
      Retry
    </button>
  );
}
