"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import { JOURNAL_FOCUS_LABELS, type JournalFocusKey } from "@/lib/journal-focus-areas";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Scope = "post_date" | "all";

type JournalFeedRow = {
  id: string;
  user_id: string;
  author_display_name: string;
  mood: string;
  note: string;
  focus_areas: string[];
  call_occurred_at: string | null;
  created_at: string;
  match_id: string | null;
  other_user_id: string | null;
  other_display_name: string | null;
};

const MOOD_OPTIONS = [
  { value: "", label: "All moods" },
  { value: "great", label: "Great" },
  { value: "good", label: "Good" },
  { value: "neutral", label: "Neutral" },
  { value: "unsure", label: "Unsure" },
  { value: "not_a_fit", label: "Not a fit" },
] as const;

async function fetchFeed(opts: {
  scope: Scope;
  mood: string;
  offset: number;
  limit: number;
}) {
  const params = new URLSearchParams({
    scope: opts.scope,
    offset: String(opts.offset),
    limit: String(opts.limit),
  });
  if (opts.mood) params.set("mood", opts.mood);
  const res = await adminApiFetch(`/api/admin/match-journal-entries?${params}`);
  const data = await res.json();
  if (!res.ok) {
    return {
      ok: false as const,
      error: data.error ?? "Failed to load",
      items: [] as JournalFeedRow[],
      total: 0,
    };
  }
  return {
    ok: true as const,
    error: null as string | null,
    items: (data.items ?? []) as JournalFeedRow[],
    total: (data.total ?? 0) as number,
  };
}

const PAGE_SIZE = 50;

export default function AdminJournalFeedPage() {
  const [items, setItems] = useState<JournalFeedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [scope, setScope] = useState<Scope>("post_date");
  const [mood, setMood] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchFeed({ scope, mood, offset, limit: PAGE_SIZE });
    if (!result.ok) {
      setError(result.error);
      setItems([]);
      setTotal(0);
      return;
    }
    setError(null);
    setItems(result.items);
    setTotal(result.total);
  }, [scope, mood, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Date reviews (journal)</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Admin-only feed of match reflections after video dates (<strong>post-date</strong> entries have a call
          timestamp). Use this to spot safety or policy issues; align with your privacy policy for how journal text is
          used.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div
          className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
          role="group"
          aria-label="Journal scope"
        >
          {(
            [
              { value: "post_date" as const, label: "Post-date only" },
              { value: "all" as const, label: "All journal" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                scope === opt.value
                  ? "bg-rose-700 text-white dark:bg-rose-600"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
              onClick={() => {
                setOffset(0);
                setScope(opt.value);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Mood</span>
          <select
            value={mood}
            onChange={(e) => {
              setOffset(0);
              setMood(e.target.value);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {MOOD_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Ordered by saved time (newest first). Showing {items.length} of {total}.
      </p>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
              <tr>
                <th className="px-3 py-2 font-medium">Saved</th>
                <th className="px-3 py-2 font-medium">Post-date</th>
                <th className="px-3 py-2 font-medium">Author</th>
                <th className="px-3 py-2 font-medium">With</th>
                <th className="px-3 py-2 font-medium">Mood</th>
                <th className="px-3 py-2 font-medium">Focus</th>
                <th className="px-3 py-2 font-medium">Note</th>
                <th className="px-3 py-2 font-medium">Match</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 align-top dark:border-zinc-800/80">
                  <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                    {row.call_occurred_at ? new Date(row.call_occurred_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/users/${row.user_id}`}
                      className="font-medium text-rose-700 hover:underline dark:text-rose-400"
                    >
                      {row.author_display_name || "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {row.other_user_id ? (
                      <Link
                        href={`/admin/users/${row.other_user_id}`}
                        className="text-rose-700 hover:underline dark:text-rose-400"
                      >
                        {row.other_display_name ?? row.other_user_id}
                      </Link>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 capitalize">{row.mood.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.focus_areas?.length
                      ? row.focus_areas
                          .map((k) => JOURNAL_FOCUS_LABELS[k as JournalFocusKey] ?? k)
                          .join(", ")
                      : "—"}
                  </td>
                  <td className="max-w-xs px-3 py-2 text-zinc-700 dark:text-zinc-300" title={row.note}>
                    <span className="line-clamp-4 whitespace-pre-wrap">{row.note || "—"}</span>
                  </td>
                  <td className="px-3 py-2">
                    {row.match_id ? (
                      <span className="space-y-0.5">
                        <span className="block font-mono text-[10px] text-zinc-500">{row.match_id}</span>
                        <Link
                          href={`/chat/${row.match_id}`}
                          className="text-[10px] text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
                        >
                          Open chat
                        </Link>
                      </span>
                    ) : (
                      "—"
                    )}
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
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={offset + PAGE_SIZE >= total}
          className="rounded-lg border border-zinc-300 px-3 py-1 disabled:opacity-40 dark:border-zinc-700"
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
