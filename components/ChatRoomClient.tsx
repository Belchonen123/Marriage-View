"use client";

import { ChatThread } from "@/components/ChatThread";
import { CoachModal } from "@/components/CoachModal";
import { MemberProfileModal } from "@/components/MemberProfileModal";
import { MatchCommonGround } from "@/components/MatchCommonGround";
import { MatchJournalPanel } from "@/components/MatchJournalPanel";
import { MatchJournalPostCallModal } from "@/components/MatchJournalPostCallModal";
import { MatchMilestonesTimeline } from "@/components/MatchMilestonesTimeline";
import { VideoCall, type VideoCallPhase } from "@/components/VideoCall";
import { VideoDatePrimerModal } from "@/components/VideoDatePrimerModal";
import { ModalCloseButton } from "@/components/ModalCloseButton";
import { useToast } from "@/components/ToastProvider";
import type { ViewerProfile } from "@/lib/types";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type MatchPartnerPreview = {
  city: string | null;
  birthYear: number | null;
  bio: string | null;
  photoUrl: string | null;
  photoVerified: boolean;
};

function ageFromBirthYear(birthYear: number | null): number | null {
  if (birthYear == null) return null;
  const y = new Date().getFullYear() - birthYear;
  return y > 0 && y < 120 ? y : null;
}

export function ChatRoomClient({
  matchId,
  selfId,
  otherUserId,
  otherName,
  otherPreview,
}: {
  matchId: string;
  selfId: string;
  otherUserId: string;
  otherName: string;
  otherPreview?: MatchPartnerPreview | null;
}) {
  const router = useRouter();
  const { show } = useToast();
  const searchParams = useSearchParams();
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoPhase, setVideoPhase] = useState<VideoCallPhase>("idle");
  const [videoPrimerOpen, setVideoPrimerOpen] = useState(false);
  const videoCooldownUntil = useRef(0);
  const [roomTab, setRoomTab] = useState<"messages" | "common">("messages");
  const [coachOpen, setCoachOpen] = useState(false);
  const [memberProfileOpen, setMemberProfileOpen] = useState(false);
  const [commonCount, setCommonCount] = useState<number | null>(null);
  const [journalAfterCallOpen, setJournalAfterCallOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [postCallReturnHint, setPostCallReturnHint] = useState(false);

  const handleJournalUnmatched = useCallback(() => {
    show("Match ended.", "success");
    router.replace("/matches");
  }, [router, show]);

  const openVideoDateFlow = useCallback(async () => {
    const now = Date.now();
    if (now < videoCooldownUntil.current) return;
    if (videoOpen && (videoPhase === "connecting" || videoPhase === "connected")) return;
    videoCooldownUntil.current = now + 700;

    const res = await fetch(`/api/livekit/room-status?matchId=${encodeURIComponent(matchId)}`, {
      credentials: "include",
    });
    const data = (await res.json().catch(() => ({}))) as { hasRemote?: boolean };
    if (data.hasRemote) {
      setVideoOpen(true);
      return;
    }
    setVideoPrimerOpen(true);
  }, [matchId, videoOpen, videoPhase]);

  /** Answering a ring or deep link: join immediately (no primer or lobby). */
  useEffect(() => {
    if (searchParams.get("video") !== "1") return;
    queueMicrotask(() => {
      void fetch("/api/call-signal/dismiss", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      setVideoOpen(true);
      router.replace(`/chat/${matchId}`, { scroll: false });
    });
  }, [searchParams, matchId, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/matches/${matchId}/common-answers`);
      const json = (await res.json().catch(() => null)) as { items?: unknown[] } | null;
      if (cancelled || !res.ok || !json || !Array.isArray(json.items)) {
        if (!cancelled) setCommonCount(0);
        return;
      }
      setCommonCount(json.items.length);
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const modalInitialProfile = useMemo((): Partial<ViewerProfile> | null => {
    if (!otherPreview) return null;
    return {
      id: otherUserId,
      display_name: otherName,
      birth_year: otherPreview.birthYear,
      city: otherPreview.city,
      bio: otherPreview.bio ?? "",
      photo_urls: otherPreview.photoUrl ? [otherPreview.photoUrl] : [],
      photo_verified: otherPreview.photoVerified,
    };
  }, [otherPreview, otherUserId, otherName]);

  async function confirmBlock() {
    const res = await fetch("/api/block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: otherUserId }),
    });
    setBlockDialogOpen(false);
    if (res.ok) {
      show("They’re blocked. You won’t see each other in Discover or Matches.", "success");
      window.location.href = "/matches";
      return;
    }
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    show(data?.error ?? "Could not block right now. Try again or use Settings.", "error");
  }

  const previewAge = otherPreview ? ageFromBirthYear(otherPreview.birthYear) : null;
  const metaParts: string[] = [];
  if (otherPreview?.city) metaParts.push(otherPreview.city);
  if (previewAge != null) metaParts.push(String(previewAge));

  return (
    <div className="space-y-5">
      <div className="card-surface motion-card space-y-5 border border-zinc-200/80 p-4 sm:p-5 dark:border-zinc-700/80">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--accent)]">Match space</p>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 gap-3">
            <button
              type="button"
              onClick={() => setMemberProfileOpen(true)}
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-100 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 sm:h-16 sm:w-16"
              aria-label={`View ${otherName}’s profile`}
            >
              {otherPreview?.photoUrl ? (
                <Image
                  src={otherPreview.photoUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width:640px) 56px, 64px"
                  unoptimized
                />
              ) : (
                <span className="flex h-full items-center justify-center font-display text-lg font-semibold text-zinc-400">
                  {otherName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMemberProfileOpen(true)}
                className="group text-left font-display text-lg font-semibold tracking-tight text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50 sm:text-xl"
              >
                {otherName}
                <span className="ml-1.5 inline text-xs font-normal text-[var(--accent)] no-underline opacity-0 transition group-hover:opacity-100 sm:ml-2 sm:text-sm">
                  View profile
                </span>
              </button>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                {metaParts.length > 0 ? <span>{metaParts.join(" · ")}</span> : null}
                {otherPreview?.photoVerified ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Verified
                  </span>
                ) : null}
                {metaParts.length === 0 && !otherPreview?.photoVerified ? (
                  <span className="text-zinc-500">Tap photo or name for full profile</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="w-full shrink-0 border-t border-zinc-200/60 pt-4 dark:border-zinc-700/60 lg:w-auto lg:border-t-0 lg:pt-0">
            <div className="flex flex-col gap-1 lg:flex-row lg:flex-nowrap lg:items-end lg:justify-end lg:gap-3">
              <div className="order-1 flex w-full flex-col items-stretch gap-1 lg:order-4 lg:w-auto lg:items-end">
                <button
                  type="button"
                  disabled={videoOpen && (videoPhase === "connecting" || videoPhase === "connected")}
                  onClick={() => void openVideoDateFlow()}
                  className="cta-video-primary order-1 min-h-10 w-full px-4 py-2.5 text-sm lg:w-auto"
                >
                  {videoOpen && videoPhase === "connecting" ? "Connecting…" : "Video Date Room"}
                </button>
                <p className="order-2 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 lg:text-right">
                  Schedule your video date
                </p>
              </div>
              <div className="order-2 grid grid-cols-3 gap-2 sm:gap-3 lg:contents">
                <button
                  type="button"
                  onClick={() => setMemberProfileOpen(true)}
                  className="motion-tap min-h-10 rounded-full border border-zinc-300 px-2 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800 lg:order-1 lg:px-4 lg:text-sm"
                >
                  Profile
                </button>
                <button
                  type="button"
                  onClick={() => setCoachOpen(true)}
                  className="motion-tap min-h-10 rounded-full border border-zinc-300 px-2 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800 lg:order-2 lg:px-4 lg:text-sm"
                >
                  Coach
                </button>
                <button
                  type="button"
                  onClick={() => setBlockDialogOpen(true)}
                  className="motion-tap min-h-10 rounded-full border border-zinc-300 px-2 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800 lg:order-3 lg:px-4 lg:text-sm"
                >
                  Block
                </button>
              </div>
            </div>
          </div>
        </div>

        {commonCount != null && commonCount > 0 ? (
          <div className="border-t border-zinc-200/60 pt-4 dark:border-zinc-700/60">
            <button
              type="button"
              onClick={() => setRoomTab("common")}
              className="w-full rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-muted)]/40 px-3 py-2.5 text-left text-xs transition hover:bg-[var(--accent-muted)]/60 dark:border-[var(--accent)]/30 sm:text-sm"
            >
              <span className="font-semibold text-[var(--accent)]">
                {commonCount} shared answer{commonCount === 1 ? "" : "s"}
              </span>
              <span className="text-zinc-600 dark:text-zinc-400"> — see questionnaire topics you matched on</span>
            </button>
          </div>
        ) : null}

        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Light messages to coordinate — your <strong className="font-medium text-zinc-700 dark:text-zinc-300">video date</strong>{" "}
          is the main event.
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2.5 text-center dark:border-zinc-700/80 dark:bg-zinc-900/40">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          Safety &amp; respect
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          Marriage View encourages <strong className="font-medium text-zinc-700 dark:text-zinc-300">video dates</strong> over
          long texting. Meet in public first, trust your instincts.{" "}
          <a href="/terms" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
            Terms
          </a>
          {" · "}
          <a href="/privacy" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
            Privacy
          </a>
          {" · "}
          <a href="/community" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
            Community
          </a>
          {" · "}
          <a href="/settings" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
            Block &amp; report
          </a>
        </p>
      </div>
      <div
        className="flex gap-1 rounded-full border border-zinc-200/90 bg-zinc-100/80 p-1 dark:border-zinc-700/90 dark:bg-zinc-800/60"
        role="tablist"
        aria-label="Chat sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={roomTab === "messages"}
          onClick={() => setRoomTab("messages")}
          className={`min-h-10 flex-1 rounded-full px-3 text-sm font-medium transition-all duration-200 ease-out ${
            roomTab === "messages"
              ? "bg-[var(--surface-elevated)] text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Messages
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={roomTab === "common"}
          onClick={() => setRoomTab("common")}
          className={`min-h-10 flex-1 rounded-full px-3 text-sm font-medium transition-all duration-200 ease-out ${
            roomTab === "common"
              ? "bg-[var(--surface-elevated)] text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          In common
          {commonCount != null && commonCount > 0 ? (
            <span className="ml-1 tabular-nums text-[var(--accent)]">· {commonCount}</span>
          ) : null}
        </button>
      </div>
      {roomTab === "messages" ? (
        <ChatThread
          matchId={matchId}
          selfId={selfId}
          otherUserId={otherUserId}
          otherName={otherName}
          onRequestVideoDate={() => void openVideoDateFlow()}
          suppressVideoDateNudge={videoPrimerOpen || videoOpen}
        />
      ) : (
        <div className="space-y-4">
          <MatchMilestonesTimeline matchId={matchId} />
          <MatchJournalPanel matchId={matchId} otherName={otherName} onUnmatched={handleJournalUnmatched} />
          <MatchCommonGround matchId={matchId} otherName={otherName} />
        </div>
      )}
      <VideoDatePrimerModal
        otherName={otherName}
        open={videoPrimerOpen}
        onClose={() => setVideoPrimerOpen(false)}
        onStartCall={() => {
          setVideoPrimerOpen(false);
          setVideoOpen(true);
        }}
      />
      {videoOpen ? (
        <VideoCall
          matchId={matchId}
          otherUserId={otherUserId}
          otherName={otherName}
          onPhaseChange={setVideoPhase}
          onClose={(detail) => {
            setVideoPhase("idle");
            setVideoOpen(false);
            if (detail?.hadConnected) {
              setJournalAfterCallOpen(true);
            }
          }}
        />
      ) : null}
      <MatchJournalPostCallModal
        open={journalAfterCallOpen}
        variant="post_call"
        matchId={matchId}
        otherName={otherName}
        otherUserId={otherUserId}
        onClose={() => setJournalAfterCallOpen(false)}
        onReflectSaved={() => setPostCallReturnHint(true)}
        onUnmatched={handleJournalUnmatched}
      />
      {blockDialogOpen ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="block-dialog-title"
        >
          <div className="card-surface relative max-w-md border border-zinc-200/90 p-5 pt-11 dark:border-zinc-700/90">
            <ModalCloseButton className="absolute right-3 top-3" onClick={() => setBlockDialogOpen(false)} />
            <h2 id="block-dialog-title" className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Block {otherName}?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              They won&apos;t appear in Discover or Matches for you, and you won&apos;t appear for them. This chat stays
              in your history until you leave the page; you can unblock from Settings if you ever need to.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
                onClick={() => setBlockDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                onClick={() => void confirmBlock()}
              >
                Block
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <CoachModal
        open={coachOpen}
        onClose={() => setCoachOpen(false)}
        matchId={matchId}
        otherName={otherName}
      />
      <MemberProfileModal
        open={memberProfileOpen}
        onClose={() => setMemberProfileOpen(false)}
        userId={otherUserId}
        displayNameFallback={otherName}
        matchId={matchId}
        initialProfile={modalInitialProfile}
      />
    </div>
  );
}
