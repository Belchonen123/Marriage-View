import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True when the user is platform-suspended. Defaults to false on lookup
 * error so an outage doesn't lock everyone out — combine with logging at
 * the call site for visibility.
 *
 * Backs the LiveKit, messages, and coach gate so a suspended user
 * can't continue to call existing matches, message them, or burn
 * the OpenAI budget after we've benched them.
 */
export async function isUserSuspended(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("profiles")
    .select("admin_suspended")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // Tolerate the case where the column hasn't been migrated yet.
    const m = (error.message ?? "").toLowerCase();
    if (m.includes("admin_suspended") && m.includes("does not exist")) return false;
    console.warn("[suspension-guard]", error.message);
    return false;
  }
  return Boolean(data?.admin_suspended);
}
