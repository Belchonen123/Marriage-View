import { userInMatch } from "@/lib/match-guards";
import { sendResendEmail } from "@/lib/email-digest";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CONCERN_TYPES = new Set(["discomfort", "unsafe", "harassment", "other"]);

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const matchId = typeof body.matchId === "string" ? body.matchId.trim() : "";
  const reportedUserId = typeof body.reportedUserId === "string" ? body.reportedUserId.trim() : "";
  const concernType = typeof body.concernType === "string" ? body.concernType.trim() : "";
  const narrativeRaw = body.narrative;
  const narrative =
    typeof narrativeRaw === "string" ? narrativeRaw.trim().slice(0, 8000) : "";

  if (!matchId || !reportedUserId || reportedUserId === user.id) {
    return NextResponse.json({ error: "matchId and reportedUserId required" }, { status: 400 });
  }
  if (!CONCERN_TYPES.has(concernType)) {
    return NextResponse.json(
      { error: "concernType must be discomfort | unsafe | harassment | other" },
      { status: 400 },
    );
  }

  if (!(await userInMatch(supabase, matchId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: matchRow, error: mErr } = await supabase
    .from("matches")
    .select("user_a, user_b")
    .eq("id", matchId)
    .maybeSingle();

  if (mErr || !matchRow) {
    return NextResponse.json({ error: "Match not found" }, { status: 400 });
  }

  const a = matchRow.user_a as string;
  const b = matchRow.user_b as string;
  const other = user.id === a ? b : user.id === b ? a : null;
  if (other !== reportedUserId) {
    return NextResponse.json({ error: "reportedUserId must be the other participant" }, { status: 400 });
  }

  const reason = `post_call_concern:${concernType}`;
  const detailsParts = [
    "[FAST_TRACK — post-call]",
    `Reporter: ${user.id}`,
    `Reported: ${reportedUserId}`,
    `Match: ${matchId}`,
    `Concern: ${concernType}`,
    narrative ? `What they shared:\n${narrative}` : "(No additional narrative provided)",
  ];
  const details = detailsParts.join("\n\n");

  const { error: insErr } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_user_id: reportedUserId,
    reason,
    details,
    status: "pending",
    priority: "urgent",
    match_id: matchId,
  });

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  const alertTo = process.env.SUPPORT_ALERT_EMAIL?.trim();
  if (alertTo && process.env.RESEND_API_KEY && process.env.RESEND_FROM) {
    const subject = `[Urgent] Post-call concern — ${concernType} — match ${matchId.slice(0, 8)}…`;
    const html = `<p><strong>Post-call escalation</strong></p><pre style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(details)}</pre>`;
    await sendResendEmail({ to: alertTo, subject, html });
  }

  return NextResponse.json({ ok: true });
}
