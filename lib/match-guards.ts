import type { SupabaseClient } from "@supabase/supabase-js";

/** Returns true if the user is a participant in the match. */
export async function userInMatch(
  supabase: SupabaseClient,
  matchId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("matches")
    .select("id")
    .eq("id", matchId)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}
