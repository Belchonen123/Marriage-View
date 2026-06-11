"use client";

import { urlBase64ToUint8Array } from "@/lib/vapid";
import { setPushDesired } from "@/lib/notification-prefs";
import { useEffect, useState } from "react";

const SESSION_HIDE_KEY = "mv:call-alerts-prompt-hidden-this-session";

function vapidPublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}

/**
 * Aggressive call-alerts prompt. Mounts globally on every signed-in page.
 *
 * Visible whenever ALL of:
 *   - browser supports notifications + service workers
 *   - server has a VAPID public key set
 *   - browser permission is "default" (we haven't asked yet, or user dismissed permission prompt)
 *   - user hasn't tapped "Not now" THIS session
 *
 * After "Not now" we hide only for the current session (sessionStorage), not forever.
 * After "Don't allow" in the browser permission dialog we stop forever, per spec.
 *
 * Style: pinned to the bottom of the viewport, hard to miss.
 */
export function CallAlertsPrompt() {
  const [visible, setVisible] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (typeof Notification === "undefined") return;
    if (!vapidPublicKey()) return;
    if (Notification.permission !== "default") return;
    try {
      if (sessionStorage.getItem(SESSION_HIDE_KEY) === "1") return;
    } catch {
      /* private mode */
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(SESSION_HIDE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const enable = async () => {
    setError(null);
    setWorking(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        if (perm === "denied") {
          // Browser will never re-prompt; stop bothering the user.
          setPushDesired(false);
        }
        setVisible(false);
        return;
      }
      const vapid = vapidPublicKey();
      if (!vapid) {
        setError("Push isn't configured on the server.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        setError("Couldn't save your subscription. Try again.");
        return;
      }
      setPushDesired(true);
      setVisible(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't enable call alerts.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[80] flex justify-center px-3 sm:bottom-6">
      <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-rose-200/80 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-rose-900/40 dark:bg-zinc-900/95">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>🔔</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Get rung for messages & calls
            </p>
            <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
              Marriage View won&apos;t work for you without this.
            </p>
            {error ? (
              <p className="mt-1 truncate text-xs text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void enable()}
            disabled={working}
            className="shrink-0 rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-800 disabled:opacity-60"
          >
            {working ? "…" : "Enable"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-2 text-sm opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export default CallAlertsPrompt;
