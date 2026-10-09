"use client";

interface DataBadgeProps {
  mode: "live" | "cached" | "demo" | "stale" | "unavailable";
}

const BADGE_STYLES: Record<string, string> = {
  live: "bg-green-100 text-green-800 border-green-300",
  cached: "bg-blue-100 text-blue-800 border-blue-300",
  demo: "bg-purple-100 text-purple-800 border-purple-300",
  stale: "bg-amber-100 text-amber-800 border-amber-300",
  unavailable: "bg-gray-100 text-gray-800 border-gray-300",
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
