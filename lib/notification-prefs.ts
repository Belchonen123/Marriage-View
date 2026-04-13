import { urlBase64ToUint8Array } from "@/lib/vapid";

const KEYS = {
  initialized: "nexus_notification_prefs_initialized",
  sound: "nexus_sound_enabled",
  desktopDesired: "nexus_desktop_notifications_desired",
  pushDesired: "nexus_push_desired",
} as const;

/** One-time defaults: sounds + alerts opt-in (user can turn off in Settings). */
export function primeNotificationOptInDefaults() {
  try {
    if (localStorage.getItem(KEYS.initialized) === "1") return;
    localStorage.setItem(KEYS.sound, "1");
    localStorage.setItem(KEYS.desktopDesired, "1");
    localStorage.setItem(KEYS.pushDesired, "1");
    localStorage.setItem(KEYS.initialized, "1");
  } catch {
    /* private mode / blocked */
  }
}

/**
 * Call synchronously from a button/submit handler before any `await` so the browser
 * may treat notification permission as user-gesture driven.
 */
export function primeNotificationOptInFromUserGesture() {
  primeNotificationOptInDefaults();
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    /* ignore */
  }
}

export function isSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem(KEYS.sound);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEYS.sound, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function isDesktopNotificationDesired(): boolean {
  try {
    const v = localStorage.getItem(KEYS.desktopDesired);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export function setDesktopNotificationDesired(on: boolean) {
  try {
    localStorage.setItem(KEYS.desktopDesired, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function isPushDesired(): boolean {
  try {
    const v = localStorage.getItem(KEYS.pushDesired);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export function setPushDesired(on: boolean) {
  try {
    localStorage.setItem(KEYS.pushDesired, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** After login, register push if permission already granted and user opted in. */
export async function maybeRegisterWebPushAfterLogin(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isPushDesired()) return;
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
  } catch {
    /* ignore — optional */
  }
}
