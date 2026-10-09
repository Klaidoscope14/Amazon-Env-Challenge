"use client";

import type { AQIReading } from "@/lib/types";
import DataBadge from "./DataBadge";

interface AqiHeroCardProps {
  reading: AQIReading;
}

const AQI_COLORS: Record<string, string> = {
  Good: "text-green-600",
  Satisfactory: "text-lime-600",
  Moderate: "text-yellow-600",
  Poor: "text-orange-600",
  "Very Poor": "text-red-600",
  Severe: "text-red-800",
};

function getStatus(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Satisfactory";
  if (aqi <= 200) return "Moderate";
  if (aqi <= 300) return "Poor";
  if (aqi <= 400) return "Very Poor";
  return "Severe";
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return ts;
  }
}

function getTimeDiff(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export default function AqiHeroCard({ reading }: AqiHeroCardProps) {
  const status = getStatus(reading.aqi);
  const aqiColor = AQI_COLORS[status] || "text-gray-600";
  const isStale =
    Date.now() - new Date(reading.timestamp).getTime() > 2 * 60 * 60 * 1000;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {isStale && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          This reading is over 2 hours old. Check{" "}
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

      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">Air Quality Index</p>
          <div className="flex items-baseline gap-3">
            <span className={`text-6xl font-bold tabular-nums ${aqiColor}`}>
              {reading.aqi}
            </span>
            <span
              className={`text-2xl font-semibold ${aqiColor}`}
            >
              {status}
            </span>
          </div>
        </div>
        <DataBadge mode={reading.dataMode} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Dominant Pollutant</span>
          <p className="font-medium mt-0.5">{reading.dominantPollutant}</p>
        </div>
        <div>
          <span className="text-gray-500">Station</span>
          <p className="font-medium mt-0.5">{reading.stationName}</p>
        </div>
        <div>
          <span className="text-gray-500">Source</span>
          <p className="font-medium mt-0.5">{reading.source}</p>
        </div>
        <div>
          <span className="text-gray-500">Last Updated</span>
          <p className="font-medium mt-0.5">
            {getTimeDiff(reading.timestamp)}
            <span className="text-gray-400 ml-1 text-xs">
              ({formatTimestamp(reading.timestamp)})
            </span>
          </p>
        </div>
      </div>

      {reading.pollutants && Object.keys(reading.pollutants).length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">Pollutant Levels</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(reading.pollutants).map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center bg-gray-50 rounded px-2 py-1 text-xs"
              >
                <span className="text-gray-500 mr-1">
                  {key.toUpperCase()}:
                </span>
                <span className="font-medium">{value}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
