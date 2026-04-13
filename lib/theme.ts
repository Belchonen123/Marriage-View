export const THEME_STORAGE_KEY = "nexus-theme";

export type ThemePreference = "system" | "light" | "dark";

export function resolveIsDark(pref: ThemePreference): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const s = localStorage.getItem(THEME_STORAGE_KEY);
  if (s === "dark" || s === "light" || s === "system") return s;
  return "system";
}

export function applyThemePreference(pref: ThemePreference) {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, pref);
  document.documentElement.classList.toggle("dark", resolveIsDark(pref));
}
