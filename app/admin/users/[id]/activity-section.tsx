"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ActivityPayload = {
  interactions: {
    id: string;
    action: string;
    direction: string;
    other_user_id: string;
    other_display_name: string;
    created_at: string;
  }[];
  blocks: {
    blocker_id: string;
    blocked_id: string;
    blocker_display_name: string;
    blocked_display_name: string;
    role: string;
    created_at: string;
  }[];
  reports: {
    id: string;
    reporter_id: string;
    reported_user_id: string;
    reporter_display_name: string;
    reported_display_name: string;
    role: string;
    reason: string;
    details: string | null;
    status: string;
    created_at: string;
    priority?: string;
    match_id?: string | null;
    match_user_a?: string | null;
    match_user_b?: string | null;
  }[];
};

export function AdminActivitySection({ userId }: { userId: string }) {
  const [data, setData] = useState<ActivityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await adminApiFetch(`/api/admin/profiles/${userId}/activity`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load activity");
      setData(null);
      setLoading(false);
      return;
    }
    setData(json as ActivityPayload);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Activity</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Discover interactions, blocks, and reports involving this user (read-only).
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !data ? null : (
        <div className="mt-4 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Discover interactions</h3>
            {!data.interactions.length ? (
              <p className="mt-1 text-sm text-zinc-500">None.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="py-1 pr-2 font-medium">When</th>
                      <th className="py-1 pr-2 font-medium">Dir</th>
                      <th className="py-1 pr-2 font-medium">Action</th>
                      <th className="py-1 font-medium">Other user</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.interactions.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-800/80">
                        <td className="py-1 pr-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                        <td className="py-1 pr-2">{row.direction}</td>
                        <td className="py-1 pr-2">{row.action}</td>
                        <td className="py-1">
                          <Link
                            href={`/admin/users/${row.other_user_id}`}
                            className="text-rose-700 hover:underline dark:text-rose-400"
                          >
                            {row.other_display_name}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Blocks</h3>
            {!data.blocks.length ? (
              <p className="mt-1 text-sm text-zinc-500">None.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {data.blocks.map((row, i) => (
                  <li key={`${row.blocker_id}-${row.blocked_id}-${i}`} className="text-zinc-700 dark:text-zinc-300">
                    <span className="text-xs uppercase text-zinc-500">{row.role.replace("_", " ")}</span>
                    <br />
                    {row.blocker_display_name} blocked {row.blocked_display_name} ·{" "}
                    {new Date(row.created_at).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Reports</h3>
            {!data.reports.length ? (
              <p className="mt-1 text-sm text-zinc-500">None.</p>
            ) : (
              <ul className="mt-2 space-y-3 text-sm">
                {data.reports.map((row) => (
                  <li key={row.id} className="rounded-lg border border-zinc-100 p-2 dark:border-zinc-800/80">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      {row.priority === "urgent" ? (
                        <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                          Urgent
                        </span>
                      ) : null}
                      <span>
                        {row.role === "reporter" ? "They reported" : "They were reported"} · {row.status} ·{" "}
                        {new Date(row.created_at).toLocaleString()}
                      </span>
                    </p>
                    <p className="mt-1 font-medium">{row.reason}</p>
                    {row.details ? <p className="mt-1 text-zinc-600 dark:text-zinc-400">{row.details}</p> : null}
                    <p className="mt-1 text-xs text-zinc-500">
                      Reporter:{" "}
                      <Link href={`/admin/users/${row.reporter_id}`} className="text-rose-700 hover:underline dark:text-rose-400">
                        {row.reporter_display_name}
                      </Link>
                      {" · "}
                      Reported:{" "}
                      <Link href={`/admin/users/${row.reported_user_id}`} className="text-rose-700 hover:underline dark:text-rose-400">
                        {row.reported_display_name}
                      </Link>
                    </p>
                    {row.match_id ? (
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Match:{" "}
                        <span className="font-mono">{row.match_id}</span>
                        {row.match_user_a && row.match_user_b ? (
                          <>
                            {" · "}
                            <Link href={`/admin/users/${row.match_user_a}`} className="text-rose-700 hover:underline dark:text-rose-400">
                              A
                            </Link>
                            {" / "}
                            <Link href={`/admin/users/${row.match_user_b}`} className="text-rose-700 hover:underline dark:text-rose-400">
                              B
                            </Link>
                            {" · "}
                            <Link href={`/chat/${row.match_id}`} className="underline-offset-2 hover:underline">
                              Chat
                            </Link>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    <Link href="/admin/reports" className="mt-1 inline-block text-xs text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400">
                      All reports
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
