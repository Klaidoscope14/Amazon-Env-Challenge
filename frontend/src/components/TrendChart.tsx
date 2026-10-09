"use client";

import type { TrendResponse } from "@/lib/types";

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

const ZONE_COLORS = [
  { max: 50, color: "#22c55e", label: "Good" },
  { max: 100, color: "#84cc16", label: "Satisfactory" },
  { max: 200, color: "#eab308", label: "Moderate" },
  { max: 300, color: "#f97316", label: "Poor" },
  { max: 400, color: "#ef4444", label: "Very Poor" },
  { max: 500, color: "#7f1d1d", label: "Severe" },
];

function getColor(aqi: number): string {
  for (const zone of ZONE_COLORS) {
    if (aqi <= zone.max) return zone.color;
  }
  return ZONE_COLORS[ZONE_COLORS.length - 1].color;
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function TrendChart({
  trends,
  selectedHours,
  onHoursChange,
}: TrendChartProps) {
  const points = trends.points;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-500">AQI Trend</h3>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 mr-3 text-xs text-gray-400">
            {ZONE_COLORS.slice(0, 4).map((z) => (
              <span key={z.label} className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: z.color }}
                />
                {z.label}
              </span>
            ))}
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onHoursChange(opt.value)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedHours === opt.value
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <svg
            className="w-12 h-12 text-gray-200 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-400">
            No trend data yet
          </p>
          <p className="text-xs text-gray-300 mt-1 max-w-xs">
            The system fetches AQI readings every 15 minutes. Trend data will
            appear here as readings accumulate.
          </p>
        </div>
      ) : (
        <>
          <ChartSVG points={points} />
          <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
            <span>{points.length} readings</span>
            <span>
              Range: {Math.min(...points.map((p) => p.aqi))} &ndash;{" "}
              {Math.max(...points.map((p) => p.aqi))} AQI
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function ChartSVG({
  points,
}: {
  points: TrendResponse["points"];
}) {
  const maxAqi = Math.max(...points.map((p) => p.aqi), 50);
  const chartHeight = 160;
  const chartWidth = 100;
  const yMax = Math.ceil(maxAqi / 50) * 50;

  const pathPoints = points.map((p, i) => {
    const x =
      points.length === 1 ? 50 : (i / (points.length - 1)) * chartWidth;
    const y = chartHeight - (p.aqi / yMax) * chartHeight;
    return { x, y, aqi: p.aqi, time: p.timestamp };
  });

  const linePath =
    "M " + pathPoints.map((p) => `${p.x} ${p.y}`).join(" L ");

  const areaPath =
    linePath +
    ` L ${pathPoints[pathPoints.length - 1].x} ${chartHeight} L ${pathPoints[0].x} ${chartHeight} Z`;

  const latestColor = getColor(points[points.length - 1].aqi);

  const yTicks = [];
  const yStep = Math.max(50, Math.floor(yMax / 4 / 50) * 50);
  for (let v = 0; v <= yMax; v += yStep) {
    yTicks.push(v);
  }

  const labelIndices: number[] = [];
  if (points.length <= 6) {
    labelIndices.push(...points.map((_, i) => i));
  } else {
    const step = Math.floor(points.length / 5);
    for (let i = 0; i < points.length; i += step) labelIndices.push(i);
    if (!labelIndices.includes(points.length - 1))
      labelIndices.push(points.length - 1);
  }

  return (
    <svg
      viewBox={`-30 -10 ${chartWidth + 40} ${chartHeight + 30}`}
      className="w-full"
      preserveAspectRatio="none"
      style={{ height: 200 }}
    >
      {yTicks.map((v) => {
        const y = chartHeight - (v / yMax) * chartHeight;
        return (
          <g key={v}>
            <line
              x1={0}
              y1={y}
              x2={chartWidth}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth={0.3}
            />
            <text
              x={-4}
              y={y + 1}
              textAnchor="end"
              fontSize={3}
              fill="#9ca3af"
            >
              {v}
            </text>
          </g>
        );
      })}

      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={latestColor} stopOpacity={0.3} />
          <stop offset="100%" stopColor={latestColor} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      <path d={areaPath} fill="url(#trendFill)" />
      <path
        d={linePath}
        fill="none"
        stroke={latestColor}
        strokeWidth={0.8}
        strokeLinejoin="round"
      />

      {pathPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={points.length < 20 ? 1 : 0.5}
          fill={getColor(p.aqi)}
        />
      ))}

      {labelIndices.map((i) => (
        <text
          key={i}
          x={pathPoints[i].x}
          y={chartHeight + 8}
          textAnchor="middle"
          fontSize={2.5}
          fill="#9ca3af"
        >
          {formatTime(points[i].timestamp)}
        </text>
      ))}
    </svg>
  );
}
