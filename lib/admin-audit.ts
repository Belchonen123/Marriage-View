import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminAuditRow = {
  actor_user_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  payload_json?: unknown;
};

/** Best-effort insert; logs warning on failure so admin mutations still succeed. */
export async function insertAdminAudit(
  admin: SupabaseClient,
  row: AdminAuditRow,
): Promise<void> {
  const { error } = await admin.from("admin_audit_log").insert({
    actor_user_id: row.actor_user_id,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    payload_json: row.payload_json ?? null,
  });
  if (error) {
    console.warn("[admin_audit]", error.message);
  }
}
