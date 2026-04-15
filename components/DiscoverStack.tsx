"use client";

import { DiscoverProfilePhotos } from "@/components/DiscoverProfilePhotos";
import { EmptyState } from "@/components/EmptyState";
import { MemberProfileModal } from "@/components/MemberProfileModal";
import { PlusUpsellModal } from "@/components/PlusUpsellModal";
import { useToast } from "@/components/ToastProvider";
import type { MatchInsight, PublicProfile } from "@/lib/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Item = { profile: PublicProfile; score: number; insight: MatchInsight };

function normalizeDiscoverItem(raw: {
  profile: PublicProfile;
  score: number;
  insight?: MatchInsight;
}): Item {
  const profile: PublicProfile = {
    ...raw.profile,
    photo_verified: raw.profile.photo_verified ?? false,
  };
  return {
    profile,
    score: raw.score,
    insight: raw.insight ?? {
      totalPercent: Math.round(raw.score * 1000) / 10,
      hardFail: false,
      reasons: [],
      categoryBreakdown: {},
    },
  };
}

type DiscoverDiag = {
  otherOnboardedInPool: number;
  droppedAlreadySwipedOrSelf: number;
  droppedBlocked: number;
  droppedAgePrefs: number;
  droppedDistance: number;
  droppedGenderSeeking: number;
  droppedVerifiedOnly?: number;
  passedFilters: number;
};

function describeDiscoverFilters(maxKm: number | null, verifiedOnly: boolean): string {
  const dist =
    maxKm == null
      ? "Distance: your profile range (“My range”)"
      : `Distance: within ${maxKm} km`;
  const ver = verifiedOnly ? " · Verified-only deck" : " · All eligible photos";
  return `${dist}${ver}`;
}

function emptyDiscoverActionHints(diag: DiscoverDiag | null, verifiedOnly: boolean): string[] {
  const hints: string[] = [];
  if (verifiedOnly) {
    hints.push("Turn off “Verified photos only” to include more profiles (Plus).");
  }
  if (diag && diag.droppedVerifiedOnly && diag.droppedVerifiedOnly > 0) {
    hints.push(`${diag.droppedVerifiedOnly} profile(s) were hidden by your verified-only filter.`);
  }
  if (diag && diag.droppedDistance > 0) {
    hints.push("Try a wider distance chip (e.g. 100 km or 200 km) or “My range”.");
  }
  if (diag && diag.droppedAgePrefs > 0) {
    hints.push("Widen your age preferences in Profile if they’re very narrow.");
  }
  if (diag && diag.droppedGenderSeeking > 0) {
    hints.push(
      "Discover only shows opposite-gender pairs (your gender vs. who you seek, both ways). For testing, add another onboarded account with the matching pair—for example woman ↔ man.",
    );
  }
  if (diag && diag.droppedAlreadySwipedOrSelf > 0 && diag.passedFilters === 0) {
    hints.push("You may have passed or liked everyone currently eligible — check back later or adjust filters.");
  }
  if (!hints.length) {
    hints.push("Adjust filters above, or refresh after more members join your area.");
  }
  return hints.slice(0, 4);
}

async function fetchDiscover(opts: {
  maxKm: number | null;
  verifiedOnly: boolean;
  prioritizeInbound: boolean;
}): Promise<{
  items: Item[];
  error: string | null;
  diag: DiscoverDiag | null;
  myBoostEndsAt: string | null;
}> {
  const p = new URLSearchParams();
  if (opts.maxKm != null) p.set("max_km", String(opts.maxKm));
  if (opts.verifiedOnly) p.set("verified_only", "1");
  if (opts.prioritizeInbound) p.set("prioritize_inbound", "1");
  const qs = p.toString();
  const res = await fetch(qs ? `/api/discover?${qs}` : "/api/discover");
  const data = await res.json();
  if (!res.ok) {
    return { items: [], error: data.error ?? "Could not load discovery", diag: null, myBoostEndsAt: null };
  }
  const rawItems = (data.items ?? []) as Array<{
    profile: PublicProfile;
    score: number;
    insight?: MatchInsight;
  }>;
  return {
    items: rawItems.map(normalizeDiscoverItem),
    error: null,
    diag: (data.diag as DiscoverDiag) ?? null,
    myBoostEndsAt: (data.myBoostEndsAt as string | null) ?? null,
  };
}

export function DiscoverSkeleton() {
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <div className="relative pt-8">
        <div
          className="absolute inset-x-6 top-3 h-[22rem] rounded-[var(--radius-lg)] opacity-40 dark:opacity-25"
          style={{ transform: "scale(0.94) translateY(8px)" }}
        >
          <div className="skeleton-shimmer h-full w-full rounded-[var(--radius-lg)]" />
        </div>
        <div className="relative z-10 overflow-hidden rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white shadow-[var(--shadow-card)] dark:border-zinc-700/80 dark:bg-zinc-900">
          <div className="skeleton-shimmer aspect-[3/4] w-full" />
          <div className="space-y-3 p-4">
            <div className="skeleton-shimmer h-4 w-2/3 rounded-md" />
            <div className="skeleton-shimmer h-3 w-full rounded-md" />
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-4">
        <div className="skeleton-shimmer h-14 w-24 rounded-full" />
        <div className="skeleton-shimmer h-14 w-28 rounded-full" />
      </div>
      <p className="text-center text-xs text-zinc-500">Finding great matches…</p>
    </div>
  );
}

export function DiscoverStack() {
  const { show } = useToast();
  const searchParams = useSearchParams();
  const prioritizeInbound = searchParams.get("prioritize_inbound") === "1";
  const reduceMotion = useReducedMotion() ?? false;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<DiscoverDiag | null>(null);
  /** Passed to exit variants: like → right (+1), pass → left (−1). */
  const [deckDir, setDeckDir] = useState<1 | -1>(1);
  const [maxKmFilter, setMaxKmFilter] = useState<number | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [tier, setTier] = useState<string>("free");
  const [upsell, setUpsell] = useState<{ title: string; body: string } | null>(null);
  const [onboardingCta, setOnboardingCta] = useState<{ href: string; label: string } | null>(null);
  const [myBoostEndsAt, setMyBoostEndsAt] = useState<string | null>(null);
  const [boostViews, setBoostViews] = useState<number | null>(null);
  const [displayedMatchPct, setDisplayedMatchPct] = useState(0);
  const impressionSentRef = useRef<string | null>(null);
  const [memberProfileOpen, setMemberProfileOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/me/entitlements");
      if (!res.ok) return;
      const j = (await res.json()) as { tier?: string };
      setTier(j.tier ?? "free");
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { items: next, error: err, diag: d, myBoostEndsAt: b } = await fetchDiscover({
      maxKm: maxKmFilter,
      verifiedOnly,
      prioritizeInbound,
    });
    setItems(next);
    setError(err);
    setDiag(d);
    setMyBoostEndsAt(b);
    setLoading(false);
  }, [maxKmFilter, verifiedOnly, prioritizeInbound]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!myBoostEndsAt) {
      setBoostViews(null);
      return;
    }
    const tick = () => {
      void (async () => {
        const res = await fetch("/api/me/boost-status");
        if (!res.ok) return;
        const j = (await res.json()) as { viewsThisSession?: number };
        setBoostViews(j.viewsThisSession ?? 0);
      })();
    };
    tick();
    const id = window.setInterval(tick, 12000);
    return () => window.clearInterval(id);
  }, [myBoostEndsAt]);

  const [boostPulse, setBoostPulse] = useState(0);
  useEffect(() => {
    if (!myBoostEndsAt) return;
    const id = window.setInterval(() => setBoostPulse((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [myBoostEndsAt]);

  const cardTopId = items[0]?.profile.id;
  const cardInsightPct = items[0]?.insight.totalPercent;

  useEffect(() => {
    if (!cardTopId) return;
    if (impressionSentRef.current === cardTopId) return;
    impressionSentRef.current = cardTopId;
    void fetch("/api/discover/impression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileUserId: cardTopId }),
    });
  }, [cardTopId]);

  useEffect(() => {
    const target = cardInsightPct != null ? Math.round(cardInsightPct) : 0;
    if (reduceMotion) {
      setDisplayedMatchPct(target);
      return;
    }
    setDisplayedMatchPct(0);
    const start = Date.now();
    const dur = 850;
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      setDisplayedMatchPct(Math.round(target * t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cardInsightPct, cardTopId, reduceMotion]);

  const top = items[0];
  const nextPeek = items[1];

  async function act(action: "like" | "pass") {
    if (!top) return;
    const snapshot = [...items];
    const removedTop = top;
    setDeckDir(action === "like" ? 1 : -1);
    setItems((prev) => prev.slice(1));
    const res = await fetch("/api/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUser: removedTop.profile.id, action }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg =
        typeof data.error === "string" && data.error.trim()
          ? data.error
          : "We couldn’t save that swipe — check your connection and try again.";
      show(msg, "error");
      setItems(snapshot);
      return;
    }
    if (data.matched) {
      show("It’s a match — say hello from Matches.", "success");
    }
    if (snapshot.length <= 1) void load();
  }

  if (loading) {
    return <DiscoverSkeleton />;
  }

  if (error) {
    const needsOnboarding = error.toLowerCase().includes("onboarding");
    return (
      <EmptyState
        title={needsOnboarding ? "Finish onboarding first" : "Discover isn’t available right now"}
        description={
          needsOnboarding
            ? error
            : `${error} If this keeps happening, try again in a moment or head to Settings to confirm you’re signed in.`
        }
      >
        {needsOnboarding ? (
          <div className="flex flex-col items-center gap-2">
            <Link
              href="/onboarding/profile"
              className="inline-flex justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-center text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)]"
            >
              Continue onboarding
            </Link>
            <p className="max-w-sm text-center text-xs text-zinc-500 dark:text-zinc-400">
              Profile → questionnaire → photos, then finish. A few quiz questions are required; the rest are optional
              for better matches.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)]"
          >
            Try again
          </button>
        )}
      </EmptyState>
    );
  }

  if (!top) {
    return (
      <div className="card-surface border border-zinc-200/80 p-6 text-left dark:border-zinc-700/80">
        <p className="text-center font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          No one to show right now
        </p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          The feed only includes people who pass <strong>all</strong> of these checks:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <strong>Finished onboarding</strong> — profile, photo, questionnaire, and “finish” step so{" "}
            <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">onboarding_complete</code> is true
          </li>
          <li>
            <strong>Gender / seeking</strong> — your “seeking” must match their gender and vice versa (unless someone
            chose “everyone”)
          </li>
          <li>
            <strong>Age range</strong> — each person’s birth year must fall in the other’s min–max age preference
          </li>
          <li>
            <strong>Distance</strong> — if both of you saved latitude &amp; longitude, you must be within{" "}
            <em>both</em> of your max-distance settings
          </li>
          <li>
            <strong>Not already liked or passed</strong> — those people are hidden until you run out of new faces
          </li>
          <li>
            <strong>Quiz dealbreakers</strong> — conflicting answers (e.g. children) lower the match score to 0% but
            people can still appear for testing
          </li>
        </ul>
        <p className="mt-3 text-center text-xs text-zinc-500">
          Tip: for testing, use two accounts with matching gender/seeking (e.g. woman ↔ man), overlapping ages, and
          leave lat/lng blank unless you need distance.
        </p>
        <div className="mt-4 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-muted)]/30 px-3 py-2.5 text-left dark:border-[var(--accent)]/25">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">Try this</p>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
            {emptyDiscoverActionHints(diag, verifiedOnly).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
        {diag ? (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white/80 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950/80">
            <p className="font-medium text-zinc-800 dark:text-zinc-200">What the server saw (this account)</p>
            <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
              <li>
                Other users <strong>ready for discover</strong> (onboarding done):{" "}
                <strong className="text-zinc-900 dark:text-zinc-100">{diag.otherOnboardedInPool}</strong>
                {diag.otherOnboardedInPool === 0 ? (
                  <span className="block text-amber-800 dark:text-amber-200">
                    → No one else has finished onboarding. Each test user must complete profile, photo, quiz, and the
                    final “finish” step.
                  </span>
                ) : null}
              </li>
              {diag.droppedAlreadySwipedOrSelf > 0 ? (
                <li>Removed (already liked or passed): {diag.droppedAlreadySwipedOrSelf}</li>
              ) : null}
              {diag.droppedBlocked > 0 ? <li>Removed (blocked): {diag.droppedBlocked}</li> : null}
              {diag.droppedAgePrefs > 0 ? (
                <li>
                  Removed (age preferences): {diag.droppedAgePrefs}{" "}
                  <span className="text-zinc-500">— widen age min/max on both profiles or fix birth years.</span>
                </li>
              ) : null}
              {diag.droppedDistance > 0 ? (
                <li>
                  Removed (distance): {diag.droppedDistance}{" "}
                  <span className="text-zinc-500">— increase max km or clear lat/lng on both sides.</span>
                </li>
              ) : null}
              {diag.droppedGenderSeeking > 0 ? (
                <li>
                  Removed (gender / seeking mismatch): {diag.droppedGenderSeeking}{" "}
                  <span className="text-zinc-500">
                    — e.g. woman seeking man only sees men seeking women (or “everyone”).
                  </span>
                </li>
              ) : null}
              {diag.droppedVerifiedOnly != null && diag.droppedVerifiedOnly > 0 ? (
                <li>
                  Removed (verified-only filter): {diag.droppedVerifiedOnly}
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
        <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
          {(maxKmFilter !== null || verifiedOnly) && (
            <button
              type="button"
              onClick={() => {
                setMaxKmFilter(null);
                setVerifiedOnly(false);
              }}
              className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Reset filters
            </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)] active:scale-[0.98]"
          >
            Refresh deck
          </button>
        </div>
      </div>
    );
  }

  const photos = top.profile.photo_urls ?? [];
  const nextPeekPhotos = nextPeek?.profile.photo_urls ?? [];
  const categoryEntries = Object.entries(top.insight.categoryBreakdown).filter(
    ([, v]) => v.maxPoints > 0,
  );

  const cardVariants = {
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: reduceMotion
        ? { duration: 0 }
        : ({ type: "spring", stiffness: 420, damping: 34, mass: 0.85 } as const),
    },
    exit: (dir: 1 | -1) =>
      reduceMotion
        ? { opacity: 0, transition: { duration: 0.12 } }
        : {
            x: dir * 320,
            rotate: dir * 9,
            opacity: 0,
            transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const },
          },
  };

  const boostRemainingSec =
    myBoostEndsAt != null
      ? Math.max(0, Math.floor((new Date(myBoostEndsAt).getTime() - Date.now()) / 1000)) + 0 * boostPulse
      : 0;

  function setVerifiedFilter(next: boolean) {
    if (next && tier !== "plus") {
      setUpsell({
        title: "Photo-verified filter",
        body: "Marriage View Plus unlocks a verified-only discover filter so you can prioritize trust-first profiles.",
      });
      return;
    }
    setVerifiedOnly(next);
  }

  async function startBoost() {
    if (tier !== "plus") {
      setUpsell({
        title: "Profile Boost",
        body: "Boost puts you higher in other people’s discover stacks for a limited window, with a live view ticker.",
      });
      return;
    }
    const res = await fetch("/api/boost/start", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      show(data.error ?? "Boost failed", "error");
      return;
    }
    show("Boost active — more people will see you soon.", "success");
    void load();
  }

  const distanceChips: { label: string; km: number | null }[] = [
    { label: "My range", km: null },
    { label: "25 km", km: 25 },
    { label: "50 km", km: 50 },
    { label: "100 km", km: 100 },
    { label: "200 km", km: 200 },
  ];

  const filtersNonDefault = maxKmFilter !== null || verifiedOnly;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <div className="space-y-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-zinc-700/80 dark:bg-zinc-900/40">
        <p className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Active filters:</span>{" "}
          {describeDiscoverFilters(maxKmFilter, verifiedOnly)}
          {filtersNonDefault ? (
            <>
              {" "}
              <button
                type="button"
                className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                onClick={() => {
                  setMaxKmFilter(null);
                  setVerifiedOnly(false);
                }}
              >
                Reset
              </button>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Distance focus
          </span>
          {distanceChips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setMaxKmFilter(c.km)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                maxKmFilter === c.km
                  ? "bg-[var(--accent)] text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setVerifiedFilter(!verifiedOnly)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              verifiedOnly
                ? "bg-emerald-700 text-white"
                : "border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            }`}
          >
            Verified photos only {tier !== "plus" ? "(Plus)" : ""}
          </button>
          {diag ? (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              ~{diag.passedFilters} in stack
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200/70 pt-3 dark:border-zinc-700/70">
          {myBoostEndsAt && boostRemainingSec > 0 ? (
            <p className="text-xs font-medium text-rose-800 dark:text-rose-200">
              Boost {Math.floor(boostRemainingSec / 60)}:
              {(boostRemainingSec % 60).toString().padStart(2, "0")} left
              {boostViews != null ? ` · ~${boostViews} profile views this session` : ""}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void startBoost()}
              className="rounded-full border border-amber-600/50 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100"
            >
              Boost my profile (Plus)
            </button>
          )}
        </div>
      </div>
      <div className="relative pt-10">
        {nextPeek ? (
          <motion.div
            key={nextPeek.profile.id}
            initial={reduceMotion ? false : { opacity: 0.35, scale: 0.9 }}
            animate={{ opacity: 0.45, scale: 0.92, y: 6 }}
            transition={
              reduceMotion ? { duration: 0 } : ({ type: "spring", stiffness: 380, damping: 28 } as const)
            }
            className="pointer-events-none absolute inset-x-5 top-2 z-0 overflow-hidden rounded-[var(--radius-lg)] border border-zinc-200/60 bg-zinc-100 shadow-md dark:border-zinc-700/50 dark:bg-zinc-800"
            style={{ transformOrigin: "50% 100%" }}
            aria-hidden
          >
            {nextPeekPhotos[0] ? (
              <div className="relative aspect-[3/4] w-full">
                <Image
                  src={nextPeekPhotos[0]}
                  alt=""
                  fill
                  className="object-cover blur-[2px]"
                  sizes="200px"
                  unoptimized
                />
              </div>
            ) : (
              <div className="aspect-[3/4] w-full bg-zinc-200 dark:bg-zinc-700" />
            )}
          </motion.div>
        ) : null}

        <AnimatePresence mode="popLayout" initial={false}>
          <motion.article
            key={top.profile.id}
            custom={deckDir}
            variants={cardVariants}
            initial={false}
            animate="animate"
            exit="exit"
            className="relative z-10 overflow-hidden rounded-[var(--radius-lg)] border border-zinc-200/90 bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] dark:border-zinc-700/90"
          >
          <div className="relative aspect-[3/4] bg-zinc-100 dark:bg-zinc-800">
            <DiscoverProfilePhotos
              urls={photos}
              profileId={top.profile.id}
              sizes="(max-width: 768px) 100vw, 400px"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            <div className="pointer-events-auto absolute right-3 top-3 z-[2] flex flex-col items-end gap-2">
              <button
                type="button"
                className="rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white shadow-md backdrop-blur-sm transition hover:bg-black/55"
                onClick={(e) => {
                  e.stopPropagation();
                  setMemberProfileOpen(true);
                }}
              >
                Full profile
              </button>
              <div
                className="animate-score-pop flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-white/30 bg-black/35 text-white shadow-lg backdrop-blur-md"
                title="Compatibility"
              >
                <span className="text-lg font-bold leading-none tabular-nums">{displayedMatchPct}</span>
                <span className="text-[0.65rem] font-medium uppercase tracking-wide opacity-90">match</span>
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[2] p-4 text-white">
              <h2 className="flex flex-wrap items-center gap-2 font-display text-2xl font-semibold tracking-tight drop-shadow-md">
                <span>
                  {top.profile.display_name}
                  {top.profile.birth_year ? (
                    <span className="text-lg font-normal opacity-90">
                      {" "}
                      · {new Date().getFullYear() - top.profile.birth_year} yrs
                    </span>
                  ) : null}
                </span>
                {top.profile.photo_verified ? (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm"
                    title="Photo verified"
                  >
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414l2.293 2.293 6.543-6.543a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Verified
                  </span>
                ) : null}
              </h2>
              {top.profile.city ? (
                <p className="mt-1 text-sm font-medium text-white/90 drop-shadow">{top.profile.city}</p>
              ) : null}
            </div>
          </div>
          <div className="border-t border-zinc-100/80 bg-white/95 p-4 dark:border-zinc-800 dark:bg-zinc-900/95">
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {top.profile.bio || "No bio yet."}
            </p>
            {top.insight.reasons.length > 0 || categoryEntries.length > 0 ? (
              <details className="mt-4 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 text-left dark:border-zinc-700/80 dark:bg-zinc-800/40">
                <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--accent)] [&::-webkit-details-marker]:hidden">
                  Why this match? <span className="font-normal text-zinc-500">(tap to expand)</span>
                </summary>
                {top.insight.hardFail ? (
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                    {top.insight.reasons[0] ?? "Low compatibility on a must-align topic."}
                  </p>
                ) : (
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {top.insight.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {categoryEntries.length > 0 ? (
                  <div className="mt-3 border-t border-zinc-200/70 pt-3 dark:border-zinc-700/70">
                    {top.insight.hardFail ? (
                      <p className="mb-2 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                        Below is how you align by area on other questions; overall compatibility is 0% because of
                        the dealbreaker above.
                      </p>
                    ) : null}
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      By topic
                    </p>
                    {!top.insight.hardFail ? (
                      <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                        Each row is fit within that topic (questions are weighted differently). Overall match
                        blends all topics.
                      </p>
                    ) : null}
                    <ul className="mt-1 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                      {categoryEntries.map(([cat, v]) => (
                        <li key={cat} className="flex justify-between gap-2 tabular-nums">
                          <span className="capitalize">{cat}</span>
                          <span>{v.percent}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </details>
            ) : null}
          </div>
        </motion.article>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-5 px-2">
        <motion.button
          type="button"
          onClick={() => void act("pass")}
          whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          whileHover={reduceMotion ? undefined : { scale: 1.02 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
          className="group flex h-16 min-w-16 items-center justify-center rounded-full border-2 border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-700 shadow-sm transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
        >
          <svg
            className="mr-2 h-5 w-5 opacity-60 group-hover:opacity-100"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Pass
        </motion.button>
        <motion.button
          type="button"
          onClick={() => void act("like")}
          whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          whileHover={reduceMotion ? undefined : { scale: 1.04 }}
          transition={{ type: "spring", stiffness: 480, damping: 26 }}
          className="group flex h-16 min-w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-700 px-8 text-sm font-semibold text-white shadow-lg shadow-rose-900/25 transition-[filter] hover:from-rose-600 hover:to-rose-800 hover:shadow-xl hover:shadow-rose-900/30"
        >
          <svg className="mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          Like
        </motion.button>
      </div>
      <MemberProfileModal
        open={memberProfileOpen}
        onClose={() => setMemberProfileOpen(false)}
        userId={top.profile.id}
        displayNameFallback={top.profile.display_name}
        insight={top.insight}
        initialProfile={top.profile}
      />
      <PlusUpsellModal
        open={upsell != null}
        title={upsell?.title ?? ""}
        body={upsell?.body ?? ""}
        onClose={() => setUpsell(null)}
      />
    </div>
  );
}
