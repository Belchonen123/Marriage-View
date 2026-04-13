import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/entitlements";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type InboundItem = {
  userId: string;
  display_name: string;
  city: string | null;
  photoUrl: string | null;
  likedAt: string | null;
  onboarding_complete: boolean;
};

/**
 * People who liked the current user but are not yet a mutual match (feature-flag gated).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: flagRow } = await admin
    .from("feature_flags")
    .select("enabled")
    .eq("key", "see_who_liked_you")
    .maybeSingle();

  if (!flagRow?.enabled) {
    return NextResponse.json({
      enabled: false,
      locked: false,
      count: 0,
      items: [] as InboundItem[],
    });
  }

  const uid = user.id;
  const tier = await getUserTier(admin, uid);
  const isPlus = tier === "plus";

  const { data: inbound, error: inErr } = await admin
    .from("interactions")
    .select("from_user, created_at")
    .eq("to_user", uid)
    .eq("action", "like")
    .order("created_at", { ascending: false });

  if (inErr) {
    return NextResponse.json({ error: inErr.message }, { status: 400 });
  }

  const fromIds = [...new Set((inbound ?? []).map((r) => r.from_user as string))];
  if (!fromIds.length) {
    return NextResponse.json({ enabled: true, items: [] as InboundItem[] });
  }

  const [{ data: mine }, { data: myMatches }, { data: iBlocked }, { data: blockedMe }] = await Promise.all([
    admin.from("interactions").select("to_user, action").eq("from_user", uid).in("to_user", fromIds),
    admin.from("matches").select("user_a, user_b").or(`user_a.eq.${uid},user_b.eq.${uid}`),
    admin.from("blocks").select("blocked_id").eq("blocker_id", uid).in("blocked_id", fromIds),
    admin.from("blocks").select("blocker_id").eq("blocked_id", uid).in("blocker_id", fromIds),
  ]);

  const mineMap = new Map((mine ?? []).map((r) => [r.to_user as string, r.action as string]));

  const matched = new Set<string>();
  for (const m of myMatches ?? []) {
    matched.add(m.user_a === uid ? (m.user_b as string) : (m.user_a as string));
  }

  const blocked = new Set([
    ...(iBlocked ?? []).map((r) => r.blocked_id as string),
    ...(blockedMe ?? []).map((r) => r.blocker_id as string),
  ]);

  const eligible = fromIds.filter((id) => {
    if (matched.has(id)) return false;
    if (blocked.has(id)) return false;
    if (mineMap.get(id) === "pass") return false;
    return true;
  });

  if (!eligible.length) {
    return NextResponse.json({
      enabled: true,
      locked: !isPlus,
      count: 0,
      items: [] as InboundItem[],
    });
  }

  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("id, display_name, city, photo_urls, onboarding_complete")
    .in("id", eligible);

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 400 });
  }

  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const likeAtByUser = new Map<string, string>();
  for (const row of inbound ?? []) {
    const fid = row.from_user as string;
    if (!likeAtByUser.has(fid)) {
      likeAtByUser.set(fid, row.created_at as string);
    }
  }

  const items: InboundItem[] = eligible.map((id) => {
    const p = byId.get(id);
    return {
      userId: id,
      display_name: (p?.display_name as string) || "Member",
      city: (p?.city as string) ?? null,
      photoUrl: ((p?.photo_urls as string[]) ?? [])[0] ?? null,
      likedAt: likeAtByUser.get(id) ?? null,
      onboarding_complete: Boolean(p?.onboarding_complete),
    };
  });

  if (!isPlus) {
    return NextResponse.json({
      enabled: true,
      locked: true,
      count: items.length,
      items: [] as InboundItem[],
    });
  }

  return NextResponse.json({
    enabled: true,
    locked: false,
    count: items.length,
    items,
  });
}
