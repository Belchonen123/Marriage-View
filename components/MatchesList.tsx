"use client";

import { getLastReadMessageId } from "@/lib/match-read-storage";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const NEXUS_MATCHES_REFRESH = "nexus-matches-refresh";

export type MatchPreview = {
  matchId: string;
  otherId: string;
  otherName: string;
  photoUrl: string | null;
  lastMessage: {
    id: string;
    body: string;
    created_at: string;
    sender_id: string;
  } | null;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MatchesList({ selfId, matches }: { selfId: string; matches: MatchPreview[] }) {
  const router = useRouter();
  const [, bump] = useState(0);
  const refresh = useCallback(() => bump((n) => n + 1), []);
  const refreshMatchesDebounce = useRef<number | null>(null);

  useEffect(() => {
    const onRead = () => refresh();
    window.addEventListener("nexus-match-read", onRead);
    window.addEventListener("storage", onRead);
    return () => {
      window.removeEventListener("nexus-match-read", onRead);
      window.removeEventListener("storage", onRead);
    };
  }, [refresh]);

  useEffect(() => {
    const onServerRefresh = () => {
      if (refreshMatchesDebounce.current) clearTimeout(refreshMatchesDebounce.current);
      refreshMatchesDebounce.current = window.setTimeout(() => {
        refreshMatchesDebounce.current = null;
        router.refresh();
      }, 300);
    };
    window.addEventListener(NEXUS_MATCHES_REFRESH, onServerRefresh);
    return () => {
      window.removeEventListener(NEXUS_MATCHES_REFRESH, onServerRefresh);
      if (refreshMatchesDebounce.current) clearTimeout(refreshMatchesDebounce.current);
    };
  }, [router]);

  return (
    <ul className="space-y-3">
      {matches.map((m, i) => {
        const last = m.lastMessage;
        const fromOther = last && last.sender_id !== selfId;
        const readId = getLastReadMessageId(m.matchId);
        const unread = Boolean(fromOther && last && last.id !== readId);

        return (
          <li
            key={m.matchId}
            className="animate-card-in"
            style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
          >
            <Link
              href={`/chat/${m.matchId}`}
              className="card-surface group flex gap-3 border border-zinc-200/80 px-4 py-3 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:border-[var(--accent-muted)] dark:border-zinc-700/80 dark:hover:border-[var(--accent-muted)]"
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-zinc-200 ring-2 ring-transparent transition group-hover:ring-[var(--accent-muted)] dark:bg-zinc-700">
                {m.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs font-medium text-zinc-500">
                    {m.otherName.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={
                      unread
                        ? "font-semibold text-zinc-900 dark:text-zinc-50"
                        : "font-medium text-zinc-800 dark:text-zinc-200"
                    }
                  >
                    {m.otherName}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {unread ? (
                      <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        New
                      </span>
                    ) : null}
                    {last ? (
                      <span className="text-xs text-zinc-500">{formatTime(last.created_at)}</span>
                    ) : null}
                  </div>
                </div>
                {last ? (
                  <p
                    className={`mt-1 truncate text-sm ${
                      unread ? "font-medium text-zinc-800 dark:text-zinc-200" : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {fromOther ? "" : "You: "}
                    {last.body}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-zinc-500">No messages yet — say hello</p>
                )}
              </div>
              <span
                className="shrink-0 self-center text-[var(--accent)] opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden
              >
                →
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
