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

/** The AQI over time as a histogram: one bar per reading, coloured by its CPCB band. */
export default function TrendHistogram({ trends, selectedHours, onHoursChange }: TrendHistogramProps) {
  const bands = useBands();
  const [hover, setHover] = useState<number | null>(null);
  const points = trends.points;

  const rows = points.map((p) => ({
    ...p,
    band: (p.status ?? statusIn(bands, p.aqi) ?? "Unavailable") as AQIStatus,
  }));

  const peak = rows.length ? Math.max(...rows.map((r) => r.aqi)) : 0;
  const yMax = Math.max(100, Math.ceil((peak * 1.08) / 25) * 25);
  const gridlines = [0, ...bands.map((b) => b.to).filter((v) => v < yMax)];

  const active = hover !== null && rows[hover] ? hover : rows.length - 1;
  const shown = rows[active];
  const tickCount = Math.min(5, rows.length);
  const ticks = Array.from({ length: tickCount }, (_, k) =>
    tickCount === 1 ? 0 : Math.round((k / (tickCount - 1)) * (rows.length - 1))
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
              {active === rows.length - 1 ? " (latest)" : ""}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">No readings stored for this period yet.</p>
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
          <p className="text-sm text-muted">The chart fills in as readings are collected.</p>
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

            <div className="absolute inset-0 flex items-end gap-[3px]">
              {rows.map((r, i) => {
                const isNow = i === rows.length - 1;
                const h = Math.max(2, (r.aqi / yMax) * 100);
                const dim = hover !== null && hover !== i;
                return (
                  <div
                    key={r.timestamp}
                    className="relative flex h-full min-w-[3px] flex-1 items-end"
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
                className="absolute whitespace-nowrap"
                style={{
                  left: `${(i / Math.max(1, rows.length - 1)) * 100}%`,
                  transform: k === 0 ? "none" : k === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {k === ticks.length - 1 ? "Now" : formatTime(rows[i].timestamp, selectedHours)}
              </span>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <p className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-muted">
          <span>{rows.length} readings</span>
          <span>
            Range {Math.min(...rows.map((r) => r.aqi))} – {peak} AQI
          </span>
        </p>
      )}
    </section>
  );
}
