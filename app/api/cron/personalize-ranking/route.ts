import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const THIRTY_DAYS_MS = 30 * 86400000;

function clampMult(n: number): number {
  return Math.min(1.06, Math.max(0.94, n));
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const sinceIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const { data: rows, error } = await admin
    .from("match_journal_entries")
    .select("user_id, mood")
    .gte("created_at", sinceIso);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const byUser = new Map<string, { total: number; pos: number; neg: number }>();
  for (const r of rows ?? []) {
    const uid = r.user_id as string;
    const m = r.mood as string;
    if (!byUser.has(uid)) byUser.set(uid, { total: 0, pos: 0, neg: 0 });
    const b = byUser.get(uid)!;
    b.total += 1;
    if (m === "great" || m === "good") b.pos += 1;
    if (m === "not_a_fit") b.neg += 1;
  }

  let upserted = 0;
  for (const [userId, { total, pos, neg }] of byUser) {
    let mult = 1 + Math.min(0.06, total * 0.012);
    if (neg > pos) mult -= 0.02;
    mult = clampMult(mult);

    const { error: upErr } = await admin.from("user_ranking_prefs").upsert(
      {
        user_id: userId,
        engagement_multiplier: mult,
        journal_entries_30d: total,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (!upErr) upserted += 1;
  }

  return NextResponse.json({ ok: true, usersUpdated: upserted, windowDays: 30 });
}
