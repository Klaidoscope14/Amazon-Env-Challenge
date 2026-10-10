"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TrendResponse } from "@/lib/types";
import { AQI_BANDS, STATUS_CONFIG, statusForAqi } from "@/lib/constants";
import DataBadge from "./DataBadge";
import Card from "./ui/Card";

interface TrendChartProps {
  trends: TrendResponse;
  selectedHours: number;
  onHoursChange: (hours: number) => void;
}

const PERIOD_OPTIONS = [
  { value: 6, label: "6h" },
  { value: 12, label: "12h" },
  { value: 24, label: "24h" },
  { value: 48, label: "48h" },
  { value: 168, label: "7d" },
];

const Y_STOPS = [100, 200, 300, 400, 500];

export default function TrendChart({
  trends,
  selectedHours,
  onHoursChange,
}: TrendChartProps) {
  const points = trends.points;
  const isDemo = trends.dataMode === "demo";

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-strong">AQI Trend</h2>
          {isDemo && <DataBadge mode="demo" />}
        </div>
        <div
          role="group"
          aria-label="Trend period"
          className="flex rounded-lg border border-border overflow-hidden"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onHoursChange(opt.value)}
              aria-pressed={selectedHours === opt.value}
              className={`inline-flex min-h-11 items-center px-3 text-xs font-medium transition-colors ${
                selectedHours === opt.value
                  ? "bg-blue-600 text-white"
                  : "text-muted hover:bg-surface-2"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isDemo && (
        <p className="text-xs text-purple-700 dark:text-purple-300 mb-3">
          Synthetic demo series shaped like a typical Delhi day — not measured data.
        </p>
      )}

      <ul className="flex flex-wrap gap-x-3 gap-y-1 mb-3 text-xs text-muted">
        {AQI_BANDS.map((band) => (
          <li key={band.status} className="flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: STATUS_CONFIG[band.status].hex }}
              aria-hidden="true"
            />
            {band.status}
          </li>
        ))}
      </ul>

      {points.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-muted">
            No readings stored for this period yet
          </p>
          <p className="text-xs text-muted mt-1 max-w-xs">
            Readings appear here as they are collected. Try a longer period.
          </p>
        </div>
      ) : (
        <>
          <ChartSVG points={points} hours={selectedHours} />
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>{points.length} readings</span>
            <span>
              Range: {Math.min(...points.map((p) => p.aqi))} &ndash;{" "}
              {Math.max(...points.map((p) => p.aqi))} AQI
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

/** Tracks an element's width so the SVG can draw at real pixel size. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function formatTick(ts: string, hours: number): string {
  const date = new Date(ts);
  return hours > 24
    ? date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric" })
    : date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function ChartSVG({
  points,
  hours,
}: {
  points: TrendResponse["points"];
  hours: number;
}) {
  const [containerRef, width] = useWidth<HTMLDivElement>(640);
  const gradientId = useId();

  const height = 220;
  const pad = { top: 8, right: 8, bottom: 26, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxAqi = Math.max(...points.map((p) => p.aqi));
  const yMax = Y_STOPS.find((stop) => stop >= maxAqi * 1.05) ?? Math.ceil(maxAqi / 100) * 100;
  const y = (aqi: number) => pad.top + plotH - (Math.min(aqi, yMax) / yMax) * plotH;
  const x = (i: number) =>
    pad.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);

  const coords = points.map((p, i) => ({ x: x(i), y: y(p.aqi), p }));
  const linePath = "M " + coords.map((c) => `${c.x} ${c.y}`).join(" L ");
  const areaPath =
    linePath +
    ` L ${coords[coords.length - 1].x} ${pad.top + plotH} L ${coords[0].x} ${pad.top + plotH} Z`;
  const latestColor = STATUS_CONFIG[statusForAqi(points[points.length - 1].aqi)].hex;

  // Faint CPCB band backgrounds, clipped to the visible range.
  const bands = AQI_BANDS.map((band, i) => ({
    status: band.status,
    from: i === 0 ? 0 : AQI_BANDS[i - 1].max,
    to: Math.min(band.max, yMax),
  })).filter((b) => b.from < yMax);

  const tickCount = Math.min(points.length, width < 420 ? 3 : 5);
  const tickIndices = Array.from({ length: tickCount }, (_, k) =>
    tickCount === 1 ? 0 : Math.round((k / (tickCount - 1)) * (points.length - 1))
  );

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${gradientId}-title`}
        aria-describedby={`${gradientId}-desc`}
      >
        <title id={`${gradientId}-title`}>
          {`AQI from ${first.aqi} to ${last.aqi} over the selected period; latest ${last.aqi} (${statusForAqi(last.aqi)}).`}
        </title>
        <desc id={`${gradientId}-desc`}>
          {`${points.length} readings. Lowest AQI ${Math.min(...points.map((p) => p.aqi))}, highest ${Math.max(
            ...points.map((p) => p.aqi)
          )}. Background bands show the CPCB categories.`}
        </desc>

        {bands.map((b) => (
          <rect
            key={b.status}
            x={pad.left}
            width={plotW}
            y={y(b.to)}
            height={y(b.from) - y(b.to)}
            fill={STATUS_CONFIG[b.status].hex}
            opacity={0.06}
          />
        ))}

        {[0, ...Y_STOPS.filter((s) => s <= yMax)].map((v) => (
          <g key={v}>
            <line
              x1={pad.left}
              x2={pad.left + plotW}
              y1={y(v)}
              y2={y(v)}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
            <text
              x={pad.left - 6}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="#6b7280"
            >
              {v}
            </text>
          </g>
        ))}

        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={latestColor} stopOpacity={0.25} />
            <stop offset="100%" stopColor={latestColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={latestColor}
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {points.length <= 80 &&
          coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={3}
              fill={STATUS_CONFIG[statusForAqi(c.p.aqi)].hex}
            >
              <title>{`AQI ${c.p.aqi} · ${formatTick(c.p.timestamp, 48)}`}</title>
            </circle>
          ))}

        {tickIndices.map((i, k) => (
          <text
            key={i}
            x={coords[i].x}
            y={height - 6}
            textAnchor={k === 0 ? "start" : k === tickIndices.length - 1 ? "end" : "middle"}
            fontSize={11}
            fill="#6b7280"
          >
            {formatTick(points[i].timestamp, hours)}
          </text>
        ))}
      </svg>
    </div>
  );
}
