"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Flag = "profanity" | "sexual" | "contact";

type FlaggedProfile = {
  source: "profile";
  userId: string;
  displayName: string;
  field: "display_name" | "bio";
  flag: Flag;
  match: string;
  preview: string;
  adminSuspended: boolean;
  createdAt: string;
};

type FlaggedMessage = {
  source: "message";
  userId: string;
  displayName: string;
  matchId: string;
  messageId: string;
  flag: Flag;
  match: string;
  preview: string;
  adminSuspended: boolean;
  createdAt: string;
};

type Flagged = FlaggedProfile | FlaggedMessage;

const FLAG_LABEL: Record<Flag, { label: string; tone: string }> = {
  profanity: {
    label: "Profanity",
    tone: "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100",
  },
  sexual: {
    label: "Sexual",
    tone: "border-red-400 bg-red-50 text-red-900 dark:border-red-700/60 dark:bg-red-950/40 dark:text-red-100",
  },
  contact: {
    label: "Off-platform contact",
    tone:
      "border-violet-400 bg-violet-50 text-violet-900 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-100",
  },
};

export default function AdminContentPage() {
  const [items, setItems] = useState<Flagged[]>([]);
  const [filter, setFilter] = useState<Flag | "all">("all");
  const [scanned, setScanned] = useState<{ profiles: number; messages: number }>({
    profiles: 0,
    messages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("flag", filter);
    try {
      const res = await adminApiFetch(`/api/admin/content-flags?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load");
        setItems([]);
        return;
      }
      setItems((data.items ?? []) as Flagged[]);
      setScanned(data.scanned ?? { profiles: 0, messages: 0 });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleSuspend(userId: string, current: boolean) {
    setBusyId(userId);
    try {
      const res = await adminApiFetch(`/api/admin/profiles/${userId}/suspension`, {
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
        prev.map((it) =>
          it.userId === userId ? ({ ...it, adminSuspended: !current } as Flagged) : it,
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Content moderation</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Heuristic scan of recent profile bios, display names, and chat messages for profanity,
          sexual language, and off-platform contact attempts (phone, email, social handles).
          Suspended users can&apos;t match with anyone.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Scanned: {scanned.profiles.toLocaleString()} profiles ·{" "}
          {scanned.messages.toLocaleString()} recent messages. Flags are heuristic — review before
          acting.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "profanity", "sexual", "contact"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              filter === f
                ? "border-rose-600 bg-rose-600 text-white"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            {f === "all" ? "All" : FLAG_LABEL[f].label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          Re-scan
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Scanning…</p>
      ) : !items.length ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
          ✅ Nothing flagged in the current scan window.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it, idx) => {
            const flag = FLAG_LABEL[it.flag];
            const key =
              it.source === "message" ? `m-${it.messageId}-${idx}` : `p-${it.userId}-${idx}`;
            return (
              <li
                key={key}
                className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${flag.tone}`}>
                    {flag.label}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {it.source === "profile"
                      ? it.field === "display_name"
                        ? "Display name"
                        : "Bio"
                      : "Message"}
                  </span>
                  <Link
                    href={`/admin/users/${it.userId}`}
                    className="text-sm font-medium text-rose-700 hover:underline dark:text-rose-400"
                  >
                    {it.displayName || it.userId.slice(0, 8)}
                  </Link>
                  {it.adminSuspended ? (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Suspended
                    </span>
                  ) : null}
                  <span className="ml-auto text-[11px] text-zinc-500">
                    {new Date(it.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
                  <span className="font-mono text-xs text-zinc-500">match: </span>
                  <span className="rounded bg-yellow-100 px-1 font-mono text-xs dark:bg-yellow-900/40">
                    {it.match}
                  </span>
                  <span className="ml-3 italic text-zinc-600 dark:text-zinc-300">{it.preview}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/users/${it.userId}`}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                  >
                    Open profile
                  </Link>
                  {it.source === "message" ? (
                    <Link
                      href={`/admin/matches?q=${encodeURIComponent(it.matchId)}`}
                      className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                    >
                      Open match
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === it.userId}
                    onClick={() => void toggleSuspend(it.userId, it.adminSuspended)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${
                      it.adminSuspended ? "bg-emerald-700 hover:bg-emerald-800" : "bg-red-700 hover:bg-red-800"
                    }`}
                  >
                    {busyId === it.userId
                      ? "…"
                      : it.adminSuspended
                        ? "Unsuspend"
                        : "Suspend from matching"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
