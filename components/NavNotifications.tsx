"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalCloseButton } from "@/components/ModalCloseButton";
import { createPortal } from "react-dom";

type Row = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
  /** True when merged from call_signals and the invite is older than the "missed" threshold. */
  isMissedCall?: boolean;
};

export function NavNotifications() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  const [unread, setUnread] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelStyle, setPanelStyle] = useState<{ top: number; right: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/notifications?limit=30");
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setLoadError(data?.error ?? `Could not load (${res.status})`);
      return;
    }
    const data = (await res.json()) as { items: Row[]; unreadCount: number };
    setItems(data.items ?? []);
    setUnread(data.unreadCount ?? 0);
  }, []);

  const updatePanelPosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    setPanelStyle({
      top: r.bottom + 8,
      right: Math.max(8, window.innerWidth - r.right),
      width,
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      ch = supabase
        .channel(`notif-bell:${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "user_notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => void load(),
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "call_signals",
            filter: `callee_id=eq.${user.id}`,
          },
          () => void load(),
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "call_signals",
            filter: `callee_id=eq.${user.id}`,
          },
          () => void load(),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [supabase, load]);

  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const onWin = () => updatePanelPosition();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, updatePanelPosition]);

  /** Re-fetch so "Video call" can become "Missed video date" after the server threshold while the panel is open. */
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => void load(), 45_000);
    return () => window.clearInterval(t);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    void load();
  }

  const panel =
    open && panelStyle && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[200] overflow-hidden rounded-2xl border border-zinc-200/90 bg-[var(--surface-elevated)] shadow-2xl dark:border-zinc-700/90"
            style={{
              top: panelStyle.top,
              right: panelStyle.right,
              width: panelStyle.width,
            }}
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Activity</span>
              <div className="flex shrink-0 items-center gap-1">
                {unread > 0 ? (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="text-[10px] font-medium text-[var(--accent)] hover:underline"
                  >
                    Mark all read
                  </button>
                ) : null}
                <ModalCloseButton className="p-1.5" onClick={() => setOpen(false)} />
              </div>
            </div>
            {loadError ? (
              <p className="px-4 py-4 text-center text-xs text-red-600 dark:text-red-400">{loadError}</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto text-left text-sm">
                {!items.length ? (
                  <li className="px-4 py-6 text-center text-xs text-zinc-500">No notifications yet</li>
                ) : (
                  items.map((n) => {
                    const isVideoRow = n.kind === "video_call_pending" || n.id.startsWith("call:");
                    return (
                      <li key={n.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                        <button
                          type="button"
                          className={`flex w-full gap-2 px-3 py-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/80 ${
                            n.read_at ? "opacity-70" : ""
                          }`}
                          onClick={() => {
                            void fetch("/api/notifications", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: n.id }),
                            }).then(() => load());
                            setOpen(false);
                            if (n.href) router.push(n.href);
                          }}
                        >
                          {isVideoRow ? (
                            <span
                              className={`mt-0.5 shrink-0 ${
                                n.isMissedCall ? "text-amber-600 dark:text-amber-400" : "text-[var(--accent)]"
                              }`}
                              aria-hidden
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                                />
                              </svg>
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <p
                              className={`font-medium ${
                                n.isMissedCall
                                  ? "text-amber-900 dark:text-amber-100"
                                  : "text-zinc-900 dark:text-zinc-50"
                              }`}
                            >
                              {n.title}
                              {n.isMissedCall ? (
                                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
                                  Missed
                                </span>
                              ) : null}
                            </p>
                            <p className="line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{n.body}</p>
                            <p className="mt-1 text-[10px] text-zinc-400">
                              {new Date(n.created_at).toLocaleString(undefined, {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </p>
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
            <div className="border-t border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
              <Link
                href="/matches"
                className="text-xs font-medium text-[var(--accent)] hover:underline"
                onClick={() => setOpen(false)}
              >
                Open matches
              </Link>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          queueMicrotask(() => updatePanelPosition());
          void load();
        }}
        className="relative rounded-full p-2 text-zinc-600 transition hover:bg-black/[0.04] dark:text-zinc-400 dark:hover:bg-white/[0.06]"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {panel}
    </>
  );
}
