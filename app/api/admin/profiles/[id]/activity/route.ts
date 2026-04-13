import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INTERACTIONS_LIMIT = 80;
const REPORTS_LIMIT = 50;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!id || !uuidRe.test(id)) {
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

  const [{ data: interactions, error: iErr }, { data: blocks, error: bErr }, { data: reports, error: rErr }] =
    await Promise.all([
      admin
        .from("interactions")
        .select("id, from_user, to_user, action, created_at")
        .or(`from_user.eq.${id},to_user.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(INTERACTIONS_LIMIT),
      admin
        .from("blocks")
        .select("blocker_id, blocked_id, created_at")
        .or(`blocker_id.eq.${id},blocked_id.eq.${id}`)
        .order("created_at", { ascending: false }),
      admin
        .from("reports")
        .select("id, reporter_id, reported_user_id, reason, details, status, created_at, priority, match_id")
        .or(`reporter_id.eq.${id},reported_user_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(REPORTS_LIMIT),
    ]);

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const nameIds = new Set<string>();
  for (const row of interactions ?? []) {
    nameIds.add(row.from_user as string);
    nameIds.add(row.to_user as string);
  }
  for (const row of blocks ?? []) {
    nameIds.add(row.blocker_id as string);
    nameIds.add(row.blocked_id as string);
  }
  for (const row of reports ?? []) {
    nameIds.add(row.reporter_id as string);
    nameIds.add(row.reported_user_id as string);
  }

  const reportMatchIds = [
    ...new Set(
      (reports ?? []).map((r) => r.match_id as string | null).filter((m): m is string => Boolean(m)),
    ),
  ];
  const reportMatchMeta: Record<string, { user_a: string; user_b: string }> = {};
  if (reportMatchIds.length) {
    const { data: mRows, error: rmErr } = await admin
      .from("matches")
      .select("id, user_a, user_b")
      .in("id", reportMatchIds);
    if (rmErr) return NextResponse.json({ error: rmErr.message }, { status: 500 });
    for (const m of mRows ?? []) {
      reportMatchMeta[m.id as string] = { user_a: m.user_a as string, user_b: m.user_b as string };
    }
    for (const pair of Object.values(reportMatchMeta)) {
      nameIds.add(pair.user_a);
      nameIds.add(pair.user_b);
    }
  }

  let names: Record<string, string> = {};
  if (nameIds.size) {
    const { data: profs, error: nErr } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", [...nameIds]);
    if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });
    names = Object.fromEntries((profs ?? []).map((p) => [p.id as string, (p.display_name as string) || ""]));
  }

  const interactionsOut = (interactions ?? []).map((row) => {
    const from = row.from_user as string;
    const to = row.to_user as string;
    const other = from === id ? to : from;
    const direction = from === id ? "outbound" : "inbound";
    return {
      id: row.id,
      action: row.action,
      direction,
      other_user_id: other,
      other_display_name: names[other] ?? "—",
      created_at: row.created_at,
    };
  });

  const blocksOut = (blocks ?? []).map((row) => {
    const blocker = row.blocker_id as string;
    const blocked = row.blocked_id as string;
    return {
      blocker_id: blocker,
      blocked_id: blocked,
      blocker_display_name: names[blocker] ?? "—",
      blocked_display_name: names[blocked] ?? "—",
      role: blocker === id ? "blocked_someone" : "was_blocked",
      created_at: row.created_at,
    };
  });

  const reportsOut = (reports ?? []).map((row) => {
    const matchId = (row as { match_id?: string | null }).match_id ?? null;
    const priority = (row as { priority?: string }).priority ?? "normal";
    let match_user_a: string | null = null;
    let match_user_b: string | null = null;
    if (matchId && reportMatchMeta[matchId]) {
      match_user_a = reportMatchMeta[matchId].user_a;
      match_user_b = reportMatchMeta[matchId].user_b;
    }
    return {
      id: row.id,
      reporter_id: row.reporter_id,
      reported_user_id: row.reported_user_id,
      reporter_display_name: names[row.reporter_id as string] ?? "—",
      reported_display_name: names[row.reported_user_id as string] ?? "—",
      role: (row.reporter_id as string) === id ? "reporter" : "reported",
      reason: row.reason,
      details: row.details,
      status: row.status,
      created_at: row.created_at,
      priority,
      match_id: matchId,
      match_user_a,
      match_user_b,
    };
  });

  return NextResponse.json({
    interactions: interactionsOut,
    blocks: blocksOut,
    reports: reportsOut,
  });
}
