"use client";

import { PlusUpsellModal } from "@/components/PlusUpsellModal";
import Image from "next/image";
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

type WallState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "feature_off" }
  | { kind: "ready"; locked: boolean; count: number; items: InboundItem[] };

export function LikesWallClient() {
  const [state, setState] = useState<WallState>({ kind: "loading" });
  const [upsell, setUpsell] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/inbound-likes");
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setState({
          kind: "error",
          message: typeof data.error === "string" ? data.error : "Could not load likes.",
        });
        return;
      }
      if (!data.enabled) {
        setState({ kind: "feature_off" });
        return;
      }
      setState({
        kind: "ready",
        locked: Boolean(data.locked),
        count: typeof data.count === "number" ? data.count : (data.items?.length ?? 0),
        items: (data.items ?? []) as InboundItem[],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <p className="text-sm text-red-600 dark:text-red-400" role="alert">
        {state.message}
      </p>
    );
  }

  if (state.kind === "feature_off") {
    return (
      <div className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-zinc-50/80 p-5 dark:border-zinc-700/80 dark:bg-zinc-900/40">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">“See who liked you” is not available</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          This environment has the feature turned off. An admin can enable it under{" "}
          <Link href="/admin/flags" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
            Feature flags
          </Link>{" "}
          (<code className="rounded bg-zinc-200/80 px-1 text-xs dark:bg-zinc-800">see_who_liked_you</code>).
        </p>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
          When it is on, Plus members see the full list; everyone else sees how many people liked them and a privacy-safe
          preview.
        </p>
        <Link
          href="/discover?prioritize_inbound=1"
          className="mt-4 inline-flex rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
        >
          Back to like or pass
        </Link>
      </div>
    );
  }

  const { locked, count, items } = state;

  if (locked && count === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-zinc-200/90 bg-white/60 p-6 text-center dark:border-zinc-700/90 dark:bg-zinc-950/40">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No inbound likes yet.</p>
        <p className="mt-1 text-xs text-zinc-500">
          Keep liking or passing — when someone likes you first, they will show up here.
        </p>
        <Link
          href="/discover?prioritize_inbound=1"
          className="mt-4 inline-flex rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          Like or pass
        </Link>
      </div>
    );
  }

  if (locked) {
    return (
      <>
        <div className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-zinc-50/80 p-5 dark:border-zinc-700/80 dark:bg-zinc-900/40">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {count} {count === 1 ? "person likes" : "people like"} you
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Unlock photos and names with{" "}
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">Marriage View Plus</strong> — free accounts
            see a count and silhouettes only.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {Array.from({ length: Math.min(count, 12) }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl bg-gradient-to-br from-zinc-300 to-zinc-500 opacity-70 blur-sm dark:from-zinc-600 dark:to-zinc-800"
                aria-hidden
              />
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setUpsell(true)}
              className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-white sm:w-auto sm:px-6"
            >
              See Plus options
            </button>
            <Link
              href="/discover?prioritize_inbound=1"
              className="w-full rounded-full border border-zinc-300 py-2.5 text-center text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200 sm:w-auto sm:px-6"
            >
              Find them while you like or pass
            </Link>
          </div>
        </div>
        <PlusUpsellModal
          open={upsell}
          title="See who liked you"
          body="Plus members get the full inbound list with photos and names. Free members see how many people liked them and a privacy-safe silhouette preview."
          onClose={() => setUpsell(false)}
        />
      </>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-zinc-200/90 bg-white/60 p-6 text-center dark:border-zinc-700/90 dark:bg-zinc-950/40">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No inbound likes to show.</p>
        <p className="mt-1 text-xs text-zinc-500">
          If someone new likes you, they will appear here until you match or pass.
        </p>
        <Link
          href="/discover?prioritize_inbound=1"
          className="mt-4 inline-flex rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          Like or pass
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        These members liked you first. Like or pass to like them back and start a match.
      </p>
      <ul className="space-y-3">
        {items.map((p) => (
          <li
            key={p.userId}
            className="flex items-center gap-3 rounded-xl border border-zinc-200/80 bg-white/90 p-3 shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900/80"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              {p.photoUrl ? (
                <Image src={p.photoUrl} alt="" fill className="object-cover" sizes="56px" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-medium text-zinc-500">
                  {(p.display_name || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">{p.display_name}</p>
              <p className="truncate text-xs text-zinc-500">
                {[p.city, p.likedAt ? new Date(p.likedAt).toLocaleDateString() : null].filter(Boolean).join(" · ") ||
                  " "}
              </p>
              {!p.onboarding_complete ? (
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Still onboarding
                </p>
              ) : null}
            </div>
            <Link
              href="/discover?prioritize_inbound=1"
              className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[var(--accent-hover)]"
            >
              Like or pass
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
