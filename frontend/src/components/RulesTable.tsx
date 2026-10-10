"use client";

import { useQuery } from "@tanstack/react-query";
import { getRules } from "@/lib/api";
import { STATUS_CONFIG } from "@/lib/constants";
import type { Ruleset } from "@/lib/types";

// The backend's built-in ruleset (backend/shared/src/aqi-categories.ts),
// shown until the live ruleset loads or if it can't be fetched.
const BUILT_IN: Ruleset = {
  id: "cpcb-india-v1",
  source: "built-in",
  thresholds: [
    { minAqi: 0, maxAqi: 50, status: "Good", statusLevel: 1, color: "#00B050", action: "No action needed. Enjoy outdoor activities as usual." },
    { minAqi: 51, maxAqi: 100, status: "Satisfactory", statusLevel: 2, color: "#92D050", action: "Air quality is acceptable. People who are unusually sensitive should consider limiting prolonged outdoor exertion." },
    { minAqi: 101, maxAqi: 200, status: "Moderate", statusLevel: 3, color: "#FFFF00", action: "Children, older adults and people with breathing difficulties should limit prolonged outdoor exertion. Consider moving long outdoor plans indoors." },
    { minAqi: 201, maxAqi: 300, status: "Poor", statusLevel: 4, color: "#FF9900", action: "Avoid prolonged outdoor activity. Keep windows closed at peak hours and let your family and neighbours know." },
    { minAqi: 301, maxAqi: 400, status: "Very Poor", statusLevel: 5, color: "#FF0000", action: "Avoid outdoor activities and stay indoors where possible. Warn your family, especially children, older adults and anyone with breathing conditions." },
    { minAqi: 401, maxAqi: 500, status: "Severe", statusLevel: 6, color: "#800000", action: "Stay indoors and avoid all outdoor exertion. Follow official advisories and check on vulnerable family members and neighbours." },
  ],
};

/** The ruleset the engine is applying right now (GET /rules). */
export default function RulesTable() {
  const query = useQuery({ queryKey: ["rules"], queryFn: getRules, staleTime: 5 * 60 * 1000, retry: 1 });
  const ruleset = query.data ?? BUILT_IN;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="text-left py-2 px-3 text-muted font-medium">AQI range</th>
              <th scope="col" className="text-left py-2 px-3 text-muted font-medium">Category</th>
              <th scope="col" className="text-left py-2 px-3 text-muted font-medium">Recommended action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ruleset.thresholds.map((rule) => (
              <tr key={rule.status}>
                <td className="py-2 px-3 tabular-nums whitespace-nowrap">
                  {rule.minAqi}–{rule.statusLevel === ruleset.thresholds.length ? `${rule.maxAqi}+` : rule.maxAqi}
                </td>
                <td className="py-2 px-3">
                  <span className={`font-medium ${STATUS_CONFIG[rule.status].color}`}>{rule.status}</span>
                </td>
                <td className="py-2 px-3 text-foreground">{rule.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted" aria-live="polite">
        Ruleset <code>{ruleset.id}</code> ·{" "}
        {query.isPending
          ? "loading the live ruleset…"
          : query.data?.source === "dynamodb"
            ? "loaded live from the RulesConfig table in DynamoDB"
            : query.data
              ? "built-in defaults (the RulesConfig table is empty or invalid)"
              : "built-in defaults (live ruleset unavailable)"}
      </p>
    </div>
  );
}
