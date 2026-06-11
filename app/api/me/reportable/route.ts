import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * People the calling user can plausibly report — the union of:
 *   - their current matches
 *   - members who liked them (inbound likes)
 *
 * Returns minimal info: { userId, displayName, source }. Used by the
 * Settings → Report someone dropdown so users don't have to paste a
 * UUID they have no way to find.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Matches: rows where the caller is user_a or user_b.
  const { data: matches } = await admin
    .from("matches")
    .select("user_a, user_b")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

  const otherIds = new Set<string>();
  for (const m of matches ?? []) {
    const a = m.user_a as string;
    const b = m.user_b as string;
    if (a !== user.id) otherIds.add(a);
    if (b !== user.id) otherIds.add(b);
  }

  // Inbound likes: rows where to_user = me. The interactions schema is
  // common across the app; reuse the same shape.
  const { data: likes } = await admin
    .from("interactions")
    .select("from_user, kind")
    .eq("to_user", user.id)
    .eq("kind", "like");

  const likerIds = new Set<string>();
  for (const r of likes ?? []) {
    const fid = r.from_user as string;
    if (fid !== user.id) likerIds.add(fid);
  }

  const allIds = Array.from(new Set([...otherIds, ...likerIds]));
  if (!allIds.length) return NextResponse.json({ items: [] });

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", allIds);

  const byId = new Map(
    (profiles ?? []).map((p) => [p.id as string, ((p.display_name as string) ?? "").trim()]),
  );

  const items = allIds
    .map((id) => ({
      userId: id,
      displayName: byId.get(id) || "Member",
      source: otherIds.has(id) ? ("match" as const) : ("inbound_like" as const),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return NextResponse.json({ items });
}
