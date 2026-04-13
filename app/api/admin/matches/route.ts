import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "30")));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? "0"));

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const listQuery = admin
    .from("matches")
    .select("id, user_a, user_b, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: rows, error, count } = await listQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = new Set<string>();
  for (const r of rows ?? []) {
    ids.add(r.user_a as string);
    ids.add(r.user_b as string);
  }

  let names: Record<string, string> = {};
  if (ids.size) {
    const { data: profs, error: pErr } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", [...ids]);
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
    names = Object.fromEntries((profs ?? []).map((p) => [p.id as string, (p.display_name as string) || ""]));
  }

  const items = (rows ?? []).map((m) => ({
    id: m.id,
    user_a: m.user_a,
    user_b: m.user_b,
    created_at: m.created_at,
    display_name_a: names[m.user_a as string] ?? "—",
    display_name_b: names[m.user_b as string] ?? "—",
  }));

  return NextResponse.json({ items, total: count ?? 0 });
}
