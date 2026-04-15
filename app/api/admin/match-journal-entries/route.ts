import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MOODS = new Set(["great", "good", "neutral", "unsure", "not_a_fit"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const scopeRaw = searchParams.get("scope") ?? "post_date";
  const scope = scopeRaw === "all" ? "all" : "post_date";

  let limit = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let offset = Number(searchParams.get("offset") ?? 0);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  const moodParam = searchParams.get("mood")?.trim();
  const moodFilter = moodParam && MOODS.has(moodParam) ? moodParam : null;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const selectCols = "id, user_id, match_id, mood, note, focus_areas, call_occurred_at, created_at";

  let countQ = admin.from("match_journal_entries").select("id", { count: "exact", head: true });
  if (scope === "post_date") {
    countQ = countQ.not("call_occurred_at", "is", null);
  }
  if (moodFilter) {
    countQ = countQ.eq("mood", moodFilter);
  }

  const { count: totalCount, error: countErr } = await countQ;
  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  let dataQ = admin
    .from("match_journal_entries")
    .select(selectCols)
    .order("created_at", { ascending: false });
  if (scope === "post_date") {
    dataQ = dataQ.not("call_occurred_at", "is", null);
  }
  if (moodFilter) {
    dataQ = dataQ.eq("mood", moodFilter);
  }

  const end = offset + limit - 1;
  const { data: rows, error: dataErr } = await dataQ.range(offset, end);

  if (dataErr) {
    return NextResponse.json({ error: dataErr.message }, { status: 500 });
  }

  const list = rows ?? [];
  const matchIds = [...new Set(list.map((r) => r.match_id as string).filter(Boolean))];
  const matchToPair: Record<string, { user_a: string; user_b: string }> = {};
  if (matchIds.length) {
    const { data: mRows, error: mErr } = await admin.from("matches").select("id, user_a, user_b").in("id", matchIds);
    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }
    for (const m of mRows ?? []) {
      matchToPair[m.id as string] = { user_a: m.user_a as string, user_b: m.user_b as string };
    }
  }

  const profileIds = new Set<string>();
  for (const row of list) {
    const uid = row.user_id as string;
    if (uid) profileIds.add(uid);
    const mid = row.match_id as string | null;
    if (mid && matchToPair[mid]) {
      const pair = matchToPair[mid];
      const other = pair.user_a === uid ? pair.user_b : pair.user_b === uid ? pair.user_a : null;
      if (other) profileIds.add(other);
    }
  }

  let names: Record<string, string> = {};
  if (profileIds.size) {
    const { data: profs, error: nErr } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", [...profileIds]);
    if (nErr) {
      return NextResponse.json({ error: nErr.message }, { status: 500 });
    }
    names = Object.fromEntries((profs ?? []).map((p) => [p.id as string, (p.display_name as string) || ""]));
  }

  const items = list.map((row) => {
    const userId = row.user_id as string;
    const matchId = row.match_id as string | null;
    let other_user_id: string | null = null;
    let other_display_name: string | null = null;
    if (matchId && matchToPair[matchId]) {
      const pair = matchToPair[matchId];
      const other = pair.user_a === userId ? pair.user_b : pair.user_b === userId ? pair.user_a : null;
      if (other) {
        other_user_id = other;
        other_display_name = names[other] ?? "—";
      }
    }
    return {
      id: row.id,
      user_id: userId,
      author_display_name: names[userId] ?? "—",
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

  return NextResponse.json({
    items,
    total: totalCount ?? 0,
    limit,
    offset,
  });
}
