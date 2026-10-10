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
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 6l3-3h10a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12z" />
        </svg>
        Explain in plain language
      </button>
    );
  }

  const result = query.data;
  const rejected = result?.fallbackReason?.startsWith("guardrail:");

  return (
    <section
      aria-label="Plain-language explanation"
      className="mt-3 rounded-lg border border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-indigo-800 dark:text-indigo-300">
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
              className={`text-xs px-2 py-0.5 rounded border ${
                lang === option.value
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-surface border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite">
        {query.isPending && <p className="text-sm text-indigo-900 dark:text-indigo-200">Preparing an explanation…</p>}
        {query.isError && (
          <p className="text-sm text-red-700 dark:text-red-400">
            Couldn&apos;t load an explanation.{" "}
            <button onClick={() => query.refetch()} className="underline font-medium">
              Try again
            </button>
          </p>
        )}
        {result && (
          <>
            <p className="text-sm text-indigo-950 dark:text-indigo-100" lang={result.lang}>
              {result.explanation}
            </p>
            <p className="text-xs text-indigo-800 dark:text-indigo-300 mt-2">
              {result.disclaimer}
              {rejected && " (An AI draft was discarded by the safety checks, so the standard wording is shown.)"}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
