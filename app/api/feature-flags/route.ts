import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public read of flag keys for client gating (no secrets in this table). */
export async function GET() {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ flags: {} as Record<string, boolean> });
  }

  const { data, error } = await admin.from("feature_flags").select("key, enabled");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const flags = Object.fromEntries((data ?? []).map((r) => [r.key as string, Boolean(r.enabled)]));
  return NextResponse.json({ flags });
}
