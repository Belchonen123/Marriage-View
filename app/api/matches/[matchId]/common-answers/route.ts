import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { answersExactlyEqual } from "@/lib/matching/score";
import { formatAnswerValue } from "@/lib/questionnaire-display";
import type { CommonAnswerItem, CommonAnswersPayload, QuestionRow } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await ctx.params;

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

  const { data: match, error: matchErr } = await admin
    .from("matches")
    .select("id, user_a, user_b")
    .eq("id", matchId)
    .maybeSingle();

  if (matchErr || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (match.user_a !== user.id && match.user_b !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const otherId = match.user_a === user.id ? (match.user_b as string) : (match.user_a as string);

  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, questionnaire_version")
    .in("id", [user.id, otherId]);

  if (profErr || !profiles?.length) {
    return NextResponse.json({ error: "Profiles not found" }, { status: 400 });
  }

  const selfProf = profiles.find((p) => p.id === user.id);
  const otherProf = profiles.find((p) => p.id === otherId);
  const versionSelf = (selfProf?.questionnaire_version as number) ?? 1;
  const versionOther = (otherProf?.questionnaire_version as number) ?? 1;
  const versionMismatch = versionSelf !== versionOther;

  const { data: questionsRaw, error: qErr } = await admin
    .from("questions")
    .select("*")
    .eq("version", versionSelf)
    .order("sort_order", { ascending: true });

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const questions = (questionsRaw ?? []) as QuestionRow[];

  const { data: answerRows, error: aErr } = await admin
    .from("answers")
    .select("user_id, question_id, value")
    .in("user_id", [user.id, otherId]);

  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }

  const byUser = new Map<string, Record<string, unknown>>();
  for (const row of answerRows ?? []) {
    const uid = row.user_id as string;
    const qid = row.question_id as string;
    if (!byUser.has(uid)) byUser.set(uid, {});
    (byUser.get(uid) as Record<string, unknown>)[qid] = row.value;
  }

  const mine = byUser.get(user.id) ?? {};
  const theirs = byUser.get(otherId) ?? {};

  const items: CommonAnswerItem[] = [];
  for (const q of questions) {
    const a = mine[q.id];
    const b = theirs[q.id];
    if (!answersExactlyEqual(q, a, b)) continue;
    items.push({
      questionId: q.id,
      section: q.section,
      prompt: q.prompt,
      answer_type: q.answer_type,
      agreedLabel: formatAnswerValue(q, a),
    });
  }

  if (items.length > 0) {
    const now = new Date().toISOString();
    const { data: msRow } = await admin
      .from("match_connection_milestones")
      .select("first_shared_answer_at")
      .eq("match_id", matchId)
      .maybeSingle();
    if (!msRow) {
      await admin.from("match_connection_milestones").insert({
        match_id: matchId,
        first_shared_answer_at: now,
        updated_at: now,
      });
    } else if (!msRow.first_shared_answer_at) {
      await admin
        .from("match_connection_milestones")
        .update({ first_shared_answer_at: now, updated_at: now })
        .eq("match_id", matchId);
    }
  }

  const payload: CommonAnswersPayload = {
    items,
    versionSelf,
    versionOther,
    versionMismatch,
  };

  return NextResponse.json(payload);
}
