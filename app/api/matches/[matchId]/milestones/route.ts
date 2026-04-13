import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await ctx.params;

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

  const { data: match, error: mErr } = await admin
    .from("matches")
    .select("id, user_a, user_b")
    .eq("id", matchId)
    .maybeSingle();

  if (mErr || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (match.user_a !== user.id && match.user_b !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: row } = await admin
    .from("match_connection_milestones")
    .select("first_message_at, first_call_at, first_shared_answer_at")
    .eq("match_id", matchId)
    .maybeSingle();

  return NextResponse.json({
    firstMessageAt: row?.first_message_at ?? null,
    firstCallAt: row?.first_call_at ?? null,
    firstSharedAnswerAt: row?.first_shared_answer_at ?? null,
  });
}
