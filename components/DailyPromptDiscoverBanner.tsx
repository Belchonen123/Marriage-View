"use client";

import { ICE_BREAKERS_PER_DAY } from "@/lib/daily-prompt";
import { useEffect, useState } from "react";

export function DailyPromptDiscoverBanner() {
  const [prompts, setPrompts] = useState<string[]>([]);
  const [slot, setSlot] = useState(0);
  const [myAnswers, setMyAnswers] = useState<(string | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/daily-prompt");
      const j = (await res.json().catch(() => null)) as {
        prompts?: string[];
        myAnswers?: (string | null)[];
        prompt?: string;
      };
      if (cancelled || !res.ok) return;
      const list = j?.prompts?.length
        ? j.prompts
        : j?.prompt
          ? [j.prompt]
          : [];
      if (!list.length) return;
      setPrompts(list);
      setMyAnswers(list.map((_, i) => j.myAnswers?.[i] ?? null));
      setSlot(0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const n = prompts.length;
  const safeSlot = n > 0 ? Math.min(slot, n - 1) : 0;
  const prompt = prompts[safeSlot];
  const answeredCount = myAnswers.filter(Boolean).length;
  const answeredThis = Boolean(myAnswers[safeSlot]);

  if (!prompt) return null;

  const goPrev = () => setSlot((s) => (s <= 0 ? n - 1 : s - 1));
  const goNext = () => setSlot((s) => (s >= n - 1 ? 0 : s + 1));

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-4 py-3 text-left dark:border-zinc-700/80 dark:bg-zinc-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
          Today&apos;s icebreakers
        </p>
        {n > 1 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
              aria-label="Previous icebreaker"
            >
              Prev
            </button>
            <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
              {safeSlot + 1} / {n}
            </span>
            <button
              type="button"
              onClick={goNext}
              className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
              aria-label="Next icebreaker"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">{prompt}</p>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        {n >= ICE_BREAKERS_PER_DAY
          ? `${ICE_BREAKERS_PER_DAY} fresh prompts today — use Prev / Next to browse.`
          : `${n} prompt${n === 1 ? "" : "s"} today.`}{" "}
        {answeredCount > 0
          ? answeredThis
            ? "This one is saved — open any chat to drop it into the composer with “Add to message.”"
            : `${answeredCount} saved — answer more in chat if you like.`
          : "Answer in chat (any match) or share when you’re ready — great openers."}
      </p>
    </div>
  );
}
