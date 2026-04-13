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
  const q = (searchParams.get("q") ?? "").trim();
  const onboardingRaw = (searchParams.get("onboarding") ?? "all").toLowerCase();
  const onboarding =
    onboardingRaw === "complete" || onboardingRaw === "incomplete" ? onboardingRaw : "all";

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let query = admin
    .from("profiles")
    .select("id, display_name, city, gender, onboarding_complete, questionnaire_version, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    const safe = q.replace(/,/g, " ").replace(/%/g, "\\%").replace(/_/g, "\\_");
    query = query.or(`display_name.ilike.%${safe}%,city.ilike.%${safe}%`);
  }

  if (onboarding === "complete") {
    query = query.eq("onboarding_complete", true);
  } else if (onboarding === "incomplete") {
    query = query.eq("onboarding_complete", false);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [], total: count ?? 0 });
}
