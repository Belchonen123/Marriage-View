"use client";

import { OnboardingAggregateProgress } from "@/components/OnboardingAggregateProgress";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { usePathname } from "next/navigation";

function stepFromPath(pathname: string | null): 1 | 2 | 3 {
  if (!pathname) return 1;
  if (pathname.includes("/onboarding/quiz")) return 2;
  if (pathname.includes("/onboarding/photos")) return 3;
  return 1;
}

export function OnboardingChrome() {
  const pathname = usePathname();
  if (pathname === "/onboarding/reveal" || pathname?.endsWith("/onboarding/reveal")) {
    return null;
  }

  const current = stepFromPath(pathname);

  return (
    <header className="mb-8 space-y-5 border-b border-zinc-200/70 pb-6 dark:border-zinc-800/80">
      <div className="text-center sm:text-left">
        <p className="font-display text-xs font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
          Marriage View
        </p>
        <h2 className="mt-2 font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-xl">
          Built for intention—not endless texting
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          A short setup unlocks thoughtful matching. Then you&apos;ll use light chat to coordinate and meet on a real{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">video date</strong>—that&apos;s the point of
          the app.
        </p>
      </div>
      <OnboardingAggregateProgress />
      <OnboardingStepper current={current} />
    </header>
  );
}
