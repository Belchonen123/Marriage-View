/**
 * Wraps fetch so a bad/unreachable Supabase Project URL shows a dev hint
 * before the usual "TypeError: Failed to fetch" / Next overlay.
 */
export function createSupabaseFetch(supabaseUrl: string | undefined) {
  return function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return fetch(input, init).catch((e: unknown) => {
      if (process.env.NODE_ENV === "development" && e instanceof TypeError) {
        const host =
          (() => {
            try {
              return typeof input === "string" ? new URL(input).host : (input as URL).host;
            } catch {
              return "";
            }
          })() || (supabaseUrl ? new URL(supabaseUrl).host : "your-project.supabase.co");
        console.warn(
          `[Supabase] ${e.message} — cannot reach ${host}. ` +
            `Open Supabase Dashboard → your project → Settings → API, copy the exact Project URL and anon key into .env.local ` +
            `(or create a new project if the old ref was removed). Restart next dev. ` +
            `If the URL is correct, clear site data for this origin (stale session refresh).`,
        );
      }
      throw e;
    });
  };
}
