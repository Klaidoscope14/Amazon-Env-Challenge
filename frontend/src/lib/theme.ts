export type ThemePreference = "system" | "light" | "dark";

/** localStorage key. Mirrored by the inline no-flash script in layout.tsx. */
export const THEME_KEY = "breathesafe_theme";

/** Fired on the window when the preference changes in this tab (storage events
 * only fire in *other* tabs), so subscribers can re-render. */
export const THEME_EVENT = "breathesafe:themechange";

/** Resolves a preference to the concrete theme to apply. */
export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** The stored preference, defaulting to "system" (absent or unreadable). */
export function getStoredPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // ignore (private mode / blocked storage)
  }
  return "system";
}

/** Sets data-theme on <html> from a preference. */
export function applyTheme(pref: ThemePreference): void {
  document.documentElement.setAttribute("data-theme", resolveTheme(pref));
}

/** Persists the preference and applies it immediately. */
export function setPreference(pref: ThemePreference): void {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // ignore
  }
  applyTheme(pref);
  try {
    window.dispatchEvent(new Event(THEME_EVENT));
  } catch {
    // ignore
  }
}
