import { createAdminClient } from "@/lib/supabase/admin";
import { sendResendEmail } from "@/lib/email-digest";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Weekly-style digest: one email per user with unread in-app notifications from the last 7 days.
 * Auth: Authorization: Bearer CRON_SECRET
 * On Vercel, set CRON_SECRET in project env; scheduled crons (see vercel.json) send this header automatically.
 */
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

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: true, skipped: "RESEND_API_KEY not set" });
  }

  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: rows, error } = await admin
    .from("user_notifications")
    .select("id, user_id, title, body, href, created_at")
    .is("read_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const byUser = new Map<string, typeof rows>();
  for (const row of rows ?? []) {
    const uid = row.user_id as string;
    const list = byUser.get(uid) ?? [];
    list.push(row);
    byUser.set(uid, list);
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

  let sent = 0;
  for (const [userId, list] of byUser) {
    const { data: authData, error: authErr } = await admin.auth.admin.getUserById(userId);
    const email = authData?.user?.email;
    if (authErr || !email) continue;

    const lines = list
      .slice(0, 15)
      .map((n) => {
        const path = String(n.href ?? "/matches");
        const href = origin ? `${origin}${path.startsWith("/") ? path : `/${path}`}` : path;
        return `<li><strong>${escapeHtml(n.title as string)}</strong> — ${escapeHtml((n.body as string) ?? "")}${
          n.href ? ` <a href="${escapeHtml(href)}">Open</a>` : ""
        }</li>`;
      })
      .join("");

    const openLink = origin ? `${origin}/matches` : "/matches";
    const html = `<p>You have unread activity on Marriage View:</p><ul>${lines}</ul><p><a href="${escapeHtml(openLink)}">Open Marriage View</a></p>`;
    const ok = await sendResendEmail({
      to: email,
      subject: `Marriage View: ${list.length} unread notification${list.length === 1 ? "" : "s"}`,
      html,
    });
    if (ok) sent++;
  }

  return NextResponse.json({ ok: true, users: byUser.size, emailsSent: sent });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
