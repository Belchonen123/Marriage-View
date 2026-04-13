import type { SupabaseClient } from "@supabase/supabase-js";

/** Count-based limit using existing rows (service-role client). */
export async function underInteractionLimit(
  admin: SupabaseClient,
  userId: string,
  maxPerHour: number = 200,
): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("interactions")
    .select("*", { count: "exact", head: true })
    .eq("from_user", userId)
    .gte("created_at", since);

  if (error) throw error;
  return (count ?? 0) < maxPerHour;
}

export async function underMessageLimit(
  admin: SupabaseClient,
  userId: string,
  maxPerHour: number = 300,
): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", userId)
    .gte("created_at", since);

  if (error) throw error;
  return (count ?? 0) < maxPerHour;
}
