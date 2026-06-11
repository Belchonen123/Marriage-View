import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const matchId = (body?.matchId as string | undefined)?.trim();
  const event = (body?.event as string | undefined)?.trim();
  if (!matchId || !event) {
    return NextResponse.json({ error: "matchId and event required" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: match } = await admin
    .from("matches")
    .select("id, user_a, user_b")
    .eq("id", matchId)
    .maybeSingle();

  if (!match || (match.user_a !== user.id && match.user_b !== user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const detail = body?.detail ?? null;

  await admin.from("call_events").insert({
    match_id: matchId,
    user_id: user.id,
    event,
    detail: detail && typeof detail === "object" ? detail : null,
  });

  return NextResponse.json({ ok: true });
}
