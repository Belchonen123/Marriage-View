import { buildCoachProfileContext } from "@/lib/coach/format-profile-for-coach";
import { COACH_SYSTEM_PROMPT } from "@/lib/coach/system-prompt";
import { completeChat, CoachNotConfiguredError, type ChatMessage } from "@/lib/coach/openai-fetch";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { ProfileRow, QuestionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 24;
const MAX_IMPORTED_TRANSCRIPT = 20_000;

type IncomingMsg = { role?: string; content?: string };

type CoachProfileRow = Pick<
  ProfileRow,
  | "display_name"
  | "city"
  | "bio"
  | "gender"
  | "seeking"
  | "age_min"
  | "age_max"
  | "birth_year"
  | "max_distance_km"
  | "questionnaire_version"
  | "onboarding_complete"
  | "photo_verification_status"
> & {
  icebreaker_answers?: unknown;
};

export async function POST(req: Request) {
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

  const body = await req.json().catch(() => null);
  const rawMessages = body?.messages as IncomingMsg[] | undefined;
  const matchId = typeof body?.matchId === "string" ? body.matchId.trim() : null;
  const importedRaw = typeof body?.importedTranscript === "string" ? body.importedTranscript : "";
  const importedTranscript = importedRaw.trim().slice(0, MAX_IMPORTED_TRANSCRIPT);

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const messages: ChatMessage[] = [];
  for (const m of rawMessages.slice(-MAX_MESSAGES)) {
    if (m?.role !== "user" && m?.role !== "assistant") continue;
    const c = typeof m.content === "string" ? m.content.trim() : "";
    if (!c) continue;
    messages.push({ role: m.role, content: c.slice(0, 12_000) });
  }

  if (!messages.length || messages[messages.length - 1]?.role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user" }, { status: 400 });
  }

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select(
      "display_name, city, bio, gender, seeking, age_min, age_max, birth_year, max_distance_km, questionnaire_version, onboarding_complete, photo_verification_status, icebreaker_answers",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (pErr || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  const p = profile as CoachProfileRow;
  const qVersion = p.questionnaire_version ?? 1;

  const [{ data: questionsRaw, error: qErr }, { data: answerRows, error: aErr }] = await Promise.all([
    admin.from("questions").select("*").eq("version", qVersion).order("sort_order", { ascending: true }),
    admin.from("answers").select("question_id, value").eq("user_id", user.id),
  ]);

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }
  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }

  const answersByQuestionId: Record<string, unknown> = {};
  for (const row of answerRows ?? []) {
    const qid = row.question_id as string;
    answersByQuestionId[qid] = row.value;
  }

  let matchNote: string | null = null;
  if (matchId) {
    const { data: mrow } = await admin
      .from("matches")
      .select("id, user_a, user_b")
      .eq("id", matchId)
      .maybeSingle();
    if (!mrow || (mrow.user_a !== user.id && mrow.user_b !== user.id)) {
      return NextResponse.json({ error: "Invalid match" }, { status: 400 });
    }
    const otherId = mrow.user_a === user.id ? mrow.user_b : mrow.user_a;
    const { data: other } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", otherId)
      .maybeSingle();
    const name = (other?.display_name as string | undefined)?.trim() || "your match";
    matchNote = `They opened the coach while chatting with a match (${name}). Do not assume anything beyond what the user says.`;
  }

  const contextBlock = buildCoachProfileContext({
    displayName: p.display_name?.trim() || "",
    city: p.city ?? null,
    bio: p.bio ?? null,
    gender: p.gender ?? null,
    seeking: p.seeking ?? null,
    ageMin: p.age_min ?? 18,
    ageMax: p.age_max ?? 99,
    birthYear: p.birth_year ?? null,
    maxDistanceKm: p.max_distance_km ?? 500,
    questionnaireVersion: qVersion,
    onboardingComplete: Boolean(p.onboarding_complete),
    photoVerificationStatus: p.photo_verification_status ?? null,
    icebreakerAnswersRaw: p.icebreaker_answers,
    matchNote,
    questions: (questionsRaw ?? []) as QuestionRow[],
    answersByQuestionId,
  });

  let systemContent = `${COACH_SYSTEM_PROMPT}\n\n${contextBlock}`;
  if (importedTranscript) {
    systemContent += `\n\n--- Imported match chat (You = this member; Them = their match). Use it only for patterns, tone, and ideas — stay kind and non-judgmental. When you respond about this thread, stay brief and plain text as instructed.\n${importedTranscript}\n--- End imported chat ---`;
  }

  const fullMessages: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...messages,
  ];

  try {
    const reply = await completeChat(fullMessages, req.signal);
    return NextResponse.json({ reply });
  } catch (e) {
    if (e instanceof CoachNotConfiguredError) {
      return NextResponse.json(
        { error: "Coach is not configured on the server. Add OPENAI_API_KEY to the deployment environment." },
        { status: 503 },
      );
    }
    const msg = e instanceof Error ? e.message : "Coach request failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
