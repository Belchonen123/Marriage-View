import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const { data: row } = await admin
    .from("boost_sessions")
    .select("started_at, ends_at")
    .eq("user_id", user.id)
    .gte("ends_at", nowIso)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startedAt = row?.started_at as string | undefined;
  const endsAt = row?.ends_at as string | undefined;

  let viewsThisSession = 0;
  if (startedAt) {
    const { count } = await admin
      .from("discover_impressions")
      .select("id", { count: "exact", head: true })
      .eq("profile_user_id", user.id)
      .gte("created_at", startedAt);
    viewsThisSession = count ?? 0;
  }

  return NextResponse.json({
    active: Boolean(endsAt),
    endsAt: endsAt ?? null,
    viewsThisSession,
  });
}
