"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getExplanation } from "@/lib/api";

type Lang = "en" | "hi";

const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिंदी" },
];

/**
 * "Explain in plain language": fetched on demand. The backend builds the
 * evidence itself, an AI rewording is only shown if it passes the output
 * guardrails, and otherwise the fixed explanation is shown.
 */
export default function ExplainPanel({ areaId, scenario }: { areaId: string; scenario?: string }) {
  const [lang, setLang] = useState<Lang | null>(null);

  const query = useQuery({
    queryKey: ["explain", areaId, lang, scenario],
    queryFn: () => getExplanation(areaId, lang!, scenario),
    enabled: lang !== null,
    staleTime: 10 * 60 * 1000,
  });

  if (lang === null) {
    return (
      <button
        onClick={() => setLang("en")}
        className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-text underline-offset-2 hover:underline"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 6l3-3h10a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12z" />
        </svg>
        Explain in plain language
      </button>
    );
  }

  const result = query.data;
  const rejected = result?.fallbackReason?.startsWith("guardrail:");

  return (
    <section aria-label="Plain-language explanation" className="mt-4 rounded-xl border border-border bg-surface-2/70 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-strong">
          {result?.generatedBy === "ai"
            ? "AI-generated · checked against the reading"
            : result
              ? "Standard explanation"
              : "Plain-language explanation"}
        </span>
        <div role="group" aria-label="Explanation language" className="flex gap-1">
          {LANGS.map((option) => (
            <button
              key={option.value}
              onClick={() => setLang(option.value)}
              aria-pressed={lang === option.value}
              className={`min-h-8 rounded-md border px-2.5 text-xs ${
                lang === option.value
                  ? "border-accent bg-accent font-semibold text-accent-fg"
                  : "border-border-strong bg-surface text-muted-strong hover:bg-surface-2"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite">
        {query.isPending && <p className="text-sm text-foreground">Preparing an explanation…</p>}
        {query.isError && (
          <p className="text-sm text-red-700 dark:text-red-300">
            Couldn&apos;t load an explanation.{" "}
            <button onClick={() => query.refetch()} className="font-medium underline">
              Try again
            </button>
          </p>
        )}
        {result && (
          <>
            <p className="text-sm text-foreground" lang={result.lang}>
              {result.explanation}
            </p>
            <p className="mt-2 text-xs text-muted">
              {result.disclaimer}
              {rejected && " (An AI draft was discarded by the safety checks, so the standard wording is shown.)"}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
