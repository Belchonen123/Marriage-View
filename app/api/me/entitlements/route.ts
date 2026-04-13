import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/entitlements";
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
    return NextResponse.json({ tier: "free" as const, effectiveUntil: null });
  }

  const tier = await getUserTier(admin, user.id);
  const { data: row, error: entErr } = await admin
    .from("user_entitlements")
    .select("effective_until")
    .eq("user_id", user.id)
    .maybeSingle();

  if (entErr) {
    return NextResponse.json({ tier: "free" as const, effectiveUntil: null });
  }

  return NextResponse.json({
    tier,
    effectiveUntil: (row?.effective_until as string | null) ?? null,
  });
}
