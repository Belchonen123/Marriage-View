import { createAdminClient } from "@/lib/supabase/admin";
import { insertAdminAudit } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { getUserTier } from "@/lib/entitlements";
import { signProfilePhotoUrls } from "@/lib/photos-sign-server";
import { isUuid } from "@/lib/uuid";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROFILE_SELECT_WITH_SUSPENSION =
  "id, display_name, birth_year, city, bio, gender, seeking, age_min, age_max, max_distance_km, photo_urls, questionnaire_version, onboarding_complete, admin_suspended, photo_guidelines_acknowledged, photo_verification_status, photo_verified_at, verification_selfie_path, created_at, updated_at, last_active_at, notification_prefs";

const PROFILE_SELECT_WITHOUT_SUSPENSION = PROFILE_SELECT_WITH_SUSPENSION.replace(", admin_suspended,", ",");

function isMissingAdminSuspendedColumn(err: { message?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return m.includes("admin_suspended") && (m.includes("does not exist") || m.includes("could not find"));
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid profile id" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const [profRes, entRes, matchesRes, rankingRes] = await Promise.all([
    admin.from("profiles").select(PROFILE_SELECT_WITH_SUSPENSION).eq("id", id).maybeSingle(),
    admin.from("user_entitlements").select("tier, effective_until, updated_at").eq("user_id", id).maybeSingle(),
    admin
      .from("matches")
      .select("id, user_a, user_b, created_at")
      .or(`user_a.eq.${id},user_b.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("user_ranking_prefs")
      .select("engagement_multiplier, journal_entries_30d, updated_at")
      .eq("user_id", id)
      .maybeSingle(),
  ]);

  let profile = profRes.data;
  let pErr = profRes.error;
  const { data: ent } = entRes;
  const { data: userMatches, error: mErr } = matchesRes;
  const { data: rankingRow } = rankingRes;

  if (pErr && isMissingAdminSuspendedColumn(pErr)) {
    const retry = await admin.from("profiles").select(PROFILE_SELECT_WITHOUT_SUSPENSION).eq("id", id).maybeSingle();
    if (!retry.error && retry.data) {
      const row = retry.data as unknown as Record<string, unknown>;
      profile = { ...row, admin_suspended: false } as NonNullable<(typeof profRes)["data"]>;
      pErr = null;
    } else {
      pErr = retry.error;
      profile = retry.error ? null : (retry.data as (typeof profRes)["data"]);
    }
  }

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const otherIds = new Set<string>();
  for (const m of userMatches ?? []) {
    const a = m.user_a as string;
    const b = m.user_b as string;
    if (a !== id) otherIds.add(a);
    if (b !== id) otherIds.add(b);
  }

  let otherNames: Record<string, string> = {};
  if (otherIds.size) {
    const { data: profs, error: onErr } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", [...otherIds]);
    if (onErr) {
      return NextResponse.json({ error: onErr.message }, { status: 500 });
    }
    otherNames = Object.fromEntries(
      (profs ?? []).map((p) => [p.id as string, (p.display_name as string) || ""]),
    );
  }

  const matches = (userMatches ?? []).map((m) => {
    const a = m.user_a as string;
    const b = m.user_b as string;
    const other = a === id ? b : a;
    return {
      id: m.id,
      created_at: m.created_at,
      other_user_id: other,
      other_display_name: otherNames[other] ?? "—",
    };
  });

  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(id);
  const u = !authErr ? authData?.user ?? null : null;
  const authSummary = u
    ? {
        email: u.email ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        created_at: u.created_at ?? null,
      }
    : null;

  const effectiveTier = await getUserTier(admin, id);

  // Sign photos + verification selfie since the bucket is now private.
  const profileRecord = profile as unknown as Record<string, unknown>;
  const photoUrlsRaw = (profileRecord.photo_urls as string[] | null) ?? [];
  const signedPhotoUrls = await signProfilePhotoUrls(admin, photoUrlsRaw);
  const selfiePath = (profileRecord.verification_selfie_path as string | null) ?? null;
  const [signedSelfie] = selfiePath
    ? await signProfilePhotoUrls(admin, [selfiePath])
    : [null];

  return NextResponse.json({
    profile: {
      ...profileRecord,
      photo_urls: signedPhotoUrls,
      verification_selfie_signed_url: signedSelfie ?? null,
    },
    entitlement: ent ?? null,
    effectiveTier,
    matches,
    auth: authSummary,
    retention: {
      rankingPrefs: rankingRow
        ? {
            engagement_multiplier: Number(rankingRow.engagement_multiplier),
            journal_entries_30d: rankingRow.journal_entries_30d as number,
            updated_at: rankingRow.updated_at as string,
          }
        : null,
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid profile id" }, { status: 400 });
  }

  if (id === gate.user.id) {
    return NextResponse.json(
      { error: "You can't delete your own admin account from here." },
      { status: 400 },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: target } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("id", id)
    .maybeSingle();

  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  await admin.from("profiles").delete().eq("id", id);

  await insertAdminAudit(admin, {
    actor_user_id: gate.user.id,
    action: "profiles.delete",
    target_type: "profiles",
    target_id: id,
    payload_json: { display_name: target?.display_name ?? null },
  });

  return NextResponse.json({ ok: true });
}
