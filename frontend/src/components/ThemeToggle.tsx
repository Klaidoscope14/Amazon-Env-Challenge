"use client";

import { useSyncExternalStore } from "react";
import {
  applyTheme,
  getStoredPreference,
  setPreference,
  THEME_EVENT,
  type ThemePreference,
} from "@/lib/theme";

const ORDER: ThemePreference[] = ["system", "light", "dark"];
const LABEL: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * Subscribes to every source that can change the effective theme: this tab's
 * own changes (THEME_EVENT), other tabs (storage), and the OS preference while
 * following "system". Re-applies data-theme before notifying React.
 */
function subscribe(onChange: () => void): () => void {
  const handler = () => {
    applyTheme(getStoredPreference());
    onChange();
  };
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(THEME_EVENT, handler);
  window.addEventListener("storage", handler);
  mq.addEventListener("change", handler);
  return () => {
    window.removeEventListener(THEME_EVENT, handler);
    window.removeEventListener("storage", handler);
    mq.removeEventListener("change", handler);
  };
}

export default function ThemeToggle() {
  const pref = useSyncExternalStore<ThemePreference>(
    subscribe,
    getStoredPreference,
    () => "system"
  );

  function cycle() {
    setPreference(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${LABEL[pref]}. Activate to change.`}
      title={`Theme: ${LABEL[pref]}`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
    >
      <span className="flex h-5 w-5 items-center justify-center" aria-hidden="true">
        {pref === "system" ? <MonitorIcon /> : pref === "light" ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
