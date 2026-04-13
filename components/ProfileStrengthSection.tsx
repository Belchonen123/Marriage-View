"use client";

import { useEffect, useState } from "react";

export function ProfileStrengthSection() {
  const [percent, setPercent] = useState<number | null>(null);
  const [segments, setSegments] = useState<{ profile: number; questionnaire: number; photos: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/me/onboarding-progress");
      const j = (await res.json().catch(() => null)) as {
        percent?: number;
        segments?: { profile: number; questionnaire: number; photos: number };
      };
      if (cancelled || !res.ok) return;
      setPercent(typeof j.percent === "number" ? j.percent : null);
      setSegments(j.segments ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (percent == null || !segments) {
    return <p className="text-sm text-zinc-500">Loading profile strength…</p>;
  }

  const nudges: string[] = [];
  if (segments.photos < 100) {
    nudges.push("Add more photos — profiles with several clear pictures often get more thoughtful passes.");
  }
  if (segments.profile < 80) {
    nudges.push("Flesh out your profile basics (bio, city) so matches feel they know you faster.");
  }
  if (segments.questionnaire < 70) {
    nudges.push("Finish more questionnaire items — each answer improves explainable match scores.");
  }
  if (!nudges.length) {
    nudges.push("Strong foundation — revisit seasonally as your priorities evolve.");
  }

  const milestones: { key: "profile" | "questionnaire" | "photos"; label: string; outcome: string }[] = [
    {
      key: "profile",
      label: "Profile basics",
      outcome: "Helps matches recognize you quickly and builds trust before a video date.",
    },
    {
      key: "questionnaire",
      label: "Questionnaire",
      outcome: "Powers clearer compatibility and better Discover explanations for you.",
    },
    {
      key: "photos",
      label: "Photos",
      outcome: "Strong photos increase replies and make your card feel real and approachable.",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">Profile strength</span>
        <span className="tabular-nums text-[var(--accent)]">{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-700/80">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3 text-left dark:border-zinc-700/80 dark:bg-zinc-900/40">
        {milestones.map((m) => (
          <li key={m.key} className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {m.label} · {segments[m.key]}%
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500 dark:text-zinc-500">{m.outcome}</span>
          </li>
        ))}
      </ul>
      <ul className="list-inside list-disc space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {nudges.slice(0, 3).map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
