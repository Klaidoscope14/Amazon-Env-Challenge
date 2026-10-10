"use client";

import { AQI_BANDS, STATUS_CONFIG } from "@/lib/constants";

const MAX = 500;

/** Band segments as % widths of the 0–500 strip (computed once, outside render). */
const SEGMENTS = AQI_BANDS.map((b, i) => {
  const prev = i === 0 ? 0 : AQI_BANDS[i - 1].max;
  const top = b.max === Infinity ? MAX : b.max;
  return { status: b.status, widthPct: ((top - prev) / MAX) * 100 };
});

/** Horizontal CPCB band strip (0–500) with a caret marking the current AQI. */
export default function CpcbScale({ aqi }: { aqi: number }) {
  const markerPct = Math.max(0, Math.min(aqi / MAX, 1)) * 100;

  return (
    <div aria-hidden="true">
      <div className="relative">
        {/* Caret marker above the strip. */}
        <div
          className="absolute -top-1.5 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent"
          style={{ left: `${markerPct}%`, borderTopColor: "var(--color-foreground)" }}
        />
        <div className="flex h-2 overflow-hidden rounded-full">
          {SEGMENTS.map((s) => (
            <div key={s.status} style={{ width: `${s.widthPct}%`, backgroundColor: STATUS_CONFIG[s.status].hex }} />
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted tabular-nums">
        <span>0</span>
        <span>100</span>
        <span>200</span>
        <span>300</span>
        <span>400</span>
        <span>500</span>
      </div>
    </div>
  );
}
