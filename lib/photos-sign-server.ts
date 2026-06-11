import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { storagePathFromProfilePhotoUrl } from "@/lib/profile-photos";

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour signed URLs

/**
 * Convert an array of stored profile photo URLs (which point at the
 * now-private profile-photos bucket) into short-lived signed URLs the
 * browser can render.
 *
 * Called server-side wherever we ship photo URLs to the client —
 * /api/discover, /api/profiles/:userId/viewer, /api/matches/summary,
 * /api/admin/photos, etc.
 *
 * Returns the same array shape as the input — empty array if the
 * inputs were empty or signing failed.
 */
export async function signProfilePhotoUrls(
  admin: SupabaseClient,
  photoUrls: string[] | null | undefined,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string[]> {
  if (!photoUrls || photoUrls.length === 0) return [];
  const paths = photoUrls
    .map((u) => storagePathFromProfilePhotoUrl(u) ?? u)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (!paths.length) return [];
  const { data, error } = await admin.storage
    .from("profile-photos")
    .createSignedUrls(paths, ttlSeconds);
  if (error) {
    console.warn("[photos-sign-server]", error.message);
    return [];
  }
  return (data ?? [])
    .map((s) => s.signedUrl)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
}

/**
 * Batch sign across many users (e.g. a discover feed of 40 profiles).
 * Issues one storage signing call per user since signed URLs are
 * per-object — but we parallelize and bound concurrency.
 */
export async function signProfilePhotoUrlsBatch(
  admin: SupabaseClient,
  byUserId: Map<string, string[]>,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  concurrency = 8,
): Promise<Map<string, string[]>> {
  const entries = Array.from(byUserId.entries());
  const out = new Map<string, string[]>();
  let i = 0;
  async function worker() {
    while (i < entries.length) {
      const idx = i++;
      const [userId, urls] = entries[idx];
      out.set(userId, await signProfilePhotoUrls(admin, urls, ttlSeconds));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()),
  );
  return out;
}
