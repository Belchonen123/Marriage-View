"use client";

import { ChatThreadSkeleton } from "@/components/Skeletons";
import { EmptyState } from "@/components/EmptyState";
import type { CommonAnswersPayload } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export function MatchCommonGround({
  matchId,
  otherName,
}: {
  matchId: string;
  otherName: string;
}) {
  const [data, setData] = useState<CommonAnswersPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/matches/${matchId}/common-answers`);
      const json = (await res.json().catch(() => null)) as CommonAnswersPayload & { error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setError(json?.error ?? "Could not load shared answers");
        setData(null);
      } else {
        setData(json as CommonAnswersPayload);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (loading) {
    return <ChatThreadSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-red-200/90 bg-red-50/80 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
        {error}
      </div>
    );
  }

  const payload = data!;
  const { items, versionMismatch, versionSelf, versionOther } = payload;

  return (
    <div className="flex h-[min(70vh,640px)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-zinc-200/90 bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] dark:border-zinc-700/90 dark:shadow-[var(--shadow-card-dark)]">
      {versionMismatch ? (
        <div className="border-b border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/35 dark:text-amber-100">
          Your questionnaire is <strong className="font-semibold">v{versionSelf}</strong>; {otherName} is on{" "}
          <strong className="font-semibold">v{versionOther}</strong>. This list uses <strong className="font-semibold">your</strong>{" "}
          prompts—both of you still need an answer for a row to appear.
        </div>
      ) : null}
      <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[200px] items-center justify-center px-2">
            <EmptyState
              title="No exact matches yet"
              description="When you and your match pick the same answers on the questionnaire, they show up here automatically. Finish more questions or ask them to update theirs."
            >
              <Link
                href="/onboarding/quiz"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Review questionnaire
              </Link>
            </EmptyState>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((row) => (
              <li
                key={row.questionId}
                className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-700/80 dark:bg-zinc-800/50"
              >
                {row.section ? (
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">{row.section}</p>
                ) : null}
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{row.prompt}</p>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <span className="text-zinc-500 dark:text-zinc-400">You both answered: </span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-100">{row.agreedLabel}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
