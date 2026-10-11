"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { evaluatePlans } from "@/lib/api";
import { useCatalog } from "@/lib/catalog";
import type { PlansEvaluation } from "@/lib/types";
import Card from "./ui/Card";
import Button from "./ui/Button";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const MAX_PLANS = 12;

type Verdict = PlansEvaluation["verdicts"][number]["verdict"];

const VERDICT_STYLE: Record<Verdict, { label: string; className: string }> = {
  go: { label: "Go", className: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300" },
  modify: { label: "Modify", className: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200" },
  avoid: { label: "Avoid", className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" },
  unknown: { label: "No data", className: "bg-surface-2 text-muted-strong" },
};

interface StoredPlan {
  id: string;
  activity: string;
  durationMinutes: number;
  sensitive: boolean;
  /** Optional "HH:MM", for the person's own reference. */
  time?: string;
}

// ---- Plans live in this browser only (localStorage) -----------------------

const STORAGE_KEY = "breathesafe_plans";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedPlans: StoredPlan[] = [];
const EMPTY: StoredPlan[] = [];

function readPlans(): StoredPlan[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      cachedPlans = Array.isArray(parsed) ? (parsed as StoredPlan[]).slice(0, MAX_PLANS) : [];
    } catch {
      cachedPlans = [];
    }
  }
  return cachedPlans;
}

function writePlans(plans: StoredPlan[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
    cachedRaw = null; // re-read on the next snapshot
  } catch {
    // Storage unavailable (private mode): keep the plans in memory only.
    cachedPlans = plans;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function usePlans(): StoredPlan[] {
  return useSyncExternalStore(subscribe, readPlans, () => EMPTY);
}

// ---------------------------------------------------------------------------

export default function PlansCard({ areaId, scenario }: { areaId: string; scenario?: string }) {
  const plans = usePlans();
  const id = useId();
  // Activities (and their labels) come from the API, which validates them.
  const activities = useCatalog().data?.activities ?? [];
  const [activity, setActivity] = useState<string>("walk");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(30);
  const [sensitive, setSensitive] = useState(false);

  const payload = plans.map(({ id, activity, durationMinutes, sensitive }) => ({
    id,
    activity,
    durationMinutes,
    sensitive,
  }));
  const verdictsQuery = useQuery({
    queryKey: ["plans", areaId, scenario, payload],
    queryFn: () => evaluatePlans(areaId, payload, scenario),
    enabled: plans.length > 0,
    placeholderData: keepPreviousData,
  });
  const verdicts = new Map((verdictsQuery.data?.verdicts ?? []).map((v) => [v.id, v]));

  function addPlan(e: React.FormEvent) {
    e.preventDefault();
    if (plans.length >= MAX_PLANS) return;
    const plan: StoredPlan = {
      id: crypto.randomUUID().slice(0, 8),
      activity,
      durationMinutes: duration,
      sensitive,
      ...(time ? { time } : {}),
    };
    const next = [...plans, plan].sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
    writePlans(next);
    setTime("");
    setSensitive(false);
  }

  const activityLabel = (value: string) =>
    activities.find((o) => o.value === value)?.label ?? value;

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">My plans today</h2>
      <p className="text-sm text-muted mt-1">
        Add what you&apos;re planning outdoors and get a Go, Modify or Avoid for each, based on the
        current reading. Plans are saved only in this browser.
      </p>

      {plans.length > 0 && (
        <ul className="mt-4 divide-y divide-border" aria-live="polite">
          {plans.map((plan) => {
            const v = verdicts.get(plan.id);
            const style = v ? VERDICT_STYLE[v.verdict] : null;
            return (
              <li key={plan.id} className="py-3 flex items-start gap-3">
                <span
                  className={`shrink-0 mt-0.5 rounded-full px-2.5 py-0.5 text-xs font-semibold min-w-16 text-center ${
                    style?.className ?? "bg-surface-2 text-muted"
                  }`}
                >
                  {style?.label ?? (verdictsQuery.isError ? "—" : "…")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {plan.time && <span className="tabular-nums">{plan.time} · </span>}
                    {activityLabel(plan.activity)} · {plan.durationMinutes} min
                    {plan.sensitive && <span className="text-muted font-normal"> · with someone sensitive</span>}
                  </p>
                  {v && <p className="text-sm text-muted-strong">{v.suggestion}</p>}
                </div>
                <button
                  onClick={() => writePlans(plans.filter((p) => p.id !== plan.id))}
                  aria-label={`Remove ${activityLabel(plan.activity)}${plan.time ? ` at ${plan.time}` : ""}`}
                  className="shrink-0 min-h-11 min-w-11 -my-2 text-muted hover:text-foreground text-xl leading-none"
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {verdictsQuery.isError && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          Couldn&apos;t check your plans.{" "}
          <button onClick={() => verdictsQuery.refetch()} className="underline font-medium">
            Try again
          </button>
        </p>
      )}

      {plans.length < MAX_PLANS ? (
        <form onSubmit={addPlan} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <div>
            <label htmlFor={`${id}-activity`} className="block text-xs font-medium text-muted-strong mb-1">
              Activity
            </label>
            <select
              id={`${id}-activity`}
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="w-full min-h-11 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"
            >
              {activities.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-time`} className="block text-xs font-medium text-muted-strong mb-1">
              Time <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id={`${id}-time`}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full min-h-11 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"
            />
          </div>
          <div>
            <label htmlFor={`${id}-duration`} className="block text-xs font-medium text-muted-strong mb-1">
              Duration
            </label>
            <select
              id={`${id}-duration`}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full min-h-11 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground"
            >
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="min-h-11">
            Add plan
          </Button>
          <label className="sm:col-span-4 flex items-center gap-2 text-sm text-muted-strong">
            <input
              type="checkbox"
              checked={sensitive}
              onChange={(e) => setSensitive(e.target.checked)}
              className="h-4 w-4"
            />
            Includes children, older adults or someone with breathing problems
          </label>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted">You can track up to {MAX_PLANS} plans.</p>
      )}

      {verdictsQuery.data && (
        <p className="mt-3 text-xs text-muted">{verdictsQuery.data.disclaimer}</p>
      )}
    </Card>
  );
}
