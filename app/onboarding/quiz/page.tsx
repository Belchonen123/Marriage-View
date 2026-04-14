import { QuizForm } from "@/components/QuizForm";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function OnboardingQuizPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { q: focusQuestionId } = await searchParams;

  const { data: profile } = await supabase
    .from("profiles")
    .select("questionnaire_version")
    .eq("id", user.id)
    .single();

  const version = profile?.questionnaire_version ?? 1;

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Questionnaire
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          The first questions (marked with *) are required to unlock Discover. Everything else is optional—answer when you
          can; it only improves matching. You can revisit anytime.
        </p>
        <div className="mt-4 flex justify-between gap-4 text-sm">
          <Link
            href="/onboarding/profile"
            className="font-medium text-[var(--accent)] underline-offset-4 hover:underline"
          >
            ← Profile
          </Link>
          <Link
            href="/onboarding/photos"
            className="font-medium text-[var(--accent)] underline-offset-4 hover:underline"
          >
            Photos →
          </Link>
        </div>
      </div>
      <QuizForm version={version} initialQuestionId={focusQuestionId ?? null} />
    </div>
  );
}
