"use client";

import { DailyPromptChatStrip } from "@/components/DailyPromptChatStrip";
import { ChatThreadSkeleton } from "@/components/Skeletons";
import { EmptyState } from "@/components/EmptyState";
import { useToast, type ToastAction } from "@/components/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { setLastReadMessageId } from "@/lib/match-read-storage";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const MESSAGE_PAGE_SIZE = 200;
const CHAT_DRAFT_PREFIX = "marriageview_chat_draft:";
/** Group consecutive messages from the same sender within this window. */
const MESSAGE_GROUP_GAP_MS = 5 * 60 * 1000;
/** If the user is within this many px of the bottom, treat them as "following" new messages. */
const NEAR_BOTTOM_PX = 100;

function isNearBottom(el: HTMLDivElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight <= NEAR_BOTTOM_PX;
}

type Msg = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  pending?: boolean;
  /** Send failed; message kept in thread for retry. */
  failed?: boolean;
};

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(iso) === dayKey(now.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Real message ids from Postgres are UUIDs; optimistic rows use `optimistic:…`. */
function isPersistedMessageId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/** True if this message is at or before the other user's read cursor (by time). */
function messageSeenByOther(messageCreatedAt: string, readCutoffIso: string | null): boolean {
  if (!readCutoffIso) return false;
  return new Date(messageCreatedAt).getTime() <= new Date(readCutoffIso).getTime();
}

const VIDEO_NUDGE_STORAGE_PREFIX = "marriageview_video_nudge:";
const DAY_MS = 86_400_000;

type VideoNudgeStored = {
  softAt: number | null;
  hardAt: number | null;
  repeatSoftAt: number | null;
  /** User chose “schedule in chat” or similar — don’t re-show tips until this time. */
  snoozeUntil: number | null;
  /** User chose “ignore” — suppress video tips for this match until this time. */
  ignoredUntil: number | null;
};

function loadVideoNudge(matchId: string): VideoNudgeStored {
  if (typeof window === "undefined") {
    return { softAt: null, hardAt: null, repeatSoftAt: null, snoozeUntil: null, ignoredUntil: null };
  }
  try {
    const raw = localStorage.getItem(VIDEO_NUDGE_STORAGE_PREFIX + matchId);
    if (!raw) return { softAt: null, hardAt: null, repeatSoftAt: null, snoozeUntil: null, ignoredUntil: null };
    const j = JSON.parse(raw) as Partial<VideoNudgeStored>;
    return {
      softAt: typeof j.softAt === "number" ? j.softAt : null,
      hardAt: typeof j.hardAt === "number" ? j.hardAt : null,
      repeatSoftAt: typeof j.repeatSoftAt === "number" ? j.repeatSoftAt : null,
      snoozeUntil: typeof j.snoozeUntil === "number" ? j.snoozeUntil : null,
      ignoredUntil: typeof j.ignoredUntil === "number" ? j.ignoredUntil : null,
    };
  } catch {
    return { softAt: null, hardAt: null, repeatSoftAt: null, snoozeUntil: null, ignoredUntil: null };
  }
}

function saveVideoNudge(matchId: string, patch: Partial<VideoNudgeStored>) {
  const cur = loadVideoNudge(matchId);
  localStorage.setItem(VIDEO_NUDGE_STORAGE_PREFIX + matchId, JSON.stringify({ ...cur, ...patch }));
}

function chatEngagementMetrics(msgs: Msg[], selfId: string, otherId: string) {
  const persisted = msgs.filter((m) => isPersistedMessageId(m.id));
  let my = 0;
  let their = 0;
  let switches = 0;
  let prev: string | null = null;
  for (const m of persisted) {
    if (m.sender_id === selfId) my++;
    else if (m.sender_id === otherId) their++;
    else continue;
    if (prev !== null && m.sender_id !== prev) switches++;
    prev = m.sender_id;
  }
  return { my, their, switches, total: persisted.length };
}

/** Last write wins per id; sorted by time (realtime + optimistic can briefly duplicate the same id). */
function dedupeMessagesById(msgs: Msg[]): Msg[] {
  const byId = new Map<string, Msg>();
  for (const m of msgs) {
    byId.set(m.id, m);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export function ChatThread({
  matchId,
  selfId,
  otherUserId,
  otherName,
  onRequestVideoDate,
  suppressVideoDateNudge = false,
}: {
  matchId: string;
  selfId: string;
  otherUserId: string;
  otherName: string;
  /** Opens the Video Date Room prelude from coach toasts. */
  onRequestVideoDate?: () => void;
  /** When true, skip “plan a video date” tips (e.g. prelude or call already open). */
  suppressVideoDateNudge?: boolean;
}) {
  const { show } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [readByUser, setReadByUser] = useState<Record<string, string>>({});
  /** When other user's last_read_message_id is not in the loaded page, we fetch that row's created_at. */
  const [fetchedOtherReadAt, setFetchedOtherReadAt] = useState<string | null>(null);
  const [otherTypingUntil, setOtherTypingUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const bottom = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const skipScrollToBottomRef = useRef(false);
  /** When true, new messages / typing strip changes will scroll to the latest. Resets per thread. */
  const stickToBottomRef = useRef(true);
  const matchIdRef = useRef(matchId);
  matchIdRef.current = matchId;
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const displayItems = useMemo(() => dedupeMessagesById(items), [items]);

  const messagesThisRollingWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * DAY_MS;
    return displayItems.filter(
      (m) => isPersistedMessageId(m.id) && new Date(m.created_at).getTime() >= cutoff,
    ).length;
  }, [displayItems]);

  const lastPersistedMessage = useMemo(() => {
    for (let i = displayItems.length - 1; i >= 0; i--) {
      const m = displayItems[i]!;
      if (isPersistedMessageId(m.id)) return m;
    }
    return null;
  }, [displayItems]);

  /** Weekday label + full insert text; shown only inside collapsed “Scheduling ideas”. */
  const scheduleSnippets = useMemo(() => {
    const out: { label: string; text: string }[] = [];
    const base = new Date();
    for (let add = 1; add <= 5 && out.length < 3; add++) {
      const x = new Date(base);
      x.setDate(x.getDate() + add);
      const wd = x.toLocaleDateString(undefined, { weekday: "short" });
      out.push({
        label: wd,
        text: `Are you free ${wd} for a video date? I'm flexible on time if that helps.`,
      });
    }
    return out;
  }, []);

  const footerEngagement = useMemo(
    () => chatEngagementMetrics(displayItems, selfId, otherUserId),
    [displayItems, selfId, otherUserId],
  );
  /** After both sides have sent at least one message, show optional thread tips (collapsed by default). */
  const showThreadTips = footerEngagement.my >= 1 && footerEngagement.their >= 1;

  const messageGroups = useMemo(
    () =>
      displayItems.map((m, i) => {
        const prev = i > 0 ? displayItems[i - 1] : null;
        const next = i < displayItems.length - 1 ? displayItems[i + 1] : null;
        const groupWithPrev =
          !!prev &&
          prev.sender_id === m.sender_id &&
          new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() <=
            MESSAGE_GROUP_GAP_MS;
        const groupWithNext =
          !!next &&
          next.sender_id === m.sender_id &&
          new Date(next.created_at).getTime() - new Date(m.created_at).getTime() <= MESSAGE_GROUP_GAP_MS;
        return { groupWithPrev, groupWithNext };
      }),
    [displayItems],
  );

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(CHAT_DRAFT_PREFIX + matchId);
      setText(typeof raw === "string" ? raw : "");
    } catch {
      setText("");
    }
  }, [matchId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = matchIdRef.current;
    const t = window.setTimeout(() => {
      try {
        if (text.trim()) sessionStorage.setItem(CHAT_DRAFT_PREFIX + id, text);
        else sessionStorage.removeItem(CHAT_DRAFT_PREFIX + id);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    let cancelled = false;
    const channelName = `chat:${matchId}:${crypto.randomUUID()}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as Msg;
          setItems((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const withoutOptimisticDup = prev.filter(
              (m) =>
                !(
                  (m.pending || m.failed) &&
                  m.sender_id === row.sender_id &&
                  m.body === row.body
                ),
            );
            return dedupeMessagesById([...withoutOptimisticDup, row]);
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_typing",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          if (cancelled) return;
          const row = (payload.new ?? payload.old) as { user_id?: string; updated_at?: string } | null;
          if (!row?.user_id || row.user_id !== otherUserId) return;
          setOtherTypingUntil(Date.now() + 4500);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_read_state",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          if (cancelled) return;
          const merged = {
            ...(typeof payload.old === "object" && payload.old ? payload.old : {}),
            ...(typeof payload.new === "object" && payload.new ? payload.new : {}),
          } as { user_id?: string; last_read_message_id?: string };
          if (!merged.user_id || !merged.last_read_message_id) return;
          setReadByUser((prev) => ({
            ...prev,
            [merged.user_id as string]: merged.last_read_message_id as string,
          }));
        },
      )
      .subscribe();

    void (async () => {
      const [{ data, error: qErr }, readsRes] = await Promise.all([
        supabase
          .from("messages")
          .select("id, body, sender_id, created_at")
          .eq("match_id", matchId)
          .order("created_at", { ascending: false })
          .limit(MESSAGE_PAGE_SIZE),
        supabase.from("match_read_state").select("user_id, last_read_message_id").eq("match_id", matchId),
      ]);

      if (!cancelled) {
        if (qErr) setError(qErr.message);
        else {
          const chronological = [...(data ?? [])].reverse();
          setItems(dedupeMessagesById(chronological as Msg[]));
          setHasMoreOlder((data?.length ?? 0) >= MESSAGE_PAGE_SIZE);
        }
        const map: Record<string, string> = {};
        for (const r of readsRes.data ?? []) {
          map[r.user_id as string] = r.last_read_message_id as string;
        }
        setReadByUser(map);
        setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, matchId, otherUserId]);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [matchId]);

  useEffect(() => {
    if (booting || !onRequestVideoDate || suppressVideoDateNudge) return;
    const st = loadVideoNudge(matchId);
    if (st.ignoredUntil != null && Date.now() < st.ignoredUntil) return;
    if (st.snoozeUntil != null && Date.now() < st.snoozeUntil) return;

    const { my, their, switches, total } = chatEngagementMetrics(displayItems, selfId, otherUserId);
    const softHit = (my >= 3 && their >= 3) || switches >= 4;
    const hardHit = total >= 25 || switches >= 12;
    if (!softHit && !hardHit) return;

    const videoNudgeActions = (): ToastAction[] => [
      { label: "Video Date Room", variant: "primary", onClick: () => onRequestVideoDate() },
      {
        label: "I'll schedule in chat",
        variant: "secondary",
        onClick: () => saveVideoNudge(matchId, { snoozeUntil: Date.now() + 14 * DAY_MS }),
      },
      { label: "Cancel", variant: "ghost", onClick: () => {} },
      {
        label: "Ignore",
        variant: "ghost",
        onClick: () => saveVideoNudge(matchId, { ignoredUntil: Date.now() + 60 * DAY_MS }),
      },
    ];

    const sevenDays = 7 * DAY_MS;

    if (hardHit && st.hardAt === null) {
      saveVideoNudge(matchId, { hardAt: Date.now() });
      show(
        "Tip from Marriage View: you’ve been messaging a lot. Long threads aren’t what we’re for — plan a Video Date Room instead.",
        "info",
        {
          durationMs: 26_000,
          actions: videoNudgeActions(),
        },
      );
      return;
    }

    if (!softHit) return;

    if (st.softAt === null) {
      saveVideoNudge(matchId, { softAt: Date.now() });
      show(
        "Tip from Marriage View: you’re hitting it off in text. Why not plan a video date? Open your Video Date Room when you’ve agreed on a time.",
        "info",
        {
          durationMs: 24_000,
          actions: videoNudgeActions(),
        },
      );
      return;
    }

    if (st.hardAt !== null) return;
    if (Date.now() - st.softAt > sevenDays) {
      const lastRepeat = st.repeatSoftAt ?? st.softAt;
      if (Date.now() - lastRepeat > sevenDays) {
        saveVideoNudge(matchId, { repeatSoftAt: Date.now() });
        show(
          "Marriage View guide: still texting? Make the next step a video date — keep messages short and use the Video Date Room.",
          "info",
          {
            durationMs: 24_000,
            actions: videoNudgeActions(),
          },
        );
      }
    }
  }, [booting, displayItems, matchId, selfId, otherUserId, onRequestVideoDate, show, suppressVideoDateNudge]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottomRef.current = isNearBottom(el);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [matchId]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder) return;
    const oldest = displayItems[0];
    if (!oldest || !isPersistedMessageId(oldest.id)) return;

    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;

    setLoadingOlder(true);
    const { data, error: qErr } = await supabase
      .from("messages")
      .select("id, body, sender_id, created_at")
      .eq("match_id", matchId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);

    if (qErr) {
      setError(qErr.message);
      setLoadingOlder(false);
      return;
    }

    const batch = data ?? [];
    if (batch.length < MESSAGE_PAGE_SIZE) setHasMoreOlder(false);
    if (batch.length === 0) {
      setHasMoreOlder(false);
      setLoadingOlder(false);
      return;
    }

    const olderChronological = [...batch].reverse() as Msg[];
    skipScrollToBottomRef.current = true;
    stickToBottomRef.current = false;
    setItems((prev) => dedupeMessagesById([...olderChronological, ...prev]));

    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) {
        const nextHeight = node.scrollHeight;
        node.scrollTop = nextHeight - prevScrollHeight + prevScrollTop;
      }
      setLoadingOlder(false);
    });
  }, [displayItems, hasMoreOlder, loadingOlder, matchId, supabase]);

  // Scroll to latest only while the user is already near the bottom (or after load-older skip).
  // Intentionally omit `now` from deps — it updates every 400ms for typing UI and was forcing scroll.
  useEffect(() => {
    if (skipScrollToBottomRef.current) {
      skipScrollToBottomRef.current = false;
      return;
    }
    if (!stickToBottomRef.current) return;
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayItems, otherTypingUntil]);

  useEffect(() => {
    if (displayItems.length === 0) return;
    const last = displayItems[displayItems.length - 1];
    if (!isPersistedMessageId(last.id)) return;
    setLastReadMessageId(matchId, last.id);
    void supabase.from("match_read_state").upsert(
      {
        match_id: matchId,
        user_id: selfId,
        last_read_message_id: last.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "match_id,user_id" },
    );
  }, [displayItems, matchId, selfId, supabase]);

  useEffect(() => {
    if (!text.trim()) return;
    const row = {
      match_id: matchId,
      user_id: selfId,
      updated_at: new Date().toISOString(),
    };
    const bump = () => {
      void supabase.from("match_typing").upsert(row, { onConflict: "match_id,user_id" });
    };
    bump();
    const id = window.setInterval(bump, 2000);
    return () => clearInterval(id);
  }, [text, matchId, selfId, supabase]);

  async function postMessage(bodyText: string, optimisticId: string): Promise<boolean> {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, body: bodyText }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: { id: string; body: string; sender_id: string; created_at: string };
      error?: string;
    };
    if (!res.ok) {
      setItems((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, pending: false, failed: true } : m,
        ),
      );
      return false;
    }
    const saved = data.message;
    if (!saved?.id) {
      setItems((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, pending: false, failed: true } : m,
        ),
      );
      return false;
    }
    setItems((prev) =>
      dedupeMessagesById(
        prev.map((m) =>
          m.id === optimisticId
            ? {
                id: saved.id,
                body: saved.body,
                sender_id: saved.sender_id,
                created_at: saved.created_at,
              }
            : m,
        ),
      ),
    );
    return true;
  }

  async function send() {
    setError(null);
    if (!text.trim()) return;
    const bodyText = text.trim();
    const hadSelfPersisted = displayItems.some(
      (m) => m.sender_id === selfId && isPersistedMessageId(m.id),
    );
    const optimisticId = `optimistic:${crypto.randomUUID()}`;
    const optimistic: Msg = {
      id: optimisticId,
      body: bodyText,
      sender_id: selfId,
      created_at: new Date().toISOString(),
      pending: true,
    };
    stickToBottomRef.current = true;
    setItems((prev) => [...prev, optimistic]);
    setText("");

    try {
      const ok = await postMessage(bodyText, optimisticId);
      if (ok && !hadSelfPersisted) {
        show("Sent — they’ll see it when they open this chat.", "success", { durationMs: 4000 });
      }
    } catch {
      setItems((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, pending: false, failed: true } : m)),
      );
    }
  }

  async function retrySend(messageId: string, bodyText: string) {
    setError(null);
    setItems((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, pending: true, failed: false } : m)),
    );
    try {
      await postMessage(bodyText, messageId);
    } catch {
      setItems((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, pending: false, failed: true } : m)),
      );
    }
  }

  useEffect(() => {
    const oid = readByUser[otherUserId];
    if (!oid) {
      setFetchedOtherReadAt(null);
      return;
    }
    if (displayItems.some((m) => m.id === oid)) {
      setFetchedOtherReadAt(null);
      return;
    }
    if (!isPersistedMessageId(oid)) {
      setFetchedOtherReadAt(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("messages")
      .select("created_at")
      .eq("id", oid)
      .eq("match_id", matchId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setFetchedOtherReadAt(data?.created_at ? (data.created_at as string) : null);
      });
    return () => {
      cancelled = true;
    };
  }, [readByUser, otherUserId, displayItems, matchId, supabase]);

  const otherReadCutoff = useMemo(() => {
    const oid = readByUser[otherUserId];
    if (!oid) return null;
    const row = displayItems.find((m) => m.id === oid);
    if (row) return row.created_at;
    return fetchedOtherReadAt;
  }, [readByUser, otherUserId, displayItems, fetchedOtherReadAt]);

  const daySeparatorFlags = useMemo(() => {
    const arr: boolean[] = [];
    let last: string | null = null;
    for (const m of displayItems) {
      const dk = dayKey(m.created_at);
      arr.push(dk !== last);
      last = dk;
    }
    return arr;
  }, [displayItems]);

  const showTyping = now < otherTypingUntil;

  if (booting) {
    return <ChatThreadSkeleton />;
  }

  return (
    <div className="flex h-[min(75vh,720px)] min-h-[20rem] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-zinc-200/90 bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] dark:border-zinc-700/90 dark:shadow-[var(--shadow-card-dark)]">
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: showTyping ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-b border-zinc-200/70 px-4 py-2 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="sr-only">{otherName} is typing</span>
              <span aria-hidden className="inline-flex items-center gap-1.5">
                <span className="font-medium text-zinc-600 dark:text-zinc-300">{otherName}</span>
                <span className="inline-flex translate-y-px gap-0.5">
                  <span className="chat-typing-dot inline-block h-1 w-1 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                  <span className="chat-typing-dot inline-block h-1 w-1 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                  <span className="chat-typing-dot inline-block h-1 w-1 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                </span>
              </span>
            </p>
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {hasMoreOlder && displayItems.length > 0 ? (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              disabled={loadingOlder}
              onClick={() => void loadOlderMessages()}
              className="rounded-full border border-zinc-200/90 bg-zinc-50 px-4 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        ) : null}
        {displayItems.length === 0 ? (
          <div className="flex h-full min-h-[200px] items-center justify-center px-2">
            <EmptyState
              title="No messages yet"
              description="Quick tip: say hello, introduce yourself, and when it feels natural suggest a time for a video date. Keep early messages light—deeper topics often work better on video."
            />
          </div>
        ) : null}
        {displayItems.map((m, msgIndex) => {
          const showDay = daySeparatorFlags[msgIndex] ?? false;
          const mine = m.sender_id === selfId;
          const { groupWithPrev, groupWithNext } = messageGroups[msgIndex] ?? {
            groupWithPrev: false,
            groupWithNext: false,
          };
          const showFooter = !groupWithNext || Boolean(m.failed) || Boolean(m.pending);
          const rowSpacing = showDay ? "mt-2" : groupWithPrev ? "mt-1" : "mt-3";

          let delivery: ReactNode = null;
          if (mine && showFooter) {
            if (m.failed) {
              delivery = (
                <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-amber-100">Not sent — check connection</span>
                  <button
                    type="button"
                    onClick={() => void retrySend(m.id, m.body)}
                    className="font-semibold text-white underline decoration-white/50 underline-offset-2 hover:decoration-white"
                  >
                    Retry send
                  </button>
                </span>
              );
            } else if (m.pending) {
              delivery = <span className="text-white/80">Sending…</span>;
            } else if (messageSeenByOther(m.created_at, otherReadCutoff)) {
              delivery = <span className="font-medium text-white">Read</span>;
            } else {
              delivery = <span className="text-white/80">Sent</span>;
            }
          }

          const bubbleRadiusMine = groupWithNext ? "rounded-br-2xl" : "rounded-br-md";
          const bubbleRadiusMineTop = groupWithPrev ? "rounded-tr-2xl" : "";
          const bubbleRadiusTheirs = groupWithNext ? "rounded-bl-2xl" : "rounded-bl-md";
          const bubbleRadiusTheirsTop = groupWithPrev ? "rounded-tl-2xl" : "";

          return (
            <div key={m.id}>
              {showDay ? (
                <div className="my-4 flex justify-center" role="separator">
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {formatDayLabel(m.created_at)}
                  </span>
                </div>
              ) : null}
              <div className={`flex ${mine ? "justify-end" : "justify-start"} ${rowSpacing}`}>
                <div
                  className={`max-w-[min(92%,28rem)] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
                    mine
                      ? `${bubbleRadiusMine} ${bubbleRadiusMineTop} bg-[var(--accent)] text-white ${m.failed ? "ring-2 ring-amber-300/90 ring-offset-1 ring-offset-[var(--accent)]" : ""}`
                      : `${bubbleRadiusTheirs} ${bubbleRadiusTheirsTop} border border-zinc-200/80 bg-zinc-50 text-zinc-900 dark:border-zinc-700/80 dark:bg-zinc-800/90 dark:text-zinc-50`
                  } ${m.pending ? "opacity-90" : ""} ${showFooter ? "pb-2.5" : "pb-2"}`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  {showFooter ? (
                    <p
                      className={`mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] tabular-nums ${
                        mine ? "text-white/75" : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      <span>{formatMsgTime(m.created_at)}</span>
                      {delivery ? (
                        <>
                          <span className={mine ? "text-white/50" : "text-zinc-300 dark:text-zinc-600"} aria-hidden>
                            ·
                          </span>
                          {delivery}
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {error ? (
        <p className="px-4 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <DailyPromptChatStrip onUseInMessage={(t) => setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${t}` : t))} />
      {displayItems.length > 0 && showThreadTips ? (
        <details className="group border-t border-zinc-100 dark:border-zinc-800/80">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-200/90 bg-zinc-50 text-zinc-500 transition group-open:rotate-180 dark:border-zinc-600 dark:bg-zinc-900/60"
              aria-hidden
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
              Scheduling ideas · thread stats
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-zinc-400 group-open:hidden dark:text-zinc-500">
              Open
            </span>
          </summary>
          <div className="space-y-2 border-t border-zinc-100 px-3 pb-2.5 pt-1.5 dark:border-zinc-800/80">
            <p className="text-center text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
              {messagesThisRollingWeek} message{messagesThisRollingWeek !== 1 ? "s" : ""} this week
              {lastPersistedMessage ? (
                <>
                  {" "}
                  · Last:{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">
                    {lastPersistedMessage.sender_id === selfId ? "You" : otherName}
                  </span>
                </>
              ) : null}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Insert a time suggestion:</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {scheduleSnippets.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className="rounded-full border border-zinc-200/90 bg-zinc-50 px-2.5 py-1 text-[10px] font-medium text-zinc-700 transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] dark:border-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300"
                  title={s.text}
                  onClick={() => setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${s.text}` : s.text))}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </details>
      ) : null}
      <div className="border-t border-zinc-200/80 p-3 dark:border-zinc-800/80">
        <div className="flex items-end gap-2 rounded-2xl border border-zinc-200/90 bg-[var(--background)] p-1.5 pl-3 dark:border-zinc-700/90">
          <label htmlFor={`chat-input-${matchId}`} className="sr-only">
            Message
          </label>
          <textarea
            ref={textareaRef}
            id={`chat-input-${matchId}`}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-sm leading-snug outline-none placeholder:text-zinc-400"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message…"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-md transition hover:bg-[var(--accent-hover)] active:scale-95 disabled:opacity-50"
            disabled={!text.trim()}
            aria-label="Send message"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-zinc-400">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
