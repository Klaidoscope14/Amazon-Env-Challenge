"use client";

import type { AQIReadingResponse } from "@/lib/types";
import { formatPollutant } from "@/lib/constants";
import { describeAge, useNow } from "@/lib/useNow";
import { useBands } from "@/lib/catalog";
import { bandFill, bandInk, bandText } from "@/lib/bands";
import DataBadge from "./DataBadge";

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return ts;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** "Main Statistics": the big number, its band, the facts behind it, and where it sits on India's AQI scale. */
export default function AqiStatsCard({ reading }: { reading: AQIReadingResponse }) {
  const now = useNow();
  const bands = useBands();
  const age = describeAge(reading.timestamp, now);
  const max = bands.at(-1)?.to;
  const markerPct = max ? Math.max(0, Math.min(reading.aqi / max, 1)) * 100 : null;

  return (
    <section aria-label="Main statistics" className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">Main Statistics</h2>
        <DataBadge mode={reading.dataMode} />
      </div>

      <div className="mt-4 flex items-end gap-4">
        <div>
          <p className="text-sm text-muted">AQI</p>
          <p
            className="font-display text-7xl font-bold leading-none tabular-nums sm:text-[5.5rem]"
            style={{ color: bandText(reading.status) }}
            aria-live="polite"
            aria-atomic="true"
          >
            {reading.aqi}
          </p>
        </div>
        <span
          className="mb-2 rounded-full px-3 py-1 text-sm font-semibold"
          style={{ background: bandFill(reading.status), color: bandInk(reading.status) }}
        >
          {reading.status}
        </span>
      </div>

      {/* India's AQI scale with a marker at the current value. */}
      <div className="mt-5" aria-hidden="true">
        {max ? (
          <>
            <div className="relative pt-2">
              <div
                className="absolute top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent"
                style={{ left: `${markerPct}%`, borderTopColor: "var(--foreground)" }}
              />
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                {bands.map((b) => (
                  <div
                    key={b.status}
                    style={{ width: `${((b.to - b.from) / max) * 100}%`, background: bandFill(b.status) }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted">
              <span>0</span>
              {bands.slice(0, -1).map((b) => (
                <span key={b.status}>{b.to}</span>
              ))}
              <span>{max}</span>
            </div>
          </>
        ) : (
          <div className="h-2.5 rounded-full bg-surface-2" />
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Fact label="Dominant pollutant" value={formatPollutant(reading.dominantPollutant).label} />
        <Fact label="Location" value={reading.stationName} />
        <Fact
          label="Last updated"
          value={`${age.label} · ${formatTimestamp(reading.timestamp)}`}
          className="col-span-2"
        />
      </dl>
    </section>
  );
}

function Fact({ label, value, hint, className = "" }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={`rounded-2xl bg-surface-2/70 px-3.5 py-3 ${className}`}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-semibold text-foreground" title={hint ?? value}>
        {value}
      </dd>
    </div>
  );
}
