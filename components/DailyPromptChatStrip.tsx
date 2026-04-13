"use client";

import { ICE_BREAKERS_PER_DAY } from "@/lib/daily-prompt";
import { useCallback, useEffect, useState } from "react";

type PromptRes = {
  day: string;
  prompts: string[];
  myAnswers: (string | null)[];
  /** @deprecated */
  prompt?: string;
};

export function DailyPromptChatStrip({ onUseInMessage }: { onUseInMessage: (text: string) => void }) {
  const [data, setData] = useState<PromptRes | null>(null);
  const [slot, setSlot] = useState(0);
  const [drafts, setDrafts] = useState<string[]>(() => Array(ICE_BREAKERS_PER_DAY).fill(""));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const n = data?.prompts.length ?? 0;
  const safeSlot = n > 0 ? Math.min(slot, n - 1) : 0;
  const currentPrompt = data?.prompts[safeSlot] ?? "";
  const draft = drafts[safeSlot] ?? "";

  const setDraftForSlot = useCallback((i: number, text: string) => {
    setDrafts((prev) => {
      const next = [...prev];
      next[i] = text;
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/daily-prompt");
      const json = (await res.json().catch(() => null)) as PromptRes & { error?: string };
      if (cancelled || !res.ok || !json?.prompts?.length) return;
      setData(json);
      setDrafts(
        json.prompts.map((_, i) => (json.myAnswers[i] != null ? String(json.myAnswers[i]) : "")),
      );
      setSlot(0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (n === 0) return;
    if (slot > n - 1) setSlot(n - 1);
  }, [n, slot]);

  async function saveAnswer() {
    if (!draft.trim()) {
      setMsg("Write a short answer first.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/daily-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: draft.trim(), slot: safeSlot }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg((json as { error?: string }).error ?? "Could not save");
        return;
      }
      setMsg("Saved");
      const answer = draft.trim();
      setData((d) =>
        d
          ? {
              ...d,
              myAnswers: d.myAnswers.map((a, i) => (i === safeSlot ? answer : a)),
            }
          : d,
      );
    } finally {
      setSaving(false);
    }
  }

  if (!data || !currentPrompt) return null;

  const myAnswer = data.myAnswers[safeSlot];
  const starter =
    myAnswer || draft.trim()
      ? `Today’s icebreaker: ${currentPrompt}\n\nMy take: ${(myAnswer ?? draft).trim()}`
      : `Today’s icebreaker: ${currentPrompt}`;

  const goPrev = () => setSlot((s) => (s <= 0 ? n - 1 : s - 1));
  const goNext = () => setSlot((s) => (s >= n - 1 ? 0 : s + 1));

  return (
    <details className="group border-t border-zinc-200/80 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200/90 bg-white text-zinc-500 transition group-open:rotate-180 dark:border-zinc-600 dark:bg-zinc-950"
          aria-hidden
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
            Daily icebreaker · {safeSlot + 1}/{n}
          </p>
          <p className="truncate text-xs leading-snug text-zinc-600 dark:text-zinc-400">{currentPrompt}</p>
        </div>
        <span className="shrink-0 text-[10px] font-medium text-zinc-400 group-open:hidden dark:text-zinc-500">
          Open
        </span>
      </summary>
      <div className="space-y-2 border-t border-zinc-200/60 px-3 pb-2.5 pt-1 dark:border-zinc-700/60">
        <p className="text-xs leading-snug text-zinc-700 dark:text-zinc-300">{currentPrompt}</p>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={goPrev}
            className="rounded-md border border-zinc-300 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            aria-label="Previous icebreaker"
          >
            Prev
          </button>
          <span className="px-1 text-[10px] tabular-nums text-zinc-500">
            {safeSlot + 1}/{n}
          </span>
          <button
            type="button"
            onClick={goNext}
            className="rounded-md border border-zinc-300 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            aria-label="Next icebreaker"
          >
            Next
          </button>
        </div>
        <textarea
          className="w-full resize-none rounded-lg border border-zinc-200/90 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          rows={2}
          placeholder="Optional answer — saved to your profile; add to message when ready"
          value={draft}
          onChange={(e) => setDraftForSlot(safeSlot, e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveAnswer()}
            className="rounded-full border border-zinc-300 px-3 py-1 text-[11px] font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => onUseInMessage(starter)}
            className="rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-semibold text-white"
          >
            Add to message
          </button>
          {msg ? (
            <span className="text-[10px] text-zinc-500" role="status">
              {msg}
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}
