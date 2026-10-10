"use client";

import type { AQIReadingResponse } from "@/lib/types";
import { STATUS_CONFIG, formatPollutant } from "@/lib/constants";
import { describeAge, useNow } from "@/lib/useNow";
import DataBadge from "./DataBadge";

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

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {isStale && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800"
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
          <p className="text-sm text-gray-500 mb-1">Air Quality Index</p>
          <div className="flex items-baseline gap-3 flex-wrap">
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
          <dt className="text-gray-500">Dominant Pollutant</dt>
          <dd className="font-medium mt-0.5 text-gray-900">
            {formatPollutant(reading.dominantPollutant).label}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Station</dt>
          <dd className="font-medium mt-0.5 text-gray-900">{reading.stationName}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Source</dt>
          <dd className="font-medium mt-0.5 text-gray-900">{reading.source}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Last Updated</dt>
          <dd className="font-medium mt-0.5 text-gray-900">
            {age.label}
            <span className="text-gray-500 ml-1 text-xs font-normal">
              ({formatTimestamp(reading.timestamp)})
            </span>
          </dd>
        </div>
      </dl>

      {reading.pollutants && Object.keys(reading.pollutants).length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">Pollutant Levels</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(reading.pollutants).map(([key, value]) => {
              const p = formatPollutant(key);
              return (
                <span
                  key={key}
                  className="inline-flex items-center bg-gray-50 rounded px-2 py-1 text-xs text-gray-900"
                >
                  <span className="text-gray-600 mr-1">{p.label}:</span>
                  <span className="font-medium">{value}</span>
                  {p.unit && <span className="text-gray-500 ml-0.5">{p.unit}</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
