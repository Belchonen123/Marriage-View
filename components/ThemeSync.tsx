"use client";

import {
  applyThemePreference,
  getThemePreference,
  resolveIsDark,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";
import { useEffect, useState } from "react";

export function ThemeSync() {
  useEffect(() => {
    const apply = () => {
      const pref = getThemePreference();
      document.documentElement.classList.toggle("dark", resolveIsDark(pref));
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMq = () => {
      if (getThemePreference() === "system") apply();
    };
    mq.addEventListener("change", onMq);
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) apply();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}

export function ThemeSegmentedControl() {
  const [pref, setPref] = useState<ThemePreference>(() =>
    typeof window !== "undefined" ? getThemePreference() : "system",
  );

  useEffect(() => {
    applyThemePreference(getThemePreference());
  }, []);

  useEffect(() => {
    const sync = () => setPref(getThemePreference());
    window.addEventListener("nexus-theme-change", sync);
    return () => window.removeEventListener("nexus-theme-change", sync);
  }, []);

  function setPrefAndApply(next: ThemePreference) {
    applyThemePreference(next);
    setPref(next);
    window.dispatchEvent(new Event("nexus-theme-change"));
  }

  const choices: { id: ThemePreference; label: string }[] = [
    { id: "system", label: "System" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];

  return (
    <div className="flex gap-1 rounded-full border border-zinc-200/90 bg-zinc-100/80 p-1 dark:border-zinc-700/90 dark:bg-zinc-800/50">
      {choices.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => setPrefAndApply(c.id)}
          className={`min-h-10 flex-1 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
            pref === c.id
              ? "bg-[var(--surface-elevated)] text-[var(--accent)] shadow-sm dark:bg-zinc-900"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
