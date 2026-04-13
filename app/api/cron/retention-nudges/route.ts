import { createAdminClient } from "@/lib/supabase/admin";
import { parseNotificationPrefs } from "@/lib/retention/notification-prefs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FOURTEEN_DAYS_MS = 14 * 86400000;
const TEN_DAYS_MS = 10 * 86400000;
const TWENTY_DAYS_MS = 20 * 86400000;

async function recentNotificationCount(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  kind: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await admin
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", sinceIso);
  if (error) return 999;
  return count ?? 0;
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

  const now = Date.now();
  const journalSince = new Date(now - FOURTEEN_DAYS_MS).toISOString();
  const reengageSince = new Date(now - TWENTY_DAYS_MS).toISOString();

  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("id, notification_prefs, last_active_at, onboarding_complete")
    .eq("onboarding_complete", true)
    .limit(200);

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 400 });
  }

  let journalNudges = 0;
  let reengageNudges = 0;

  for (const p of profiles ?? []) {
    const userId = p.id as string;
    const prefs = parseNotificationPrefs(p.notification_prefs);

    if (prefs.retention_journal) {
      const recent = await recentNotificationCount(admin, userId, "retention_journal_prompt", journalSince);
      if (recent === 0) {
        const { count: jCount } = await admin
          .from("match_journal_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);

        if ((jCount ?? 0) === 0) {
          const { data: matchRow } = await admin
            .from("matches")
            .select("id")
            .or(`user_a.eq.${userId},user_b.eq.${userId}`)
            .limit(1)
            .maybeSingle();

          if (matchRow?.id) {
            const { count: msgCount } = await admin
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("match_id", matchRow.id as string)
              .gte("created_at", new Date(now - 21 * 86400000).toISOString());

            if ((msgCount ?? 0) >= 3) {
              const { error: insErr } = await admin.from("user_notifications").insert({
                user_id: userId,
                kind: "retention_journal_prompt",
                title: "A quick reflection",
                body: "When you have a minute, jot how things feel with your match — it helps you stay intentional.",
                href: `/chat/${matchRow.id}`,
                metadata: { source: "retention_cron" },
              });
              if (!insErr) journalNudges += 1;
            }
          }
        }
      }
    }

    if (prefs.retention_reengage) {
      const recentR = await recentNotificationCount(admin, userId, "retention_reengage", reengageSince);
      if (recentR === 0) {
        const last = p.last_active_at ? new Date(p.last_active_at as string).getTime() : 0;
        if (last && now - last > TEN_DAYS_MS) {
          const { error: insErr } = await admin.from("user_notifications").insert({
            user_id: userId,
            kind: "retention_reengage",
            title: "Marriage View misses you",
            body: "New people are joining Discover. Come back when you have a few minutes.",
            href: "/discover",
            metadata: { source: "retention_cron" },
          });
          if (!insErr) reengageNudges += 1;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    journalNudges,
    reengageNudges,
    scanned: profiles?.length ?? 0,
  });
}
