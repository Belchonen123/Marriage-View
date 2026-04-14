import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPairBlocked } from "@/lib/pair-blocked";
import { sendWebPushToUser } from "@/lib/push-notify";
import { underMessageLimit } from "@/lib/rate-limit";
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
  const matchId = body?.matchId as string | undefined;
  const text = body?.body as string | undefined;
  if (!matchId || !text?.trim()) {
    return NextResponse.json({ error: "matchId and body required" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const ok = await underMessageLimit(admin, user.id);
  if (!ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { data: match } = await supabase
    .from("matches")
    .select("id, user_a, user_b")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const ma = match.user_a as string;
  const mb = match.user_b as string;
  if (await isPairBlocked(admin, ma, mb)) {
    return NextResponse.json(
      { error: "Messaging is not available between blocked accounts." },
      { status: 403 },
    );
  }

  const recipientId = ma === user.id ? mb : ma;

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      match_id: matchId,
      sender_id: user.id,
      body: text.trim().slice(0, 4000),
    })
    .select("id, body, sender_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  void sendWebPushToUser(admin, recipientId, {
    title: "New message",
    body: (text.trim().slice(0, 140) || "New message") as string,
    url: `/chat/${matchId}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, message: inserted });
}
