"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import { useCallback, useEffect, useState } from "react";

type Flag = {
  key: string;
  enabled: boolean;
  description: string | null;
};

export default function AdminFlagsPage() {
  const [items, setItems] = useState<Flag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await adminApiFetch("/api/admin/feature-flags");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to load");
      setItems([]);
      return;
    }
    setItems((data.items ?? []) as Flag[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(key: string, enabled: boolean) {
    setBusyKey(key);
    setError(null);
    const res = await adminApiFetch("/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled }),
    });
    const data = await res.json();
    setBusyKey(null);
    if (!res.ok) {
      setError(data.error ?? "Update failed");
      return;
    }
    setItems((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: data.item.enabled } : f)));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Feature flags</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Toggles apply immediately for clients that fetch{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/api/feature-flags</code> (cached per session in
          the app).
        </p>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {!items.length && !error ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {items.map((f) => (
            <li
              key={f.key}
              className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">{f.key}</p>
                {f.description ? (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{f.description}</p>
                ) : null}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300"
                  checked={f.enabled}
                  disabled={busyKey === f.key}
                  onChange={(e) => void toggle(f.key, e.target.checked)}
                />
                <span>{f.enabled ? "On" : "Off"}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
