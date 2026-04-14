import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { computeOnboardingProgress } from "@/lib/onboarding-next-step";
import type { ProfileRow } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileMinimal } = await supabase
    .from("profiles")
    .select("onboarding_complete")
    .eq("id", user.id)
    .maybeSingle();

  if (!profileMinimal?.onboarding_complete) {
    let admin;
    try {
      admin = createAdminClient();
    } catch {
      redirect("/onboarding/profile");
    }
    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) {
      redirect("/onboarding/profile");
    }
    const p = profile as ProfileRow;
    const version = p.questionnaire_version;
    const [{ data: qsAll }, { data: ans }] = await Promise.all([
      admin
        .from("questions")
        .select("id, required, sort_order")
        .eq("version", version)
        .order("sort_order", { ascending: true }),
      admin.from("answers").select("question_id").eq("user_id", user.id),
    ]);
    const { nextStep } = computeOnboardingProgress(p, (qsAll ?? []) as { id: string; required: boolean }[], ans ?? []);
    redirect(nextStep?.href ?? "/onboarding/profile");
  }

  redirect("/discover");
}
