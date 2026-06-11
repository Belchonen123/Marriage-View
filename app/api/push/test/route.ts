import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import webpush from "web-push";

export const dynamic = "force-dynamic";

/**
 * Fires a self-test push to the calling user and returns rich diagnostics
 * (per-subscription success/failure) so we can debug push from the phone
 * without server-log access.
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

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:support@example.com";
  const vapidConfigured = Boolean(publicKey && privateKey);

  const { data: subs, error: subsErr } = await admin
    .from("push_subscriptions")
    .select("endpoint, subscription")
    .eq("user_id", user.id);

  if (subsErr) {
    return NextResponse.json(
      { ok: false, vapidConfigured, subscriptions: 0, error: subsErr.message },
      { status: 500 },
    );
  }

  if (!vapidConfigured) {
    return NextResponse.json({
      ok: false,
      vapidConfigured: false,
      subscriptions: subs?.length ?? 0,
      vapidPublicHint: null,
      message:
        "Server VAPID keys are missing. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT on Vercel and redeploy.",
    });
  }

  if (!subs || subs.length === 0) {
    return NextResponse.json({
      ok: false,
      vapidConfigured: true,
      subscriptions: 0,
      vapidPublicHint: publicKey?.slice(0, 12) ?? null,
      message:
        "No push subscription saved for this user yet. Reload this page (the app will auto-subscribe) or tap Enable to subscribe first.",
    });
  }

  webpush.setVapidDetails(subject, publicKey!, privateKey!);

  const payload = JSON.stringify({
    title: "Marriage View test",
    body: "If you see this, push works. ✅",
    url: "/matches",
    type: "message",
    tag: "mv-test",
  });

  type Result = { endpoint: string; ok: boolean; statusCode?: number; error?: string };
  const results: Result[] = [];

  for (const row of subs) {
    const sub = row.subscription as webpush.PushSubscription;
    const endpoint = (row.endpoint as string).slice(0, 80) + "…";
    try {
      const r = await webpush.sendNotification(sub, payload, { TTL: 60 });
      results.push({ endpoint, ok: true, statusCode: r.statusCode });
    } catch (e) {
      const err = e as { statusCode?: number; body?: string; message?: string };
      const code = err.statusCode ?? 0;
      const errorText = err.message ?? err.body ?? "send failed";
      results.push({ endpoint, ok: false, statusCode: code, error: errorText });
      if (code === 404 || code === 410) {
        await admin
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", row.endpoint as string);
      }
    }
  }

  const anyOk = results.some((r) => r.ok);

  return NextResponse.json({
    ok: anyOk,
    vapidConfigured: true,
    subscriptions: subs.length,
    vapidPublicHint: publicKey?.slice(0, 12) ?? null,
    results,
    message: anyOk
      ? "Test push fired. Look for the system notification."
      : "Push attempted but every subscription failed. Re-enable from the prompt below.",
  });
}
