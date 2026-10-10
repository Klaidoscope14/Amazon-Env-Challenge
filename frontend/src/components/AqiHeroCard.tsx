"use client";

import type { AQIReadingResponse } from "@/lib/types";
import { STATUS_CONFIG, formatPollutant } from "@/lib/constants";
import { describeAge, useNow } from "@/lib/useNow";
import DataBadge from "./DataBadge";
import Card from "./ui/Card";
import AqiGauge from "./AqiGauge";
import CpcbScale from "./CpcbScale";

interface AqiHeroCardProps {
  reading: AQIReadingResponse;
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return ts;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function AqiHeroCard({ reading }: AqiHeroCardProps) {
  const now = useNow();
  // Status comes from the backend rules engine — the same one that produces
  // the recommendation — so the two cards can never disagree.
  const age = describeAge(reading.timestamp, now);
  const isStale = reading.dataMode !== "demo" && age.isStale;
  const status = STATUS_CONFIG[reading.status] ? reading.status : "Unavailable";

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-muted">Air Quality Index</h2>
        <DataBadge mode={isStale ? "stale" : reading.dataMode} />
      </div>

      {isStale && (
        <div
          role="status"
          className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
        >
          This reading is {age.label === "Unknown time" ? "of unknown age" : `from ${age.label.toLowerCase()}`}
          {" "}(older than 2 hours). Check{" "}
          <a href="https://cpcb.nic.in" target="_blank" rel="noopener noreferrer" className="underline font-medium">
            CPCB
          </a>{" "}
          for the latest data.
        </div>
      )}

      <div className="mt-2">
        <AqiGauge aqi={reading.aqi} status={status} />
      </div>

      {/* Screen-reader announcement of the auto-refreshing value (the gauge is decorative to AT). */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Air Quality Index {reading.aqi}, {status}.
      </p>

      <div className="mt-4">
        <CpcbScale aqi={reading.aqi} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm border-t border-border pt-4">
        <div>
          <dt className="text-xs text-muted">Dominant pollutant</dt>
          <dd className="font-medium mt-0.5 text-foreground">
            {formatPollutant(reading.dominantPollutant).label}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{reading.source === "CPCB" ? "Station" : "Location"}</dt>
          <dd className="font-medium mt-0.5 text-foreground truncate" title={reading.stationName}>
            {reading.stationName}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Source</dt>
          <dd className="font-medium mt-0.5 text-foreground">{reading.source}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Last updated</dt>
          <dd className="font-medium mt-0.5 text-foreground">
            {age.label}
            <span className="block text-xs font-normal text-muted">{formatTimestamp(reading.timestamp)}</span>
          </dd>
        </div>
      </dl>
    </Card>
  );
}
