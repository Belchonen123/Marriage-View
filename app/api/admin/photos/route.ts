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

  let query = admin
    .from("profiles")
    .select(
      "id, display_name, birth_year, city, gender, photo_urls, photo_verification_status, admin_suspended, onboarding_complete, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filter === "unverified") {
    query = query.neq("photo_verification_status", "verified");
  } else if (filter === "suspended") {
    query = query.eq("admin_suspended", true);
  }

  const { data, error, count } = await query;
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
      admin_suspended: (row.admin_suspended as boolean | null) ?? false,
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
