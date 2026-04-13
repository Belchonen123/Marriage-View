import Link from "next/link";

const STEPS = [
  { step: 1 as const, label: "Profile", href: "/onboarding/profile" },
  { step: 2 as const, label: "Questionnaire", href: "/onboarding/quiz" },
  { step: 3 as const, label: "Photos", href: "/onboarding/photos" },
];

export function OnboardingStepper({ current }: { current: 1 | 2 | 3 }) {
  const completedSteps = Math.max(0, current - 1);

  return (
    <nav aria-label="Onboarding steps" className="mb-6 space-y-4">
      <div
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={3}
        aria-label={`Onboarding step ${current} of 3: finish setup to reach Discover and video dates`}
        className="space-y-2"
      >
        <p className="text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Milestones toward your first video date
        </p>
        <div className="flex gap-1.5 sm:gap-2">
          {STEPS.map((s) => {
            const done = current > s.step;
            const active = current === s.step;
            return (
              <div
                key={s.step}
                className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200/90 dark:bg-zinc-700/90"
                title={s.label}
              >
                <div
                  className={`h-full rounded-full transition-[width,opacity,background-color] duration-300 ease-out ${
                    done || active
                      ? "w-full bg-[var(--accent)] shadow-[0_0_0_1px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "w-0 bg-transparent"
                  } ${active && !done ? "opacity-100 ring-2 ring-[var(--accent)]/35 ring-offset-2 ring-offset-[var(--background)] dark:ring-offset-[var(--background)]" : ""}`}
                />
              </div>
            );
          })}
        </div>
        <p className="text-center text-[10px] tabular-nums text-zinc-500 dark:text-zinc-500">
          {completedSteps} of 3 sections complete
        </p>
      </div>

      <ol className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {STEPS.map((s, i) => {
          const done = current > s.step;
          const active = current === s.step;
          return (
            <li key={s.step} className="flex items-center gap-2 sm:gap-3">
              {i > 0 ? (
                <span
                  className={`hidden h-px w-6 transition-colors duration-300 sm:block sm:w-10 ${done ? "bg-[var(--accent)]/50" : "bg-zinc-200 dark:bg-zinc-700"}`}
                  aria-hidden
                />
              ) : null}
              <Link
                href={s.href}
                aria-current={active ? "step" : undefined}
                className={
                  done
                    ? "flex items-center gap-2 rounded-full border border-zinc-200/90 bg-zinc-50/90 py-1.5 pl-2 pr-3 text-xs font-semibold text-zinc-600 shadow-sm outline-none ring-[var(--accent)]/40 transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] focus-visible:ring-2 dark:border-zinc-700/90 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:border-[var(--accent)]/50 dark:hover:text-[var(--accent)]"
                    : active
                      ? "flex items-center gap-2 rounded-full border-2 border-[var(--accent)]/50 bg-[var(--accent-muted)] py-1.5 pl-2 pr-3 text-xs font-semibold text-[var(--accent)] shadow-sm outline-none ring-[var(--accent)]/30 transition hover:border-[var(--accent)]/70 hover:bg-[var(--accent-muted)] focus-visible:ring-2 dark:border-[var(--accent)]/40"
                      : "flex items-center gap-2 rounded-full border border-zinc-200/80 py-1.5 pl-2 pr-3 text-xs font-medium text-zinc-400 shadow-sm outline-none ring-[var(--accent)]/40 transition hover:border-[var(--accent)]/35 hover:text-[var(--accent)] focus-visible:ring-2 dark:border-zinc-700/80 dark:text-zinc-500 dark:hover:border-[var(--accent)]/40 dark:hover:text-[var(--accent)]"
                }
              >
                <span
                  className={
                    done
                      ? "flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent)] transition-transform duration-300"
                      : active
                        ? "flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-md transition-transform duration-300"
                        : "flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-transform duration-300 dark:bg-zinc-800 dark:text-zinc-400"
                  }
                >
                  {done ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span>{s.step}</span>
                  )}
                </span>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
