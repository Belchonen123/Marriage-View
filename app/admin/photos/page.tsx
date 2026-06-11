"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import { profilePhotoPublicUrl } from "@/lib/public-storage-url";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Filter = "all" | "with_photos" | "no_photos" | "unverified" | "suspended";

type Item = {
  id: string;
  display_name: string;
  birth_year: number | null;
  city: string | null;
  gender: string | null;
  photo_urls: string[];
  photo_verification_status: string;
  admin_suspended: boolean;
  onboarding_complete: boolean;
  created_at: string;
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "with_photos", label: "With photos" },
  { key: "no_photos", label: "No photos" },
  { key: "unverified", label: "Unverified" },
  { key: "suspended", label: "Suspended" },
];

const PAGE = 60;

function ageFromBirthYear(y: number | null): number | null {
  if (y == null) return null;
  const a = new Date().getFullYear() - y;
  return a > 0 && a < 120 ? a : null;
}

export default function AdminPhotosPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<Filter>("with_photos");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      limit: String(PAGE),
      offset: String(offset),
      filter,
    });
    try {
      const res = await adminApiFetch(`/api/admin/photos?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load");
        setItems([]);
        return;
      }
      setItems((data.items ?? []) as Item[]);
      setTotal((data.total ?? 0) as number);
    } finally {
      setLoading(false);
    }
  }, [filter, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleSuspend(id: string, current: boolean) {
    setBusyId(id);
    try {
      const res = await adminApiFetch(`/api/admin/profiles/${id}/suspension`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminSuspended: !current }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update suspension");
        return;
      }
      setItems((prev) =>
        prev.map((p) => (p.id === id ? { ...p, admin_suspended: !current } : p)),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Photo wall</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Every uploaded profile photo at a glance. Suspended users are blocked from matching with
          anyone. Click a card to open the full member profile.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFilter(f.key);
              setOffset(0);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              filter === f.key
                ? "border-rose-600 bg-rose-600 text-white"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-500">
          Page {Math.floor(offset / PAGE) + 1} · {total.toLocaleString()} total
        </span>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : !items.length ? (
        <p className="text-sm text-zinc-500">No members matched this filter.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((p) => {
            const age = ageFromBirthYear(p.birth_year);
            const photo = p.photo_urls[0];
            return (
              <div
                key={p.id}
                className={`group relative overflow-hidden rounded-xl border bg-white dark:bg-zinc-900 ${
                  p.admin_suspended
                    ? "border-red-400 ring-2 ring-red-500/40"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <Link href={`/admin/users/${p.id}`} className="block">
                  <div className="relative aspect-[3/4] w-full bg-zinc-100 dark:bg-zinc-800">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profilePhotoPublicUrl(photo)}
                        alt={p.display_name || "Member photo"}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                        No photo
                      </div>
                    )}
                    {p.photo_urls.length > 1 ? (
                      <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                        +{p.photo_urls.length - 1}
                      </span>
                    ) : null}
                    {p.admin_suspended ? (
                      <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Suspended
                      </span>
                    ) : null}
                    {p.photo_verification_status !== "verified" && p.photo_urls.length ? (
                      <span className="absolute bottom-2 left-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Unverified
                      </span>
                    ) : null}
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {p.display_name || "—"}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {age ? `${age} · ` : ""}
                      {p.gender ?? "—"}
                      {p.city ? ` · ${p.city}` : ""}
                    </p>
                  </div>
                </Link>
                <div className="border-t border-zinc-100 px-2.5 py-2 dark:border-zinc-800">
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => void toggleSuspend(p.id, p.admin_suspended)}
                    className={`w-full rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      p.admin_suspended
                        ? "bg-emerald-700 text-white hover:bg-emerald-800"
                        : "bg-red-700 text-white hover:bg-red-800"
                    }`}
                  >
                    {busyId === p.id
                      ? "…"
                      : p.admin_suspended
                        ? "Unsuspend"
                        : "Suspend from matching"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between gap-2">
        <button
          type="button"
          disabled={offset === 0 || loading}
          onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
        >
          ← Previous
        </button>
        <button
          type="button"
          disabled={items.length < PAGE || loading}
          onClick={() => setOffset((o) => o + PAGE)}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
