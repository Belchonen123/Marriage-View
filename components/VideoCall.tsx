"use client";

import { ModalCloseButton } from "@/components/ModalCloseButton";
import { startCallRingtone } from "@/lib/call-ringtone";
import {
  ConnectionState,
  DefaultReconnectPolicy,
  DisconnectReason,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from "livekit-client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type VideoCallPhase = "connecting" | "connected" | "error" | "idle";

const REPORT_REASONS = ["harassment", "spam", "fake_profile", "other"] as const;
const CHROME_HIDE_MS = 5000;
/** Longer backoff than SDK default so brief dead zones (elevator, cell handoff) can recover. */
const RECONNECT_DELAYS_MS = [
  0, 400, 800, 1500, 2500, 4000, 5500, 7000, 7000, 7000, 7000, 7000, 7000, 7000, 7000, 7000, 7000,
];
/** After the SDK gives up, keep the UI in a recoverable state for this long before “couldn’t restore” copy. */
const GRACE_MS_AFTER_DROP = 28_000;

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

function ControlBtn({
  onClick,
  disabled,
  active,
  danger,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex min-h-[48px] min-w-[48px] touch-manipulation flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-2 text-[11px] font-semibold transition sm:min-w-[56px] sm:px-4 sm:text-xs ${
        danger
          ? "bg-red-600 text-white shadow-lg hover:bg-red-500 disabled:opacity-40"
          : active === false
            ? "bg-rose-500/35 text-white ring-2 ring-rose-300/80 hover:bg-rose-500/45"
            : "bg-white/15 text-white hover:bg-white/25 disabled:opacity-40"
      }`}
    >
      {children}
    </button>
  );
}

export function VideoCall({
  matchId,
  otherUserId,
  otherName,
  onClose,
  onPhaseChange,
}: {
  matchId: string;
  /** When set, in-call report uses this target user id. */
  otherUserId?: string;
  otherName?: string;
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
    onConnectionStateChanged: (state: ConnectionState) => void;
    onDisconnected: (reason?: DisconnectReason) => void;
  } | null>(null);
  const aliveRef = useRef(true);
  const sessionGenRef = useRef(0);
  /** Session id for this mount of the call effect; used to ignore stale manual reconnect. */
  const callSessionRef = useRef(0);
  const userClosingRef = useRef(false);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const facingRef = useRef<"user" | "environment">("user");
  const [status, setStatus] = useState<string>("Connecting…");
  const [live, setLive] = useState(false);
  const wasEverLiveRef = useRef(false);
  const [showRecoverBanner, setShowRecoverBanner] = useState(false);
  const [graceExpired, setGraceExpired] = useState(false);
  const [reconnectBusy, setReconnectBusy] = useState(false);
  const [swapFeeds, setSwapFeeds] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string>("harassment");
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMsg, setReportMsg] = useState<string | null>(null);

  const ringing =
    !live &&
    !showRecoverBanner &&
    status === "Connecting…" &&
    !/could not|fail|error/i.test(status);

  useEffect(() => {
    if (!ringing) return;
    const r = startCallRingtone();
    return () => r.stop();
  }, [ringing, matchId]);

  useEffect(() => {
    if (!live || !chromeVisible) return;
    const id = window.setTimeout(() => setChromeVisible(false), CHROME_HIDE_MS);
    return () => clearTimeout(id);
  }, [live, chromeVisible]);

  const revealChrome = useCallback(() => setChromeVisible(true), []);

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current != null) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

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
    userClosingRef.current = true;
    clearGraceTimer();
    setShowRecoverBanner(false);
    setGraceExpired(false);
    aliveRef.current = false;
    const room = roomRef.current;
    roomRef.current = null;
    detachVideoElements();
    if (room) {
      room.removeListener(RoomEvent.TrackSubscribed, trackSubscribedHandlerRef.current);
      const rh = roomReconnectHandlersRef.current;
      if (rh) {
        room.removeListener(RoomEvent.Reconnecting, rh.onReconnecting);
        room.removeListener(RoomEvent.Reconnected, rh.onReconnected);
        room.removeListener(RoomEvent.ConnectionStateChanged, rh.onConnectionStateChanged);
        room.removeListener(RoomEvent.Disconnected, rh.onDisconnected);
      }
      roomReconnectHandlersRef.current = null;
    }
    await stopRoom(room, audioElsRef.current);
  }, [clearGraceTimer, detachVideoElements]);

  const attachLocalMediaAfterJoin = useCallback(
    async (room: Room, guard: () => boolean, signal?: AbortSignal): Promise<boolean> => {
      if (!guard() || signal?.aborted || !aliveRef.current) return false;
      try {
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        return false;
      }
      if (!guard() || signal?.aborted || !aliveRef.current) return false;
      setMicOn(room.localParticipant.isMicrophoneEnabled);
      setCamOn(room.localParticipant.isCameraEnabled);
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      pub?.videoTrack?.attach(localRef.current!);
      if (!guard() || !aliveRef.current) return false;
      setStatus("Connected");
      setLive(true);
      wasEverLiveRef.current = true;
      onPhaseChange?.("connected");
      return true;
    },
    [onPhaseChange],
  );

  const manualReconnect = useCallback(async () => {
    const inThisCall = () => aliveRef.current && callSessionRef.current === sessionGenRef.current;
    if (!inThisCall()) return;
    const room = roomRef.current;
    if (!room) return;
    revealChrome();
    setReconnectBusy(true);
    setStatus("Reconnecting…");
    try {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!inThisCall()) return;
      if (!res.ok) {
        setStatus((data as { error?: string }).error ?? "Could not get a new token");
        return;
      }
      await room.connect((data as { url: string }).url, (data as { token: string }).token);
      if (!inThisCall()) return;
      clearGraceTimer();
      setShowRecoverBanner(false);
      setGraceExpired(false);
      const ok = await attachLocalMediaAfterJoin(room, inThisCall);
      if (!ok && inThisCall()) {
        setStatus("Connected but media failed — try Reconnect again");
      }
    } catch (e) {
      if (inThisCall()) {
        setStatus(e instanceof Error ? e.message : "Reconnect failed");
      }
    } finally {
      if (callSessionRef.current === sessionGenRef.current) {
        setReconnectBusy(false);
      }
    }
  }, [attachLocalMediaAfterJoin, clearGraceTimer, matchId, revealChrome]);

  useEffect(() => {
    const mySession = ++sessionGenRef.current;
    callSessionRef.current = mySession;
    userClosingRef.current = false;
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

      const room = new Room({
        reconnectPolicy: new DefaultReconnectPolicy(RECONNECT_DELAYS_MS),
      });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);

      const onReconnecting = () => {
        if (!isCurrent() || !aliveRef.current) return;
        setStatus("Reconnecting — hang tight");
        revealChrome();
      };
      const onReconnected = () => {
        if (!isCurrent() || !aliveRef.current) return;
        clearGraceTimer();
        setShowRecoverBanner(false);
        setGraceExpired(false);
        setStatus("Connected");
        setLive(true);
      };
      const onConnectionStateChanged = (state: ConnectionState) => {
        if (!isCurrent() || !aliveRef.current) return;
        if (state === ConnectionState.Reconnecting) {
          revealChrome();
        }
      };
      const onDisconnected = (reason?: DisconnectReason) => {
        if (!isCurrent() || !aliveRef.current || userClosingRef.current) return;
        if (reason === DisconnectReason.CLIENT_INITIATED) return;
        if (!wasEverLiveRef.current) return;
        clearGraceTimer();
        setLive(false);
        setShowRecoverBanner(true);
        setGraceExpired(false);
        setStatus("Connection lost — poor reception. Trying to recover…");
        revealChrome();
        graceTimerRef.current = setTimeout(() => {
          graceTimerRef.current = null;
          if (!isCurrent() || !aliveRef.current) return;
          setGraceExpired(true);
          setStatus("Couldn't restore the call. You can try Reconnect again or leave.");
        }, GRACE_MS_AFTER_DROP);
      };

      roomReconnectHandlersRef.current = {
        onReconnecting,
        onReconnected,
        onConnectionStateChanged,
        onDisconnected,
      };
      room.on(RoomEvent.Reconnecting, onReconnecting);
      room.on(RoomEvent.Reconnected, onReconnected);
      room.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
      room.on(RoomEvent.Disconnected, onDisconnected);

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

        const ok = await attachLocalMediaAfterJoin(room, isCurrent, ac.signal);
        if (!ok) {
          await stopRoom(room, audioEls);
          roomRef.current = null;
          if (isCurrent() && aliveRef.current && !ac.signal.aborted) {
            setStatus("Could not start camera or microphone");
            onPhaseChange?.("error");
          }
          return;
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
      clearGraceTimer();
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
          room.removeListener(RoomEvent.ConnectionStateChanged, rh.onConnectionStateChanged);
          room.removeListener(RoomEvent.Disconnected, rh.onDisconnected);
        }
        roomReconnectHandlersRef.current = null;
      }
      void stopRoom(room, audioEls);
    };
  }, [attachLocalMediaAfterJoin, clearGraceTimer, detachVideoElements, matchId, onPhaseChange, revealChrome]);

  async function handleClose() {
    const had = wasEverLiveRef.current;
    await teardown();
    onPhaseChange?.("idle");
    onClose({ hadConnected: had });
  }

  async function toggleMic() {
    revealChrome();
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const on = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!on);
    setMicOn(room.localParticipant.isMicrophoneEnabled);
  }

  async function toggleCam() {
    revealChrome();
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const on = room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(!on);
    setCamOn(room.localParticipant.isCameraEnabled);
    if (!on && localRef.current) {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      pub?.videoTrack?.attach(localRef.current);
    }
  }

  async function flipCamera() {
    revealChrome();
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected || !camOn) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (!track || track.kind !== Track.Kind.Video) return;
    const next = facingRef.current === "user" ? "environment" : "user";
    facingRef.current = next;
    try {
      await (track as LocalVideoTrack).restartTrack({ facingMode: next });
    } catch {
      facingRef.current = next === "user" ? "environment" : "user";
    }
    if (localRef.current) {
      pub?.videoTrack?.attach(localRef.current);
    }
  }

  async function submitReport() {
    if (!otherUserId?.trim()) return;
    setReportBusy(true);
    setReportMsg(null);
    const res = await fetch("/api/report", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportedUserId: otherUserId.trim(),
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      }),
    });
    const raw = await res.json().catch(() => ({}));
    setReportBusy(false);
    if (!res.ok) {
      setReportMsg((raw as { error?: string }).error ?? `Could not submit (${res.status})`);
      return;
    }
    setReportMsg("Report sent. Thank you.");
    window.setTimeout(() => {
      setReportOpen(false);
      setReportMsg(null);
    }, 2000);
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black text-white"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div
        className={`flex shrink-0 flex-col gap-2 px-3 pt-2 transition-opacity duration-200 md:px-4 ${
          chromeVisible ? "opacity-100" : "pointer-events-none h-0 overflow-hidden p-0 opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
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
            className="shrink-0 text-white hover:bg-white/15 hover:text-white"
            aria-label="Leave video date"
          />
        </div>
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-center text-[11px] leading-snug text-amber-50 md:text-xs">
          Marriage-oriented conversation only. No nudity, sexual content, harassment, or illegal behavior — violations
          can mean a permanent ban and cooperation with authorities.{" "}
          <Link href="/terms" className="font-semibold underline underline-offset-2">
            Terms
          </Link>
        </p>
      </div>

      <div
        className="relative min-h-0 flex-1 px-2 pb-1 pt-1 md:px-3"
        onClick={() => revealChrome()}
        role="presentation"
      >
        <div className="grid h-full min-h-[120px] grid-rows-2 gap-2 md:grid-cols-2 md:grid-rows-1">
          <div
            className={`relative min-h-0 overflow-hidden rounded-xl bg-zinc-900 ${
              swapFeeds ? "order-2 md:order-2" : "order-1 md:order-1"
            }`}
          >
            <video
              ref={remoteRef}
              className="h-full w-full object-cover"
              autoPlay
              playsInline
            />
            <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white/90">
              {otherName ?? "Match"}
            </span>
          </div>
          <div
            className={`relative min-h-0 overflow-hidden rounded-xl bg-zinc-800 ${
              swapFeeds ? "order-1 md:order-1" : "order-2 md:order-2"
            }`}
          >
            <video
              ref={localRef}
              className="h-full w-full object-cover"
              autoPlay
              playsInline
              muted
            />
            <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white/90">
              You
            </span>
          </div>
        </div>

        {!chromeVisible && live ? (
          <button
            type="button"
            className="pointer-events-auto absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/65 px-4 py-2 text-xs font-medium text-white/95 shadow-lg backdrop-blur-sm touch-manipulation"
            onClick={(e) => {
              e.stopPropagation();
              revealChrome();
            }}
          >
            Tap for controls
          </button>
        ) : null}
      </div>

      {showRecoverBanner ? (
        <div
          className="shrink-0 border-t border-amber-400/40 bg-amber-950/90 px-3 py-2.5 backdrop-blur-md md:px-4"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-center text-[11px] leading-snug text-amber-50 md:text-xs">
            {graceExpired
              ? "Couldn't restore the call. You can try Reconnect again or leave."
              : "Connection lost — poor reception. Trying to recover… You can tap Reconnect now or wait."}
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <button
              type="button"
              disabled={reconnectBusy}
              className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-amber-950 touch-manipulation disabled:opacity-50"
              onClick={() => void manualReconnect()}
            >
              {reconnectBusy ? "Reconnecting…" : "Reconnect now"}
            </button>
            <button
              type="button"
              className="rounded-full border border-white/35 bg-transparent px-4 py-2.5 text-sm font-medium text-white touch-manipulation hover:bg-white/10"
              onClick={() => void handleClose()}
            >
              Leave call
            </button>
          </div>
        </div>
      ) : null}

      {chromeVisible || !live ? (
      <div
        className="shrink-0 border-t border-white/10 bg-black/80 px-2 py-3 backdrop-blur-md md:px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 sm:gap-3">
          <ControlBtn
            label={micOn ? "Mute microphone" : "Unmute microphone"}
            disabled={!live}
            active={micOn}
            onClick={() => void toggleMic()}
          >
            {micOn ? (
              <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            ) : (
              <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
            Mic
          </ControlBtn>
          <ControlBtn
            label={camOn ? "Turn camera off" : "Turn camera on"}
            disabled={!live}
            active={camOn}
            onClick={() => void toggleCam()}
          >
            {camOn ? (
              <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
            Cam
          </ControlBtn>
          <ControlBtn label="Flip camera (front/back)" disabled={!live || !camOn} onClick={() => void flipCamera()}>
            <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Flip
          </ControlBtn>
          <ControlBtn
            label={swapFeeds ? "Put match video on top" : "Put your video on top"}
            disabled={!live}
            onClick={() => {
              revealChrome();
              setSwapFeeds((s) => !s);
            }}
          >
            <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            Swap
          </ControlBtn>
          <ControlBtn label="Connection tips" disabled={false} onClick={() => setHelpOpen(true)}>
            <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Help
          </ControlBtn>
          {otherUserId ? (
            <ControlBtn label="Report safety concern" disabled={!live} onClick={() => setReportOpen(true)}>
              <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
              Report
            </ControlBtn>
          ) : null}
          <ControlBtn label="End video date" danger disabled={false} onClick={() => void handleClose()}>
            <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            </svg>
            End
          </ControlBtn>
        </div>
      </div>
      ) : null}

      {helpOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="video-help-title"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="video-help-title" className="font-display text-lg font-semibold">
              Having trouble?
            </h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-white/85">
              <li>Use stable Wi‑Fi or LTE; move closer to your router if the video freezes.</li>
              <li>Allow camera and microphone when the browser prompts.</li>
              <li>If you see “Reconnecting”, wait a few seconds — the call may recover.</li>
              <li>Try turning the camera off and on, or leave and rejoin the room.</li>
            </ul>
            <button
              type="button"
              className="mt-5 w-full rounded-full bg-white/15 py-3 text-sm font-semibold text-white touch-manipulation hover:bg-white/25"
              onClick={() => setHelpOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {reportOpen && otherUserId ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="video-report-title"
          onClick={() => {
            if (!reportBusy) {
              setReportOpen(false);
              setReportMsg(null);
            }
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="video-report-title" className="font-display text-lg font-semibold">
              Report {otherName ?? "user"}
            </h2>
            <p className="mt-1 text-xs text-white/65">
              Reports are reviewed as we can. Include what happened during this call.
            </p>
            <label className="mt-3 block text-xs font-medium text-white/80">
              Reason
              <select
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs font-medium text-white/80">
              Details (optional)
              <textarea
                className="mt-1 min-h-[88px] w-full resize-y rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40"
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="What happened?"
              />
            </label>
            {reportMsg ? (
              <p
                className={`mt-2 text-sm ${reportMsg.startsWith("Report sent") ? "text-emerald-300" : "text-amber-200"}`}
              >
                {reportMsg}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-white touch-manipulation hover:bg-white/10"
                onClick={() => {
                  setReportOpen(false);
                  setReportMsg(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reportBusy}
                className="rounded-full bg-[var(--accent,#e11d48)] px-4 py-2.5 text-sm font-semibold text-white touch-manipulation disabled:opacity-50"
                onClick={() => void submitReport()}
              >
                {reportBusy ? "Sending…" : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
