"use client";

import { useEffect, useState } from "react";

/**
 * Current time that re-renders on an interval, so relative labels
 * ("5m ago") stay accurate and render functions stay pure.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Relative age of an ISO timestamp; invalid or future times count as stale. */
export function describeAge(timestamp: string, now: number) {
  const then = new Date(timestamp).getTime();
  if (!Number.isFinite(then)) return { label: "Unknown time", isStale: true };

  const diff = now - then;
  if (diff < -FUTURE_SKEW_MS) return { label: "Time in the future", isStale: true };

  const mins = Math.max(0, Math.floor(diff / 60000));
  let label: string;
  if (mins < 1) label = "Just now";
  else if (mins < 60) label = `${mins}m ago`;
  else if (mins < 48 * 60) label = `${Math.floor(mins / 60)}h ago`;
  else label = `${Math.floor(mins / 1440)}d ago`;

  return { label, isStale: diff > STALE_AFTER_MS };
}
