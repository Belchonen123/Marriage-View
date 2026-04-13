"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import { useEffect, useState } from "react";

type Report = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  priority?: string;
  match_id?: string | null;
};

const filters = [
  { value: "pending", label: "Pending" },
  { value: "all", label: "All" },
  { value: "reviewed", label: "Reviewed" },
  { value: "actioned", label: "Actioned" },
] as const;

async function fetchReports(status: (typeof filters)[number]["value"]) {
  const params = new URLSearchParams({ status });
  const res = await adminApiFetch(`/api/admin/reports?${params}`);
  const data = await res.json();
  if (!res.ok) {
    return { ok: false as const, error: data.error ?? "Failed to load", items: [] as Report[] };
  }
  return { ok: true as const, error: null as string | null, items: (data.items ?? []) as Report[] };
}

function sortReports(items: Report[]): Report[] {
  return [...items].sort((a, b) => {
    const ua = a.priority === "urgent" ? 0 : 1;
    const ub = b.priority === "urgent" ? 0 : 1;
    if (ua !== ub) return ua - ub;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function AdminReportsPage() {
  const [items, setItems] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<(typeof filters)[number]["value"]>("pending");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchReports(status);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setItems([]);
        return;
      }
      setError(null);
      setItems(sortReports(result.items));
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  async function mark(id: string, next: "reviewed" | "actioned") {
    const res = await adminApiFetch(`/api/admin/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) return;
    const result = await fetchReports(status);
    if (result.ok) {
      setError(null);
      setItems(sortReports(result.items));
    } else {
      setError(result.error);
      setItems([]);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Requires your email in{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">ADMIN_EMAILS</code>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatus(f.value)}
            className={`rounded-full px-3 py-1 text-xs ${
              status === f.value
                ? "bg-rose-700 text-white"
                : "bg-zinc-200 dark:bg-zinc-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !items.length ? (
        <p className="text-sm text-zinc-500">No reports in this view.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{r.reason}</p>
                <div className="flex flex-wrap items-center gap-1">
                  {r.priority === "urgent" ? (
                    <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">
                      Urgent
                    </span>
                  ) : null}
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs capitalize dark:bg-zinc-800">
                    {r.status}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {new Date(r.created_at).toLocaleString()} · reporter {r.reporter_id} → reported{" "}
                {r.reported_user_id}
                {r.match_id ? ` · match ${r.match_id}` : ""}
              </p>
              {r.details ? <p className="mt-2 text-zinc-700 dark:text-zinc-300">{r.details}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-zinc-200 px-3 py-1 text-xs dark:bg-zinc-800"
                  onClick={() => void mark(r.id, "reviewed")}
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  className="rounded-full bg-rose-700 px-3 py-1 text-xs text-white"
                  onClick={() => void mark(r.id, "actioned")}
                >
                  Mark actioned
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
