import { createAdminClient } from "@/lib/supabase/admin";
import { insertAdminAudit } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_FLAGS = new Set(["profanity", "sexual", "contact"]);

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
    .from("moderation_words")
    .select("id, word, flag, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    const m = (error.message ?? "").toLowerCase();
    if (m.includes("moderation_words") && m.includes("does not exist")) {
      return NextResponse.json({
        items: [],
        warning: "Apply migration 025_moderation_words.sql in Supabase to enable custom word lists.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => null)) as { word?: string; flag?: string } | null;
  const word = (body?.word ?? "").trim().toLowerCase();
  const flag = (body?.flag ?? "").trim().toLowerCase();
  if (!word || !ALLOWED_FLAGS.has(flag)) {
    return NextResponse.json(
      { error: "word and flag (profanity|sexual|contact) required" },
      { status: 400 },
    );
  }
  if (word.length > 64) {
    return NextResponse.json({ error: "word is too long" }, { status: 400 });
  }
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const { data, error } = await admin
    .from("moderation_words")
    .insert({ word, flag, created_by: gate.user.id })
    .select("id, word, flag, created_at")
    .single();
  if (error) {
    if ((error.message ?? "").toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: "Already in the list." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await insertAdminAudit(admin, {
    actor_user_id: gate.user.id,
    action: "moderation.word_add",
    target_type: "moderation_words",
    target_id: data.id as string,
    payload_json: { word, flag },
  });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const { error } = await admin.from("moderation_words").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await insertAdminAudit(admin, {
    actor_user_id: gate.user.id,
    action: "moderation.word_remove",
    target_type: "moderation_words",
    target_id: id,
    payload_json: null,
  });
  return NextResponse.json({ ok: true });
}
