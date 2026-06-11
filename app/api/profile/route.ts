import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUserSuspended } from "@/lib/suspension-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Server-side profile writes with an explicit field allowlist. The
 * client may NEVER write integrity columns directly — `onboarding_complete`,
 * `admin_suspended`, `photo_verification_status`, `phone_verified_at`,
 * `questionnaire_version`, `created_at`, etc. are owned by server routes
 * or DB triggers exclusively.
 *
 * Replaces the direct supabase.from('profiles').upsert(...) the
 * onboarding form used to do, which (combined with a USING-only RLS
 * policy) let any anon-key holder write arbitrary fields including
 * onboarding_complete.
 */

const AGE_MIN = 18;
const AGE_MAX = 99;
const MAX_KM = 20_000;
const BIO_MAX = 4_000;
const DISPLAY_NAME_MAX = 80;
const CITY_MAX = 120;

const GENDER_ALLOWED = new Set(["", "woman", "man"]);
const SEEKING_ALLOWED = new Set(["", "woman", "man", "everyone"]);

type Body = {
  display_name?: string;
  birth_year?: number | null;
  city?: string | null;
  bio?: string;
  gender?: string | null;
  seeking?: string | null;
  age_min?: number;
  age_max?: number;
  max_distance_km?: number;
  latitude?: number | null;
  longitude?: number | null;
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function bad(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (await isUserSuspended(admin, user.id)) {
    return NextResponse.json(
      { error: "Your account is suspended. Contact support." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") return bad("Invalid request body.");

  // Strict whitelist — anything not listed here is silently dropped.
  const update: Record<string, unknown> = {};

  if ("display_name" in body) {
    const v = typeof body.display_name === "string" ? body.display_name.trim() : "";
    if (v.length > DISPLAY_NAME_MAX) return bad("Display name is too long.");
    update.display_name = v;
  }

  if ("birth_year" in body) {
    const y = body.birth_year;
    if (y == null) {
      update.birth_year = null;
    } else {
      if (!isFiniteNumber(y)) return bad("birth_year must be a number.");
      const now = new Date().getFullYear();
      if (y < now - 120 || y > now - 18) {
        return bad("Birth year must place you between 18 and 120.");
      }
      update.birth_year = Math.round(y);
    }
  }

  if ("city" in body) {
    const v = typeof body.city === "string" ? body.city.trim() : "";
    if (v.length > CITY_MAX) return bad("City is too long.");
    update.city = v || null;
  }

  if ("bio" in body) {
    const v = typeof body.bio === "string" ? body.bio : "";
    if (v.length > BIO_MAX) return bad("Bio is too long.");
    update.bio = v.trim();
  }

  if ("gender" in body) {
    const v = body.gender ?? "";
    if (typeof v !== "string" || !GENDER_ALLOWED.has(v)) return bad("Invalid gender.");
    update.gender = v || null;
  }

  if ("seeking" in body) {
    const v = body.seeking ?? "";
    if (typeof v !== "string" || !SEEKING_ALLOWED.has(v)) return bad("Invalid seeking.");
    update.seeking = v || null;
  }

  if ("age_min" in body) {
    const n = body.age_min;
    if (!isFiniteNumber(n)) return bad("age_min must be a number.");
    if (n < AGE_MIN || n > AGE_MAX) return bad("age_min out of range.");
    update.age_min = Math.round(n);
  }

  if ("age_max" in body) {
    const n = body.age_max;
    if (!isFiniteNumber(n)) return bad("age_max must be a number.");
    if (n < AGE_MIN || n > AGE_MAX) return bad("age_max out of range.");
    update.age_max = Math.round(n);
  }
  if (
    typeof update.age_min === "number" &&
    typeof update.age_max === "number" &&
    (update.age_min as number) > (update.age_max as number)
  ) {
    return bad("age_min cannot be greater than age_max.");
  }

  if ("max_distance_km" in body) {
    const n = body.max_distance_km;
    if (!isFiniteNumber(n)) return bad("max_distance_km must be a number.");
    if (n < 1 || n > MAX_KM) return bad("max_distance_km out of range.");
    update.max_distance_km = Math.round(n);
  }

  if ("latitude" in body) {
    const n = body.latitude;
    if (n == null) update.latitude = null;
    else if (!isFiniteNumber(n) || n < -90 || n > 90) return bad("Invalid latitude.");
    else update.latitude = n;
  }

  if ("longitude" in body) {
    const n = body.longitude;
    if (n == null) update.longitude = null;
    else if (!isFiniteNumber(n) || n < -180 || n > 180) return bad("Invalid longitude.");
    else update.longitude = n;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  update.updated_at = new Date().toISOString();

  // Admin client uses the service-role JWT; PostgREST sets current_user =
  // 'service_role' for those connections, so the protected-columns trigger
  // bypasses. Our allowlist above already excluded protected columns, so
  // even without the bypass the write would succeed; the trigger is
  // belt-and-suspenders for future code paths.
  const { data, error } = await admin
    .from("profiles")
    .upsert({ id: user.id, ...update }, { onConflict: "id" })
    .select("id")
    .maybeSingle();

  if (error) return bad(error.message);
  if (!data) return bad("Could not save profile.");
  return NextResponse.json({ ok: true, id: data.id });
}
