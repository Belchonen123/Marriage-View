"use client";

import { createClient } from "@/lib/supabase/client";
import { playMessagePing, startCallRingtone } from "@/lib/call-ringtone";
import {
  isDesktopNotificationDesired,
  primeNotificationOptInDefaults,
} from "@/lib/notification-prefs";
import { ModalCloseButton } from "@/components/ModalCloseButton";
import { useToast } from "@/components/ToastProvider";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type IncomingCall = {
  matchId: string;
  callerName: string;
};

type MsgPopup = {
  id: string;
  matchId: string;
  preview: string;
  fromLabel: string;
};

export function GlobalRealtimeNotifications() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const router = useRouter();
  const { show } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [msgPopup, setMsgPopup] = useState<MsgPopup | null>(null);
  const ringRef = useRef<ReturnType<typeof startCallRingtone> | null>(null);
  const matchNamesRef = useRef<Map<string, string>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const channelName = `nexus-notify:${crypto.randomUUID()}`;

    function dismissCall(matchId: string) {
      void fetch("/api/call-signal/dismiss", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
    }

    void (async () => {
      primeNotificationOptInDefaults();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const ch = supabase.channel(channelName);
      if (cancelled) return;
      channelRef.current = ch;

      ch.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_signals",
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload) => {
          if (cancelled) return;
          const row = payload.new as { match_id: string; caller_id: string };
          const { data: p } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", row.caller_id)
            .maybeSingle();
          const callerName = (p?.display_name as string) ?? "Your match";
          const chatPath = `/chat/${row.match_id}`;

          ringRef.current?.stop();
          ringRef.current = startCallRingtone();
          window.setTimeout(() => ringRef.current?.stop(), 55_000);
          setIncoming({ matchId: row.match_id, callerName });

          if (
            isDesktopNotificationDesired() &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            document.visibilityState !== "visible"
          ) {
            try {
              const videoPath = `${chatPath}?video=1`;
              const n = new Notification(`${callerName} is calling`, {
                body: "Video date invitation on Marriage View",
                tag: `nexus-call-${row.match_id}`,
              });
              n.onclick = () => {
                window.focus();
                router.push(videoPath);
                n.close();
              };
            } catch {
              /* ignore */
            }
          }

          show(`${callerName} is inviting you to a video date`, "info", {
            durationMs: 24_000,
            actions: [
              {
                label: "Answer",
                onClick: () => {
                  ringRef.current?.stop();
                  setIncoming(null);
                  router.push(`${chatPath}?video=1`);
                },
              },
              {
                label: "Decline",
                onClick: () => {
                  ringRef.current?.stop();
                  setIncoming(null);
                  dismissCall(row.match_id);
                },
              },
            ],
          });
        },
      );

      const res = await fetch("/api/matches/summary", { credentials: "include" });
      if (cancelled) return;

      if (res.ok) {
        const data = (await res.json()) as { threads: { matchId: string }[] };
        const matchIds = [...new Set(data.threads.map((t) => t.matchId))];

        for (const mid of matchIds) {
          const { data: m } = await supabase
            .from("matches")
            .select("user_a, user_b")
            .eq("id", mid)
            .maybeSingle();
          if (!m) continue;
          const oid = m.user_a === user.id ? m.user_b : m.user_a;
          const { data: prof } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", oid)
            .maybeSingle();
          matchNamesRef.current.set(mid, (prof?.display_name as string) ?? "Match");
        }

        for (const mid of matchIds) {
          ch.on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `match_id=eq.${mid}`,
            },
            (payload) => {
              if (cancelled) return;
              const row = payload.new as { id: string; match_id: string; sender_id: string; body: string };
              if (row.sender_id === user.id) return;
              const chatPath = `/chat/${row.match_id}`;
              if (pathnameRef.current === chatPath) return;

              const from = matchNamesRef.current.get(row.match_id) ?? "Match";
              const preview =
                row.body.length > 140 ? `${row.body.slice(0, 140)}…` : row.body;
              playMessagePing();
              if (
                isDesktopNotificationDesired() &&
                typeof Notification !== "undefined" &&
                Notification.permission === "granted" &&
                document.visibilityState !== "visible"
              ) {
                try {
                  const n = new Notification(from, { body: preview, tag: `nexus-msg-${row.match_id}` });
                  n.onclick = () => {
                    window.focus();
                    router.push(chatPath);
                    n.close();
                  };
                } catch {
                  /* ignore */
                }
              }
              setMsgPopup({
                id: row.id,
                matchId: row.match_id,
                preview,
                fromLabel: from,
              });
              show(`New message from ${from}`, "info", {
                durationMs: 12_000,
                actions: [{ label: "View chat", onClick: () => router.push(chatPath) }],
              });
              if (pathnameRef.current === "/matches") {
                window.dispatchEvent(new CustomEvent("nexus-matches-refresh"));
              }
              window.setTimeout(() => {
                setMsgPopup((cur) => (cur?.id === row.id ? null : cur));
              }, 14_000);
            },
          );
        }
      }

      if (cancelled) return;
      ch.subscribe();
    })();

    return () => {
      cancelled = true;
      ringRef.current?.stop();
      ringRef.current = null;
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [router, show, supabase]);

  useEffect(() => {
    if (!incoming) {
      ringRef.current?.stop();
      ringRef.current = null;
    }
  }, [incoming]);

  useEffect(() => {
    if (!incoming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setIncoming((cur) => {
        if (!cur) return null;
        ringRef.current?.stop();
        void fetch("/api/call-signal/dismiss", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId: cur.matchId }),
        });
        return null;
      });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [incoming]);

  useEffect(() => {
    if (!msgPopup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMsgPopup(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [msgPopup]);

  function declineIncoming() {
    setIncoming((cur) => {
      if (!cur) return null;
      ringRef.current?.stop();
      void fetch("/api/call-signal/dismiss", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: cur.matchId }),
      });
      return null;
    });
  }

  return (
    <>
      {incoming ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="incoming-call-title"
        >
          <div className="card-surface relative max-w-sm border border-zinc-200/90 p-6 pt-12 text-center dark:border-zinc-700/90">
            <ModalCloseButton className="absolute right-3 top-3" onClick={declineIncoming} />
            <p id="incoming-call-title" className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Video date invitation
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{incoming.callerName}</p>
            <p className="mt-1 text-xs text-zinc-500">Ringing — open your Video Date Room when you&apos;re ready</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                className="min-h-11 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700"
                onClick={() => {
                  ringRef.current?.stop();
                  const mid = incoming.matchId;
                  setIncoming(null);
                  router.push(`/chat/${mid}?video=1`);
                }}
              >
                Answer
              </button>
              <button
                type="button"
                className="min-h-11 rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                onClick={declineIncoming}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {msgPopup ? (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[110] w-[min(100%-2rem,22rem)] animate-card-in">
          <div className="card-surface relative border border-zinc-200/90 p-4 pt-10 shadow-xl dark:border-zinc-700/90">
            <ModalCloseButton className="absolute right-2 top-2" onClick={() => setMsgPopup(null)} />
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">New message</p>
            <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-50">{msgPopup.fromLabel}</p>
            <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">{msgPopup.preview}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="min-h-10 flex-1 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
                onClick={() => {
                  router.push(`/chat/${msgPopup.matchId}`);
                  setMsgPopup(null);
                }}
              >
                View
              </button>
              <button
                type="button"
                className="min-h-10 rounded-full border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                onClick={() => setMsgPopup(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
