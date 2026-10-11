"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { AqiStandard } from "./aqiScale";

/*
 * Which AQI standard the globe and city lists use. Remembered in this
 * browser, and shared between components so they never disagree.
 */

const KEY = "vayusaathi_aqi_standard";
const EVENT = "vayusaathi:aqi-standard";

// Used when storage is unavailable, so the choice still applies for this visit.
let memory: AqiStandard | null = null;

function read(): AqiStandard {
  if (memory) return memory;
  try {
    return localStorage.getItem(KEY) === "us" ? "us" : "india";
  } catch {
    return "india";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useAqiStandard(): [AqiStandard, (next: AqiStandard) => void] {
  const standard = useSyncExternalStore<AqiStandard>(subscribe, read, () => "india");
  const set = useCallback((next: AqiStandard) => {
    memory = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage unavailable: the in-memory choice above still applies.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [standard, set];
}
