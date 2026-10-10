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
  EMAIL_DELIVERY,
} from "@/lib/constants";
import type { Alert } from "@/lib/types";
import AqiHeroCard from "@/components/AqiHeroCard";
import RecommendationCard from "@/components/RecommendationCard";
import TrendChart from "@/components/TrendChart";
import AlertForm from "@/components/AlertForm";
import DecisionRecorder from "@/components/DecisionRecorder";
import WhatsAppShare from "@/components/WhatsAppShare";

const CPCB_URL = "https://cpcb.nic.in";

export default function DashboardPage() {
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [sentAlert, setSentAlert] = useState<Alert | null>(null);
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

      {sentAlert && (
        <SentAlertPanel alert={sentAlert} onDismiss={() => setSentAlert(null)} />
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
          readingFetchedAt={isDemo ? undefined : aqiQuery.data?.fetchedAt}
          onClose={() => setShowAlertForm(false)}
          onSuccess={(alert) => {
            setShowAlertForm(false);
            setSentAlert(alert);
          }}
        />
      )}
    </div>
  );
}

// Shown right after an alert is issued: what was delivered, where people can
// read it, and the prompt to record the decision (See -> Act -> Record).
function SentAlertPanel({ alert, onDismiss }: { alert: Alert; onDismiss: () => void }) {
  const email = alert.delivery ? EMAIL_DELIVERY[alert.delivery.email] : null;
  return (
    <section
      aria-label="Alert sent"
      className="rounded-2xl border border-green-200 bg-green-50 p-5 text-green-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Alert sent</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">
              In-app notice published
            </span>
            {email && (
              <span className={`rounded-full px-2 py-0.5 ${email.className}`}>{email.label}</span>
            )}
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-green-700 hover:text-green-900 text-xl leading-none"
        >
          &times;
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href="/notice"
          className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-900 hover:bg-green-100"
        >
          View public notice
        </Link>
        <WhatsAppShare alert={alert} />
        <Link href="/alerts" className="text-sm underline">
          Alerts & Decisions
        </Link>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4 text-gray-900">
        <p className="text-sm font-medium">Record your decision</p>
        <p className="text-xs text-gray-600">
          Log the action you took so the audit trail is complete.
        </p>
        <DecisionRecorder alert={alert} startOpen />
      </div>
    </section>
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
