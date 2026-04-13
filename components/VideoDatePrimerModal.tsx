"use client";

import { ModalCloseButton } from "@/components/ModalCloseButton";
import { useEffect, useState } from "react";

type View = "coordinate" | "remind" | "primer";

export function VideoDatePrimerModal({
  otherName,
  open,
  onClose,
  onStartCall,
}: {
  otherName: string;
  open: boolean;
  onClose: () => void;
  /** User confirmed coordination + safety; open VideoCall immediately (no lobby). */
  onStartCall: () => void;
}) {
  const [view, setView] = useState<View>("coordinate");
  const [ack, setAck] = useState(false);

  useEffect(() => {
    if (!open) {
      setView("coordinate");
      setAck(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAck(false);
        onClose();
      }
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
      aria-labelledby="video-primer-title"
    >
      <div className="card-surface relative max-h-[min(90vh,42rem)] w-full max-w-lg overflow-y-auto border border-zinc-200/90 p-6 pt-12 dark:border-zinc-700/90">
        <ModalCloseButton
          className="absolute right-3 top-3"
          onClick={() => {
            setAck(false);
            onClose();
          }}
        />

        {view === "coordinate" ? (
          <>
            <h2
              id="video-primer-title"
              className="font-display text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              Video date with {otherName}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              Have you messaged and agreed on a time so you&apos;re both ready?
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="min-h-11 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
                onClick={() => setView("remind")}
              >
                Not yet
              </button>
              <button
                type="button"
                className="cta-video-primary min-h-11 px-5 py-2.5 text-sm"
                onClick={() => setView("primer")}
              >
                Yes, we&apos;re ready
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
        ) : null}

        {view === "remind" ? (
          <>
            <h2
              id="video-primer-title"
              className="font-display text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              Coordinate in chat first
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              Use messages below to pick a time and confirm you&apos;re both ready, then tap{" "}
              <strong className="font-medium text-zinc-900 dark:text-zinc-100">Video Date Room</strong> again.
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
        ) : null}

        {view === "primer" ? (
          <>
            <h2
              id="video-primer-title"
              className="font-display text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              Before you connect
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              With <span className="font-medium text-zinc-900 dark:text-zinc-100">{otherName}</span>
            </p>

            <div className="mt-4 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-3 dark:border-zinc-700/80 dark:bg-zinc-900/50">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Quick checks
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                <li>Stable connection and lighting on your face</li>
                <li>Chat is for scheduling — save deeper topics for the call</li>
                <li>Stay respectful and appropriate; no sexual content or harassment</li>
              </ul>
            </div>

            <div className="mt-4 rounded-xl border border-red-200/90 bg-red-50/80 p-3 text-xs leading-relaxed text-red-950 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-100">
              <span className="font-semibold">Enforcement</span>
              <p className="mt-1">
                Violations can mean a permanent ban. See our{" "}
                <a href="/terms" className="font-semibold underline underline-offset-2">
                  Terms
                </a>{" "}
                for details.
              </p>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-400"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>
                I understand this call should stay <strong>appropriate and marriage-oriented</strong>, and misconduct
                can lead to a ban.
              </span>
            </label>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="min-h-11 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
                onClick={() => {
                  setAck(false);
                  setView("coordinate");
                }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={!ack}
                className="cta-video-primary min-h-11 px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  setAck(false);
                  onStartCall();
                }}
              >
                Start Video Date
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
