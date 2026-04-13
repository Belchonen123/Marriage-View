import { insertAdminAudit } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { asRecord, readJsonBody } from "@/lib/parse-json-body";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid report id" }, { status: 400 });
  }

  const body = await readJsonBody(req);
  const rec = asRecord(body);
  if (!rec) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const status = rec.status;
  if (status !== "reviewed" && status !== "actioned") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await admin.from("reports").update({ status }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await insertAdminAudit(admin, {
    actor_user_id: gate.user.id,
    action: "report.status",
    target_type: "reports",
    target_id: id,
    payload_json: { status },
  });

  return NextResponse.json({ ok: true });
}
