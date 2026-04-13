import { normalizeFocusAreas } from "@/lib/journal-focus-areas";
import { userInMatch } from "@/lib/match-guards";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MOODS = new Set(["great", "good", "neutral", "unsure", "not_a_fit"]);
const NOTE_MAX = 2000;

export async function GET(_req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userInMatch(supabase, matchId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("match_journal_entries")
    .select("id, mood, note, call_occurred_at, created_at, focus_areas")
    .eq("match_id", matchId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userInMatch(supabase, matchId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const mood = body?.mood as string | undefined;
  let note = typeof body?.note === "string" ? body.note.trim() : "";
  const callOccurredAt =
    typeof body?.call_occurred_at === "string" && body.call_occurred_at.trim()
      ? body.call_occurred_at.trim()
      : null;
  const focusAreas = normalizeFocusAreas(body?.focus_areas);

  if (!mood || !MOODS.has(mood)) {
    return NextResponse.json(
      { error: "mood required: great | good | neutral | unsure | not_a_fit" },
      { status: 400 },
    );
  }
  if (note.length > NOTE_MAX) {
    return NextResponse.json({ error: `note at most ${NOTE_MAX} characters` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("match_journal_entries")
    .insert({
      user_id: user.id,
      match_id: matchId,
      mood,
      note,
      call_occurred_at: callOccurredAt,
      focus_areas: focusAreas,
    })
    .select("id, mood, note, call_occurred_at, created_at, focus_areas")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ item: data });
}
