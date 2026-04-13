"use client";

import { useEffect, useState } from "react";

export function OnboardingAggregateProgress() {
  const [percent, setPercent] = useState<number | null>(null);
  const [segments, setSegments] = useState<{ profile: number; questionnaire: number; photos: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/me/onboarding-progress");
      const data = await res.json().catch(() => null);
      if (cancelled || !res.ok || typeof data?.percent !== "number") return;
      setPercent(data.percent);
      setSegments(
        data.segments && typeof data.segments === "object"
          ? (data.segments as { profile: number; questionnaire: number; photos: number })
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (percent == null) {
    return <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-700/80" aria-hidden />;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <span>Overall onboarding</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <p className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-500">
        Every step brings you closer to <strong className="font-medium text-zinc-800 dark:text-zinc-300">Discover</strong>{" "}
        and your first <strong className="font-medium text-zinc-800 dark:text-zinc-300">video date</strong>.
      </p>
      {segments ? (
        <ul className="space-y-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-500">
          <li>
            <strong className="text-zinc-700 dark:text-zinc-400">Basics {segments.profile}%</strong> — clearer profile,
            faster trust on your card.
          </li>
          <li>
            <strong className="text-zinc-700 dark:text-zinc-400">Quiz {segments.questionnaire}%</strong> — better match
            stories and ranking.
          </li>
          <li>
            <strong className="text-zinc-700 dark:text-zinc-400">Photos {segments.photos}%</strong> — more passes and
            replies when you look like yourself.
          </li>
        </ul>
      ) : null}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-700/80"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
