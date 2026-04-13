"use client";

import { ModalCloseButton } from "@/components/ModalCloseButton";
import { useEffect } from "react";

export function PlusUpsellModal({
  open,
  title,
  body,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plus-upsell-title"
    >
      <div className="card-surface relative max-w-md border border-zinc-200/90 p-6 pt-12 dark:border-zinc-700/90">
        <ModalCloseButton className="absolute right-3 top-3" onClick={onClose} />
        <h2 id="plus-upsell-title" className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
        <p className="mt-3 text-xs text-zinc-500">
          Marriage View Plus is granted by admins for now — this preview shows where a paywall would appear at natural
          friction points.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
            onClick={onClose}
          >
            Not now
          </button>
          <a
            href="/settings"
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            onClick={onClose}
          >
            View settings
          </a>
        </div>
      </div>
    </div>
  );
}
