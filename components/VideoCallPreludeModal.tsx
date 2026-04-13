"use client";

import { ModalCloseButton } from "@/components/ModalCloseButton";
import { useEffect, useState } from "react";

export function VideoCallPreludeModal({
  otherName,
  open,
  onCancel,
  onConfirm,
}: {
  otherName: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [ack, setAck] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAck(false);
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-prelude-title"
    >
      <div className="card-surface relative max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto border border-zinc-200/90 p-6 pt-12 dark:border-zinc-700/90">
        <ModalCloseButton
          className="absolute right-3 top-3"
          onClick={() => {
            setAck(false);
            onCancel();
          }}
        />
        <h2
          id="video-prelude-title"
          className="font-display text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Before your Video Date Room
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          With <span className="font-medium text-zinc-900 dark:text-zinc-100">{otherName}</span>
        </p>

        <div className="mt-4 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-3 dark:border-zinc-700/80 dark:bg-zinc-900/50">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            10-second room check
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            <li>Stable connection (Wi‑Fi helps)</li>
            <li>Lighting on your face so they can see you clearly</li>
            <li>A private-enough space for a respectful, marriage-minded call</li>
          </ul>
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">You can still leave anytime from the call screen.</p>
        </div>

        <ol className="mt-5 list-decimal space-y-4 pl-4 text-sm leading-relaxed text-zinc-700 marker:font-semibold dark:text-zinc-300">
          <li className="pl-1">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Messages are for coordination only</span>
            <p className="mt-1">
              Marriage View is built around <strong>video dates</strong>. Chat to agree on a time and confirm you&apos;re
              both ready, then open the <strong>Video Date Room</strong>.
            </p>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Example: &quot;Hi — are you free for a video date?&quot; / &quot;Yes, I&apos;m ready.&quot; Long texting
              isn&apos;t recommended; save deeper topics for the call.
            </p>
          </li>
          <li className="pl-1">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Stay marriage-minded and appropriate</span>
            <p className="mt-1">
              Be serious, respectful, and appropriate. Flirting is fine.{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">Sexual content, nudity, harassment, or illegal</strong>{" "}
              behavior is <strong className="text-zinc-900 dark:text-zinc-100">not allowed</strong>.
            </p>
          </li>
          <li className="rounded-xl border border-red-200/90 bg-red-50/80 p-3 pl-3 text-red-950 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-100">
            <span className="font-semibold">Enforcement</span>
            <p className="mt-1">
              Violations can mean a <strong>permanent ban</strong>. We may <strong>cooperate with authorities</strong> and
              share <strong>available evidence</strong> (reports, logs, or recordings if retained) as described in our{" "}
              <a href="/terms" className="font-semibold underline underline-offset-2">
                Terms
              </a>
              . Treat video like a serious first meeting.
            </p>
          </li>
        </ol>

        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-400"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          <span>
            I understand the Video Date Room should stay <strong>appropriate and marriage-oriented</strong>, and that
            misconduct can lead to a permanent ban and legal consequences.
          </span>
        </label>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="min-h-11 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
            onClick={() => {
              setAck(false);
              onCancel();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ack}
            className="cta-video-primary min-h-11 px-5 py-2.5 text-sm disabled:cursor-not-allowed"
            onClick={() => {
              onConfirm();
              setAck(false);
            }}
          >
            Open Video Date Room
          </button>
        </div>
      </div>
    </div>
  );
}
