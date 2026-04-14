import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { viewerIcebreakerSnippets } from "@/lib/icebreaker-answers";
import { isAdminSuspended } from "@/lib/profile-suspension";
import type { ProfileRow, ViewerProfile } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId: targetId } = await ctx.params;
  if (!targetId || !uuidRe.test(targetId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.id === targetId) {
    return NextResponse.json({ error: "Use your own profile settings" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId");
  if (matchId && uuidRe.test(matchId)) {
    const { data: match, error: mErr } = await admin
      .from("matches")
      .select("user_a, user_b")
      .eq("id", matchId)
      .maybeSingle();
    if (mErr || !match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const a = match.user_a as string;
    const b = match.user_b as string;
    if ((a !== user.id && b !== user.id) || (a !== targetId && b !== targetId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const [{ data: blockedByMe }, { data: blockedMe }] = await Promise.all([
    admin.from("blocks").select("id").eq("blocker_id", user.id).eq("blocked_id", targetId).maybeSingle(),
    admin.from("blocks").select("id").eq("blocker_id", targetId).eq("blocked_id", user.id).maybeSingle(),
  ]);

  if (blockedByMe || blockedMe) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: row, error: pErr } = await admin.from("profiles").select("*").eq("id", targetId).maybeSingle();

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 400 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const p = row as ProfileRow;
  if (!p.onboarding_complete) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const snippets = viewerIcebreakerSnippets(p.icebreaker_answers, 12);

  const dto: ViewerProfile = {
    id: p.id,
    display_name: p.display_name,
    birth_year: p.birth_year,
    city: p.city,
    bio: p.bio ?? "",
    gender: p.gender,
    seeking: p.seeking,
    age_min: p.age_min,
    age_max: p.age_max,
    max_distance_km: p.max_distance_km,
    photo_urls: Array.isArray(p.photo_urls) ? p.photo_urls.filter((u): u is string => typeof u === "string") : [],
    photo_verified: p.photo_verification_status === "verified",
    questionnaire_version: p.questionnaire_version,
    ...(snippets.length > 0 ? { icebreaker_snippets: snippets } : {}),
  };

  return NextResponse.json(dto);
}
