import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPairBlocked } from "@/lib/pair-blocked";
import { sendWebPushToUser } from "@/lib/push-notify";
import { AccessToken } from "livekit-server-sdk";
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
  if (!matchId) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json(
      { error: "LiveKit not configured (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)" },
      { status: 503 },
    );
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

  const ma = match.user_a as string;
  const mb = match.user_b as string;
  if (await isPairBlocked(admin, ma, mb)) {
    return NextResponse.json(
      { error: "Video calls are not available between blocked accounts." },
      { status: 403 },
    );
  }

  const calleeId = ma === user.id ? mb : ma;

  const since = new Date(Date.now() - 45_000).toISOString();
  const { data: recentSig } = await admin
    .from("call_signals")
    .select("id")
    .eq("match_id", matchId)
    .eq("caller_id", user.id)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const callerDisplayName =
    (callerProfile?.display_name as string | null | undefined)?.trim() || "Member";

  if (!recentSig) {
    const { error: sigErr } = await admin.from("call_signals").insert({
      match_id: matchId,
      caller_id: user.id,
      callee_id: calleeId,
    });
    if (sigErr) {
      console.warn("livekit token: call_signals insert:", sigErr.message);
    }
    void sendWebPushToUser(admin, calleeId, {
      type: "call",
      title: `${callerDisplayName} is calling`,
      body: "Video date invitation — tap to join",
      url: `/chat/${matchId}?video=1`,
      tag: `call-${matchId}`,
    }).catch(() => {
      /* fire-and-forget */
    });
  }

  const roomName = `match-${matchId}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: callerDisplayName,
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  const jwt = await token.toJwt();

  return NextResponse.json({
    token: jwt,
    url,
    roomName,
  });
}
