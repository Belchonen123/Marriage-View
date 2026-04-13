"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import { JOURNAL_FOCUS_LABELS, type JournalFocusKey } from "@/lib/journal-focus-areas";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type JournalRow = {
  id: string;
  mood: string;
  note: string;
  focus_areas: string[];
  call_occurred_at: string | null;
  created_at: string;
  match_id: string | null;
  other_user_id: string | null;
  other_display_name: string | null;
};

export function AdminJournalSection({ userId }: { userId: string }) {
  const [items, setItems] = useState<JournalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await adminApiFetch(`/api/admin/profiles/${userId}/journal`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load journal");
      setItems(null);
      return;
    }
    setItems((json.items ?? []) as JournalRow[]);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Private reflections (journal)</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Admin-only access for moderation and support. Align member-facing privacy policy with how you use this data.
      </p>

      {items === null && !error ? (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !items?.length ? (
        <p className="mt-3 text-sm text-zinc-500">No journal entries.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="py-2 pr-2 font-medium">When</th>
                <th className="py-2 pr-2 font-medium">Mood</th>
                <th className="py-2 pr-2 font-medium">Post-call</th>
                <th className="py-2 pr-2 font-medium">Focus</th>
                <th className="py-2 pr-2 font-medium">Match context</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 align-top dark:border-zinc-800/80">
                  <td className="py-2 pr-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-2 capitalize">{row.mood.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-2">{row.call_occurred_at ? "Yes" : "—"}</td>
                  <td className="py-2 pr-2 text-zinc-600 dark:text-zinc-400">
                    {row.focus_areas?.length
                      ? row.focus_areas
                          .map((k) => JOURNAL_FOCUS_LABELS[k as JournalFocusKey] ?? k)
                          .join(", ")
                      : "—"}
                  </td>
                  <td className="py-2 pr-2">
                    {row.match_id ? (
                      <span className="space-y-0.5">
                        {row.other_user_id ? (
                          <Link
                            href={`/admin/users/${row.other_user_id}`}
                            className="block text-rose-700 hover:underline dark:text-rose-400"
                          >
                            {row.other_display_name ?? row.other_user_id}
                          </Link>
                        ) : (
                          <span className="text-zinc-500">Match ended</span>
                        )}
                        <span className="block font-mono text-[10px] text-zinc-500">{row.match_id}</span>
                        <Link
                          href={`/chat/${row.match_id}`}
                          className="text-[10px] text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
                        >
                          Open chat (staff)
                        </Link>
                      </span>
                    ) : (
                      <span className="text-zinc-500">Unlinked</span>
                    )}
                  </td>
                  <td className="max-w-xs py-2">
                    {row.note ? (
                      <details className="cursor-pointer">
                        <summary className="text-zinc-700 dark:text-zinc-300">
                          {row.note.length > 80 ? `${row.note.slice(0, 80)}…` : row.note}
                        </summary>
                        <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{row.note}</p>
                      </details>
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
    </div>
  );
}
