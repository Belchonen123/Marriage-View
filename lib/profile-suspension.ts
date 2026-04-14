import type { ProfileRow } from "@/lib/types";

/** True when admin has platform-suspended this profile (Discover + interactions blocked in API). */
export function isAdminSuspended(
  p: Pick<ProfileRow, "admin_suspended"> | { admin_suspended?: boolean | null },
): boolean {
  return p.admin_suspended === true;
}
