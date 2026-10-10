"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ApiError, getNearestArea } from "./api";
import type { AreaInfo } from "./types";

/*
 * The area (nearest CPCB monitoring station) every page is scoped to.
 * Detected once from the browser's location and remembered in localStorage;
 * if location is unavailable or denied, the user picks an area instead.
 * Coordinates are rounded to ~1 km before leaving the browser and are never
 * stored — only the chosen area is.
 */

const STORAGE_KEY = "breathesafe_area";
const CHANGE_EVENT = "breathesafe-area-change";
// Distinguishes "not hydrated yet" (server render) from "nothing saved".
const SERVER_SNAPSHOT = "__server__";

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function writeSaved(area: AreaInfo) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(area));
  } catch {
    // Storage unavailable (private mode): the area still applies via the event below.
    memoryArea = JSON.stringify(area);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Fallback when localStorage can't be written.
let memoryArea: string | null = null;

function parseArea(raw: string | null): AreaInfo | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AreaInfo>;
    if (typeof value.id === "string" && typeof value.name === "string") {
      return {
        id: value.id,
        kind: value.kind === "city" || value.kind === "geo" ? value.kind : "station",
        name: value.name,
        city: value.city ?? "",
        state: value.state ?? "",
        ...(typeof value.distanceKm === "number" ? { distanceKm: value.distanceKm } : {}),
      };
    }
  } catch {
    // ignore malformed saved values
  }
  return null;
}

type DetectState =
  | { phase: "idle" }
  | { phase: "detecting" }
  | { phase: "failed"; message: string };

interface AreaContextValue {
  area: AreaInfo | null;
  /** loading: before hydration; ready: area known; detecting; needs-choice: user must pick */
  status: "loading" | "detecting" | "ready" | "needs-choice";
  /** Why the user needs to choose (permission denied, no station nearby, ...). */
  message: string | null;
  isDetecting: boolean;
  chooseArea: (area: AreaInfo) => void;
  /** Detects from the browser location; resolves true when an area was set. */
  detect: () => Promise<boolean>;
}

const AreaContext = createContext<AreaContextValue | null>(null);

export function AreaProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readSaved() ?? memoryArea,
    () => SERVER_SNAPSHOT
  );
  const hydrated = raw !== SERVER_SNAPSHOT;
  const area = useMemo(() => (hydrated ? parseArea(raw) : null), [hydrated, raw]);
  const [detectState, setDetectState] = useState<DetectState>({ phase: "idle" });

  const detect = useCallback((): Promise<boolean> => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setDetectState({
        phase: "failed",
        message: "Location isn't available in this browser. Choose your area below.",
      });
      return Promise.resolve(false);
    }

    setDetectState({ phase: "detecting" });
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          // ~1 km precision is plenty to find the nearest station.
          const lat = Math.round(position.coords.latitude * 100) / 100;
          const lon = Math.round(position.coords.longitude * 100) / 100;
          try {
            const { area: nearest } = await getNearestArea(lat, lon);
            writeSaved(nearest);
            setDetectState({ phase: "idle" });
            resolve(true);
          } catch (err) {
            setDetectState({
              phase: "failed",
              message:
                err instanceof ApiError && (err.status === 404 || err.status === 400)
                  ? "No air-quality monitoring station was found near you. Choose the nearest area below."
                  : "Couldn't find your area automatically. Choose it below.",
            });
            resolve(false);
          }
        },
        (error) => {
          setDetectState({
            phase: "failed",
            message:
              error.code === error.PERMISSION_DENIED
                ? "Location permission was denied. Choose your area below."
                : "Couldn't get your location. Choose your area below.",
          });
          resolve(false);
        },
        { timeout: 10000, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false }
      );
    });
  }, []);

  // First visit: detect automatically once, after hydration.
  useEffect(() => {
    if (!hydrated || area || detectState.phase !== "idle") return;
    const timer = setTimeout(() => void detect(), 0);
    return () => clearTimeout(timer);
  }, [hydrated, area, detectState.phase, detect]);

  const chooseArea = useCallback((next: AreaInfo) => {
    writeSaved(next);
    setDetectState({ phase: "idle" });
  }, []);

  const value = useMemo<AreaContextValue>(() => {
    let status: AreaContextValue["status"];
    if (!hydrated) status = "loading";
    else if (area) status = "ready";
    else if (detectState.phase === "failed") status = "needs-choice";
    else status = "detecting";
    return {
      area,
      status,
      message: detectState.phase === "failed" ? detectState.message : null,
      isDetecting: detectState.phase === "detecting",
      chooseArea,
      detect,
    };
  }, [hydrated, area, detectState, chooseArea, detect]);

  return <AreaContext.Provider value={value}>{children}</AreaContext.Provider>;
}

export function useArea(): AreaContextValue {
  const ctx = useContext(AreaContext);
  if (!ctx) throw new Error("useArea must be used within AreaProvider");
  return ctx;
}

/** "ITO, Delhi - CPCB" + "Delhi, Delhi" style subtitle for an area. */
export function areaSubtitle(area: AreaInfo): string {
  const place = [area.city, area.state].filter(Boolean);
  const unique = place.filter((p, i) => place.indexOf(p) === i).join(", ");
  const distance =
    typeof area.distanceKm === "number" ? `${area.distanceKm} km from you` : "";
  return [unique, distance].filter(Boolean).join(" · ");
}
