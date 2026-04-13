import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PER_THREAD_PREVIEW = 30;
const MAX_MATCHES_LIST = 50;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!id || !uuidRe.test(id)) {
    return NextResponse.json({ error: "Invalid profile id" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const matchIdParam = searchParams.get("matchId");
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit") ?? String(DEFAULT_LIMIT))));

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (matchIdParam) {
    if (!uuidRe.test(matchIdParam)) {
      return NextResponse.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const { data: match, error: mErr } = await admin
      .from("matches")
      .select("id, user_a, user_b")
      .eq("id", matchIdParam)
      .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

    const a = match.user_a as string;
    const b = match.user_b as string;
    if (a !== id && b !== id) {
      return NextResponse.json({ error: "User is not a participant in this match" }, { status: 403 });
    }

    const other = a === id ? b : a;
    const { data: otherProf } = await admin.from("profiles").select("display_name").eq("id", other).maybeSingle();
    const otherDisplayName = (otherProf?.display_name as string) || "—";

    const { data: msgRows, error: msgErr } = await admin
      .from("messages")
      .select("id, body, created_at, sender_id")
      .eq("match_id", matchIdParam)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

    const messages = (msgRows ?? []).map((m) => ({
      id: m.id,
      body: m.body,
      created_at: m.created_at,
      sender_id: m.sender_id,
      from_self: m.sender_id === id,
    }));

    return NextResponse.json({
      match_id: matchIdParam,
      other_user_id: other,
      other_display_name: otherDisplayName,
      messages,
    });
  }

  const { data: userMatches, error: umErr } = await admin
    .from("matches")
    .select("id, user_a, user_b, created_at")
    .or(`user_a.eq.${id},user_b.eq.${id}`)
    .order("created_at", { ascending: false })
    .limit(MAX_MATCHES_LIST);

  if (umErr) return NextResponse.json({ error: umErr.message }, { status: 500 });

  const otherIds = new Set<string>();
  for (const m of userMatches ?? []) {
    const a = m.user_a as string;
    const b = m.user_b as string;
    if (a !== id) otherIds.add(a);
    if (b !== id) otherIds.add(b);
  }

  let otherNames: Record<string, string> = {};
  if (otherIds.size) {
    const { data: profs, error: onErr } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", [...otherIds]);
    if (onErr) return NextResponse.json({ error: onErr.message }, { status: 500 });
    otherNames = Object.fromEntries(
      (profs ?? []).map((p) => [p.id as string, (p.display_name as string) || ""]),
    );
  }

  try {
    const threads = await Promise.all(
      (userMatches ?? []).map(async (m) => {
        const mid = m.id as string;
        const a = m.user_a as string;
        const b = m.user_b as string;
        const other = a === id ? b : a;

        const { data: recentDesc, error: rErr } = await admin
          .from("messages")
          .select("id, body, created_at, sender_id")
          .eq("match_id", mid)
          .order("created_at", { ascending: false })
          .limit(PER_THREAD_PREVIEW);

        if (rErr) throw new Error(rErr.message);

        const chronological = [...(recentDesc ?? [])].reverse();
        const messages = chronological.map((row) => ({
          id: row.id,
          body: row.body,
          created_at: row.created_at,
          sender_id: row.sender_id,
          from_self: row.sender_id === id,
        }));

        return {
          match_id: mid,
          match_created_at: m.created_at,
          other_user_id: other,
          other_display_name: otherNames[other] ?? "—",
          messages,
        };
      }),
    );

    return NextResponse.json({ threads });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load messages";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
