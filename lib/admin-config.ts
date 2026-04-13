/**
 * Server-only admin access policy. Not imported from client components.
 *
 * Relaxed admin (any signed-in user) applies **only** when `NODE_ENV === "development"`.
 * `ADMIN_RELAXED_AUTH` is ignored in production so a mis-set env cannot open the panel publicly.
 */
export function isAdminRelaxedAuth(): boolean {
  return process.env.NODE_ENV === "development";
}
