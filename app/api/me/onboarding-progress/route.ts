import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { profileCompletenessRatio } from "@/lib/matching/score";
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

  const [{ data: qs }, { data: ans }] = await Promise.all([
    admin.from("questions").select("id").eq("version", version),
    admin.from("answers").select("question_id").eq("user_id", user.id),
  ]);

  const totalQ = (qs ?? []).length || 1;
  const answered = new Set((ans ?? []).map((r) => r.question_id as string)).size;
  const quizRatio = answered / totalQ;
  const profRatio = profileCompletenessRatio(p);
  const photoN = (p.photo_urls ?? []).length;
  const photoRatio = Math.min(1, photoN / 3);

  const percent = Math.min(
    100,
    Math.round(100 * (profRatio * 0.35 + quizRatio * 0.45 + photoRatio * 0.2)),
  );

  return NextResponse.json({
    percent,
    segments: {
      profile: Math.round(profRatio * 100),
      questionnaire: Math.round(quizRatio * 100),
      photos: Math.round(photoRatio * 100),
    },
  });
}
