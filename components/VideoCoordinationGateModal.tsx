"use client";

import { ModalCloseButton } from "@/components/ModalCloseButton";
import { useEffect, useState } from "react";

type View = "ask" | "remind";

export function VideoCoordinationGateModal({
  otherName,
  open,
  onClose,
  onCoordinated,
}: {
  otherName: string;
  open: boolean;
  onClose: () => void;
  onCoordinated: () => void;
}) {
  const [view, setView] = useState<View>("ask");

  useEffect(() => {
    if (!open) setView("ask");
  }, [open]);

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
      className="fixed inset-0 z-[135] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={view === "ask" ? "video-coordination-ask-title" : "video-coordination-remind-title"}
    >
      <div className="card-surface relative w-full max-w-md border border-zinc-200/90 p-6 pt-12 dark:border-zinc-700/90">
        <ModalCloseButton className="absolute right-3 top-3" onClick={onClose} />
        {view === "ask" ? (
          <>
            <h2
              id="video-coordination-ask-title"
              className="font-display text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              Coordinate first
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              Did you message <span className="font-medium text-zinc-900 dark:text-zinc-100">{otherName}</span> and
              coordinate this video date?
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="min-h-11 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
                onClick={() => setView("remind")}
              >
                No, not yet
              </button>
              <button
                type="button"
                className="cta-video-primary min-h-11 px-5 py-2.5 text-sm"
                onClick={() => {
                  onCoordinated();
                }}
              >
                Yes
              </button>
            </div>
            <button
              type="button"
              className="mt-3 w-full text-center text-sm text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
              onClick={onClose}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2
              id="video-coordination-remind-title"
              className="font-display text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              Message first
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              Please use the <strong className="font-medium text-zinc-900 dark:text-zinc-100">messaging feature</strong>{" "}
              in this chat to agree on a time and make sure you&apos;re both ready before starting the Video Date Room.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="cta-video-primary min-h-11 px-5 py-2.5 text-sm"
                onClick={onClose}
              >
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
