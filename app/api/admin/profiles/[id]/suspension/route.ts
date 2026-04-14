import { insertAdminAudit } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { asRecord, readJsonBody } from "@/lib/parse-json-body";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid profile id" }, { status: 400 });
  }

  const raw = await readJsonBody(req);
  const body = asRecord(raw);
  if (!body || !("adminSuspended" in body)) {
    return NextResponse.json({ error: "adminSuspended boolean required" }, { status: 400 });
  }
  const adminSuspended = body.adminSuspended;
  if (adminSuspended !== true && adminSuspended !== false) {
    return NextResponse.json({ error: "adminSuspended must be true or false" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data, error } = await admin
    .from("profiles")
    .update({ admin_suspended: adminSuspended })
    .eq("id", id)
    .select("id, admin_suspended")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  await insertAdminAudit(admin, {
    actor_user_id: gate.user.id,
    action: "profiles.suspension",
    target_type: "profiles",
    target_id: id,
    payload_json: { admin_suspended: adminSuspended },
  });

  return NextResponse.json({ profile: data });
}
