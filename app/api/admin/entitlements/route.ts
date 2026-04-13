import { insertAdminAudit } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { parseAdminEntitlementBody } from "@/lib/entitlements-payload";
import { readJsonBody } from "@/lib/parse-json-body";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = await readJsonBody(req);
  const parsed = parseAdminEntitlementBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const { userId, tier, effectiveUntil } = parsed.value;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: profileRow, error: profErr } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }
  if (!profileRow) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  if (tier === "free") {
    const { error } = await admin.from("user_entitlements").upsert(
      {
        user_id: userId,
        tier: "free",
        effective_until: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    await insertAdminAudit(admin, {
      actor_user_id: gate.user.id,
      action: "entitlements.set_free",
      target_type: "user_entitlements",
      target_id: userId,
      payload_json: { tier: "free" },
    });
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin.from("user_entitlements").upsert(
    {
      user_id: userId,
      tier: "plus",
      effective_until: effectiveUntil,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await insertAdminAudit(admin, {
    actor_user_id: gate.user.id,
    action: "entitlements.set_plus",
    target_type: "user_entitlements",
    target_id: userId,
    payload_json: { tier: "plus", effectiveUntil },
  });
  return NextResponse.json({ ok: true });
}
