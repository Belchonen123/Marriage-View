import type { SupabaseClient } from "@supabase/supabase-js";

/** True if either user has blocked the other (used to gate chat / calls). */
export async function isPairBlocked(
  admin: SupabaseClient,
  userA: string,
  userB: string,
): Promise<boolean> {
  const [{ data: ab }, { data: ba }] = await Promise.all([
    admin.from("blocks").select("id").eq("blocker_id", userA).eq("blocked_id", userB).maybeSingle(),
    admin.from("blocks").select("id").eq("blocker_id", userB).eq("blocked_id", userA).maybeSingle(),
  ]);
  return Boolean(ab || ba);
}
