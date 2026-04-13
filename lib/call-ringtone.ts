/** Lightweight call-style ring using Web Audio (no asset files). */

import { isSoundEnabled } from "@/lib/notification-prefs";

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
}

function playTone(ctx: AudioContext, freq: number, durationSec: number, gain = 0.07) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(ctx.destination);
  const t0 = ctx.currentTime;
  osc.start(t0);
  osc.stop(t0 + durationSec);
}

export type RingtoneController = {
  stop: () => void;
};

/** Repeating two-tone pattern until `stop()` (outgoing / incoming call). */
export function startCallRingtone(): RingtoneController {
  if (!isSoundEnabled()) return { stop: () => {} };
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  let stopped = false;
  const run = () => {
    if (stopped) return;
    try {
      void ctx.resume();
      playTone(ctx, 440, 0.12, 0.06);
      window.setTimeout(() => {
        if (stopped) return;
        playTone(ctx, 554.37, 0.12, 0.06);
      }, 150);
    } catch {
      /* ignore */
    }
  };
  run();
  const id = window.setInterval(run, 900);

  return {
    stop: () => {
      stopped = true;
      window.clearInterval(id);
      void ctx.close().catch(() => {});
    },
  };
}

/** Single short ping for chat notifications. */
export function playMessagePing() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    void ctx.resume();
    playTone(ctx, 523.25, 0.08, 0.04);
  } catch {
    /* ignore */
  }
  window.setTimeout(() => {
    void ctx.close().catch(() => {});
  }, 200);
}
