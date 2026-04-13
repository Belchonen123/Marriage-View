import { createAdminClient } from "@/lib/supabase/admin";
import { sendResendEmail } from "@/lib/email-digest";
import { sendWebPushToUser } from "@/lib/push-notify";
import { parseNotificationPrefs } from "@/lib/retention/notification-prefs";
import { scorePairExplain } from "@/lib/matching/score";
import type { ProfileRow, QuestionRow } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 86400000;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const cutoffMs = Date.now() - WEEK_MS;
  const { data: profileRows, error: uErr } = await admin
    .from("profiles")
    .select("id, questionnaire_version, last_top_pick_digest_at, notification_prefs")
    .eq("onboarding_complete", true)
    .limit(200);

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 400 });
  }

  const users = (profileRows ?? []).filter((r) => {
    const at = r.last_top_pick_digest_at as string | null | undefined;
    if (!at) return true;
    const t = new Date(at).getTime();
    return !Number.isNaN(t) && t < cutoffMs;
  }).slice(0, 80);

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  let emailsSent = 0;
  let pushesSent = 0;

  for (const u of users ?? []) {
    const userId = u.id as string;
    const version = (u.questionnaire_version as number) ?? 1;
    const prefs = parseNotificationPrefs(u.notification_prefs);
    if (!prefs.retention_weekly_hint) {
      await admin
        .from("profiles")
        .update({ last_top_pick_digest_at: new Date().toISOString() })
        .eq("id", userId);
      continue;
    }

    const { data: matches } = await admin
      .from("matches")
      .select("id, user_a, user_b")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .limit(40);

    if (!matches?.length) continue;

    const otherIds = [
      ...new Set(
        matches.map((m) => (m.user_a === userId ? (m.user_b as string) : (m.user_a as string))),
      ),
    ];

    const { data: questionsRaw } = await admin
      .from("questions")
      .select("*")
      .eq("version", version)
      .order("sort_order", { ascending: true });

    const questions = (questionsRaw ?? []) as QuestionRow[];
    if (!questions.length) continue;

    const { data: myAns } = await admin.from("answers").select("question_id, value").eq("user_id", userId);
    const myAnswers: Record<string, unknown> = {};
    for (const r of myAns ?? []) myAnswers[r.question_id as string] = r.value;

    const { data: theirAns } = await admin
      .from("answers")
      .select("user_id, question_id, value")
      .in("user_id", otherIds);

    const byOther: Record<string, Record<string, unknown>> = {};
    for (const r of theirAns ?? []) {
      const oid = r.user_id as string;
      if (!byOther[oid]) byOther[oid] = {};
      byOther[oid][r.question_id as string] = r.value;
    }

    let bestOther: string | null = null;
    let bestInsight: ReturnType<typeof scorePairExplain> | null = null;

    for (const oid of otherIds) {
      const ex = scorePairExplain(questions, myAnswers, byOther[oid] ?? {});
      if (ex.hardFail) continue;
      if (!bestInsight || ex.totalPercent > bestInsight.totalPercent) {
        bestInsight = ex;
        bestOther = oid;
      }
    }

    if (!bestOther || !bestInsight) continue;

    const topMatchRow = (matches ?? []).find(
      (m) =>
        (m.user_a === userId && m.user_b === bestOther) || (m.user_b === userId && m.user_a === bestOther),
    );
    const topMatchId = (topMatchRow?.id as string | undefined) ?? null;
    const deepHref = topMatchId ? `/chat/${topMatchId}` : "/matches";

    const { data: otherProf } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", bestOther)
      .maybeSingle();

    const name = (otherProf?.display_name as string) || "Your match";
    const fromInsight = bestInsight.reasons.filter(Boolean);
    const filler = [
      "Strong alignment on shared priorities.",
      "Compatible rhythms for marriage-minded dating.",
      "Clear overlap on values that tend to matter long-term.",
    ];
    const three: string[] = [...fromInsight];
    for (const f of filler) {
      if (three.length >= 3) break;
      if (!three.includes(f)) three.push(f);
    }
    const topThree = three.slice(0, 3);

    const matchHref = origin ? `${origin}${deepHref}` : deepHref;
    const html = `<p>Your <strong>#1 compatibility match</strong> this week: <strong>${escapeHtml(name)}</strong> (${Math.round(
      bestInsight.totalPercent,
    )}%).</p><p><strong>Why you fit:</strong></p><ul>${topThree
      .map((r) => `<li>${escapeHtml(r)}</li>`)
      .join("")}</ul><p><a href="${escapeHtml(matchHref)}">Open Matches</a></p>`;

    const { data: authData } = await admin.auth.admin.getUserById(userId);
    const email = authData?.user?.email;

    if (process.env.RESEND_API_KEY && email) {
      const ok = await sendResendEmail({
        to: email,
        subject: `Marriage View: Your #1 match — ${name}`,
        html,
      });
      if (ok) emailsSent++;
    }

    await admin.from("user_notifications").insert({
      user_id: userId,
      kind: "retention_weekly_top_pick",
      title: "Your #1 match this week",
      body: `${name} — ${topThree[0] ?? "Open Matches for a quick compatibility recap."}`,
      href: deepHref,
      metadata: { source: "weekly_top_pick_cron", matchUserId: bestOther },
    });

    await sendWebPushToUser(admin, userId, {
      title: "Your #1 match this week",
      body: `${name} — ${topThree[0] ?? "Open the app for details."}`,
      url: deepHref,
    });
    pushesSent++;

    await admin
      .from("profiles")
      .update({ last_top_pick_digest_at: new Date().toISOString() })
      .eq("id", userId);
  }

  return NextResponse.json({ ok: true, processed: users?.length ?? 0, emailsSent, pushesSent });
}
