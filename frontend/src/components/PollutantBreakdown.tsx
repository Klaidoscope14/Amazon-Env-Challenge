"use client";

import {
  STATUS_CONFIG,
  bandForLimitRatio,
  formatPollutant,
  pollutantLimit,
} from "@/lib/constants";

interface PollutantBreakdownProps {
  pollutants: Record<string, number>;
  dominantPollutant: string;
}

// Fixed display order so the layout is stable regardless of the data's key order.
const ORDER = ["pm25", "pm10", "o3", "no2", "so2", "co", "nh3"];

interface Row {
  key: string;
  label: string;
  fillPct: number;
  hex: string;
  statusText: string;
  valueText: string;
  subText: string;
  isDominant: boolean;
}

export default function PollutantBreakdown({
  pollutants,
  dominantPollutant,
}: PollutantBreakdownProps) {
  const keys = Object.keys(pollutants);
  const ordered = [
    ...ORDER.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !ORDER.includes(k)),
  ];

  const rows: Row[] = ordered.map((key) => {
    const value = pollutants[key];
    const { label, unit } = formatPollutant(key);
    const isDominant = key.toLowerCase() === dominantPollutant.toLowerCase();

    const limitInfo = pollutantLimit(key);
    if (!limitInfo) {
      return {
        key,
        label,
        fillPct: 0,
        hex: STATUS_CONFIG.Unavailable.hex,
        statusText: "Unavailable",
        valueText: `${value} ${unit}`,
        subText: "no CPCB limit",
        isDominant,
      };
    }
    const ratio = value / limitInfo.limit;
    const status = bandForLimitRatio(ratio);
    // Track represents 0–2× the limit, so the dashed limit marker sits at 50%.
    return {
      key,
      label,
      fillPct: Math.min(ratio / 2, 1) * 100,
      hex: STATUS_CONFIG[status].hex,
      statusText: status,
      valueText: `${value} ${unit}`,
      subText: `${Math.round(ratio * 100)}% of ${limitInfo.averaging} limit`,
      isDominant,
    };
  });

  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3">
            <span className="flex items-center gap-1 text-sm font-medium text-foreground">
              {r.label}
            </span>
            <div
              className="relative h-2.5 rounded-full bg-surface-2"
              title={`${r.label}: ${r.valueText} — ${r.statusText}`}
            >
              {(
                // CPCB safe-limit marker at 50% of the track (= 1× limit).
                <span
                  className="absolute -top-1 -bottom-1 w-px bg-muted-strong/70"
                  style={{ left: "50%" }}
                  aria-hidden="true"
                />
              )}
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width]"
                style={{ width: `${r.fillPct}%`, backgroundColor: r.hex, minWidth: r.fillPct > 0 ? 6 : 0 }}
              />
            </div>
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold tabular-nums text-foreground">
                {r.valueText}
                {r.isDominant && (
                  <span className="ml-1.5 align-middle rounded bg-surface-2 px-1 py-0.5 text-[10px] font-medium text-muted">
                    dominant
                  </span>
                )}
              </div>
              <div className="text-xs text-muted">{r.subText}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">
        Bars are relative to the CPCB safe limit (dashed line). Colour shows severity.
      </p>
    </div>
  );
}
