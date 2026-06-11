import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(120, Math.max(1, Number(searchParams.get("limit") ?? "60")));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? "0"));
  const filter = (searchParams.get("filter") ?? "all").toLowerCase();
  // "all" | "with_photos" | "no_photos" | "unverified" | "suspended"

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const fullCols =
    "id, display_name, birth_year, city, gender, photo_urls, photo_verification_status, admin_suspended, onboarding_complete, created_at";
  const fallbackCols =
    "id, display_name, birth_year, city, gender, photo_urls, photo_verification_status, onboarding_complete, created_at";

  function isMissingSuspendedColumn(msg: string | undefined): boolean {
    const m = (msg ?? "").toLowerCase();
    return m.includes("admin_suspended") && (m.includes("does not exist") || m.includes("could not find"));
  }

  let useFallback = false;

  let q1 = admin
    .from("profiles")
    .select(fullCols, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (filter === "unverified") q1 = q1.neq("photo_verification_status", "verified");
  if (filter === "suspended") q1 = q1.eq("admin_suspended", true);

  type AnyRow = Record<string, unknown>;
  type AnyResult = { data: AnyRow[] | null; error: { message: string } | null; count: number | null };

  let result: AnyResult = (await q1) as unknown as AnyResult;
  if (result.error && isMissingSuspendedColumn(result.error.message)) {
    useFallback = true;
    if (filter === "suspended") {
      return NextResponse.json({
        items: [],
        total: 0,
        warning: "Suspension column not yet migrated. Apply migration 018_admin_suspension.sql in Supabase.",
      });
    }
    let q2 = admin
      .from("profiles")
      .select(fallbackCols, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (filter === "unverified") q2 = q2.neq("photo_verification_status", "verified");
    result = (await q2) as unknown as AnyResult;
  }

  const { data, error, count } = result;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let items =
    (data ?? []).map((row) => ({
      id: row.id as string,
      display_name: (row.display_name as string) ?? "",
      birth_year: (row.birth_year as number | null) ?? null,
      city: (row.city as string | null) ?? null,
      gender: (row.gender as string | null) ?? null,
      photo_urls: ((row.photo_urls as string[] | null) ?? []) as string[],
      photo_verification_status: (row.photo_verification_status as string | null) ?? "none",
      admin_suspended: useFallback
        ? false
        : ((row.admin_suspended as boolean | null) ?? false),
      onboarding_complete: (row.onboarding_complete as boolean | null) ?? false,
      created_at: row.created_at as string,
    })) ?? [];

  if (filter === "with_photos") {
    items = items.filter((p) => p.photo_urls.length > 0);
  } else if (filter === "no_photos") {
    items = items.filter((p) => p.photo_urls.length === 0);
  }

  return NextResponse.json({ items, total: count ?? items.length });
}
