"use client";

import { STATUS_CONFIG } from "@/lib/constants";
import { useRuleset } from "@/lib/catalog";

/** The ruleset the engine is applying right now (GET /rules). */
export default function RulesTable() {
  const query = useRuleset();
  const ruleset = query.data;

  if (!ruleset) {
    return (
      <p className="text-sm text-muted" aria-live="polite">
        {query.isError ? (
          <>
            Couldn&apos;t load the current rules.{" "}
            <button onClick={() => query.refetch()} className="underline font-medium">
              Try again
            </button>
          </>
        ) : (
          "Loading the rules in force…"
        )}
      </p>
    );
  }

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
        {ruleset.source === "dynamodb"
          ? "loaded live from the RulesConfig table in DynamoDB"
          : "the backend's built-in defaults (the RulesConfig table is empty or invalid)"}
      </p>
    </div>
  );
}
