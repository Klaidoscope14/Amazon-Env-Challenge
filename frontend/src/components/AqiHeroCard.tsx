"use client";

import type { AQIReadingResponse } from "@/lib/types";
import { STATUS_CONFIG, formatPollutant } from "@/lib/constants";
import { describeAge, useNow } from "@/lib/useNow";
import DataBadge from "./DataBadge";
import Card from "./ui/Card";
import Chip from "./ui/Chip";

interface AqiHeroCardProps {
  reading: AQIReadingResponse;
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return ts;
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AqiHeroCard({ reading }: AqiHeroCardProps) {
  const now = useNow();
  // Status comes from the backend rules engine — the same one that produces
  // the recommendation — so the two cards can never disagree.
  const config = STATUS_CONFIG[reading.status] ?? STATUS_CONFIG.Unavailable;
  const age = describeAge(reading.timestamp, now);
  const isStale = reading.dataMode !== "demo" && age.isStale;
  const isSubIndex = reading.pollutantScale === "subindex";

  return (
    <Card className="p-6">
      {isStale && (
        <div
          role="status"
          className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
        >
          This reading is {age.label === "Unknown time" ? "of unknown age" : `from ${age.label.toLowerCase()}`}
          {" "}(older than 2 hours). Check{" "}
          <a
            href="https://cpcb.nic.in"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium"
          >
            CPCB
          </a>{" "}
          for the latest data.
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted mb-1" id="aqi-value-label">
            Air Quality Index
          </p>
          <div
            className="flex items-baseline gap-3 flex-wrap"
            aria-live="polite"
            aria-atomic="true"
            aria-labelledby="aqi-value-label"
          >
            <span className={`text-6xl font-bold tabular-nums ${config.color}`}>
              {reading.aqi}
            </span>
            <span className={`text-2xl font-semibold ${config.color}`}>
              {config.text}
            </span>
          </div>
        </div>
        <DataBadge mode={isStale ? "stale" : reading.dataMode} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted">Dominant Pollutant</dt>
          <dd className="font-medium mt-0.5 text-foreground">
            {formatPollutant(reading.dominantPollutant).label}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{reading.source === "CPCB" ? "Station" : "Location"}</dt>
          <dd className="font-medium mt-0.5 text-foreground">{reading.stationName}</dd>
        </div>
        <div>
          <dt className="text-muted">Source</dt>
          <dd className="font-medium mt-0.5 text-foreground">{reading.source}</dd>
        </div>
        <div>
          <dt className="text-muted">Last Updated</dt>
          <dd className="font-medium mt-0.5 text-foreground">
            {age.label}
            <span className="text-muted ml-1 text-xs font-normal">
              ({formatTimestamp(reading.timestamp)})
            </span>
          </dd>
        </div>
      </dl>

      {reading.pollutants && Object.keys(reading.pollutants).length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted mb-2">
            {isSubIndex
              ? "Pollutant sub-indices (CPCB scale — the AQI is the highest)"
              : "Pollutant Levels"}
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(reading.pollutants).map(([key, value]) => {
              const p = formatPollutant(key);
              return (
                <Chip key={key}>
                  <span className="text-muted mr-1">{p.label}:</span>
                  <span className="font-medium">{value}</span>
                  {p.unit && !isSubIndex && <span className="text-muted ml-0.5">{p.unit}</span>}
                </Chip>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
