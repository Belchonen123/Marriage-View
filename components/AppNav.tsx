"use client";

import { NavNotifications } from "@/components/NavNotifications";
import { getLastReadMessageId } from "@/lib/match-read-storage";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Close the drawer whenever navigation happens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

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

  const isActive = (href: string) =>
    href === "/coach" || href === "/tips"
      ? pathname === href
      : pathname === href || (pathname != null && pathname.startsWith(`${href}/`));

  const drawer =
    menuOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[150] sm:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-0 flex h-full w-72 max-w-[80vw] flex-col gap-2 border-l border-zinc-200/80 bg-[var(--surface)] p-5 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-2xl dark:border-zinc-800/80">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-lg font-semibold text-[var(--accent)]">Menu</span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="rounded-full p-2 text-zinc-600 transition hover:bg-black/[0.04] dark:text-zinc-400 dark:hover:bg-white/[0.06]"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {links.map((l) => {
                const active = isActive(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={`input-focus flex items-center justify-between rounded-xl px-3 py-3 text-base font-medium transition-colors ${
                      active
                        ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                        : "text-zinc-700 hover:bg-black/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    <span>{l.label}</span>
                    {l.unreadFromSummary && matchUnread > 0 ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold text-white">
                        {matchUnread > 9 ? "9+" : matchUnread}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <header className="nav-shell sticky top-0 z-40 overflow-visible border-b border-rose-900/[0.08] bg-[var(--surface)] backdrop-blur-xl dark:border-rose-100/[0.06]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="input-focus shrink-0 font-display text-lg font-semibold tracking-tight text-[var(--accent)] rounded-md transition-opacity hover:opacity-90"
        >
          Marriage View
        </Link>

        {/* Desktop / tablet nav */}
        <nav className="hidden min-w-0 flex-1 items-center justify-end gap-1 sm:flex sm:flex-wrap sm:gap-2">
          <NavNotifications />
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`input-focus shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--accent-muted)] text-[var(--accent)] dark:text-[var(--accent)]"
                    : "text-zinc-600 hover:bg-black/[0.04] hover:text-rose-800 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-rose-200"
                }`}
              >
                {l.label}
                {l.unreadFromSummary && matchUnread > 0 ? (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white">
                    {matchUnread > 9 ? "9+" : matchUnread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Mobile bell + hamburger */}
        <div className="flex items-center gap-1 sm:hidden">
          <NavNotifications />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="relative rounded-full p-2 text-zinc-600 transition hover:bg-black/[0.04] dark:text-zinc-400 dark:hover:bg-white/[0.06]"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {matchUnread > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-white">
                {matchUnread > 9 ? "9+" : matchUnread}
              </span>
            ) : null}
          </button>
        </div>
      </div>
      {drawer}
    </header>
  );
}
