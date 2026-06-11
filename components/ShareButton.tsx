"use client";

import { useCallback, useMemo } from "react";
import { track } from "@/lib/analytics";

type Placement = "post_date" | "waiting_room";

type ShareButtonProps = {
  placement: Placement;
  appName?: string;
  className?: string;
};

function appUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && env.length > 0) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "https://marriageview.app";
}

function shareText(url: string): string {
  return `Try Marriage View — real video dates for people actually looking to get married. Free 💍\n${url}`;
}

export function ShareButton({
  placement,
  appName = "Marriage View",
  className,
}: ShareButtonProps) {
  const canNativeShare = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      typeof (navigator as Navigator & { share?: unknown }).share === "function",
    [],
  );

  const onClick = useCallback(async () => {
    const url = appUrl();
    const text = shareText(url);

    if (canNativeShare) {
      try {
        await navigator.share({ title: "Marriage View", text, url });
        track("share_clicked", { method: "native", placement, app: appName });
        return;
      } catch {
        /* fall through to whatsapp */
      }
    }

    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    track("share_clicked", { method: "whatsapp", placement, app: appName });
    if (typeof window !== "undefined") {
      window.open(wa, "_blank", "noopener,noreferrer");
    }
  }, [appName, canNativeShare, placement]);

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
      }
      aria-label="Share Marriage View"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M19.05 4.91A10 10 0 0 0 4.1 18.17L2 22l3.95-1.04A10 10 0 1 0 19.05 4.9zM12 20.07a8.07 8.07 0 0 1-4.11-1.12l-.3-.18-2.34.62.63-2.28-.2-.31a8.07 8.07 0 1 1 6.32 3.27zm4.42-6.05c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.55.12-.16.24-.63.78-.77.94-.14.16-.28.18-.52.06a6.6 6.6 0 0 1-1.94-1.2 7.3 7.3 0 0 1-1.35-1.68c-.14-.24 0-.36.1-.48.1-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.42-.55-.43h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.5.58.18 1.1.16 1.51.1.46-.07 1.43-.59 1.63-1.15.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z" />
      </svg>
      Share on WhatsApp
    </button>
  );
}

export default ShareButton;
