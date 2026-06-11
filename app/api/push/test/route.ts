import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendWebPushToUser } from "@/lib/push-notify";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Fires a self-test push to the calling user. Returns a diagnostic JSON so
 * a phone hitting this can see exactly why push isn't firing (VAPID missing,
 * no subscriptions, etc.) without having to inspect server logs.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured (admin)." }, { status: 500 });
  }

  const vapidConfigured =
    Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) &&
    Boolean(process.env.VAPID_PRIVATE_KEY);

  const { count, error: countErr } = await admin
    .from("push_subscriptions")
    .select("endpoint", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countErr) {
    return NextResponse.json(
      { ok: false, vapidConfigured, subscriptions: 0, error: countErr.message },
      { status: 500 },
    );
  }

  if (!vapidConfigured) {
    return NextResponse.json({
      ok: false,
      vapidConfigured: false,
      subscriptions: count ?? 0,
      message:
        "Server VAPID keys are missing. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT on Vercel and redeploy.",
    });
  }

  if (!count) {
    return NextResponse.json({
      ok: false,
      vapidConfigured: true,
      subscriptions: 0,
      message:
        "No push subscription saved for this user yet. Tap Enable to subscribe first.",
    });
  }

  await sendWebPushToUser(admin, user.id, {
    type: "message",
    title: "Marriage View test",
    body: "If you see this, push works. ✅",
    url: "/matches",
    tag: "mv-test",
  });

  return NextResponse.json({
    ok: true,
    vapidConfigured: true,
    subscriptions: count,
    message: "Test push fired. Look for the system notification.",
  });
}
