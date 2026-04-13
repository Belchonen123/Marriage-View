import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LIMIT = 120;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid profile id" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: profile, error: pErr } = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data: rows, error: jErr } = await admin
    .from("match_journal_entries")
    .select("id, mood, note, focus_areas, call_occurred_at, created_at, match_id")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 });

  const matchIds = [...new Set((rows ?? []).map((r) => r.match_id as string | null).filter(Boolean))] as string[];
  const matchToPair: Record<string, { user_a: string; user_b: string }> = {};
  if (matchIds.length) {
    const { data: mRows, error: mErr } = await admin.from("matches").select("id, user_a, user_b").in("id", matchIds);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    for (const m of mRows ?? []) {
      matchToPair[m.id as string] = { user_a: m.user_a as string, user_b: m.user_b as string };
    }
  }

  const otherIds = new Set<string>();
  for (const mid of matchIds) {
    const pair = matchToPair[mid];
    if (!pair) continue;
    const other = pair.user_a === id ? pair.user_b : pair.user_b === id ? pair.user_a : null;
    if (other) otherIds.add(other);
  }

  let names: Record<string, string> = {};
  if (otherIds.size) {
    const { data: profs, error: nErr } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", [...otherIds]);
    if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });
    names = Object.fromEntries((profs ?? []).map((p) => [p.id as string, (p.display_name as string) || ""]));
  }

  const items = (rows ?? []).map((row) => {
    const matchId = row.match_id as string | null;
    let other_user_id: string | null = null;
    let other_display_name: string | null = null;
    if (matchId && matchToPair[matchId]) {
      const pair = matchToPair[matchId];
      const other = pair.user_a === id ? pair.user_b : pair.user_b === id ? pair.user_a : null;
      if (other) {
        other_user_id = other;
        other_display_name = names[other] ?? "—";
      }
    }
    return {
      id: row.id,
      mood: row.mood,
      note: row.note,
      focus_areas: row.focus_areas ?? [],
      call_occurred_at: row.call_occurred_at,
      created_at: row.created_at,
      match_id: matchId,
      other_user_id,
      other_display_name,
    };
  });

  return NextResponse.json({ items });
}
