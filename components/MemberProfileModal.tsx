"use client";

import type { CommonAnswersPayload, MatchInsight, ViewerProfile } from "@/lib/types";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function ageFromBirthYear(birthYear: number | null): number | null {
  if (birthYear == null) return null;
  const y = new Date().getFullYear() - birthYear;
  return y > 0 && y < 120 ? y : null;
}

function seedViewerProfile(
  id: string,
  nameFallback: string,
  partial?: Partial<ViewerProfile> | null,
): ViewerProfile | null {
  if (!partial || partial.id !== id) return null;
  return {
    id,
    display_name: partial.display_name ?? nameFallback,
    birth_year: partial.birth_year ?? null,
    city: partial.city ?? null,
    bio: partial.bio ?? "",
    gender: partial.gender ?? null,
    seeking: partial.seeking ?? null,
    age_min: partial.age_min ?? 18,
    age_max: partial.age_max ?? 99,
    max_distance_km: partial.max_distance_km ?? 200,
    photo_urls: Array.isArray(partial.photo_urls) ? partial.photo_urls : [],
    photo_verified: partial.photo_verified ?? false,
    questionnaire_version: partial.questionnaire_version ?? 1,
    ...(partial.icebreaker_snippets?.length
      ? { icebreaker_snippets: partial.icebreaker_snippets }
      : {}),
  };
}

export function MemberProfileModal({
  open,
  onClose,
  userId,
  displayNameFallback,
  matchId,
  insight,
  initialProfile,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  displayNameFallback: string;
  matchId?: string | null;
  insight?: MatchInsight | null;
  /** Optional fields from discover card to avoid empty flash. */
  initialProfile?: Partial<ViewerProfile> | null;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [common, setCommon] = useState<CommonAnswersPayload | null>(null);
  const [commonLoading, setCommonLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const q = matchId ? `?matchId=${encodeURIComponent(matchId)}` : "";
      const res = await fetch(`/api/profiles/${userId}/viewer${q}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data as { error?: string })?.error ?? "Could not load profile");
        setProfile(null);
        return;
      }
      setProfile(data as ViewerProfile);
    } finally {
      setLoading(false);
    }
  }, [userId, matchId]);

  useEffect(() => {
    if (!open || !userId) return;
    void loadProfile();
  }, [open, userId, loadProfile]);

  useEffect(() => {
    if (open) return;
    setProfile(null);
    setError(null);
    setCommon(null);
    setLightboxUrl(null);
    setCarouselIdx(0);
  }, [open]);

  useEffect(() => {
    if (!open || !matchId) return;
    let cancelled = false;
    setCommonLoading(true);
    void (async () => {
      const res = await fetch(`/api/matches/${matchId}/common-answers`);
      const json = (await res.json().catch(() => null)) as CommonAnswersPayload & { error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setCommon(null);
      } else {
        setCommon(json as CommonAnswersPayload);
      }
      setCommonLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, matchId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxUrl) setLightboxUrl(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, lightboxUrl]);

  const seed =
    open && userId ? seedViewerProfile(userId, displayNameFallback, initialProfile) : null;
  const p = profile ?? seed;
  const name = p?.display_name || displayNameFallback;
  const age = ageFromBirthYear(p?.birth_year ?? null);
  const photos = p?.photo_urls?.filter(Boolean) ?? [];
  const safeCarousel = Math.min(carouselIdx, Math.max(0, photos.length - 1));
  const mainPhoto = photos[safeCarousel] ?? null;

  const categoryEntries = insight
    ? Object.entries(insight.categoryBreakdown).filter(([, v]) => v.maxPoints > 0)
    : [];

  const sectionNav = useMemo(() => {
    if (!p) return [];
    const items: { id: string; label: string }[] = [{ id: "member-profile-photos", label: "Photos" }];
    if (p.bio?.trim()) items.push({ id: "member-profile-about", label: "About" });
    if (p.icebreaker_snippets?.length) {
      items.push({ id: "member-profile-icebreakers", label: "Icebreakers" });
    }
    items.push({ id: "member-profile-looking", label: "Looking for" });
    if (insight) items.push({ id: "member-profile-match", label: "Match" });
    if (matchId) items.push({ id: "member-profile-common", label: "In common" });
    return items;
  }, [p, insight, matchId]);

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!open || !userId) return null;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-profile-title"
        className="relative flex max-h-[min(92vh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-200/90 bg-[var(--surface-elevated)] shadow-2xl dark:border-zinc-700/90 sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-700/80">
          <h2 id="member-profile-title" className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Profile
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close"
            autoFocus
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !p ? (
            <div className="space-y-4 p-4">
              <div className="skeleton-shimmer aspect-[4/3] w-full rounded-xl" />
              <div className="skeleton-shimmer h-4 w-2/3 rounded" />
              <div className="skeleton-shimmer h-20 w-full rounded-lg" />
            </div>
          ) : null}

          {error && !seed ? (
            <div className="p-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => void loadProfile()}
                className="mt-3 rounded-full border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                Retry
              </button>
            </div>
          ) : null}

          {p ? (
            <>
              {sectionNav.length > 1 ? (
                <div className="sticky top-0 z-[2] flex gap-1.5 overflow-x-auto border-b border-zinc-200/80 bg-[var(--surface-elevated)]/95 px-3 py-2 backdrop-blur-sm dark:border-zinc-700/80">
                  {sectionNav.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => scrollToSection(item.id)}
                      className="shrink-0 rounded-full border border-zinc-200/90 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] dark:border-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-200"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="space-y-5 p-4 pb-8">
                <div
                  id="member-profile-photos"
                  className="scroll-mt-16 space-y-5"
                >
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                {mainPhoto ? (
                  <button
                    type="button"
                    className="relative h-full w-full"
                    onClick={() => setLightboxUrl(mainPhoto)}
                    aria-label="Enlarge photo"
                  >
                    <Image src={mainPhoto} alt="" fill className="object-cover" sizes="(max-width:640px)100vw,32rem" unoptimized />
                  </button>
                ) : (
                  <div className="flex h-full items-center justify-center text-zinc-400">No photo</div>
                )}
                {photos.length > 1 ? (
                  <>
                    <button
                      type="button"
                      className="absolute inset-y-0 left-0 z-[2] w-12 bg-gradient-to-r from-black/30 to-transparent text-white"
                      aria-label="Previous photo"
                      onClick={() => setCarouselIdx((i) => (i - 1 + photos.length) % photos.length)}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 z-[2] w-12 bg-gradient-to-l from-black/30 to-transparent text-white"
                      aria-label="Next photo"
                      onClick={() => setCarouselIdx((i) => (i + 1) % photos.length)}
                    />
                  </>
                ) : null}
              </div>

              {photos.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {photos.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => {
                        setCarouselIdx(i);
                        setLightboxUrl(url);
                      }}
                      className={`relative h-16 w-16 overflow-hidden rounded-lg ring-2 ring-offset-2 ring-offset-[var(--surface-elevated)] ${
                        i === safeCarousel ? "ring-[var(--accent)]" : "ring-transparent"
                      }`}
                    >
                      <Image src={url} alt="" fill className="object-cover" sizes="64px" unoptimized />
                    </button>
                  ))}
                </div>
              ) : null}

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                    {name}
                    {age != null ? <span className="text-lg font-normal text-zinc-600 dark:text-zinc-400"> · {age}</span> : null}
                  </h3>
                  {p.photo_verified ? (
                    <span className="rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Verified
                    </span>
                  ) : null}
                </div>
                {p.city ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{p.city}</p> : null}
              </div>
                </div>

              {p.bio?.trim() ? (
                <section id="member-profile-about" className="scroll-mt-16">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">About</h4>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{p.bio}</p>
                </section>
              ) : null}

              {p.icebreaker_snippets && p.icebreaker_snippets.length > 0 ? (
                <section id="member-profile-icebreakers" className="scroll-mt-16">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Icebreakers</h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    From their saved daily prompts — in their own words.
                  </p>
                  <ul className="mt-3 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
                    {p.icebreaker_snippets.map((item, idx) => (
                      <li
                        key={`${item.day}-${item.slot}-${idx}`}
                        className="rounded-lg border border-zinc-200/70 bg-zinc-50/50 px-3 py-2 dark:border-zinc-700/70 dark:bg-zinc-900/30"
                      >
                        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{item.prompt}</p>
                        <p className="mt-1 leading-relaxed text-zinc-800 dark:text-zinc-200">{item.answer}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section
                id="member-profile-looking"
                className="scroll-mt-16 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-zinc-700/80 dark:bg-zinc-900/40"
              >
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Looking for</h4>
                <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                  <li>
                    <span className="text-zinc-500">Gender: </span>
                    {p.gender ?? "—"}
                  </li>
                  <li>
                    <span className="text-zinc-500">Seeking: </span>
                    {p.seeking ?? "—"}
                  </li>
                  <li>
                    <span className="text-zinc-500">Age range: </span>
                    {p.age_min}–{p.age_max}
                  </li>
                  <li>
                    <span className="text-zinc-500">Max distance: </span>
                    {p.max_distance_km} km
                  </li>
                </ul>
              </section>

              {insight ? (
                <details
                  id="member-profile-match"
                  className="scroll-mt-16 rounded-xl border border-zinc-200/80 bg-white/80 p-3 dark:border-zinc-700/80 dark:bg-zinc-950/40"
                >
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--accent)]">
                    Compatibility with you ({Math.round(insight.totalPercent)}%)
                  </summary>
                  {insight.hardFail ? (
                    <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                      {insight.reasons[0] ?? "Low compatibility on a must-align topic."}
                    </p>
                  ) : (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                      {insight.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                  {categoryEntries.length > 0 ? (
                    <div className="mt-3 border-t border-zinc-200/70 pt-2 dark:border-zinc-700/70">
                      <p className="text-[10px] font-semibold uppercase text-zinc-500">By topic</p>
                      <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
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

              {matchId ? (
                <section id="member-profile-common" className="scroll-mt-16">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">In common</h4>
                  {commonLoading ? (
                    <p className="mt-2 text-sm text-zinc-500">Loading shared answers…</p>
                  ) : common && common.items.length > 0 ? (
                    <ul className="mt-2 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                      {common.items.slice(0, 12).map((item) => (
                        <li key={item.questionId} className="rounded-lg border border-zinc-200/70 bg-zinc-50/50 px-3 py-2 dark:border-zinc-700/70 dark:bg-zinc-900/30">
                          <p className="text-xs text-zinc-500">{item.section ?? "General"}</p>
                          <p className="font-medium">{item.prompt}</p>
                          <p className="text-[var(--accent)]">{item.agreedLabel}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-500">
                      No overlapping answers yet — keep chatting and fill out more of the questionnaire.
                    </p>
                  )}
                </section>
              ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {lightboxUrl ? (
        <button
          type="button"
          className="fixed inset-0 z-[170] flex items-center justify-center bg-black/90 p-4"
          aria-label="Close photo"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative h-[min(85vh,36rem)] w-full max-w-2xl">
            <Image src={lightboxUrl} alt="" fill className="object-contain" sizes="100vw" unoptimized />
          </div>
        </button>
      ) : null}
    </div>
  );
}
