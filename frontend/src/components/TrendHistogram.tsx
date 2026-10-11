"use client";

import { useState } from "react";
import type { AQIStatus, TrendResponse } from "@/lib/types";
import { useBands } from "@/lib/catalog";
import { bandFill, bandText, statusIn } from "@/lib/bands";

const PERIODS = [
  { value: 6, label: "6h" },
  { value: 12, label: "12h" },
  { value: 24, label: "24h" },
  { value: 48, label: "48h" },
  { value: 168, label: "7d" },
];

/** Most bars drawn; longer periods are grouped so the chart always fits its card. */
const MAX_BARS = 56;

/**
 * Groups readings into at most MAX_BARS bars. Each bar is the worst reading in
 * its group (so a spike is never averaged away); the latest reading always
 * keeps a bar of its own, so the chart ends at "now".
 */
function toBars<T extends { aqi: number }>(rows: T[]): T[] {
  if (rows.length <= MAX_BARS) return rows;
  const earlier = rows.slice(0, -1);
  const size = Math.ceil(earlier.length / (MAX_BARS - 1));
  const bars: T[] = [];
  // Group from the end, so the oldest group is the partial one.
  for (let end = earlier.length; end > 0; end -= size) {
    const group = earlier.slice(Math.max(0, end - size), end);
    bars.unshift(group.reduce((worst, r) => (r.aqi > worst.aqi ? r : worst)));
  }
  return [...bars, rows[rows.length - 1]];
}

interface TrendHistogramProps {
  trends: TrendResponse;
  selectedHours: number;
  onHoursChange: (hours: number) => void;
}

function formatTime(ts: string, hours: number): string {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "";
  return hours > 24
    ? d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric" })
    : d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** The AQI over time as a histogram: one bar per reading (grouped for long periods), coloured by band. */
export default function TrendHistogram({ trends, selectedHours, onHoursChange }: TrendHistogramProps) {
  const bands = useBands();
  const [hover, setHover] = useState<number | null>(null);
  const points = trends.points;

  const rows = points.map((p) => ({
    ...p,
    band: (p.status ?? statusIn(bands, p.aqi) ?? "Unavailable") as AQIStatus,
  }));

  const bars = toBars(rows);
  const grouped = bars.length < rows.length;

  const peak = rows.length ? Math.max(...rows.map((r) => r.aqi)) : 0;
  const yMax = Math.max(100, Math.ceil((peak * 1.08) / 25) * 25);
  const gridlines = [0, ...bands.map((b) => b.to).filter((v) => v < yMax)];

  const active = hover !== null && bars[hover] ? hover : bars.length - 1;
  const shown = bars[active];
  const tickCount = Math.min(5, bars.length);
  const ticks = Array.from({ length: tickCount }, (_, k) =>
    tickCount === 1 ? 0 : Math.round((k / (tickCount - 1)) * (bars.length - 1))
  );

  return (
    <section aria-label="AQI trend" className="glass flex h-full flex-col rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">AQI trend</h2>
          {shown ? (
            <p className="mt-1 text-sm text-muted" aria-live="polite">
              <span className="font-semibold tabular-nums" style={{ color: bandText(shown.band) }}>
                {shown.aqi}
              </span>{" "}
              · {shown.band} · {formatTime(shown.timestamp, selectedHours)}
              {active === bars.length - 1 ? " (latest)" : grouped ? " (worst hour)" : ""}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">Nothing to show for this period yet.</p>
          )}
        </div>
        <div role="group" aria-label="Trend period" className="glass flex rounded-full p-1 text-sm font-medium">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onHoursChange(p.value)}
              aria-pressed={selectedHours === p.value}
              className={`min-h-9 rounded-full px-3 transition-colors ${
                selectedHours === p.value ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 && (
        <div className="mt-5 flex min-h-[10rem] flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-glass-border text-center">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </svg>
          <p className="text-sm text-muted">The chart fills in hour by hour.</p>
          <p className="text-xs text-muted">Try a longer period, or check back soon.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div
            className="relative ml-9 min-h-[12rem] flex-1"
            role="img"
            aria-label={`AQI over the last ${selectedHours} hours, from ${rows[0].aqi} to ${rows[rows.length - 1].aqi}. Peak ${peak}.`}
            onMouseLeave={() => setHover(null)}
          >
            {/* Gridlines with their value labels in the left gutter. */}
            {gridlines.map((v) => (
              <div
                key={v}
                className="absolute inset-x-0 border-t border-dashed border-glass-border"
                style={{ bottom: `${(v / yMax) * 100}%` }}
                aria-hidden="true"
              >
                <span className="absolute right-full mr-2 -translate-y-1/2 text-[10px] tabular-nums text-muted">{v}</span>
              </div>
            ))}

            <div className={`absolute inset-0 flex items-end ${bars.length > 30 ? "gap-px" : "gap-[3px]"}`}>
              {bars.map((r, i) => {
                const isNow = i === bars.length - 1;
                const h = Math.max(2, (r.aqi / yMax) * 100);
                const dim = hover !== null && hover !== i;
                return (
                  <div
                    key={r.timestamp}
                    className="relative flex h-full min-w-0 flex-1 items-end"
                    onMouseEnter={() => setHover(i)}
                  >
                    <div
                      className="w-full rounded-t-md transition-opacity"
                      style={{
                        height: `${h}%`,
                        background: bandFill(r.band),
                        opacity: dim ? 0.45 : 1,
                        boxShadow: isNow ? `0 0 18px -2px ${bandFill(r.band)}` : undefined,
                      }}
                    />
                    {isNow && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-canvas"
                        style={{ bottom: `calc(${h}% + 6px)` }}
                      >
                        {r.aqi}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative ml-9 mt-2 h-4 text-[11px] text-muted" aria-hidden="true">
            {ticks.map((i, k) => (
              <span
                key={i}
                // Phones show the first, middle and last labels only, so they don't overlap.
                className={`absolute whitespace-nowrap ${ticks.length === 5 && k % 2 === 1 ? "hidden sm:inline" : ""}`}
                style={{
                  left: `${(i / Math.max(1, bars.length - 1)) * 100}%`,
                  transform: k === 0 ? "none" : k === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {k === ticks.length - 1 ? "Now" : formatTime(bars[i].timestamp, selectedHours)}
              </span>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <p className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-muted">
          <span>
            {rows.length} readings{grouped ? " · each bar is the worst hour in that stretch" : ""}
          </span>
          <span>
            Range {Math.min(...rows.map((r) => r.aqi))} – {peak} AQI
          </span>
        </p>
      )}
    </section>
  );
}
