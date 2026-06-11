import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Default per-user-per-day coach request cap. Override with
 * COACH_DAILY_REQUEST_LIMIT (env). Set very low for the free tier
 * so a looping client can't burn the OpenAI budget overnight.
 */
function dailyLimit(): number {
  const raw = Number(process.env.COACH_DAILY_REQUEST_LIMIT ?? "40");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 40;
}

export type CoachQuotaCheck = {
  allowed: boolean;
  used: number;
  limit: number;
  resetsAt: string; // ISO timestamp of the next UTC midnight
};

function utcMidnightIso(): string {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return tomorrow.toISOString();
}

/**
 * Increments the user's per-day counter and returns whether the call
 * is allowed. Uses a row in coach_usage_daily (PK: user_id + date).
 * Server-only — service-role admin client required.
 */
export async function checkAndIncrementCoachQuota(
  admin: SupabaseClient,
  userId: string,
): Promise<CoachQuotaCheck> {
  const limit = dailyLimit();
  const today = new Date().toISOString().slice(0, 10);

  // Read current count.
  const { data: existing } = await admin
    .from("coach_usage_daily")
    .select("request_count")
    .eq("user_id", userId)
    .eq("usage_date", today)
    .maybeSingle();

  const used = (existing?.request_count as number | null) ?? 0;
  if (used >= limit) {
    return { allowed: false, used, limit, resetsAt: utcMidnightIso() };
  }

  // Upsert+increment. Not perfectly race-safe under heavy concurrency for
  // a single user — acceptable here because the worst case is one extra
  // request slipping through, not a runaway loop.
  if (existing) {
    await admin
      .from("coach_usage_daily")
      .update({ request_count: used + 1 })
      .eq("user_id", userId)
      .eq("usage_date", today);
  } else {
    await admin.from("coach_usage_daily").insert({
      user_id: userId,
      usage_date: today,
      request_count: 1,
    });
  }

  return { allowed: true, used: used + 1, limit, resetsAt: utcMidnightIso() };
}
