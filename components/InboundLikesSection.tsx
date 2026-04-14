"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type InboundItem = {
  userId: string;
  display_name: string;
  city: string | null;
  photoUrl: string | null;
  likedAt: string | null;
  onboarding_complete: boolean;
};

export function InboundLikesSection() {
  const [items, setItems] = useState<InboundItem[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [teaserCount, setTeaserCount] = useState(0);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/inbound-likes");
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok || !data.enabled) {
        setEnabled(false);
        setItems([]);
        setLocked(false);
        setTeaserCount(0);
        return;
      }
      setEnabled(true);
      setLocked(Boolean(data.locked));
      setTeaserCount(typeof data.count === "number" ? data.count : 0);
      setItems((data.items ?? []) as InboundItem[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (enabled === false) {
    return null;
  }

  if (enabled === null || items === null) {
    return null;
  }

  if (locked && teaserCount > 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-rose-200/80 bg-rose-50/50 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
        <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">Liked you</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {teaserCount} {teaserCount === 1 ? "person has" : "people have"} you in their likes — unlock with Plus to see
          who they are.
        </p>
        <Link
          href="/likes"
          className="mt-3 inline-flex rounded-full border border-rose-400/60 px-4 py-2 text-xs font-semibold text-rose-900 dark:text-rose-100"
        >
          Open likes wall
        </Link>
      </section>
    );
  }

  if (!items.length) {
    return null;
  }

  const n = teaserCount > 0 ? teaserCount : items.length;

  return (
    <section className="rounded-[var(--radius-lg)] border border-rose-200/80 bg-rose-50/50 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
      <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">Liked you</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {n} {n === 1 ? "person liked" : "people liked"} you first — open{" "}
        <strong className="font-medium text-zinc-800 dark:text-zinc-200">Likes</strong> for names and photos, then use{" "}
        <strong className="font-medium text-zinc-800 dark:text-zinc-200">like or pass</strong> to match.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link
          href="/likes"
          className="inline-flex justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)]"
        >
          View likes
        </Link>
        <Link
          href="/discover?prioritize_inbound=1"
          className="inline-flex justify-center rounded-full border border-zinc-300 bg-white/90 px-5 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Like or pass
        </Link>
      </div>
    </section>
  );
}
