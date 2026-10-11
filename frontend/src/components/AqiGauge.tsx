"use client";

import { STATUS_CONFIG } from "@/lib/constants";
import { useBands, type Band } from "@/lib/catalog";
import type { AQIStatus } from "@/lib/types";

interface AqiGaugeProps {
  aqi: number;
  status: AQIStatus;
}

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

/** Band boundaries as fractions of the scale (0 to the top band's maxAqi). */
function bandFractions(bands: Band[], max: number): { from: number; to: number; status: AQIStatus }[] {
  return bands.map((b) => ({ from: b.from / max, to: b.to / max, status: b.status }));
}

export default function AqiGauge({ aqi, status }: AqiGaugeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.Unavailable;
  // Bands come from the active ruleset; until it loads, only the neutral track shows.
  const bands = useBands();
  const max = bands.at(-1)?.to;
  const needle = max ? polar(Math.max(0, Math.min(aqi / max, 1))) : null;

  return (
    <div className="mx-auto w-full max-w-[280px]">
      <svg
        viewBox="0 0 240 132"
        className="w-full"
        role="img"
        aria-label={`Air Quality Index ${aqi}, ${status}${max ? `, on India's scale from 0 to ${max}` : ""}.`}
      >
        {/* Neutral track under the coloured bands, so gaps read cleanly. */}
        <path d={arcPath(0, 1)} fill="none" stroke="var(--color-border)" strokeWidth={TRACK} strokeLinecap="round" />
        {max && bandFractions(bands, max).map((b) => (
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
        {needle && (
          <circle cx={needle.x} cy={needle.y} r={7} fill={config.hex} stroke="var(--color-surface)" strokeWidth={3} />
        )}

        {/* Scale ends. */}
        {max && (
          <>
            <text x={CX - R} y={CY + 20} textAnchor="middle" fontSize={11} fill="var(--color-muted)">0</text>
            <text x={CX + R} y={CY + 20} textAnchor="middle" fontSize={11} fill="var(--color-muted)">{max}</text>
          </>
        )}
      </svg>

      {/* Crisp HTML number/status pulled up into the dial opening. */}
      <div className="-mt-14 flex flex-col items-center" aria-hidden="true">
        <span className={`text-5xl font-bold tabular-nums leading-none ${config.color}`}>{aqi}</span>
        <span className={`mt-1 text-lg font-semibold ${config.color}`}>{config.text}</span>
      </div>
    </div>
  );
}
