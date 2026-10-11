"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError, getAQI, getRecommendation, getTrends } from "@/lib/api";
import { EMAIL_DELIVERY } from "@/lib/constants";
import { useSearchParam } from "@/lib/useSearchParam";
import { areaSubtitle } from "@/lib/area";
import { useCatalog } from "@/lib/catalog";
import type { Alert, AreaInfo } from "@/lib/types";
import AreaGate from "@/components/AreaGate";
import AreaPicker from "@/components/AreaPicker";
import AqiStatsCard from "@/components/AqiStatsCard";
import ActionCard from "@/components/ActionCard";
import PollutantTiles from "@/components/PollutantTiles";
import TrendHistogram from "@/components/TrendHistogram";
import PlansCard from "@/components/PlansCard";
import AlertForm from "@/components/AlertForm";
import DecisionRecorder from "@/components/DecisionRecorder";
import WhatsAppShare from "@/components/WhatsAppShare";

const CPCB_URL = "https://cpcb.nic.in";

/** Used only when GET /catalog is unreachable; the API's catalog is the source of truth. */
const FALLBACK_DEFAULT_SCENARIO = "poor";
const FALLBACK_SCENARIOS = [
  { value: "good", label: "Good" },
  { value: "satisfactory", label: "Satisfactory" },
  { value: "moderate", label: "Moderate" },
  { value: "poor", label: "Poor" },
  { value: "veryPoor", label: "Very Poor" },
  { value: "severe", label: "Severe" },
];

export default function DashboardPage() {
  // Remount per area so every piece of state belongs to one area.
  return <AreaGate>{(area) => <Dashboard key={area.id} area={area} />}</AreaGate>;
}

function Dashboard({ area }: { area: AreaInfo }) {
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [sentAlert, setSentAlert] = useState<Alert | null>(null);
  const [changing, setChanging] = useState(false);
  // Demo scenarios (and the default one) come from the API's catalog.
  const catalog = useCatalog();
  const [chosenScenario, setScenario] = useState<string | null>(null);
  // If the catalog can't be reached (e.g. an older deployment), presenter mode
  // still works with the backend's standard scenario names.
  const scenarioOptions = catalog.data?.demoScenarios ?? (catalog.isError ? FALLBACK_SCENARIOS : []);
  const scenario =
    chosenScenario ?? catalog.data?.defaultDemoScenario ?? (catalog.isError ? FALLBACK_DEFAULT_SCENARIO : undefined);
  const [trendHours, setTrendHours] = useState(24);
  const presenterParam = useSearchParam("presenter") !== null;
  const [presenterSeen, setPresenterSeen] = useState(false);

  // Presenter control: shown when the backend serves demo data, or on demand
  // with ?presenter=1 (live mode). Only then is a scenario sent.
  const sendScenario = presenterParam || presenterSeen;
  const activeScenario = sendScenario ? scenario : undefined;
  // In presenter mode, wait for the scenario rather than briefly showing live data.
  const ready = !sendScenario || !!scenario;

  // All requests are independent, so they load in parallel; the backend
  // resolves the same area (and scenario) for each of them.
  const aqiQuery = useQuery({
    queryKey: ["aqi", area.id, activeScenario],
    queryFn: () => getAQI(area.id, activeScenario),
    enabled: ready,
    placeholderData: keepPreviousData,
    // A 503 means "no valid reading right now": say so immediately, don't retry.
    retry: (count, err) => !(err instanceof ApiError && err.status === 503) && count < 2,
  });

  const recQuery = useQuery({
    queryKey: ["recommendation", area.id, activeScenario],
    queryFn: () => getRecommendation(area.id, activeScenario),
    enabled: ready,
    placeholderData: keepPreviousData,
  });

  const trendQuery = useQuery({
    queryKey: ["trends", area.id, trendHours, activeScenario],
    queryFn: () => getTrends(area.id, trendHours, activeScenario),
    enabled: ready,
    placeholderData: keepPreviousData,
  });

  const isDemo = aqiQuery.data?.dataMode === "demo";
  // Latch: once the server has served demo data, keep the presenter control
  // (and scenario) stable instead of toggling with each response.
  if (isDemo && !presenterSeen) setPresenterSeen(true);
  const showPresenter = presenterParam || presenterSeen;

  const aqiUnavailable = aqiQuery.error instanceof ApiError && aqiQuery.error.status === 503;
  const reading = aqiQuery.data;
  const hasPollutants = !!reading?.pollutants && Object.keys(reading.pollutants).length > 0;

  return (
    <div className="bleed space-y-6 sm:space-y-8">
      <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Left: headline, key numbers, the decision. */}
        <div className="space-y-5 lg:col-span-5">
          <header>
            <p className="text-sm text-muted">Air quality near you</p>
            <h1 className="mt-1 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl xl:text-6xl">
              Air Quality <span className="text-muted">Index</span>
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-strong">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span className="font-medium text-foreground">
                {areaSubtitle(area).startsWith(area.name) ? areaSubtitle(area) : area.name}
              </span>
              {areaSubtitle(area) && !areaSubtitle(area).startsWith(area.name) && (
                <span>· {areaSubtitle(area)}</span>
              )}
              <button
                type="button"
                onClick={() => setChanging((v) => !v)}
                aria-expanded={changing}
                className="font-medium text-accent-text underline underline-offset-2"
              >
                {changing ? "Cancel" : "Change location"}
              </button>
            </p>

            {showPresenter && (
              <section aria-label="Demo mode" className="glass mt-4 max-w-xl rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <label htmlFor="demo-scenario" className="text-sm font-semibold text-foreground">
                    Demo mode · pick a scenario
                  </label>
                  <select
                    id="demo-scenario"
                    value={scenario ?? ""}
                    onChange={(e) => setScenario(e.target.value)}
                    className="min-h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"
                  >
                    {scenarioOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {presenterParam
                    ? "You opened this page in presenter mode. "
                    : "The service is currently serving sample data. "}
                  The figures for your area are a labelled sample, not a live reading, so you can preview how the
                  advice and colours change from clean to hazardous air.
                  {presenterParam && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={() => window.location.assign(window.location.pathname)}
                        className="font-medium text-accent-text underline underline-offset-2"
                      >
                        Exit demo mode
                      </button>
                      .
                    </>
                  )}
                </p>
              </section>
            )}
          </header>

          {changing && <AreaPicker onDone={() => setChanging(false)} />}

          {sentAlert && <SentAlertPanel alert={sentAlert} onDismiss={() => setSentAlert(null)} />}

          {aqiQuery.isPending && <PanelSkeleton tall />}

          {aqiUnavailable && (
            <section className="glass rounded-3xl p-5 sm:p-6">
              <p className="font-medium text-foreground">Air quality data unavailable</p>
              <p className="mt-1 text-sm text-muted">
                No valid air-quality reading is available for this area right now. Check{" "}
                <a href={CPCB_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                  official CPCB sources
                </a>{" "}
                or choose a different area.
              </p>
              <RetryButton onClick={() => aqiQuery.refetch()} />
            </section>
          )}

          {aqiQuery.isError && !aqiUnavailable && (
            <ErrorPanel title="Failed to load air quality data" onRetry={() => aqiQuery.refetch()} />
          )}

          {reading && <AqiStatsCard reading={reading} />}

          {recQuery.isPending && <PanelSkeleton />}
          {recQuery.isError && (
            <ErrorPanel title="Failed to load the recommendation" onRetry={() => recQuery.refetch()} />
          )}
          {recQuery.data && !(aqiUnavailable && recQuery.data.dataQuality === "unavailable") && (
            <ActionCard
              recommendation={recQuery.data}
              areaId={area.id}
              scenario={activeScenario}
              onIssueAlert={() => setShowAlertForm(true)}
            />
          )}
        </div>

        {/* Right: how the air has moved. */}
        <div className="space-y-5 lg:col-span-7">
          {trendQuery.isError && (
            <ErrorPanel title="Failed to load the AQI trend" onRetry={() => trendQuery.refetch()} />
          )}
          {trendQuery.data && (
            <TrendHistogram trends={trendQuery.data} selectedHours={trendHours} onHoursChange={setTrendHours} />
          )}
          {trendQuery.isPending && <PanelSkeleton tall />}
        </div>
      </div>

      {hasPollutants && reading && (
        <section aria-label="Pollutant levels">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-semibold text-foreground">Pollutants this hour</h2>
            <p className="text-sm text-muted">Against the CPCB safe limit — the tick marks the limit</p>
          </div>
          <PollutantTiles pollutants={reading.pollutants} dominantPollutant={reading.dominantPollutant} />
        </section>
      )}

      {reading && <PlansCard areaId={area.id} scenario={activeScenario} />}

      {showAlertForm && (
        <AlertForm
          area={area}
          recommendation={recQuery.data || null}
          scenario={activeScenario}
          readingTimestamp={isDemo ? undefined : reading?.timestamp}
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
      className="rounded-3xl border border-green-400/40 bg-green-500/10 p-5 text-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display font-semibold">Alert sent</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-green-800 dark:text-green-200">
              In-app notice published
            </span>
            {email && <span className={`rounded-full px-2 py-0.5 ${email.className}`}>{email.label}</span>}
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="min-h-11 min-w-11 text-xl leading-none text-muted hover:text-foreground"
        >
          &times;
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/notice?area=${encodeURIComponent(alert.campus)}`}
          className="glass inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-foreground"
        >
          View public notice
        </Link>
        <WhatsAppShare alert={alert} />
        <Link href="/alerts" className="text-sm underline">
          Alerts & Decisions
        </Link>
      </div>

      <div className="glass mt-4 rounded-2xl p-4">
        <p className="text-sm font-medium text-foreground">Record your decision</p>
        <p className="text-xs text-muted">Log the action you took so the audit trail is complete.</p>
        <DecisionRecorder alert={alert} startOpen />
      </div>
    </section>
  );
}

function PanelSkeleton({ tall }: { tall?: boolean }) {
  return (
    <div className="glass animate-pulse rounded-3xl p-6" aria-hidden="true">
      <div className="mb-4 h-4 w-1/4 rounded bg-surface-2" />
      <div className={`${tall ? "h-24" : "h-8"} mb-4 w-1/2 rounded bg-surface-2`} />
      <div className="h-4 w-2/3 rounded bg-surface-2" />
    </div>
  );
}

function ErrorPanel({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-red-400/40 bg-red-500/10 p-5 text-red-800 dark:text-red-200">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm">The API may be temporarily unavailable. Please try again.</p>
      <RetryButton onClick={onRetry} />
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-3 min-h-11 text-sm font-medium underline">
      Retry
    </button>
  );
}
