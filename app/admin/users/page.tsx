"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import Link from "next/link";
import { useEffect, useState } from "react";

type ProfileRow = {
  id: string;
  display_name: string;
  city: string | null;
  gender: string | null;
  onboarding_complete: boolean;
  questionnaire_version: number;
  created_at: string;
};

const limit = 25;

type OnboardingFilter = "all" | "complete" | "incomplete";

async function fetchProfiles(offset: number, search: string, onboarding: OnboardingFilter) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search.trim()) params.set("q", search.trim());
  if (onboarding !== "all") params.set("onboarding", onboarding);
  const res = await adminApiFetch(`/api/admin/profiles?${params}`);
  const data = await res.json();
  if (!res.ok) {
    return {
      ok: false as const,
      error: data.error ?? "Failed to load",
      items: [] as ProfileRow[],
      total: 0,
    };
  }
  return {
    ok: true as const,
    error: null as string | null,
    items: (data.items ?? []) as ProfileRow[],
    total: (data.total ?? 0) as number,
  };
}

export default function AdminUsersPage() {
  const [items, setItems] = useState<ProfileRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [onboarding, setOnboarding] = useState<OnboardingFilter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchProfiles(offset, search, onboarding);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setItems([]);
        setTotal(0);
        return;
      }
      setError(null);
      setItems(result.items);
      setTotal(result.total);
    })();
    return () => {
      cancelled = true;
    };
  }, [offset, search, onboarding]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setSearch(q);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Profile rows (no questionnaire answers shown). Total: {total}
          </p>
        </div>
               <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div
            className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
            role="group"
            aria-label="Onboarding filter"
          >
            {(
              [
                { value: "all" as const, label: "All" },
                { value: "complete" as const, label: "Onboarded" },
                { value: "incomplete" as const, label: "Incomplete" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  onboarding === opt.value
                    ? "bg-rose-700 text-white dark:bg-rose-600"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
                onClick={() => {
                  setOffset(0);
                  setOnboarding(opt.value);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <form onSubmit={submitSearch} className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or city"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">City</th>
                <th className="px-3 py-2 font-medium">Gender</th>
                <th className="px-3 py-2 font-medium">Quiz v</th>
                <th className="px-3 py-2 font-medium">Onboarded</th>
                <th className="px-3 py-2 font-medium">User id</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800/80">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/users/${p.id}`}
                      className="font-medium text-rose-700 underline-offset-2 hover:underline dark:text-rose-400"
                    >
                      {p.display_name || "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{p.city ?? "—"}</td>
                  <td className="px-3 py-2">{p.gender ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{p.questionnaire_version}</td>
                  <td className="px-3 py-2">{p.onboarding_complete ? "Yes" : "No"}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2 font-mono text-xs text-zinc-500" title={p.id}>
                    {p.id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between text-sm">
        <button
          type="button"
          disabled={offset === 0}
          className="rounded-lg border border-zinc-300 px-3 py-1 disabled:opacity-40 dark:border-zinc-700"
          onClick={() => setOffset((o) => Math.max(0, o - limit))}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={offset + limit >= total}
          className="rounded-lg border border-zinc-300 px-3 py-1 disabled:opacity-40 dark:border-zinc-700"
          onClick={() => setOffset((o) => o + limit)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
