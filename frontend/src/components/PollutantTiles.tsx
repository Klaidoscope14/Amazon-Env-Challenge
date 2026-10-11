"use client";

import { bandForLimitRatio, formatPollutant } from "@/lib/constants";
import { useCatalog } from "@/lib/catalog";
import { bandFill, bandText } from "@/lib/bands";

interface PollutantTilesProps {
  pollutants: Record<string, number>;
  dominantPollutant: string;
}

// Fixed order so the grid is stable whatever order the API returns keys in.
const ORDER = ["pm25", "pm10", "o3", "no2", "so2", "co", "nh3"];

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** One tile per pollutant: the value, and where it sits against its safe limit (limits from the API). */
export default function PollutantTiles({ pollutants, dominantPollutant }: PollutantTilesProps) {
  const limits = useCatalog().data?.pollutantLimits ?? {};
  const keys = Object.keys(pollutants);
  const ordered = [...ORDER.filter((k) => keys.includes(k)), ...keys.filter((k) => !ORDER.includes(k))];

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {ordered.map((key) => {
        const value = pollutants[key];
        const { label, unit } = formatPollutant(key);
        const limit = limits[key.toLowerCase()];
        const ratio = limit ? value / limit.limit : null;
        const status = ratio === null ? "Unavailable" : bandForLimitRatio(ratio);
        const isDominant = key.toLowerCase() === dominantPollutant.toLowerCase();
        // Track covers 0–2× the limit, so the safe-limit tick sits at the middle.
        const fill = ratio === null ? 0 : Math.min(ratio / 2, 1) * 100;

        return (
          <li key={key} className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-muted-strong">
                <span className="h-2 w-2 rounded-full" style={{ background: bandFill(status) }} aria-hidden="true" />
                {label}
              </span>
              {isDominant && (
                <span className="rounded-full bg-accent-text/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-text">
                  Main
                </span>
              )}
            </div>

            <p className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-2xl font-semibold tabular-nums text-foreground">{round(value)}</span>
              <span className="text-xs text-muted">{unit}</span>
            </p>

            <div
              className="relative mt-3 h-2 rounded-full bg-surface-2"
              role="img"
              aria-label={
                ratio === null
                  ? `${label}: no safe limit on file`
                  : `${label}: ${Math.round(ratio * 100)}% of the ${limit?.averaging} safe limit`
              }
            >
              <span className="absolute -bottom-1 -top-1 left-1/2 w-px bg-muted-strong/60" aria-hidden="true" />
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${fill}%`, background: bandFill(status), minWidth: fill > 0 ? 6 : 0 }}
              />
            </div>

            <p className="mt-2 text-xs" style={{ color: bandText(status) }}>
              {ratio === null ? "No limit on file" : `${Math.round(ratio * 100)}% of ${limit?.averaging} limit`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
