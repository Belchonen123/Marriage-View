import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionTier = "free" | "plus";

export async function getUserTier(admin: SupabaseClient, userId: string): Promise<SubscriptionTier> {
  const { data, error } = await admin
    .from("user_entitlements")
    .select("tier, effective_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return "free";
  // No row: Plus by default (everyone gets premium behavior unless admin sets tier `free`).
  if (!data) return "plus";
  if (data.tier === "free") return "free";
  if (data.tier !== "plus") return "free";
  const until = data.effective_until as string | null;
  if (until && new Date(until) < new Date()) return "free";
  return "plus";
}

/** Hourly discover interaction cap: higher for paid tier. */
export function interactionHourlyLimitForTier(tier: SubscriptionTier): number {
  return tier === "plus" ? 500 : 200;
}
