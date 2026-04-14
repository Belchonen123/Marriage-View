import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkArray } from "@/lib/chunk-array";
import { hashQuestionBankForCache } from "@/lib/matching/question-bank-hash";
import {
  diversifyByScoreTier,
  engagementFactor,
  haversineKm,
  normalizedScore,
  passesAgePreference,
  profileCompletenessRatio,
  recencyBoost,
  scorePair,
  scorePairExplain,
  type ExplainableScore,
} from "@/lib/matching/score";
import type { MatchInsight, ProfileRow, PublicProfile, QuestionRow } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type DiscoverDiag = {
  otherOnboardedInPool: number;
  droppedAlreadySwipedOrSelf: number;
  droppedBlocked: number;
  droppedAgePrefs: number;
  droppedDistance: number;
  droppedGenderSeeking: number;
  droppedVerifiedOnly: number;
  passedFilters: number;
};

type DiscoverItem = {
  profile: PublicProfile;
  /** Normalized 0–1 (legacy field; aligns with questionnaire match after category weighting). */
  score: number;
  insight: MatchInsight;
};

type EnrichedRow = DiscoverItem & {
  rankScore: number;
  completeness: number;
  recency: number;
  engagement: number;
  msgCount: number;
  /** Bounded personalization from `user_ranking_prefs` (candidate’s journal signals). */
  journalRankingMult: number;
};

export async function GET(req: Request) {
  const urlObj = new URL(req.url);
  const debug = urlObj.searchParams.get("debug") === "1";
  const maxKmRaw = urlObj.searchParams.get("max_km");
  const parsedMaxKm =
    maxKmRaw != null && maxKmRaw !== ""
      ? Math.min(2500, Math.max(5, Number(maxKmRaw)))
      : null;
  const sessionMaxKm = parsedMaxKm != null && !Number.isNaN(parsedMaxKm) ? parsedMaxKm : null;
  const verifiedOnly = urlObj.searchParams.get("verified_only") === "1";
  const prioritizeInbound = urlObj.searchParams.get("prioritize_inbound") === "1";

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
    return NextResponse.json(
      { error: "Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 },
    );
  }

  const { data: me, error: meErr } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (meErr || !me) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  const profile = me as ProfileRow;
  if (!profile.onboarding_complete) {
    return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const { error: bumpErr } = await admin
    .from("profiles")
    .update({ last_active_at: nowIso })
    .eq("id", user.id);
  if (bumpErr && debug) {
    // Column may be missing before migration 002 — discover still works.
    console.warn("discover: last_active_at bump skipped:", bumpErr.message);
  }

  const { data: questionsRaw, error: qErr } = await admin
    .from("questions")
    .select("*")
    .eq("version", profile.questionnaire_version)
    .order("sort_order", { ascending: true });

  if (qErr || !questionsRaw?.length) {
    return NextResponse.json({ error: "Questions not available" }, { status: 500 });
  }

  const questions = questionsRaw as QuestionRow[];
  const questionSnapshotHash = hashQuestionBankForCache(questions);

  const { data: myAnswersRows } = await admin
    .from("answers")
    .select("question_id, value")
    .eq("user_id", user.id);

  const myAnswers: Record<string, unknown> = {};
  for (const r of myAnswersRows ?? []) {
    myAnswers[r.question_id as string] = r.value;
  }

  const { data: blocked } = await admin
    .from("blocks")
    .select("blocked_id, blocker_id")
    .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);

  const blockedIds = new Set<string>();
  for (const b of blocked ?? []) {
    if (b.blocker_id === user.id) blockedIds.add(b.blocked_id as string);
    if (b.blocked_id === user.id) blockedIds.add(b.blocker_id as string);
  }

  const { data: already } = await admin
    .from("interactions")
    .select("to_user")
    .eq("from_user", user.id);

  const seen = new Set((already ?? []).map((x) => x.to_user as string));
  seen.add(user.id);

  const { data: inboundLikeRows } = await admin
    .from("interactions")
    .select("from_user")
    .eq("to_user", user.id)
    .eq("action", "like");

  const inboundFromIds = [
    ...new Set((inboundLikeRows ?? []).map((r) => r.from_user as string)),
  ].filter((id) => id && id !== user.id);

  /** Inbound likers you have not passed/blocked/matched and have not swiped yet — merged into pool; optional rank boost. */
  let inboundEligibleIds = new Set<string>();
  let eligibleInboundList: string[] = [];

  if (inboundFromIds.length > 0) {
    const [{ data: mineToInbound }, { data: matchRowsForInbound }] = await Promise.all([
      admin.from("interactions").select("to_user, action").eq("from_user", user.id).in("to_user", inboundFromIds),
      admin
        .from("matches")
        .select("user_a, user_b")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
    ]);

    const mineToInboundMap = new Map(
      (mineToInbound ?? []).map((r) => [r.to_user as string, r.action as string]),
    );
    const matchedForInbound = new Set<string>();
    for (const m of matchRowsForInbound ?? []) {
      matchedForInbound.add(m.user_a === user.id ? (m.user_b as string) : (m.user_a as string));
    }

    eligibleInboundList = inboundFromIds.filter((id) => {
      if (matchedForInbound.has(id)) return false;
      if (blockedIds.has(id)) return false;
      if (mineToInboundMap.get(id) === "pass") return false;
      if (seen.has(id)) return false;
      return true;
    });

    inboundEligibleIds = new Set(eligibleInboundList);
  }

  const { data: candidates } = await admin
    .from("profiles")
    .select("*")
    .eq("onboarding_complete", true)
    .neq("id", user.id)
    .limit(200);

  const pool = (candidates ?? []) as ProfileRow[];

  if (eligibleInboundList.length > 0) {
    const inPool = new Set(pool.map((p) => p.id));
    const missingInbound = eligibleInboundList.filter((id) => !inPool.has(id));

    if (missingInbound.length > 0) {
      const { data: extraProfiles } = await admin
        .from("profiles")
        .select("*")
        .in("id", missingInbound)
        .eq("onboarding_complete", true)
        .neq("id", user.id);

      for (const row of (extraProfiles ?? []) as ProfileRow[]) {
        if (!inPool.has(row.id)) {
          inPool.add(row.id);
          pool.push(row);
        }
      }
    }
  }

  let stage = pool;
  const n0 = stage.length;

  stage = stage.filter((row) => !seen.has(row.id));
  const dSwipe = n0 - stage.length;

  const lenAfterSwipe = stage.length;
  stage = stage.filter((row) => !blockedIds.has(row.id));
  const dBlock = lenAfterSwipe - stage.length;

  const afterAge = stage.filter((row) => {
    return (
      passesAgePreference(profile, row.birth_year) &&
      passesAgePreference(row, profile.birth_year)
    );
  });
  const dAge = stage.length - afterAge.length;
  stage = afterAge;

  const myDistCap =
    sessionMaxKm != null ? Math.min(profile.max_distance_km, sessionMaxKm) : profile.max_distance_km;

  const afterDist = stage.filter((row) => {
    if (
      profile.latitude != null &&
      profile.longitude != null &&
      row.latitude != null &&
      row.longitude != null
    ) {
      const d = haversineKm(
        profile.latitude,
        profile.longitude,
        row.latitude,
        row.longitude,
      );
      if (d > myDistCap || d > row.max_distance_km) return false;
    }
    return true;
  });
  const dDist = stage.length - afterDist.length;
  stage = afterDist;

  const afterGender = stage.filter((row) => {
    if (profile.seeking && row.gender && profile.seeking !== "everyone") {
      if (profile.seeking !== row.gender) return false;
    }
    if (row.seeking && profile.gender && row.seeking !== "everyone") {
      if (row.seeking !== profile.gender) return false;
    }
    return true;
  });
  const dGender = stage.length - afterGender.length;
  stage = afterGender;

  const afterVerified = verifiedOnly
    ? stage.filter((row) => (row as ProfileRow).photo_verification_status === "verified")
    : stage;
  const dVerify = stage.length - afterVerified.length;
  const filtered = afterVerified;

  const { data: activeBoosts } = await admin
    .from("boost_sessions")
    .select("user_id")
    .gte("ends_at", nowIso);

  const boostedIds = new Set((activeBoosts ?? []).map((r) => r.user_id as string));

  const { data: myBoost } = await admin
    .from("boost_sessions")
    .select("ends_at")
    .eq("user_id", user.id)
    .gte("ends_at", nowIso)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ids = filtered.map((p) => p.id);
  if (ids.length === 0) {
    const diag: DiscoverDiag = {
      otherOnboardedInPool: n0,
      droppedAlreadySwipedOrSelf: dSwipe,
      droppedBlocked: dBlock,
      droppedAgePrefs: dAge,
      droppedDistance: dDist,
      droppedGenderSeeking: dGender,
      droppedVerifiedOnly: dVerify,
      passedFilters: 0,
    };
    return NextResponse.json({
      items: [] as DiscoverItem[],
      diag,
      myBoostEndsAt: (myBoost?.ends_at as string | undefined) ?? null,
      ...(debug ? { debug: { bumpLastActiveOk: !bumpErr } } : {}),
    });
  }

  const byUser: Record<string, Record<string, unknown>> = {};
  const idChunks = chunkArray(ids, 150);
  for (const chunk of idChunks) {
    const { data: chunkAnswers } = await admin
      .from("answers")
      .select("user_id, question_id, value")
      .in("user_id", chunk);
    for (const r of chunkAnswers ?? []) {
      const uid = r.user_id as string;
      if (!byUser[uid]) byUser[uid] = {};
      byUser[uid][r.question_id as string] = r.value;
    }
  }

  const msgCountByUser = new Map<string, number>();
  if (ids.length > 0) {
    const { data: countRows, error: rpcErr } = await admin.rpc("message_counts_last_days", {
      p_user_ids: ids,
      p_days: 30,
    });
    if (!rpcErr && Array.isArray(countRows)) {
      for (const row of countRows as { user_id: string; msg_count: number }[]) {
        msgCountByUser.set(row.user_id, Number(row.msg_count));
      }
    } else if (debug && rpcErr) {
      console.warn("discover: message_counts_last_days:", rpcErr.message);
    }
  }

  const journalRankingMultByUser = new Map<string, number>();
  if (ids.length > 0) {
    const idChunks = chunkArray(ids, 120);
    for (const chunk of idChunks) {
      const { data: prefRows, error: prefErr } = await admin
        .from("user_ranking_prefs")
        .select("user_id, engagement_multiplier")
        .in("user_id", chunk);
      if (!prefErr && Array.isArray(prefRows)) {
        for (const row of prefRows as { user_id: string; engagement_multiplier: number }[]) {
          const m = Number(row.engagement_multiplier);
          journalRankingMultByUser.set(row.user_id, Number.isFinite(m) ? m : 1);
        }
      } else if (debug && prefErr) {
        console.warn("discover: user_ranking_prefs:", prefErr.message);
      }
    }
  }

  type CompatibilityCacheRow = {
    candidate_id: string;
    questionnaire_version: number;
    question_snapshot_hash: string;
    total_percent: number;
    hard_fail: boolean;
    category_breakdown: ExplainableScore["categoryBreakdown"];
    reasons: unknown;
    normalized_score: number;
  };

  const cacheByCandidate = new Map<string, CompatibilityCacheRow>();
  if (ids.length > 0) {
    const { data: cacheRows, error: cacheErr } = await admin
      .from("discover_compatibility_cache")
      .select(
        "candidate_id, questionnaire_version, question_snapshot_hash, total_percent, hard_fail, category_breakdown, reasons, normalized_score",
      )
      .eq("viewer_id", user.id)
      .in("candidate_id", ids);
    if (cacheErr && debug) {
      console.warn("discover: discover_compatibility_cache:", cacheErr.message);
    }
    for (const row of (cacheRows ?? []) as CompatibilityCacheRow[]) {
      cacheByCandidate.set(row.candidate_id, row);
    }
  }

  const cacheRowsToUpsert: Record<string, unknown>[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  const enriched: EnrichedRow[] = [];

  for (const p of filtered) {
    const row = p as ProfileRow;
    const their = byUser[row.id] ?? {};
    const hit = cacheByCandidate.get(row.id);
    const hitOk =
      hit != null &&
      hit.questionnaire_version === profile.questionnaire_version &&
      hit.question_snapshot_hash === questionSnapshotHash;

    let explain: ExplainableScore;
    let n: number;

    if (hitOk && hit) {
      cacheHits++;
      const reasonsRaw = hit.reasons;
      explain = {
        totalPercent: hit.total_percent,
        hardFail: hit.hard_fail,
        dealbreakerPrompt: null,
        categoryBreakdown: hit.category_breakdown,
        reasons: Array.isArray(reasonsRaw) ? (reasonsRaw as string[]) : [],
      };
      n = hit.normalized_score;
    } else {
      cacheMisses++;
      explain = scorePairExplain(questions, myAnswers, their);
      const result = scorePair(questions, myAnswers, their);
      n = normalizedScore(result);
      cacheRowsToUpsert.push({
        viewer_id: user.id,
        candidate_id: row.id,
        questionnaire_version: profile.questionnaire_version,
        question_snapshot_hash: questionSnapshotHash,
        total_percent: explain.totalPercent,
        hard_fail: explain.hardFail,
        category_breakdown: explain.categoryBreakdown,
        reasons: explain.reasons,
        normalized_score: n,
      });
    }

    const completeness = profileCompletenessRatio(row);
    const recency = recencyBoost(row.last_active_at ?? null);
    const msgCount = msgCountByUser.get(row.id) ?? 0;
    const engage = engagementFactor(msgCount);
    const journalRankingMult = journalRankingMultByUser.get(row.id) ?? 1;

    const base = explain.totalPercent / 100;
    let rankScore =
      base *
      (0.82 + 0.18 * completeness) *
      (0.85 + 0.15 * recency) *
      (0.9 + 0.1 * engage) *
      journalRankingMult;
    if (boostedIds.has(row.id)) rankScore *= 1.1;
    if (prioritizeInbound && inboundEligibleIds.has(row.id)) rankScore *= 1.35;
    if (explain.hardFail) rankScore = Math.min(rankScore, 0.02);

    const insight: MatchInsight = {
      totalPercent: explain.totalPercent,
      hardFail: explain.hardFail,
      reasons: explain.reasons,
      categoryBreakdown: explain.categoryBreakdown,
    };

    enriched.push({
      profile: {
        id: row.id,
        display_name: row.display_name,
        birth_year: row.birth_year,
        city: row.city,
        bio: row.bio,
        gender: row.gender,
        photo_urls: row.photo_urls ?? [],
        photo_verified: (row as ProfileRow).photo_verification_status === "verified",
      },
      score: n,
      insight,
      rankScore,
      completeness,
      recency,
      engagement: engage,
      msgCount,
      journalRankingMult,
    });
  }

  if (cacheRowsToUpsert.length > 0) {
    for (const chunk of chunkArray(cacheRowsToUpsert, 50)) {
      const { error: upErr } = await admin.from("discover_compatibility_cache").upsert(chunk);
      if (upErr && debug) {
        console.warn("discover: cache upsert:", upErr.message);
      }
    }
  }

  enriched.sort((a, b) => b.rankScore - a.rankScore);
  const diversified = diversifyByScoreTier(enriched, user.id).slice(0, 40);

  const items: DiscoverItem[] = diversified.map((row) => ({
    profile: row.profile,
    score: row.score,
    insight: row.insight,
  }));

  const diag: DiscoverDiag = {
    otherOnboardedInPool: n0,
    droppedAlreadySwipedOrSelf: dSwipe,
    droppedBlocked: dBlock,
    droppedAgePrefs: dAge,
    droppedDistance: dDist,
    droppedGenderSeeking: dGender,
    droppedVerifiedOnly: dVerify,
    passedFilters: filtered.length,
  };

  return NextResponse.json({
    items,
    diag,
    myBoostEndsAt: (myBoost?.ends_at as string | undefined) ?? null,
    ...(debug
      ? {
          debug: {
            bumpLastActiveOk: !bumpErr,
            discoverCompatibilityCache: { hits: cacheHits, misses: cacheMisses },
            ranking: diversified.map((d) => ({
              id: d.profile.id,
              displayName: d.profile.display_name,
              rankScore: Math.round(d.rankScore * 10000) / 10000,
              compatibilityPercent: d.insight.totalPercent,
              hardFail: d.insight.hardFail,
              completeness: Math.round(d.completeness * 1000) / 1000,
              recencyBoost: Math.round(d.recency * 1000) / 1000,
              engagementFactor: Math.round(d.engagement * 1000) / 1000,
              messagesLast30Days: d.msgCount,
              journalRankingMult: Math.round(d.journalRankingMult * 1000) / 1000,
            })),
          },
        }
      : {}),
  });
}
