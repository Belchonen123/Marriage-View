import { aggregateProfileStats, type ProfileStatsRow } from "@/lib/admin-stats-aggregate";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGE = 800;

async function fetchAllProfileStatRows(admin: SupabaseClient): Promise<ProfileStatsRow[]> {
  const out: ProfileStatsRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("profiles")
      .select(
        "gender, seeking, birth_year, onboarding_complete, city, questionnaire_version, max_distance_km, age_min, age_max, photo_urls, bio, created_at, last_active_at",
      )
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as ProfileStatsRow[];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const now = new Date();

  const monthStarts: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthStarts.push(d.toISOString());
  }
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  let profileRows: ProfileStatsRow[];
  try {
    profileRows = await fetchAllProfileStatRows(admin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load profiles";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const agg = aggregateProfileStats(profileRows, now);

  const matchMonthQueries = monthStarts.map((start, idx) => {
    const end = idx < monthStarts.length - 1 ? monthStarts[idx + 1]! : nextMonthStart;
    return admin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lt("created_at", end);
  });

  const [
    profilesTotal,
    profilesComplete,
    matches,
    pendingReports,
    reviewedReports,
    actionedReports,
    reportsTotal,
    questions,
    interactionsLikes,
    interactionsPasses,
    interactionsTotal,
    messagesTotal,
    blocksTotal,
    freeEntitlements,
    notificationsUnread,
    notificationsTotal,
    answersTotal,
    journalEntriesTotal,
    reportsUrgentPending,
    ...matchMonthResults
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("onboarding_complete", true),
    admin.from("matches").select("id", { count: "exact", head: true }),
    admin.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("reports").select("id", { count: "exact", head: true }).eq("status", "reviewed"),
    admin.from("reports").select("id", { count: "exact", head: true }).eq("status", "actioned"),
    admin.from("reports").select("id", { count: "exact", head: true }),
    admin.from("questions").select("id", { count: "exact", head: true }),
    admin.from("interactions").select("id", { count: "exact", head: true }).eq("action", "like"),
    admin.from("interactions").select("id", { count: "exact", head: true }).eq("action", "pass"),
    admin.from("interactions").select("id", { count: "exact", head: true }),
    admin.from("messages").select("id", { count: "exact", head: true }),
    admin.from("blocks").select("blocker_id", { count: "exact", head: true }),
    admin.from("user_entitlements").select("user_id", { count: "exact", head: true }).eq("tier", "free"),
    admin.from("user_notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    admin.from("user_notifications").select("id", { count: "exact", head: true }),
    admin.from("answers").select("user_id", { count: "exact", head: true }),
    admin.from("match_journal_entries").select("id", { count: "exact", head: true }),
    admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("priority", "urgent"),
    ...matchMonthQueries,
  ]);

  const err =
    profilesTotal.error ??
    profilesComplete.error ??
    matches.error ??
    pendingReports.error ??
    reviewedReports.error ??
    actionedReports.error ??
    reportsTotal.error ??
    questions.error ??
    interactionsLikes.error ??
    interactionsPasses.error ??
    interactionsTotal.error ??
    messagesTotal.error ??
    blocksTotal.error ??
    freeEntitlements.error ??
    notificationsUnread.error ??
    notificationsTotal.error ??
    answersTotal.error ??
    journalEntriesTotal.error ??
    reportsUrgentPending.error;

  const matchMonthErr = matchMonthResults.find((r) => r.error)?.error;
  if (err || matchMonthErr) {
    return NextResponse.json({ error: (err ?? matchMonthErr)!.message }, { status: 500 });
  }

  const likes = interactionsLikes.count ?? 0;
  const passes = interactionsPasses.count ?? 0;
  const swipes = likes + passes;
  const matchCount = matches.count ?? 0;
  const msgCount = messagesTotal.count ?? 0;
  const complete = profilesComplete.count ?? 0;
  const totalProfiles = profilesTotal.count ?? 0;
  const explicitFree = freeEntitlements.count ?? 0;
  const plusTierUsers = Math.max(0, totalProfiles - explicitFree);

  const matchesByMonth = monthStarts.map((start, idx) => {
    const r = matchMonthResults[idx]!;
    const d = new Date(start);
    const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { month: label, newMatches: r.count ?? 0 };
  });

  return NextResponse.json({
    profilesTotal: profilesTotal.count ?? 0,
    profilesOnboardingComplete: complete,
    matches: matchCount,
    pendingReports: pendingReports.count ?? 0,
    questions: questions.count ?? 0,
    likes,
    passes,
    interactionsTotal: interactionsTotal.count ?? 0,
    messages: msgCount,
    blocks: blocksTotal.count ?? 0,
    plusTierUsers,
    explicitFreeTierUsers: explicitFree,
    notificationsUnread: notificationsUnread.count ?? 0,
    notificationsTotal: notificationsTotal.count ?? 0,
    answersRowsTotal: answersTotal.count ?? 0,
    journalEntriesTotal: journalEntriesTotal.count ?? 0,
    reportsUrgentPending: reportsUrgentPending.count ?? 0,
    reports: {
      pending: pendingReports.count ?? 0,
      reviewed: reviewedReports.count ?? 0,
      actioned: actionedReports.count ?? 0,
      total: reportsTotal.count ?? 0,
    },
    derived: {
      likePassRatio: swipes > 0 ? Math.round((likes / swipes) * 1000) / 1000 : null,
      messagesPerMatch: matchCount > 0 ? Math.round((msgCount / matchCount) * 100) / 100 : null,
      mutualPairsPerOnboardedProfile:
        complete > 0 ? Math.round((matchCount / complete) * 1000) / 1000 : null,
      plusAttachRate:
        totalProfiles > 0 ? Math.round((plusTierUsers / totalProfiles) * 1000) / 1000 : null,
      onboardingRate:
        (profilesTotal.count ?? 0) > 0
          ? Math.round((complete / (profilesTotal.count ?? 1)) * 1000) / 1000
          : null,
    },
    matchesByMonth,
    profilesSampleSize: profileRows.length,
    demographics: {
      byAgeBucket: agg.byAgeBucket,
      byGender: agg.byGender,
      bySeeking: agg.bySeeking,
      genderSeekingCross: agg.genderSeekingCross,
      birthYearMissing: agg.birthYearMissing,
      medianAge: agg.medianAge,
    },
    preferences: {
      quizVersion: agg.quizVersion,
      maxDistanceKm: agg.maxDistanceKm,
      ageRangeSpan: agg.ageRangeSpan,
    },
    profileHealth: {
      photoCountHistogram: agg.photoCountHistogram,
      withBio: agg.withBio,
      emptyBio: agg.emptyBio,
      onboardedComplete: agg.onboardedComplete,
      onboardedIncomplete: agg.onboardedIncomplete,
      unknownCity: agg.unknownCity,
    },
    geography: {
      topCities: agg.topCities,
    },
    growth: {
      signupsByMonth: agg.signupsByMonth,
    },
    engagement: {
      activeLast7d: agg.activeLast7d,
      activeLast30d: agg.activeLast30d,
    },
  });
}
