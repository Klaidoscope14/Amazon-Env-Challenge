"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError, getAQI, getRecommendation, getTrends } from "@/lib/api";
import {
  DEFAULT_DEMO_SCENARIO,
  DEMO_SCENARIO_OPTIONS,
  EMAIL_DELIVERY,
} from "@/lib/constants";
import { useSearchParam } from "@/lib/useSearchParam";
import type { Alert, AreaInfo } from "@/lib/types";
import AreaGate from "@/components/AreaGate";
import AreaHeader from "@/components/AreaHeader";
import AqiHeroCard from "@/components/AqiHeroCard";
import RecommendationCard from "@/components/RecommendationCard";
import TrendChart from "@/components/TrendChart";
import AlertForm from "@/components/AlertForm";
import DecisionRecorder from "@/components/DecisionRecorder";
import WhatsAppShare from "@/components/WhatsAppShare";

const CPCB_URL = "https://cpcb.nic.in";

export default function DashboardPage() {
  // Remount per area so every piece of state belongs to one area.
  return <AreaGate>{(area) => <Dashboard key={area.id} area={area} />}</AreaGate>;
}

function Dashboard({ area }: { area: AreaInfo }) {
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [sentAlert, setSentAlert] = useState<Alert | null>(null);
  const [scenario, setScenario] = useState<string>(DEFAULT_DEMO_SCENARIO);
  const [trendHours, setTrendHours] = useState(24);
  const presenterParam = useSearchParam("presenter") !== null;
  const [presenterSeen, setPresenterSeen] = useState(false);

  // Presenter control: shown when the backend serves demo data, or on demand
  // with ?presenter=1 (live mode). Only then is a scenario sent.
  const sendScenario = presenterParam || presenterSeen;
  const activeScenario = sendScenario ? scenario : undefined;

  // All three requests are independent, so they load in parallel; the backend
  // resolves the same area (and scenario) for each of them.
  const aqiQuery = useQuery({
    queryKey: ["aqi", area.id, activeScenario],
    queryFn: () => getAQI(area.id, activeScenario),
    placeholderData: keepPreviousData,
  });

  const recQuery = useQuery({
    queryKey: ["recommendation", area.id, activeScenario],
    queryFn: () => getRecommendation(area.id, activeScenario),
    placeholderData: keepPreviousData,
  });

  const trendQuery = useQuery({
    queryKey: ["trends", area.id, trendHours, activeScenario],
    queryFn: () => getTrends(area.id, trendHours, activeScenario),
    placeholderData: keepPreviousData,
  });

  const isDemo = aqiQuery.data?.dataMode === "demo";
  // Latch: once the server has served demo data, keep the presenter control
  // (and scenario) stable instead of toggling with each response.
  if (isDemo && !presenterSeen) setPresenterSeen(true);
  const showPresenter = presenterParam || presenterSeen;

  const aqiUnavailable =
    aqiQuery.error instanceof ApiError && aqiQuery.error.status === 503;

  return (
    <div className="space-y-6">
      <AreaHeader
        area={area}
        title="Air quality near you"
        actions={
          showPresenter && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/40 px-3 py-1.5 max-w-full">
              <label
                htmlFor="demo-scenario"
                className="text-xs font-medium text-purple-800 dark:text-purple-200 whitespace-nowrap"
              >
                Presenter control &middot; demo scenario
              </label>
              <select
                id="demo-scenario"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                className="text-xs border border-purple-300 dark:border-purple-800 rounded px-2 py-1 bg-surface text-foreground"
              >
                {DEMO_SCENARIO_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )
        }
      />

      {sentAlert && (
        <SentAlertPanel alert={sentAlert} onDismiss={() => setSentAlert(null)} />
      )}

      {aqiQuery.isPending && <CardSkeleton tall />}

      {aqiUnavailable && (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <p className="font-medium text-foreground">
            Air quality data unavailable
          </p>
          <p className="text-sm text-muted mt-1">
            The monitoring station for this area has no valid reading right now. Check{" "}
            <a
              href={CPCB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              official CPCB sources
            </a>{" "}
            or choose a different area.
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
          area={area}
          recommendation={recQuery.data || null}
          scenario={activeScenario}
          readingTimestamp={isDemo ? undefined : aqiQuery.data?.timestamp}
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
      className="rounded-2xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 p-5 text-green-900 dark:text-green-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Alert sent</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-green-800 dark:text-green-200">
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
          className="text-green-700 dark:text-green-300 hover:text-green-900 dark:text-green-200 text-xl leading-none"
        >
          &times;
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/notice?area=${encodeURIComponent(alert.campus)}`}
          className="rounded-lg border border-green-300 dark:border-green-800 bg-surface px-3 py-1.5 text-sm font-medium text-green-900 dark:text-green-200 hover:bg-green-100 dark:bg-green-900/40"
        >
          View public notice
        </Link>
        <WhatsAppShare alert={alert} />
        <Link href="/alerts" className="text-sm underline">
          Alerts & Decisions
        </Link>
      </div>

      <div className="mt-4 rounded-xl bg-surface p-4 text-foreground">
        <p className="text-sm font-medium">Record your decision</p>
        <p className="text-xs text-muted">
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
      className="rounded-2xl border border-border bg-surface p-6 animate-pulse"
      aria-hidden="true"
    >
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4" />
      <div className={`${tall ? "h-16" : "h-6"} bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4`} />
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
    </div>
  );
}

function ErrorCard({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-6 text-red-800 dark:text-red-200">
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
