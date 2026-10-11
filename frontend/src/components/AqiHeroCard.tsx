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
  const status = STATUS_CONFIG[reading.status] ? reading.status : "Unavailable";

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-muted">Air Quality Index</h2>
        <DataBadge mode={reading.dataMode} />
      </div>

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
          <dt className="text-xs text-muted">Location</dt>
          <dd className="font-medium mt-0.5 text-foreground truncate" title={reading.stationName}>
            {reading.stationName}
          </dd>
        </div>
        <div className="col-span-2">
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
