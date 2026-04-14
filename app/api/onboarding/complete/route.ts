import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuestionRow } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "No profile" }, { status: 400 });
  }

  if (!profile.display_name?.trim() || !profile.birth_year) {
    return NextResponse.json(
      { error: "Display name and birth year required" },
      { status: 400 },
    );
  }

  const urls = (profile.photo_urls as string[]) ?? [];
  if (urls.length < 1) {
    return NextResponse.json({ error: "Add at least one photo" }, { status: 400 });
  }

  const version = profile.questionnaire_version as number;
  const { data: qs } = await admin
    .from("questions")
    .select("*")
    .eq("version", version)
    .order("sort_order", { ascending: true });

  const questions = (qs ?? []) as QuestionRow[];
  const required = questions.filter((q) => q.required);

  const { data: ans } = await admin
    .from("answers")
    .select("question_id")
    .eq("user_id", user.id);

  const answered = new Set((ans ?? []).map((a) => a.question_id as string));
  for (const q of required) {
    if (!answered.has(q.id)) {
      return NextResponse.json(
        { error: `Missing answer: ${q.prompt}` },
        { status: 400 },
      );
    }
  }

  const gender = profile.gender as string | null;
  if (gender !== "woman" && gender !== "man") {
    return NextResponse.json(
      {
        error:
          "Choose your gender (woman or man) on your profile step and save before finishing onboarding. Who you seek is set automatically to the opposite gender.",
      },
      { status: 400 },
    );
  }
  const seeking = gender === "woman" ? "man" : "woman";

  const { error } = await admin
    .from("profiles")
    .update({
      onboarding_complete: true,
      seeking,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
