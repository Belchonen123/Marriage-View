import { createClient } from "@/lib/supabase/server";
import { parseNotificationPrefs } from "@/lib/retention/notification-prefs";
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

  const [
    { data: profile },
    { count: journalCount },
    { count: afterCallCount },
    { count: purposefulCount },
    { data: prefsRow },
  ] = await Promise.all([
    supabase.from("profiles").select("notification_prefs").eq("id", user.id).maybeSingle(),
    supabase
      .from("match_journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("match_journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("call_occurred_at", "is", null),
    supabase
      .from("match_journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("has_purposeful_focus", true),
    supabase.from("user_ranking_prefs").select("engagement_multiplier, journal_entries_30d").eq("user_id", user.id).maybeSingle(),
  ]);

  const notificationPrefs = parseNotificationPrefs(profile?.notification_prefs);

  const reflectionsTotal = journalCount ?? 0;
  const reflectionsAfterVideo = afterCallCount ?? 0;
  const purposefulReflections = purposefulCount ?? 0;

  const journeyStages = [
    {
      id: "showing_up",
      label: "Showing up",
      hint: "First private reflection",
      done: reflectionsTotal >= 1,
    },
    {
      id: "after_video",
      label: "Pausing after video",
      hint: "Named how a call felt",
      done: reflectionsAfterVideo >= 1,
    },
    {
      id: "intentional",
      label: "Dating with intention",
      hint: "Used a purposeful prompt (values, goals, pace, safety)",
      done: purposefulReflections >= 1,
    },
    {
      id: "rhythm",
      label: "Your rhythm",
      hint: "Five reflections — a steady practice",
      done: reflectionsTotal >= 5,
    },
  ];

  const journeyProgress =
    journeyStages.length > 0
      ? Math.round((journeyStages.filter((s) => s.done).length / journeyStages.length) * 100)
      : 0;

  return NextResponse.json({
    journalEntriesTotal: reflectionsTotal,
    reflectionsAfterVideo,
    purposefulReflections,
    datingJourney: {
      progressPercent: journeyProgress,
      stages: journeyStages,
    },
    discoverPersonalization: {
      engagementMultiplier: Number(prefsRow?.engagement_multiplier ?? 1),
      journalEntries30d: prefsRow?.journal_entries_30d ?? 0,
    },
    notificationPrefs,
  });
}
