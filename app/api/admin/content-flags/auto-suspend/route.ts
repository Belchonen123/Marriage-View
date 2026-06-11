import { createAdminClient } from "@/lib/supabase/admin";
import { insertAdminAudit } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { loadCustomModerationWords } from "@/lib/moderation/load-custom-words";
import { scanForModeration } from "@/lib/moderation/profanity";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Scans recent bios + display names + ~500 recent messages, groups hits by
 * user, and auto-suspends anyone who meets the threshold.
 *
 * Body: { threshold?: number = 3, flags?: ("profanity"|"sexual"|"contact")[]?,
 *         requireBio?: boolean = false }
 *
 * Defaults are conservative — change them from the admin UI.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => null)) as {
    threshold?: number;
    flags?: string[];
    requireBio?: boolean;
  } | null;

  const threshold = Math.max(1, Math.min(50, Math.round(body?.threshold ?? 3)));
  const allowedFlags = new Set(
    (body?.flags ?? ["profanity", "sexual", "contact"]).filter((f) =>
      ["profanity", "sexual", "contact"].includes(f),
    ),
  );
  const requireBio = body?.requireBio === true;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  await loadCustomModerationWords(admin);

  const [profilesRes, messagesRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, bio")
      .order("created_at", { ascending: false })
      .limit(2000),
    admin
      .from("messages")
      .select("id, sender_id, body")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  }
  if (messagesRes.error) {
    return NextResponse.json({ error: messagesRes.error.message }, { status: 500 });
  }

  const counts = new Map<string, { count: number; bioFlagged: boolean }>();
  const note = (userId: string, isBio: boolean) => {
    const cur = counts.get(userId) ?? { count: 0, bioFlagged: false };
    cur.count++;
    if (isBio) cur.bioFlagged = true;
    counts.set(userId, cur);
  };

  for (const p of profilesRes.data ?? []) {
    const id = p.id as string;
    const name = (p.display_name as string) ?? "";
    const bio = (p.bio as string | null) ?? "";
    for (const h of scanForModeration(name)) {
      if (!allowedFlags.has(h.flag)) continue;
      note(id, false);
    }
    for (const h of scanForModeration(bio)) {
      if (!allowedFlags.has(h.flag)) continue;
      note(id, true);
    }
  }
  for (const m of messagesRes.data ?? []) {
    const id = m.sender_id as string;
    const body = (m.body as string) ?? "";
    for (const h of scanForModeration(body)) {
      if (!allowedFlags.has(h.flag)) continue;
      note(id, false);
    }
  }

  const candidates = Array.from(counts.entries())
    .filter(([userId, v]) => {
      if (userId === gate.user.id) return false; // never auto-suspend yourself
      if (v.count < threshold) return false;
      if (requireBio && !v.bioFlagged) return false;
      return true;
    })
    .map(([userId, v]) => ({ userId, count: v.count, bioFlagged: v.bioFlagged }));

  if (!candidates.length) {
    return NextResponse.json({ suspendedCount: 0, candidates: [] });
  }

  const ids = candidates.map((c) => c.userId);
  const { error: updErr } = await admin
    .from("profiles")
    .update({ admin_suspended: true })
    .in("id", ids)
    .eq("admin_suspended", false);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  for (const c of candidates) {
    await insertAdminAudit(admin, {
      actor_user_id: gate.user.id,
      action: "profiles.auto_suspend",
      target_type: "profiles",
      target_id: c.userId,
      payload_json: { flagCount: c.count, bioFlagged: c.bioFlagged, threshold },
    });
  }

  return NextResponse.json({ suspendedCount: ids.length, candidates });
}
