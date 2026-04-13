"use client";

import { ModalCloseButton } from "@/components/ModalCloseButton";
import { startCallRingtone } from "@/lib/call-ringtone";
import { ConnectionState, Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export type VideoCallPhase = "connecting" | "connected" | "error" | "idle";

function collectAudioElements(room: Room | null): HTMLAudioElement[] {
  const out: HTMLAudioElement[] = [];
  if (!room) return out;
  room.remoteParticipants.forEach((p) => {
    p.audioTrackPublications.forEach((pub) => {
      const t = pub.track;
      if (t?.attachedElements) {
        for (const el of t.attachedElements) {
          if (el instanceof HTMLAudioElement) out.push(el);
        }
      }
    });
  });
  return out;
}

async function stopRoom(room: Room | null, extraAudio: HTMLAudioElement[]) {
  const audioSet = new Set(extraAudio);
  for (const el of collectAudioElements(room)) {
    audioSet.add(el);
  }
  for (const el of audioSet) {
    try {
      el.pause();
      el.srcObject = null;
      el.remove();
    } catch {
      /* ignore */
    }
  }
  extraAudio.length = 0;

  if (!room) return;
  try {
    if (room.state !== ConnectionState.Disconnected) {
      await room.localParticipant.setCameraEnabled(false);
      await room.localParticipant.setMicrophoneEnabled(false);
    }
  } catch {
    /* ignore */
  }
  try {
    if (room.state !== ConnectionState.Disconnected) {
      await room.disconnect(true);
    }
  } catch {
    /* ignore */
  }
}

export function VideoCall({
  matchId,
  onClose,
  onPhaseChange,
}: {
  matchId: string;
  /** `hadConnected` is true if the room reached a connected state at least once. */
  onClose: (detail?: { hadConnected?: boolean }) => void;
  onPhaseChange?: (phase: VideoCallPhase) => void;
}) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<HTMLAudioElement[]>([]);
  const trackSubscribedHandlerRef = useRef<(track: RemoteTrack) => void>(() => {});
  const roomReconnectHandlersRef = useRef<{
    onReconnecting: () => void;
    onReconnected: () => void;
  } | null>(null);
  const aliveRef = useRef(true);
  /** Bumps on cleanup so overlapping connect attempts from strict mode / fast remount abort. */
  const sessionGenRef = useRef(0);
  const [status, setStatus] = useState<string>("Connecting…");
  const [live, setLive] = useState(false);
  const wasEverLiveRef = useRef(false);

  const ringing = !live && !/could not|fail|error/i.test(status);

  useEffect(() => {
    if (!ringing) return;
    const r = startCallRingtone();
    return () => r.stop();
  }, [ringing, matchId]);

  const detachVideoElements = useCallback(() => {
    const loc = localRef.current;
    const rem = remoteRef.current;
    if (loc) {
      loc.srcObject = null;
      loc.load();
    }
    if (rem) {
      rem.srcObject = null;
      rem.load();
    }
  }, []);

  const teardown = useCallback(async () => {
    aliveRef.current = false;
    const room = roomRef.current;
    roomRef.current = null;
    detachVideoElements();
    if (room) {
      room.removeListener(RoomEvent.TrackSubscribed, trackSubscribedHandlerRef.current);
    }
    await stopRoom(room, audioElsRef.current);
  }, [detachVideoElements]);

  useEffect(() => {
    const mySession = ++sessionGenRef.current;
    const isCurrent = () => mySession === sessionGenRef.current;
    aliveRef.current = true;
    wasEverLiveRef.current = false;
    roomReconnectHandlersRef.current = null;
    onPhaseChange?.("connecting");
    const audioEls = audioElsRef.current;
    const ac = new AbortController();

    const onTrackSubscribed = (track: RemoteTrack) => {
      if (!aliveRef.current || !isCurrent()) {
        track.detach();
        return;
      }
      if (track.kind === Track.Kind.Video && remoteRef.current) {
        track.attach(remoteRef.current);
      }
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach() as HTMLAudioElement;
        el.style.display = "none";
        document.body.appendChild(el);
        audioEls.push(el);
      }
    };
    trackSubscribedHandlerRef.current = onTrackSubscribed;

    void (async () => {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
        signal: ac.signal,
      });
      const data = await res.json().catch(() => ({}));

      if (!isCurrent() || ac.signal.aborted) {
        return;
      }

      if (!res.ok) {
        setStatus((data as { error?: string }).error ?? "Could not start video");
        onPhaseChange?.("error");
        return;
      }

      const room = new Room();
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
      const onReconnecting = () => {
        if (!isCurrent() || !aliveRef.current) return;
        setStatus("Reconnecting — hang tight");
      };
      const onReconnected = () => {
        if (!isCurrent() || !aliveRef.current) return;
        setStatus("Connected");
        setLive(true);
      };
      roomReconnectHandlersRef.current = { onReconnecting, onReconnected };
      room.on(RoomEvent.Reconnecting, onReconnecting);
      room.on(RoomEvent.Reconnected, onReconnected);

      try {
        if (!isCurrent() || ac.signal.aborted) {
          await stopRoom(room, audioEls);
          return;
        }

        await room.connect((data as { url: string }).url, (data as { token: string }).token);

        if (!isCurrent() || ac.signal.aborted) {
          await stopRoom(room, audioEls);
          return;
        }

        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);

        if (!isCurrent() || ac.signal.aborted) {
          await stopRoom(room, audioEls);
          return;
        }

        const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        pub?.videoTrack?.attach(localRef.current!);

        if (isCurrent() && aliveRef.current) {
          setStatus("Connected");
          setLive(true);
          wasEverLiveRef.current = true;
          onPhaseChange?.("connected");
        } else {
          await stopRoom(room, audioEls);
          roomRef.current = null;
        }
      } catch (e) {
        if (ac.signal.aborted || !isCurrent()) {
          await stopRoom(room, audioEls);
          roomRef.current = null;
          return;
        }
        if (aliveRef.current) {
          setStatus(e instanceof Error ? e.message : "Connection failed");
          onPhaseChange?.("error");
        }
        await stopRoom(room, audioEls);
        roomRef.current = null;
      }
    })();

    return () => {
      ac.abort();
      sessionGenRef.current += 1;
      aliveRef.current = false;
      onPhaseChange?.("idle");
      const room = roomRef.current;
      roomRef.current = null;
      detachVideoElements();
      if (room) {
        room.removeListener(RoomEvent.TrackSubscribed, trackSubscribedHandlerRef.current);
        const rh = roomReconnectHandlersRef.current;
        if (rh) {
          room.removeListener(RoomEvent.Reconnecting, rh.onReconnecting);
          room.removeListener(RoomEvent.Reconnected, rh.onReconnected);
        }
        roomReconnectHandlersRef.current = null;
      }
      void stopRoom(room, audioEls);
    };
  }, [detachVideoElements, matchId, onPhaseChange]);

  async function handleClose() {
    const had = wasEverLiveRef.current;
    await teardown();
    onPhaseChange?.("idle");
    onClose({ hadConnected: had });
  }

  async function toggleMic() {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const on = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!on);
  }

  async function toggleCam() {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const on = room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(!on);
    if (!on && localRef.current) {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      pub?.videoTrack?.attach(localRef.current);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/90 p-4 text-white">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-medium tracking-tight opacity-90">
            Marriage View · Video date · <span className="opacity-80">{status}</span>
          </p>
          {!live && status === "Connecting…" ? (
            <p className="mt-0.5 text-[11px] font-normal opacity-75">
              Hang tight — connecting usually takes a few seconds on a stable connection.
            </p>
          ) : null}
        </div>
        <ModalCloseButton
          onClick={() => void handleClose()}
          className="text-white hover:bg-white/15 hover:text-white"
          aria-label="Leave video date"
        />
      </div>
      <p className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-center text-[11px] leading-snug text-amber-50 md:text-xs">
        Marriage-oriented conversation only. No nudity, sexual content, harassment, or illegal behavior — violations
        can mean a permanent ban and cooperation with authorities.{" "}
        <Link href="/terms" className="font-semibold underline underline-offset-2">
          Terms
        </Link>
      </p>
      <div className="grid flex-1 grid-rows-2 gap-2 md:grid-cols-2 md:grid-rows-1">
        <video ref={remoteRef} className="h-full w-full rounded-lg bg-zinc-900 object-cover" autoPlay playsInline />
        <video ref={localRef} className="h-full w-full rounded-lg bg-zinc-800 object-cover" autoPlay playsInline muted />
      </div>
      <div className="mt-3 flex justify-center gap-3">
        <button
          type="button"
          className="rounded-full bg-white/15 px-4 py-2 text-sm hover:bg-white/25"
          onClick={() => void toggleMic()}
          aria-label={live ? "Mute or unmute microphone" : "Microphone (available when connected)"}
          disabled={!live}
        >
          Mic
        </button>
        <button
          type="button"
          className="rounded-full bg-white/15 px-4 py-2 text-sm hover:bg-white/25"
          onClick={() => void toggleCam()}
          aria-label={live ? "Turn camera on or off" : "Camera (available when connected)"}
          disabled={!live}
        >
          Camera
        </button>
      </div>
    </div>
  );
}
