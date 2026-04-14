import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { computeOnboardingProgress } from "@/lib/onboarding-next-step";
import type { ProfileRow } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: profile, error: pErr } = await admin.from("profiles").select("*").eq("id", user.id).single();
  if (pErr || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
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

  const payload = computeOnboardingProgress(
    p,
    (qsAll ?? []) as { id: string; required: boolean }[],
    ans ?? [],
  );

  return NextResponse.json({
    percent: payload.percent,
    segments: payload.segments,
    nextStep: payload.nextStep,
  });
}
