import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** RoomServiceClient expects https:// host; client uses wss:// for WebRTC. */
function livekitServiceHost(url: string): string {
  const u = url.trim();
  if (u.startsWith("wss://")) return `https://${u.slice(6)}`;
  if (u.startsWith("ws://")) return `http://${u.slice(5)}`;
  return u;
}

export async function GET(req: Request) {
  const urlObj = new URL(req.url);
  const matchId = urlObj.searchParams.get("matchId")?.trim();
  if (!matchId) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json({
      participantCount: 0,
      hasRemote: false,
      configured: false,
    });
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

  const roomName = `match-${matchId}`;
  const host = livekitServiceHost(livekitUrl);

  try {
    const svc = new RoomServiceClient(host, apiKey, apiSecret);
    const participants = await svc.listParticipants(roomName);
    const participantCount = participants.length;
    const hasRemote = participants.some((p) => p.identity !== user.id);
    return NextResponse.json({
      participantCount,
      hasRemote,
      configured: true,
    });
  } catch {
    return NextResponse.json({
      participantCount: 0,
      hasRemote: false,
      configured: true,
    });
  }
}
