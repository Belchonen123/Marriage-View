"use client";

import { NavNotifications } from "@/components/NavNotifications";
import { getLastReadMessageId } from "@/lib/match-read-storage";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const links = [
  { href: "/discover", label: "Discover", unreadFromSummary: false },
  { href: "/likes", label: "Likes", unreadFromSummary: false },
  { href: "/matches", label: "Matches", unreadFromSummary: true },
  { href: "/tips", label: "Tips", unreadFromSummary: false },
  { href: "/coach", label: "Coach", unreadFromSummary: false },
  { href: "/onboarding/profile", label: "Profile", unreadFromSummary: false },
  { href: "/settings", label: "Settings", unreadFromSummary: false },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const [matchUnread, setMatchUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    const res = await fetch("/api/matches/summary");
    if (!res.ok) return;
    const data = (await res.json()) as {
      selfId: string;
      threads: { matchId: string; last: { id: string; sender_id: string } | null }[];
    };
    const selfId = data.selfId;
    let n = 0;
    for (const t of data.threads ?? []) {
      const last = t.last;
      if (!last || last.sender_id === selfId) continue;
      if (last.id !== getLastReadMessageId(t.matchId)) n++;
    }
    setMatchUnread(n);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refreshUnread());
    const onRead = () => void refreshUnread();
    window.addEventListener("nexus-match-read", onRead);
    window.addEventListener("storage", onRead);
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshUnread();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onRead);
    return () => {
      window.removeEventListener("nexus-match-read", onRead);
      window.removeEventListener("storage", onRead);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onRead);
    };
  }, [refreshUnread]);

  return (
    <header className="nav-shell sticky top-0 z-40 overflow-visible border-b border-rose-900/[0.08] bg-[var(--surface)] backdrop-blur-xl dark:border-rose-100/[0.06]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="input-focus font-display text-lg font-semibold tracking-tight text-[var(--accent)] rounded-md transition-opacity hover:opacity-90"
        >
          Marriage View
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          <NavNotifications />
          {links.map((l) => {
            const active =
              l.href === "/coach" || l.href === "/tips"
                ? pathname === l.href
                : pathname === l.href || (pathname != null && pathname.startsWith(`${l.href}/`));
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`input-focus rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--accent-muted)] text-[var(--accent)] dark:text-[var(--accent)]"
                    : "text-zinc-600 hover:bg-black/[0.04] hover:text-rose-800 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-rose-200"
                }`}
              >
                {l.label}
                {"unreadFromSummary" in l && l.unreadFromSummary && matchUnread > 0 ? (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white">
                    {matchUnread > 9 ? "9+" : matchUnread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
