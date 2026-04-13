import { isAdminRelaxedAuth } from "@/lib/admin-config";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export function parseAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Comma-separated auth user UUIDs allowed to use /admin (optional; use if email is missing or for break-glass). */
export function parseAdminUserIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function collectAdminCandidateEmails(user: User): string[] {
  const out = new Set<string>();
  if (user.email) {
    out.add(user.email.trim().toLowerCase());
  }
  const metaEmail = user.user_metadata?.email;
  if (typeof metaEmail === "string" && metaEmail.includes("@")) {
    out.add(metaEmail.trim().toLowerCase());
  }
  for (const identity of user.identities ?? []) {
    const e = identity.identity_data?.email;
    if (typeof e === "string" && e.includes("@")) {
      out.add(e.trim().toLowerCase());
    }
  }
  return [...out];
}

export type AdminGate =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

export async function requireAdmin(): Promise<AdminGate> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Sign in required. Open /login in this same browser origin, then return to /admin.",
          reason: "no_session",
        },
        { status: 401 },
      ),
    };
  }

  if (isAdminRelaxedAuth()) {
    return { ok: true, user };
  }

  const allowedIds = parseAdminUserIds();
  if (allowedIds.has(user.id.toLowerCase())) {
    return { ok: true, user };
  }

  const allowedEmails = parseAdminEmails();
  if (allowedEmails.size === 0 && allowedIds.size === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Admin access is not configured. Set ADMIN_EMAILS and/or ADMIN_USER_IDS on the server (e.g. in .env.local).",
          reason: "admin_env_missing",
        },
        { status: 503 },
      ),
    };
  }

  const candidates = collectAdminCandidateEmails(user);
  if (allowedEmails.size > 0 && candidates.some((e) => allowedEmails.has(e))) {
    return { ok: true, user };
  }

  if (allowedEmails.size > 0 && candidates.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "No email found on this session. Sign in with an email provider, or add your user id to ADMIN_USER_IDS (see Settings → copy from a profile row, or Supabase Auth).",
          reason: "no_email_for_admin",
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          "You do not have admin access. Your signed-in email must appear in ADMIN_EMAILS, or your user id in ADMIN_USER_IDS.",
        reason: "not_in_admin_list",
      },
      { status: 403 },
    ),
  };
}
