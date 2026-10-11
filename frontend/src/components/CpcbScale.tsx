"use client";

import { STATUS_CONFIG } from "@/lib/constants";
import { useBands } from "@/lib/catalog";

/** Horizontal CPCB band strip with a caret marking the current AQI (bands from the active ruleset). */
export default function CpcbScale({ aqi }: { aqi: number }) {
  const bands = useBands();
  const max = bands.at(-1)?.to;
  if (!max) return <div className="h-2 rounded-full bg-surface-2" aria-hidden="true" />;

  const markerPct = Math.max(0, Math.min(aqi / max, 1)) * 100;
  // Tick labels at band edges, skipping the first (too close to 0 to read).
  const ticks = [0, ...bands.slice(1).map((b) => b.to)];

  return (
    <div aria-hidden="true">
      <div className="relative">
        {/* Caret marker above the strip. */}
        <div
          className="absolute -top-1.5 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent"
          style={{ left: `${markerPct}%`, borderTopColor: "var(--color-foreground)" }}
        />
        <div className="flex h-2 overflow-hidden rounded-full">
          {bands.map((b) => (
            <div
              key={b.status}
              style={{ width: `${((b.to - b.from) / max) * 100}%`, backgroundColor: STATUS_CONFIG[b.status].hex }}
            />
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted tabular-nums">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}
