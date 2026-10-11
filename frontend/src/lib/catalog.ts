"use client";

import { useQuery } from "@tanstack/react-query";
import { getCatalog, getRules } from "./api";
import type { AQIStatus, Ruleset } from "./types";

/*
 * Reference data the backend owns: the AQI bands in force (RulesConfig) and
 * the choices it accepts (audiences, plan activities, demo scenarios). Fetched
 * once and shared across pages, so the frontend never keeps its own copies.
 */

const LONG = 30 * 60 * 1000;

export function useRuleset() {
  return useQuery({ queryKey: ["rules"], queryFn: getRules, staleTime: LONG, retry: 1 });
}

export function useCatalog() {
  return useQuery({ queryKey: ["catalog"], queryFn: getCatalog, staleTime: LONG, retry: 1 });
}

export interface Band {
  status: AQIStatus;
  /** Lower edge of the band on the AQI scale. */
  from: number;
  /** Upper edge (the band's maxAqi). */
  to: number;
}

export function bandsOf(ruleset: Ruleset | undefined): Band[] {
  return (ruleset?.thresholds ?? []).map((t, i, all) => ({
    status: t.status,
    from: i === 0 ? 0 : all[i - 1].maxAqi,
    to: t.maxAqi,
  }));
}

/** The active bands; empty until the ruleset has loaded. */
export function useBands(): Band[] {
  return bandsOf(useRuleset().data);
}

/** Display label for an audience value (including values on older alerts). */
export function useAudienceLabel(): (value: string) => string {
  const labels = useCatalog().data?.audienceLabels;
  return (value) => labels?.[value] ?? value;
}
