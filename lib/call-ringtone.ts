/**
 * Lightweight in-app ringtone + ping using Web Audio.
 *
 * These play only when the tab is open — system-level push notifications
 * use the OS's default Chrome/Safari notification sound, which we can't
 * override.
 */

import { isSoundEnabled } from "@/lib/notification-prefs";

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
}

/**
 * Play a single tone with an attack/decay envelope so it sounds like a
 * bell or chime instead of a flat beep. `peakGain` is the loudest point;
 * the envelope fades the tone out smoothly to avoid clicks.
 */
function playBell(
  ctx: AudioContext,
  freq: number,
  durationSec: number,
  peakGain = 0.25,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;

  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peakGain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationSec + 0.05);
}

export type RingtoneController = {
  stop: () => void;
};

/**
 * Repeating phone-style ring: a quick two-tone burst, pause, two-tone
 * burst again. Continues until `stop()` is called. Louder than the
 * previous version so it actually grabs attention from across the room.
 */
export function startCallRingtone(): RingtoneController {
  if (!isSoundEnabled()) return { stop: () => {} };
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  let stopped = false;

  const burst = () => {
    if (stopped) return;
    try {
      void ctx.resume();
      // Two paired "ring-ring" tones close together, like a desk phone.
      playBell(ctx, 880, 0.18, 0.32);
      window.setTimeout(() => {
        if (stopped) return;
        playBell(ctx, 988, 0.18, 0.32);
      }, 220);
      window.setTimeout(() => {
        if (stopped) return;
        playBell(ctx, 880, 0.18, 0.32);
      }, 480);
      window.setTimeout(() => {
        if (stopped) return;
        playBell(ctx, 988, 0.18, 0.32);
      }, 700);
    } catch {
      /* ignore */
    }
  };
  burst();
  const id = window.setInterval(burst, 1800);

  return {
    stop: () => {
      stopped = true;
      window.clearInterval(id);
      void ctx.close().catch(() => {});
    },
  };
}

/**
 * Two-tone "ding-dong" for incoming messages. Audible at normal device
 * volume without being startling.
 */
export function playMessagePing() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    void ctx.resume();
    playBell(ctx, 880, 0.18, 0.22);
    window.setTimeout(() => {
      try {
        playBell(ctx, 659.25, 0.28, 0.22);
      } catch {
        /* ignore */
      }
    }, 160);
  } catch {
    /* ignore */
  }
  window.setTimeout(() => {
    void ctx.close().catch(() => {});
  }, 600);
}

/** Plays both a single ring burst and a message ping — used by the
 *  "Test sound" button in Settings so users can verify their setup. */
export function playSoundTest(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    void ctx.resume();
    // Message ding-dong first
    playBell(ctx, 880, 0.18, 0.22);
    window.setTimeout(() => playBell(ctx, 659.25, 0.28, 0.22), 160);
    // Then a short call-style burst after a pause
    window.setTimeout(() => playBell(ctx, 880, 0.18, 0.30), 900);
    window.setTimeout(() => playBell(ctx, 988, 0.18, 0.30), 1100);
  } catch {
    /* ignore */
  }
  window.setTimeout(() => {
    void ctx.close().catch(() => {});
  }, 2000);
}
