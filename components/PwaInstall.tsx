"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "mv:pwa-install-dismissed-at";
const DISMISS_DAYS = 7;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari
    window.navigator?.standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function recentlyDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const at = Number(v);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function PwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const url = "/sw.js";
      navigator.serviceWorker
        .register(url, { scope: "/" })
        .catch(() => {
          /* ignore */
        });
    }
  }, []);

  useEffect(() => {
    if (isStandalone()) return;
    if (recentlyDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (isIos()) {
      const t = window.setTimeout(() => setVisible(true), 1200);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setVisible(false);
    setShowIosHelp(false);
  };

  const install = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } catch {
        /* ignore */
      }
      setDeferred(null);
      setVisible(false);
      return;
    }
    if (isIos()) {
      setShowIosHelp(true);
      return;
    }
    setVisible(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[60] flex justify-center px-3 sm:bottom-6">
      <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-rose-200/70 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-rose-900/40 dark:bg-zinc-900/95">
        <div className="flex items-center gap-3">
          <img
            src="/icon-192.png"
            alt=""
            className="h-10 w-10 rounded-xl"
            width={40}
            height={40}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              Install Marriage View
            </div>
            <div className="truncate text-xs opacity-70">
              Add to your home screen for the full app experience.
            </div>
          </div>
          <button
            type="button"
            onClick={install}
            className="rounded-full bg-rose-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-800"
          >
            Download
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="rounded-full p-2 text-sm opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
        {showIosHelp && (
          <div className="rounded-xl bg-rose-50 p-3 text-xs leading-relaxed text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            On iPhone/iPad: tap the <strong>Share</strong> button{" "}
            <span aria-hidden>⬆️</span> in Safari, then choose{" "}
            <strong>Add to Home Screen</strong>.
          </div>
        )}
      </div>
    </div>
  );
}

export default PwaInstall;
