import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return Boolean(process.env.VAPID_PRIVATE_KEY);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:support@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

type PushPayload = { title: string; body: string; url: string };

/**
 * Fire-and-forget web push for all subscriptions of a user. No-op if VAPID not configured.
 */
export async function sendWebPushToUser(admin: SupabaseClient, userId: string, payload: PushPayload) {
  if (!ensureVapid()) return;

  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, subscription")
    .eq("user_id", userId);

  if (error || !rows?.length) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });

  for (const row of rows) {
    const sub = row.subscription as webpush.PushSubscription;
    try {
      await webpush.sendNotification(sub, body, { TTL: 3600 });
    } catch (e: unknown) {
      const status = typeof e === "object" && e !== null && "statusCode" in e ? (e as { statusCode: number }).statusCode : 0;
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", row.endpoint as string);
      }
    }
  }
}
