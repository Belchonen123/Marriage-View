import { insertAdminAudit } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { asRecord, readJsonBody } from "@/lib/parse-json-body";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ANSWER_TYPES = new Set(["single", "multi", "likert", "text", "number"]);

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data, error } = await admin
    .from("questions")
    .select("*")
    .order("version", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const raw = await readJsonBody(req);
  const body = asRecord(raw);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const version = Number(body.version ?? 1);
  const sort_order = Number(body.sort_order);
  const prompt = String(body.prompt ?? "").trim();
  const answer_type = String(body.answer_type ?? "");
  const section = body.section != null ? String(body.section).trim() || null : null;
  const weight = body.weight != null ? Number(body.weight) : 1;
  const required = Boolean(body.required ?? true);
  const dealbreaker = Boolean(body.dealbreaker ?? false);

  let options: unknown = body.options ?? null;
  if (typeof options === "string") {
    try {
      options = JSON.parse(options);
    } catch {
      return NextResponse.json({ error: "options must be valid JSON" }, { status: 400 });
    }
  }

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!Number.isFinite(sort_order)) {
    return NextResponse.json({ error: "sort_order must be a number" }, { status: 400 });
  }
  if (!ANSWER_TYPES.has(answer_type)) {
    return NextResponse.json({ error: "Invalid answer_type" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data, error } = await admin
    .from("questions")
    .insert({
      version,
      sort_order,
      section,
      prompt,
      answer_type,
      options,
      weight,
      required,
      dealbreaker,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await insertAdminAudit(admin, {
    actor_user_id: gate.user.id,
    action: "questions.create",
    target_type: "questions",
    target_id: (data as { id?: string }).id ?? null,
    payload_json: { version, sort_order, prompt, answer_type },
  });

  return NextResponse.json({ item: data });
}
