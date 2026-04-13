import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/entitlements";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BOOST_MS = 35 * 60 * 1000;

export async function POST() {
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

  const tier = await getUserTier(admin, user.id);
  if (tier !== "plus") {
    return NextResponse.json({ error: "Plus only" }, { status: 403 });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const { data: existing } = await admin
    .from("boost_sessions")
    .select("ends_at")
    .eq("user_id", user.id)
    .gte("ends_at", nowIso)
    .maybeSingle();

  if (existing?.ends_at) {
    return NextResponse.json({
      ok: true,
      endsAt: existing.ends_at as string,
      already: true,
    });
  }

  const ends = new Date(now + BOOST_MS).toISOString();
  const { error } = await admin.from("boost_sessions").insert({
    user_id: user.id,
    ends_at: ends,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, endsAt: ends });
}
