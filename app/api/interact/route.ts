import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { interactionHourlyLimitForTier, getUserTier } from "@/lib/entitlements";
import { sendWebPushToUser } from "@/lib/push-notify";
import { underInteractionLimit } from "@/lib/rate-limit";
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
  const toUser = body?.toUser as string | undefined;
  const action = body?.action as "like" | "pass" | undefined;
  if (!toUser || (action !== "like" && action !== "pass")) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (toUser === user.id) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const tier = await getUserTier(admin, user.id);
  const hourlyCap = interactionHourlyLimitForTier(tier);
  const allowed = await underInteractionLimit(admin, user.id, hourlyCap);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again later or upgrade when premium is available." },
      { status: 429 },
    );
  }

  const { error: insErr } = await supabase.from("interactions").insert({
    from_user: user.id,
    to_user: toUser,
    action,
  });

  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true, matched: false });
    }
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  let matched = false;
  let matchId: string | undefined;

  if (action === "like") {
    const a = user.id < toUser ? user.id : toUser;
    const b = user.id < toUser ? toUser : user.id;
    const { data: m } = await admin
      .from("matches")
      .select("id")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();

    if (m?.id) {
      matched = true;
      matchId = m.id as string;
    }
  }

  if (matched && matchId) {
    const chatUrl = `/chat/${matchId}`;
    void sendWebPushToUser(admin, user.id, {
      title: "New match",
      body: "You matched — say hello on Marriage View.",
      url: chatUrl,
    }).catch(() => {});
    void sendWebPushToUser(admin, toUser, {
      title: "New match",
      body: "You matched — say hello on Marriage View.",
      url: chatUrl,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, matched, matchId });
}
