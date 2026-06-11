import { urlBase64ToUint8Array } from "@/lib/vapid";

/**
 * Self-heal the user's push subscription. Idempotent, safe to call on every
 * page load. Handles three real-world failure modes:
 *
 *   - Permission was granted but no PushSubscription exists (rare, but
 *     happens after browser data cleanup or VAPID key rotation).
 *   - A PushSubscription exists but is bound to a stale VAPID public key
 *     (the case after we rotated keys). We unsubscribe + re-subscribe with
 *     the current key.
 *   - A new browser/device that needs the subscription saved server-side.
 *
 * Does nothing when permission isn't granted, when service workers aren't
 * available, or when no VAPID public key is configured.
 *
 * Returns the action taken so callers can show a status if they want.
 */
export type PushReconcileAction =
  | "noop"
  | "unsupported"
  | "no-permission"
  | "no-vapid"
  | "saved-existing"
  | "rotated-key"
  | "fresh-subscribed";

const SESSION_FLAG = "mv:push-reconciled-this-session";

export async function reconcilePushSubscription(): Promise<PushReconcileAction> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "granted") return "no-permission";

  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return "no-vapid";

  // Only run the heavy path once per session — re-checks via this lib on every
  // page render would burn cycles. Override by clearing sessionStorage.
  try {
    if (sessionStorage.getItem(SESSION_FLAG) === "1") return "noop";
  } catch {
    /* private mode */
  }

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const applicationServerKey = urlBase64ToUint8Array(vapid) as BufferSource;

  const existing = await reg.pushManager.getSubscription();
  const currentKeyBytes = new Uint8Array(applicationServerKey as ArrayBuffer);

  if (existing) {
    // Compare existing subscription's serverKey with the current VAPID. If
    // they differ, the subscription is bound to an old key and the server
    // can't send to it — recycle.
    const subOpts = existing.options as unknown as {
      applicationServerKey?: ArrayBuffer | null;
    };
    const existingKey =
      subOpts.applicationServerKey instanceof ArrayBuffer
        ? new Uint8Array(subOpts.applicationServerKey)
        : null;

    const keysMatch =
      existingKey != null &&
      existingKey.length === currentKeyBytes.length &&
      existingKey.every((b, i) => b === currentKeyBytes[i]);

    if (keysMatch) {
      // Re-POST to /api/push/subscribe so the server has the latest
      // endpoint in its push_subscriptions table even if cleared.
      try {
        await fetch("/api/push/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: existing.toJSON() }),
        });
      } catch {
        /* best-effort */
      }
      try {
        sessionStorage.setItem(SESSION_FLAG, "1");
      } catch {
        /* ignore */
      }
      return "saved-existing";
    }

    // Stale key — kill old subscription and create a new one.
    try {
      await existing.unsubscribe();
    } catch {
      /* ignore */
    }
    const fresh = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: fresh.toJSON() }),
    });
    try {
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      /* ignore */
    }
    return "rotated-key";
  }

  // Permission granted but no subscription — subscribe fresh.
  const fresh = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
  await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: fresh.toJSON() }),
  });
  try {
    sessionStorage.setItem(SESSION_FLAG, "1");
  } catch {
    /* ignore */
  }
  return "fresh-subscribed";
}
