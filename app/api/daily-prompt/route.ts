import { createClient } from "@/lib/supabase/server";
import { answersForDay, mergeIcebreakerAnswer, parseIcebreakerAnswers } from "@/lib/icebreaker-answers";
import { ICE_BREAKERS_PER_DAY, dailyIcebreakersForUtcDate } from "@/lib/daily-prompt";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { day, prompts } = dailyIcebreakersForUtcDate(new Date());

  const { data: row } = await supabase
    .from("profiles")
    .select("icebreaker_answers")
    .eq("id", user.id)
    .maybeSingle();

  const list = parseIcebreakerAnswers(row?.icebreaker_answers);
  const bySlot = answersForDay(list, day);

  const myAnswers: (string | null)[] = Array.from({ length: ICE_BREAKERS_PER_DAY }, () => null);
  const answeredAt: (string | null)[] = Array.from({ length: ICE_BREAKERS_PER_DAY }, () => null);

  for (let s = 0; s < ICE_BREAKERS_PER_DAY; s++) {
    const e = bySlot.get(s);
    if (e) {
      myAnswers[s] = e.answer;
      answeredAt[s] = e.updated_at || null;
    }
  }

  return NextResponse.json({
    day,
    prompts,
    myAnswers,
    answeredAt,
    /** @deprecated use prompts[0] */
    prompt: prompts[0] ?? "",
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { answer?: string; slot?: number };
  try {
    body = (await req.json()) as { answer?: string; slot?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (answer.length < 2 || answer.length > 2000) {
    return NextResponse.json({ error: "Answer must be 2–2000 characters" }, { status: 400 });
  }

  let slot = typeof body.slot === "number" && Number.isInteger(body.slot) ? body.slot : 0;
  if (slot < 0 || slot >= ICE_BREAKERS_PER_DAY) {
    return NextResponse.json({ error: `slot must be 0–${ICE_BREAKERS_PER_DAY - 1}` }, { status: 400 });
  }

  const { day, prompts } = dailyIcebreakersForUtcDate(new Date());
  const promptText = prompts[slot];
  if (!promptText) {
    return NextResponse.json({ error: "Invalid prompt day" }, { status: 400 });
  }

  const { data: prev } = await supabase
    .from("profiles")
    .select("icebreaker_answers")
    .eq("id", user.id)
    .maybeSingle();

  const merged = mergeIcebreakerAnswer(prev?.icebreaker_answers, {
    day,
    slot,
    prompt: promptText,
    answer,
  });

  const { error } = await supabase
    .from("profiles")
    .update({
      icebreaker_answers: merged,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, day, slot, prompt: promptText });
}
