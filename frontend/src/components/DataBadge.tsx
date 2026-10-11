"use client";

interface DataBadgeProps {
  mode: "live" | "cached" | "demo" | "stale" | "unavailable";
}

/**
 * Marks sample data shown in presenter mode, so a demo value is never
 * mistaken for a real reading. Real readings carry no badge: their age is
 * shown as "Last updated" instead.
 */
export default function DataBadge({ mode }: DataBadgeProps) {
  if (mode !== "demo") return null;
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-800">
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-purple-500" />
      Sample data
    </span>
  );
}
