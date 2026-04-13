"use client";

import { formatMatchTranscript } from "@/lib/coach/format-transcript";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_PREFIX = "marriageview_coach_thread:";

const STARTER_PROMPTS = [
  "How do I suggest a video date without sounding pushy?",
  "They've been slow to reply — what’s a healthy way to think about that?",
  "What are good boundaries when we’re still getting to know each other?",
  "How do I say I’m looking for something marriage-minded without overwhelming them?",
];

const IMPORT_FEEDBACK_PROMPT = `I've imported our recent messages with this match. In a short shadchan-style reply (plain text, no formatting): what do you see going well, what should I watch, and one or two concrete next steps for me? Don't assume what we didn't discuss.`;

export type CoachChatCoreProps = {
  variant: "page" | "modal";
  initialMatchId: string | null;
  /** Enables "Import chat" when this match context is present */
  matchImportContext?: { matchId: string; otherName: string };
  /** Distinct sessionStorage namespace (e.g. \`page\` or \`match:<uuid>\`) */
  storageScopeSuffix: string;
};

export function CoachChatCore({
  variant,
  initialMatchId,
  matchImportContext,
  storageScopeSuffix,
}: CoachChatCoreProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadHydrated, setThreadHydrated] = useState(false);
  const skipPersistRef = useRef(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedTranscript, setImportedTranscript] = useState<string | null>(null);
  const [importMeta, setImportMeta] = useState<{ count: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const storageKey = userId ? `${STORAGE_PREFIX}${userId}:${storageScopeSuffix}` : null;

  useEffect(() => {
    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/coach/status");
      const data = (await res.json()) as { configured?: boolean };
      setConfigured(Boolean(data.configured));
    })();
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    skipPersistRef.current = true;
    if (!storageKey) {
      setThreadHydrated(true);
      queueMicrotask(() => {
        skipPersistRef.current = false;
      });
      return;
    }
    setThreadHydrated(false);
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as
          | Msg[]
          | {
              messages?: Msg[];
              importedTranscript?: string | null;
              importMeta?: { count: number } | null;
            };
        const arr = Array.isArray(parsed) ? parsed : parsed.messages;
        if (
          arr &&
          Array.isArray(arr) &&
          arr.every(
            (m) =>
              (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
          )
        ) {
          setMessages(arr);
        }
        if (!Array.isArray(parsed) && typeof parsed.importedTranscript === "string") {
          setImportedTranscript(parsed.importedTranscript);
        }
        if (!Array.isArray(parsed) && parsed.importMeta && typeof parsed.importMeta.count === "number") {
          setImportMeta(parsed.importMeta);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setThreadHydrated(true);
      queueMicrotask(() => {
        skipPersistRef.current = false;
      });
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !threadHydrated || typeof window === "undefined") return;
    if (skipPersistRef.current) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ messages, importedTranscript, importMeta }),
      );
    } catch {
      /* ignore */
    }
  }, [storageKey, threadHydrated, messages, importedTranscript, importMeta]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    return () => fetchAbortRef.current?.abort();
  }, []);

  const postCoach = useCallback(
    async (nextMessages: Msg[], transcript: string | null) => {
      fetchAbortRef.current?.abort();
      const ac = new AbortController();
      fetchAbortRef.current = ac;
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          matchId: initialMatchId || matchImportContext?.matchId || undefined,
          importedTranscript: transcript || undefined,
        }),
        signal: ac.signal,
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong");
      }
      if (!data.reply) throw new Error("Empty reply");
      return data.reply;
    },
    [initialMatchId, matchImportContext?.matchId],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !threadHydrated) return;
    setError(null);
    setInput("");
    const before = messages;
    const next: Msg[] = [...before, { role: "user", content: text }];
    setMessages(next);
    setSending(true);
    try {
      const reply = await postCoach(next, importedTranscript);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Network error — try again.");
      setMessages(before);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, importedTranscript, threadHydrated, postCoach]);

  async function importAndGetFeedback() {
    if (!matchImportContext || importing || sending || !threadHydrated || configured === false) return;
    setError(null);
    setImporting(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Sign in required.");
        return;
      }
      const { data: rows, error: qErr } = await supabase
        .from("messages")
        .select("body, sender_id, created_at")
        .eq("match_id", matchImportContext.matchId)
        .order("created_at", { ascending: true })
        .limit(250);

      if (qErr) {
        setError(qErr.message);
        return;
      }
      const { text, count } = formatMatchTranscript(rows ?? [], user.id, matchImportContext.otherName);
      if (!count) {
        setError("No messages to import yet — say hi first, then try again.");
        return;
      }
      setImportedTranscript(text);
      setImportMeta({ count });

      const before = messages;
      const userMsg: Msg = { role: "user", content: IMPORT_FEEDBACK_PROMPT };
      const next: Msg[] = [...before, userMsg];
      setMessages(next);
      setSending(true);
      try {
        const reply = await postCoach(next, text);
        setMessages([...next, { role: "assistant", content: reply }]);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not reach the coach.");
        setMessages(before);
        setImportedTranscript(null);
        setImportMeta(null);
      } finally {
        setSending(false);
      }
    } finally {
      setImporting(false);
    }
  }

  function clearImport() {
    setImportedTranscript(null);
    setImportMeta(null);
  }

  function clearThread() {
    fetchAbortRef.current?.abort();
    setMessages([]);
    setError(null);
    clearImport();
    if (storageKey && typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
  }

  function applyStarter(text: string) {
    setInput(text);
    setError(null);
  }

  const titleClass =
    variant === "page"
      ? "font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
      : "font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50";

  const scrollMax =
    variant === "modal" ? "max-h-[min(340px,38vh)]" : "max-h-[min(420px,55vh)]";

  return (
    <div className={`mx-auto flex w-full flex-col gap-3 ${variant === "page" ? "max-w-xl gap-4" : "min-h-0 flex-1"}`}>
      {variant === "page" ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--accent)]">Marriage View</p>
          <h1 className={titleClass}>Dating coach</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Private guidance for pacing, boundaries, and conversation — not therapy or crisis support.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
            The coach sees your <strong className="font-medium text-zinc-700 dark:text-zinc-400">profile</strong>,{" "}
            <strong className="font-medium text-zinc-700 dark:text-zinc-400">questionnaire answers</strong>, and optional{" "}
            <strong className="font-medium text-zinc-700 dark:text-zinc-400">imported match chat</strong> — only what you
            have saved in Marriage View. It does not browse the app for you.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Context the coach may use">
            <span className="rounded-full border border-zinc-200/80 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Profile
            </span>
            <span className="rounded-full border border-zinc-200/80 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Questionnaire
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                importMeta
                  ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100"
                  : "border-dashed border-zinc-300/80 text-zinc-500 dark:border-zinc-600 dark:text-zinc-500"
              }`}
            >
              {importMeta ? "Imported chat" : "Imported chat (optional)"}
            </span>
          </div>
          {initialMatchId ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              You opened the coach from a match — stay honest and kind to yourself.
            </p>
          ) : null}
        </div>
      ) : null}

      {configured === false ? (
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100 sm:text-sm">
          Add{" "}
          <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">OPENAI_API_KEY</code> to your environment and
          restart.
        </div>
      ) : null}

      {matchImportContext ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={importing || sending || configured === false || !threadHydrated}
            onClick={() => void importAndGetFeedback()}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            {importing ? "Importing…" : "Import chat & get feedback"}
          </button>
          {importMeta ? (
            <>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {importMeta.count} messages in context
              </span>
              <button
                type="button"
                onClick={clearImport}
                className="text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Clear import
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {!messages.length && threadHydrated && variant === "page" ? (
        <div className="flex flex-wrap gap-2">
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={sending || configured === false}
              onClick={() => applyStarter(p)}
              className="rounded-full border border-zinc-200/90 bg-zinc-50/90 px-3 py-1.5 text-left text-xs font-medium text-zinc-700 transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50 dark:border-zinc-700/90 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:border-[var(--accent)]/50"
            >
              {p}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={`flex min-h-0 flex-col rounded-xl border border-zinc-200/80 bg-[var(--surface-elevated)] dark:border-zinc-700/80 ${variant === "modal" ? "flex-1" : ""}`}
      >
        {variant === "modal" ? (
          <p className="border-b border-zinc-200/70 px-3 py-2 text-[10px] leading-snug text-zinc-500 dark:border-zinc-700/70 dark:text-zinc-400 sm:px-4">
            Uses your saved <span className="font-medium text-zinc-600 dark:text-zinc-300">profile</span>,{" "}
            <span className="font-medium text-zinc-600 dark:text-zinc-300">questionnaire</span>, and optional{" "}
            <span className="font-medium text-zinc-600 dark:text-zinc-300">imported chat</span>.
          </p>
        ) : null}
        <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4 ${scrollMax}`}>
          {!messages.length ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {matchImportContext
                ? "Import chat for a one-pass read on tone and next steps, or type your own question. One clear question usually beats a long preamble."
                : "Pick a starter or write your own question. Enter sends; Shift+Enter adds a new line. Small, specific questions get more useful answers."}
            </p>
          ) : (
            messages.map((m, i) => (
              <div
                key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-[var(--accent)] text-white"
                      : "border border-zinc-200/80 bg-zinc-50 text-zinc-800 dark:border-zinc-600/80 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {sending ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
              </span>
              Thinking…
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
        <div className="border-t border-zinc-200/80 p-3 dark:border-zinc-700/80">
          {error ? <p className="mb-2 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
          <textarea
            className="input-focus mb-2 min-h-[72px] w-full resize-y rounded-xl border border-zinc-200 bg-[var(--background)] px-3 py-2 text-sm dark:border-zinc-700 sm:min-h-[88px]"
            placeholder="Message the coach…"
            value={input}
            disabled={sending || importing || !threadHydrated}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={sending || importing || !input.trim() || !threadHydrated}
              onClick={() => void send()}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
            >
              Send
            </button>
            <button
              type="button"
              disabled={!messages.length}
              onClick={clearThread}
              className="rounded-full border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800 sm:px-4"
            >
              Clear chat
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">
            Not quite right? Clear chat and ask again with a bit more context — the coach won’t remember the old thread
            after you clear it.
          </p>
        </div>
      </div>

      {variant === "page" ? (
        <>
          <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">
            If you or someone else is in danger, contact local emergency services. Marriage View cannot monitor chats in
            real time.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/discover" className="text-[var(--accent)] hover:underline">
              ← Discover
            </Link>
            <Link href="/matches" className="text-zinc-600 hover:underline dark:text-zinc-400">
              Matches
            </Link>
            <Link href="/settings" className="text-zinc-600 hover:underline dark:text-zinc-400">
              Settings
            </Link>
          </div>
        </>
      ) : (
        <p className="text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-500">
          Not therapy or crisis care. For emergencies, contact local services.
        </p>
      )}
    </div>
  );
}
