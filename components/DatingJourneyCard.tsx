"use client";

export type DatingJourneyStage = {
  id: string;
  label: string;
  hint: string;
  done: boolean;
};

export function DatingJourneyCard({
  progressPercent,
  stages,
}: {
  progressPercent: number;
  stages: DatingJourneyStage[];
}) {
  const doneCount = stages.filter((s) => s.done).length;

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-gradient-to-b from-zinc-50/90 to-transparent px-3 py-3 dark:border-zinc-700/80 dark:from-zinc-900/50">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Your dating journey</p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        Small steps add up — each reflection ties what you felt to how you want to show up.
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-zinc-500">
        {doneCount} of {stages.length} touchstones — for you, not a scoreboard.
      </p>
      <ul className="mt-3 space-y-2">
        {stages.map((s) => (
          <li key={s.id} className="flex gap-2 text-xs">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                s.done
                  ? "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]"
                  : "border-zinc-300 text-zinc-400 dark:border-zinc-600"
              }`}
              aria-hidden
            >
              {s.done ? "\u2713" : ""}
            </span>
            <div>
              <p className={`font-medium ${s.done ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"}`}>
                {s.label}
              </p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-500">{s.hint}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
