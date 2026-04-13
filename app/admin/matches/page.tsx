"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import Link from "next/link";
import { useEffect, useState } from "react";

type MatchRow = {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  display_name_a: string;
  display_name_b: string;
};

const limit = 25;

async function fetchMatches(offset: number) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await adminApiFetch(`/api/admin/matches?${params}`);
  const data = await res.json();
  if (!res.ok) {
    return { ok: false as const, error: data.error ?? "Failed to load", items: [] as MatchRow[], total: 0 };
  }
  return {
    ok: true as const,
    error: null as string | null,
    items: (data.items ?? []) as MatchRow[],
    total: (data.total ?? 0) as number,
  };
}

export default function AdminMatchesPage() {
  const [items, setItems] = useState<MatchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchMatches(offset);
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
  }, [offset]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Matches</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Mutual likes (newest first). Total: {total}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Member A</th>
                <th className="px-3 py-2 font-medium">Member B</th>
                <th className="px-3 py-2 font-medium">Chat</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-b border-zinc-100 dark:border-zinc-800/80">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {new Date(m.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/users/${m.user_a}`} className="text-rose-700 underline-offset-2 hover:underline dark:text-rose-400">
                      {m.display_name_a || "—"}
                    </Link>
                    <span className="ml-1 font-mono text-xs text-zinc-400">({m.user_a.slice(0, 8)}…)</span>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/users/${m.user_b}`} className="text-rose-700 underline-offset-2 hover:underline dark:text-rose-400">
                      {m.display_name_b || "—"}
                    </Link>
                    <span className="ml-1 font-mono text-xs text-zinc-400">({m.user_b.slice(0, 8)}…)</span>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/chat/${m.id}`}
                      className="text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                    >
                      Open thread
                    </Link>
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
