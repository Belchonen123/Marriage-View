"use client";

import { urlBase64ToUint8Array } from "@/lib/vapid";
import { isPushDesired, setPushDesired } from "@/lib/notification-prefs";
import { useEffect, useState } from "react";

const DISMISS_KEY = "mv:call-alerts-prompt-dismissed";

function vapidPublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}

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
    if (!isPushDesired()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* private mode */
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
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
        // Never re-prompt after denial.
        if (perm === "denied") {
          setPushDesired(false);
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
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
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
      setVisible(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't enable call alerts.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-4 dark:border-rose-900/40 dark:bg-rose-950/30">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>🔔</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-rose-900 dark:text-rose-100">
            Get rung when a match calls you
          </p>
          <p className="mt-1 text-xs text-rose-900/80 dark:text-rose-100/80">
            Enable call alerts so your phone rings even when Marriage View is closed.
          </p>
          {error ? (
            <p className="mt-2 text-xs text-red-700 dark:text-red-300" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void enable()}
            disabled={working}
            className="rounded-full bg-rose-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-800 disabled:opacity-60"
          >
            {working ? "Enabling…" : "Enable"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full border border-rose-300 px-3 py-2 text-xs font-medium text-rose-900 dark:border-rose-800/60 dark:text-rose-100"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

export default CallAlertsPrompt;
