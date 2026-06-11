import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPairBlocked } from "@/lib/pair-blocked";
import { isAdminSuspended } from "@/lib/profile-suspension";
import { storagePathFromProfilePhotoUrl } from "@/lib/profile-photos";
import { isUuid } from "@/lib/uuid";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SIGN_TTL_SECONDS = 60 * 60; // 1 hour
const MAX_USERS_PER_BATCH = 100;

type Body = { userIds?: unknown };

/**
 * POST /api/photos/sign
 * Body: { userIds: string[] }
 * Returns: { photos: Record<userId, string[]> } — short-lived signed URLs.
 *
 * Gating per user:
 *   - viewer must be signed in
 *   - target must exist
 *   - viewer is not blocked-pair with target
 *   - target is not admin-suspended (unless viewer === target — you can
 *     still see your own photos)
 *
 * The bucket itself is private (migration 027); this endpoint is the
 * only path to view another member's photos.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const raw = Array.isArray(body?.userIds) ? body!.userIds : [];
  const userIds = Array.from(
    new Set(
      (raw.filter((x) => typeof x === "string" && isUuid(x as string)) as string[]),
    ),
  ).slice(0, MAX_USERS_PER_BATCH);

  if (!userIds.length) {
    return NextResponse.json({ photos: {} });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  type ProfileLite = {
    id: string;
    photo_urls: string[] | null;
    admin_suspended?: boolean | null;
  };
  let rows: ProfileLite[] = [];
  const firstRead = await admin
    .from("profiles")
    .select("id, photo_urls, admin_suspended")
    .in("id", userIds);
  if (firstRead.error) {
    const m = (firstRead.error.message ?? "").toLowerCase();
    if (m.includes("admin_suspended") && m.includes("does not exist")) {
      const retry = await admin
        .from("profiles")
        .select("id, photo_urls")
        .in("id", userIds);
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
      rows = (retry.data as unknown as ProfileLite[]) ?? [];
    } else {
      return NextResponse.json({ error: firstRead.error.message }, { status: 500 });
    }
  } else {
    rows = (firstRead.data as unknown as ProfileLite[]) ?? [];
  }

  const result: Record<string, string[]> = {};

  for (const row of rows) {
    const targetId = row.id as string;
    if (targetId !== user.id) {
      if (isAdminSuspended({ admin_suspended: (row.admin_suspended as boolean | null) ?? false })) {
        result[targetId] = [];
        continue;
      }
      if (await isPairBlocked(admin, user.id, targetId)) {
        result[targetId] = [];
        continue;
      }
    }
    const urls = (row.photo_urls as string[] | null) ?? [];
    const paths = urls
      .map((u) => storagePathFromProfilePhotoUrl(u) ?? u)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (!paths.length) {
      result[targetId] = [];
      continue;
    }
    const { data: signed, error: sErr } = await admin.storage
      .from("profile-photos")
      .createSignedUrls(paths, SIGN_TTL_SECONDS);
    if (sErr) {
      console.warn("[photos/sign] createSignedUrls:", sErr.message);
      result[targetId] = [];
      continue;
    }
    result[targetId] = (signed ?? [])
      .map((s) => s.signedUrl)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
  }

  return NextResponse.json({ photos: result });
}
