"use client";

import { ModalCloseButton } from "@/components/ModalCloseButton";
import { useEffect, useMemo, useRef } from "react";

/** Brief lobby before joining the LiveKit room (UX buffer; not a literal connection timer). */
const LOBBY_MS = 8000;

const ICEBREAKERS = [
  "What is one thing you are grateful for this week?",
  "If you could learn any new skill in a month, what would it be?",
  "What does a typical Sunday look like for you?",
  "What is a book, film, or sermon that shaped how you think?",
  "How do you like to recharge after a busy week?",
  "What role does faith or community play in your daily life?",
  "What is a tradition from your family you hope to keep?",
  "What is something small that always makes your day better?",
];

function icebreakerForMatch(matchId: string): string {
  let h = 0;
  for (let i = 0; i < matchId.length; i++) h = (h * 31 + matchId.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % ICEBREAKERS.length;
  return ICEBREAKERS[idx]!;
}

export function VideoCallLobby({
  matchId,
  otherName,
  open,
  onCancel,
  onComplete,
}: {
  matchId: string;
  otherName: string;
  open: boolean;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const prompt = useMemo(() => icebreakerForMatch(matchId), [matchId]);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!open) {
      doneRef.current = false;
      return;
    }
    doneRef.current = false;
    const t = window.setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        queueMicrotask(() => onComplete());
      }
    }, LOBBY_MS);
    return () => window.clearTimeout(t);
  }, [open, onComplete]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        doneRef.current = true;
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  function cancelLobby() {
    doneRef.current = true;
    onCancel();
  }

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-gradient-to-b from-zinc-950/95 via-zinc-900/95 to-black/95 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-lobby-title"
    >
      <div className="relative w-full max-w-md space-y-8 text-center">
        <ModalCloseButton
          className="absolute -right-1 -top-1 text-zinc-400 hover:bg-white/10 hover:text-white dark:hover:bg-white/10"
          onClick={cancelLobby}
        />
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-rose-300/90">Video date lobby</p>
          <h2
            id="video-lobby-title"
            className="font-display mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl"
          >
            Starting soon with {otherName}
          </h2>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-200/90">Before you land on video</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed text-zinc-300">
            <li>Connection stable</li>
            <li>Face lit from the front</li>
            <li>Quiet enough to focus</li>
          </ul>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div
            className="relative flex h-28 w-28 items-center justify-center"
            aria-hidden
          >
            <span className="absolute inset-0 animate-ping rounded-full border-2 border-rose-500/40 opacity-40" />
            <span className="absolute inset-2 rounded-full border-4 border-rose-500/25" />
            <span className="relative inline-block h-10 w-10 animate-spin rounded-full border-2 border-white/25 border-t-rose-400" />
          </div>
          <div aria-live="polite" aria-atomic="true" className="space-y-1 px-2">
            <p className="text-lg font-semibold text-white">Waiting to connect</p>
            <p className="text-sm text-zinc-300">Setting up your Video Date Room…</p>
            <p className="text-xs text-zinc-500">This usually takes a few seconds.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-200/90">Icebreaker</p>
          <p className="mt-2 text-base leading-relaxed text-zinc-100">{prompt}</p>
          <p className="mt-3 text-xs text-zinc-400">You can use this once you are both on the call — no pressure to cover it all.</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            className="w-full rounded-full bg-rose-500 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-rose-600 sm:w-auto sm:min-w-[11rem]"
            onClick={() => {
              doneRef.current = true;
              onComplete();
            }}
          >
            Join now
          </button>
          <button
            type="button"
            className="w-full rounded-full border border-zinc-600 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/10 sm:w-auto sm:min-w-[11rem]"
            onClick={cancelLobby}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
