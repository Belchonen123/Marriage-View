import { insertAdminAudit } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { asRecord, readJsonBody } from "@/lib/parse-json-body";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ANSWER_TYPES = new Set(["single", "multi", "likert", "text", "number"]);

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const raw = await readJsonBody(req);
  const body = asRecord(raw);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if ("version" in body) patch.version = Number(body.version);
  if ("sort_order" in body) patch.sort_order = Number(body.sort_order);
  if ("prompt" in body) patch.prompt = String(body.prompt).trim();
  if ("answer_type" in body) {
    const at = String(body.answer_type);
    if (!ANSWER_TYPES.has(at)) {
      return NextResponse.json({ error: "Invalid answer_type" }, { status: 400 });
    }
    patch.answer_type = at;
  }
  if ("section" in body) {
    patch.section = body.section == null || body.section === "" ? null : String(body.section);
  }
  if ("weight" in body) patch.weight = Number(body.weight);
  if ("required" in body) patch.required = Boolean(body.required);
  if ("dealbreaker" in body) patch.dealbreaker = Boolean(body.dealbreaker);
  if ("options" in body) {
    let options: unknown = body.options;
    if (typeof options === "string") {
      try {
        options = JSON.parse(options);
      } catch {
        return NextResponse.json({ error: "options must be valid JSON" }, { status: 400 });
      }
    }
    patch.options = options;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data, error } = await admin.from("questions").update(patch).eq("id", id).select("*").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await insertAdminAudit(admin, {
    actor_user_id: gate.user.id,
    action: "questions.patch",
    target_type: "questions",
    target_id: id,
    payload_json: patch,
  });

  return NextResponse.json({ item: data });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await admin.from("questions").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await insertAdminAudit(admin, {
    actor_user_id: gate.user.id,
    action: "questions.delete",
    target_type: "questions",
    target_id: id,
    payload_json: {},
  });

  return NextResponse.json({ ok: true });
}
