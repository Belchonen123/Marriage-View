"use client";

import { CoachChatCore } from "@/components/CoachChatCore";
import { useEffect } from "react";

export function CoachModal({
  open,
  onClose,
  matchId,
  otherName,
}: {
  open: boolean;
  onClose: () => void;
  matchId: string;
  otherName: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label="Close coach"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[min(92dvh,820px)] w-full max-w-lg flex-col rounded-t-2xl border border-zinc-200 bg-[var(--surface)] shadow-2xl dark:border-zinc-700 sm:max-h-[min(88vh,820px)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-700/80">
          <div>
            <h2 id="coach-modal-title" className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Marriage coach
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Marriage-minded guidance — import your thread for feedback, then keep the conversation going here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="input-focus rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2 sm:px-4">
          <CoachChatCore
            variant="modal"
            initialMatchId={matchId}
            matchImportContext={{ matchId, otherName }}
            storageScopeSuffix={`match:${matchId}`}
          />
        </div>
      </div>
    </div>
  );
}
