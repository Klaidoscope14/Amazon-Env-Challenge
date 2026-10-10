"use client";

import { AQI_BANDS, STATUS_CONFIG } from "@/lib/constants";
import type { AQIStatus } from "@/lib/types";

interface AqiGaugeProps {
  aqi: number;
  status: AQIStatus;
}

const MAX = 500; // CPCB AQI scale tops out at 500.
const CX = 120;
const CY = 120;
const R = 96;
const TRACK = 16;

function polar(fraction: number): { x: number; y: number } {
  // fraction 0..1 maps left (180°) to right (0°) over the top of the dial.
  const angle = (180 - fraction * 180) * (Math.PI / 180);
  return { x: CX + R * Math.cos(angle), y: CY - R * Math.sin(angle) };
}

function arcPath(f0: number, f1: number): string {
  // Sample points along the parametric circle (polar is verified to stay on the
  // upper half), which avoids the ambiguity of SVG arc large-arc/sweep flags.
  const steps = Math.max(2, Math.round((f1 - f0) * 72));
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const p = polar(f0 + ((f1 - f0) * i) / steps);
    d += `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
  }
  return d.trim();
}

/** Cumulative band boundaries as fractions of the 0–500 scale. */
function bandFractions(): { from: number; to: number; status: AQIStatus }[] {
  let prev = 0;
  return AQI_BANDS.map((b) => {
    const top = b.max === Infinity ? MAX : b.max;
    const seg = { from: prev / MAX, to: Math.min(top, MAX) / MAX, status: b.status };
    prev = top;
    return seg;
  });
}

export default function AqiGauge({ aqi, status }: AqiGaugeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.Unavailable;
  const fraction = Math.max(0, Math.min(aqi / MAX, 1));
  const needle = polar(fraction);

  return (
    <div className="mx-auto w-full max-w-[280px]">
      <svg
        viewBox="0 0 240 132"
        className="w-full"
        role="img"
        aria-label={`Air Quality Index ${aqi}, ${status}, on the CPCB scale from 0 to 500.`}
      >
        {/* Neutral track under the coloured bands, so gaps read cleanly. */}
        <path d={arcPath(0, 1)} fill="none" stroke="var(--color-border)" strokeWidth={TRACK} strokeLinecap="round" />
        {bandFractions().map((b) => (
          <path
            key={b.status}
            d={arcPath(b.from, b.to)}
            fill="none"
            stroke={STATUS_CONFIG[b.status].hex}
            strokeWidth={TRACK}
            strokeLinecap="round"
          />
        ))}

        {/* Value marker riding on the arc. */}
        <circle cx={needle.x} cy={needle.y} r={7} fill={config.hex} stroke="var(--color-surface)" strokeWidth={3} />

        {/* Scale ends. */}
        <text x={CX - R} y={CY + 20} textAnchor="middle" fontSize={11} fill="var(--color-muted)">0</text>
        <text x={CX + R} y={CY + 20} textAnchor="middle" fontSize={11} fill="var(--color-muted)">500</text>
      </svg>

      {/* Crisp HTML number/status pulled up into the dial opening. */}
      <div className="-mt-14 flex flex-col items-center" aria-hidden="true">
        <span className={`text-5xl font-bold tabular-nums leading-none ${config.color}`}>{aqi}</span>
        <span className={`mt-1 text-lg font-semibold ${config.color}`}>{config.text}</span>
      </div>
    </div>
  );
}
