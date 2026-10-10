"use client";

interface DataBadgeProps {
  mode: "live" | "cached" | "demo" | "stale" | "unavailable";
}

const BADGE_STYLES: Record<string, string> = {
  live: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 border-green-300 dark:border-green-800",
  cached: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-800",
  demo: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-800",
  stale: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-800",
  unavailable: "bg-surface-2 text-foreground border-border-strong",
};

const BADGE_LABELS: Record<string, string> = {
  live: "Live",
  cached: "Cached",
  demo: "Demo data — not a live reading",
  stale: "Stale data",
  unavailable: "Unavailable",
};

export default function DataBadge({ mode }: DataBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${BADGE_STYLES[mode] || BADGE_STYLES.unavailable}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${mode === "live" ? "bg-green-500 animate-pulse" : mode === "demo" ? "bg-purple-500" : "bg-gray-400"}`}
      />
      {BADGE_LABELS[mode] || mode}
    </span>
  );
}
