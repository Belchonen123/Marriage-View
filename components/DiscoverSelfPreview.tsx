"use client";

import type { PublicProfile } from "@/lib/types";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export function DiscoverSelfPreview() {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/me/discover-preview");
      const j = (await res.json().catch(() => null)) as { profile?: PublicProfile; error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setErr(j?.error ?? "Could not load preview");
        return;
      }
      setProfile(j.profile ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) {
    return <p className="text-sm text-red-600 dark:text-red-400">{err}</p>;
  }
  if (!profile) {
    return <p className="text-sm text-zinc-500">Loading how you appear…</p>;
  }

  const photo = profile.photo_urls?.[0] ?? null;
  const age =
    profile.birth_year != null
      ? new Date().getFullYear() - profile.birth_year
      : null;
  const saneAge = age != null && age > 0 && age < 120 ? age : null;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-[var(--surface-elevated)] shadow-sm dark:border-zinc-700/90">
      <div className="relative aspect-[3/4] max-h-64 w-full bg-zinc-100 dark:bg-zinc-800 sm:max-h-72">
        {photo ? (
          <Image src={photo} alt="" fill className="object-cover" sizes="280px" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center font-display text-3xl font-semibold text-zinc-400">
            {profile.display_name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
          <p className="font-display text-lg font-semibold tracking-tight">
            {profile.display_name}
            {saneAge != null ? <span className="text-base font-normal opacity-90"> · {saneAge}</span> : null}
          </p>
          {profile.city ? <p className="text-sm opacity-90">{profile.city}</p> : null}
        </div>
      </div>
      <div className="border-t border-zinc-100 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
        <p className="line-clamp-4 leading-relaxed">{profile.bio?.trim() || "No bio yet — add one so matches get a fuller picture."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/onboarding/profile"
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Edit profile
          </Link>
          <Link
            href="/settings"
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Photos
          </Link>
        </div>
      </div>
    </div>
  );
}
