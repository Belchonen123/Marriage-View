import { buildPersonalityRevealLines } from "@/lib/personality-reveal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { QuestionRow } from "@/lib/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function OnboardingRevealPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    redirect("/discover");
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("onboarding_complete, questionnaire_version")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarding_complete) {
    redirect("/onboarding/photos");
  }

  const version = (profile.questionnaire_version as number) ?? 1;

  const [{ data: qs }, { data: ans }] = await Promise.all([
    admin.from("questions").select("*").eq("version", version).order("sort_order", { ascending: true }),
    admin.from("answers").select("question_id, value").eq("user_id", user.id),
  ]);

  const questions = (qs ?? []) as QuestionRow[];
  const answers: Record<string, unknown> = {};
  for (const row of ans ?? []) {
    answers[row.question_id as string] = row.value;
  }

  const lines = buildPersonalityRevealLines(questions, answers);

  return (
    <div className="mx-auto max-w-lg space-y-8 pb-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">You&apos;re in</p>
        <h1 className="font-display mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Your story so far
        </h1>
      </div>
      <div className="card-surface motion-card space-y-4 border border-zinc-200/80 p-6 dark:border-zinc-700/80">
        {lines.map((line, i) => (
          <p key={i} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {line}
          </p>
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/discover"
          className="cta-video-primary motion-tap inline-flex min-h-11 items-center justify-center px-6 py-3 text-sm no-underline"
        >
          Enter Discover
        </Link>
        <Link
          href="/onboarding/quiz"
          className="motion-tap inline-flex justify-center rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-800 transition dark:border-zinc-600 dark:text-zinc-200"
        >
          Refine questionnaire
        </Link>
      </div>
    </div>
  );
}
