"use client";

import { useEffect, useState } from "react";

type MilestonePayload = {
  firstMessageAt: string | null;
  firstCallAt: string | null;
  firstSharedAnswerAt: string | null;
};

type JournalRow = { focus_areas?: string[] | null };

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MatchMilestonesTimeline({ matchId }: { matchId: string }) {
  const [data, setData] = useState<MilestonePayload | null>(null);
  const [journalCount, setJournalCount] = useState<number | null>(null);
  const [purposefulInMatch, setPurposefulInMatch] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/matches/${matchId}/milestones`);
      const json = (await res.json().catch(() => null)) as MilestonePayload & { error?: string };
      if (cancelled || !res.ok) return;
      setData(json);
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/matches/${matchId}/journal`);
      const json = (await res.json().catch(() => null)) as { items?: JournalRow[] } | null;
      if (cancelled || !res.ok) return;
      const rows = Array.isArray(json?.items) ? json!.items! : [];
      setJournalCount(rows.length);
      setPurposefulInMatch(rows.filter((r) => (r.focus_areas?.length ?? 0) > 0).length);
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (!data) return null;

  const steps = [
    { label: "First message", at: data.firstMessageAt },
    { label: "First video signal", at: data.firstCallAt },
    { label: "First shared quiz answer", at: data.firstSharedAnswerAt },
  ];

  const any =
    steps.some((s) => s.at) ||
    (journalCount != null && journalCount > 0) ||
    (purposefulInMatch != null && purposefulInMatch > 0);
  if (!any) {
    return (
      <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-xs text-zinc-600 dark:border-zinc-700/80 dark:bg-zinc-900/50 dark:text-zinc-400">
        Your connection story will fill in as you message, start a video date, and overlap on questionnaire answers.
        <span className="mt-2 block">Reflections you add after calls stay private and build your sense of progress.</span>
      </div>
    );
  }

  const reflectionLabel =
    journalCount != null && journalCount > 0
      ? `${journalCount} reflection${journalCount === 1 ? "" : "s"}`
      : "—";
  const purposefulLabel =
    purposefulInMatch != null && purposefulInMatch > 0
      ? `${purposefulInMatch} with intentional prompts`
      : "—";

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-[var(--surface-elevated)] px-4 py-3 dark:border-zinc-700/80">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Your story</p>
      <ul className="mt-2 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        {steps.map((s) => (
          <li key={s.label} className="flex justify-between gap-3">
            <span>{s.label}</span>
            <span className="shrink-0 tabular-nums text-xs text-zinc-500">{formatWhen(s.at)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <span>Reflections (private)</span>
          <span className="shrink-0 text-xs text-zinc-500">{reflectionLabel}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>Purposeful prompts</span>
          <span className="shrink-0 text-xs text-zinc-500">{purposefulLabel}</span>
        </li>
      </ul>
    </div>
  );
}
