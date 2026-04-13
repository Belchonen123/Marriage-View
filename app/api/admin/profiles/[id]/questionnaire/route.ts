import {
  normalizeAnswerForStorage,
  shouldClearOptionalAnswer,
  validateAnswerValueForUpsert,
} from "@/lib/admin-questionnaire-validate";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuestionRow } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!id || !uuidRe.test(id)) {
    return NextResponse.json({ error: "Invalid profile id" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, questionnaire_version")
    .eq("id", id)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const version = profile.questionnaire_version as number;

  const [{ data: questions, error: qErr }, { data: answerRows, error: aErr }] = await Promise.all([
    admin.from("questions").select("*").eq("version", version).order("sort_order", { ascending: true }),
    admin.from("answers").select("question_id, value").eq("user_id", id),
  ]);

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const answers: Record<string, unknown> = {};
  for (const row of answerRows ?? []) {
    answers[row.question_id as string] = row.value;
  }

  return NextResponse.json({
    version,
    questions: (questions ?? []) as QuestionRow[],
    answers,
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!id || !uuidRe.test(id)) {
    return NextResponse.json({ error: "Invalid profile id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("answers" in body)) {
    return NextResponse.json({ error: "Expected { answers: { [questionId]: value | null } }" }, { status: 400 });
  }

  const patch = (body as { answers: unknown }).answers;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return NextResponse.json({ error: "answers must be an object" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, questionnaire_version")
    .eq("id", id)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const version = profile.questionnaire_version as number;
  const { data: questions, error: qErr } = await admin
    .from("questions")
    .select("*")
    .eq("version", version);

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const byId = new Map((questions ?? []).map((q) => [q.id as string, q as QuestionRow]));

  const toDelete: string[] = [];
  const toUpsert: { user_id: string; question_id: string; value: unknown }[] = [];

  for (const [questionId, rawValue] of Object.entries(patch as Record<string, unknown>)) {
    if (!uuidRe.test(questionId)) {
      return NextResponse.json({ error: `Invalid question id: ${questionId}` }, { status: 400 });
    }
    const q = byId.get(questionId);
    if (!q) {
      return NextResponse.json(
        { error: `Unknown question for questionnaire version ${version}: ${questionId}` },
        { status: 400 },
      );
    }

    if (rawValue === null) {
      toDelete.push(questionId);
      continue;
    }

    const err = validateAnswerValueForUpsert(q, rawValue);
    if (err) {
      return NextResponse.json({ error: `${q.prompt}: ${err}` }, { status: 400 });
    }

    const normalized = normalizeAnswerForStorage(q, rawValue);
    if (shouldClearOptionalAnswer(q, normalized)) {
      toDelete.push(questionId);
      continue;
    }

    toUpsert.push({ user_id: id, question_id: questionId, value: normalized });
  }

  for (const questionId of toDelete) {
    const { error: dErr } = await admin.from("answers").delete().eq("user_id", id).eq("question_id", questionId);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  if (toUpsert.length) {
    const { error: uErr } = await admin.from("answers").upsert(toUpsert, { onConflict: "user_id,question_id" });
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: toUpsert.length, deleted: toDelete.length });
}
