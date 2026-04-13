"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import { profilePhotoPublicUrl } from "@/lib/public-storage-url";
import { AdminActivitySection } from "@/app/admin/users/[id]/activity-section";
import { AdminJournalSection } from "@/app/admin/users/[id]/journal-section";
import { AdminMessagesSection } from "@/app/admin/users/[id]/messages-section";
import { AdminQuestionnaireSection } from "@/app/admin/users/[id]/questionnaire-section";
import { parseNotificationPrefs } from "@/lib/retention/notification-prefs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ProfileDetail = {
  id: string;
  display_name: string;
  birth_year: number | null;
  city: string | null;
  bio: string;
  gender: string | null;
  seeking: string | null;
  age_min: number;
  age_max: number;
  max_distance_km: number;
  photo_urls: string[];
  questionnaire_version: number;
  onboarding_complete: boolean;
  photo_guidelines_acknowledged: boolean;
  photo_verification_status: string;
  photo_verified_at: string | null;
  verification_selfie_path: string | null;
  created_at: string;
  updated_at: string;
  last_active_at?: string | null;
  notification_prefs?: unknown;
};

type EntRow = {
  tier: string;
  effective_until: string | null;
  updated_at: string;
} | null;

type MatchBrief = {
  id: string;
  created_at: string;
  other_user_id: string;
  other_display_name: string;
};

type DetailResponse = {
  profile: ProfileDetail;
  entitlement: EntRow;
  effectiveTier: "free" | "plus";
  matches: MatchBrief[];
  auth: { email: string | null; last_sign_in_at: string | null; created_at: string | null } | null;
  retention?: {
    rankingPrefs: {
      engagement_multiplier: number;
      journal_entries_30d: number;
      updated_at: string;
    } | null;
  };
};

export default function AdminUserDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entTier, setEntTier] = useState<"free" | "plus">("plus");
  const [entMsg, setEntMsg] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    const res = await adminApiFetch(`/api/admin/profiles/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load");
      setData(null);
      return;
    }
    setData(json as DetailResponse);
    setEntTier(json.entitlement?.tier === "free" ? "free" : "plus");
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEntitlement() {
    setEntMsg(null);
    const res = await adminApiFetch("/api/admin/entitlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, tier: entTier }),
    });
    const json = await res.json();
    if (!res.ok) {
      setEntMsg(json.error ?? "Failed");
      return;
    }
    setEntMsg("Saved.");
    void load();
  }

  function copyId() {
    void navigator.clipboard.writeText(id);
  }

  async function submitVerification(action: "approve" | "reject") {
    setVerifyMsg(null);
    const res = await adminApiFetch(`/api/admin/profiles/${id}/verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (!res.ok) {
      setVerifyMsg(json.error ?? "Failed");
      return;
    }
    setVerifyMsg(action === "approve" ? "Marked verified." : "Marked rejected.");
    void load();
  }

  if (!id) {
    return <p className="text-sm text-red-600">Invalid user id.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/users"
          className="text-sm text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          ← Users
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !data ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold">{data.profile.display_name || "Profile"}</h1>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              {data.profile.id}
              <button
                type="button"
                onClick={() => copyId()}
                className="ml-2 rounded border border-zinc-300 px-2 py-0.5 text-[10px] uppercase dark:border-zinc-600"
              >
                Copy id
              </button>
            </p>
          </div>

          {data.auth ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="font-semibold">Account</h2>
              <dl className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
                <div>
                  <dt className="inline text-zinc-500">Email</dt>: {data.auth.email ?? "—"}
                </div>
                <div>
                  <dt className="inline text-zinc-500">Signed up</dt>:{" "}
                  {data.auth.created_at ? new Date(data.auth.created_at).toLocaleString() : "—"}
                </div>
                <div>
                  <dt className="inline text-zinc-500">Last sign-in</dt>:{" "}
                  {data.auth.last_sign_in_at ? new Date(data.auth.last_sign_in_at).toLocaleString() : "—"}
                </div>
              </dl>
            </div>
          ) : null}

          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-semibold">Profile</h2>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-zinc-500">City</dt>
                <dd>{data.profile.city ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Birth year</dt>
                <dd>{data.profile.birth_year ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Gender / seeking</dt>
                <dd>
                  {data.profile.gender ?? "—"} / {data.profile.seeking ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Age range / distance</dt>
                <dd>
                  {data.profile.age_min}–{data.profile.age_max} · {data.profile.max_distance_km} km
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Onboarding</dt>
                <dd>{data.profile.onboarding_complete ? "Complete" : "Incomplete"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Quiz version</dt>
                <dd className="tabular-nums">{data.profile.questionnaire_version}</dd>
              </div>
            </dl>
            {data.profile.bio ? (
              <p className="mt-3 text-zinc-700 dark:text-zinc-300">{data.profile.bio}</p>
            ) : null}
            {data.profile.photo_urls?.length ? (
              <p className="mt-2 text-xs text-zinc-500">{data.profile.photo_urls.length} photo(s) on file</p>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">No photos</p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">Photo verification</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Status:{" "}
              <span className="font-medium capitalize">{data.profile.photo_verification_status ?? "none"}</span>
              {data.profile.photo_verified_at
                ? ` · ${new Date(data.profile.photo_verified_at).toLocaleString()}`
                : null}
            </p>
            {data.profile.verification_selfie_path ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-zinc-500">Submitted selfie</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={profilePhotoPublicUrl(data.profile.verification_selfie_path)}
                  alt="Verification selfie"
                  className="mt-2 max-h-56 rounded-lg border border-zinc-200 object-contain dark:border-zinc-700"
                />
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">No selfie submitted.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                onClick={() => void submitVerification("approve")}
              >
                Approve
              </button>
              <button
                type="button"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
                onClick={() => void submitVerification("reject")}
              >
                Reject
              </button>
            </div>
            {verifyMsg ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{verifyMsg}</p> : null}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">Entitlements</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Effective tier:{" "}
              <span className="font-medium">{data.effectiveTier === "plus" ? "Plus" : "Free"}</span>
              {!data.entitlement
                ? " (default — no row; everyone is Plus unless set to Free below)"
                : data.entitlement.tier === "free"
                  ? " (explicit Free row)"
                  : null}
              {data.entitlement?.effective_until
                ? ` · until ${new Date(data.entitlement.effective_until).toLocaleString()}`
                : null}
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Set tier</span>
                <select
                  className="rounded-lg border border-zinc-200 bg-[var(--background)] px-3 py-2 text-sm dark:border-zinc-700"
                  value={entTier}
                  onChange={(e) => setEntTier(e.target.value as "free" | "plus")}
                >
                  <option value="plus">plus</option>
                  <option value="free">free (explicit row)</option>
                </select>
              </label>
              <button
                type="button"
                className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                onClick={() => void saveEntitlement()}
              >
                Save
              </button>
            </div>
            {entMsg ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{entMsg}</p> : null}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">Retention and notification prefs</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-zinc-500">Last active (Discover ping)</dt>
                <dd className="tabular-nums">
                  {data.profile.last_active_at
                    ? new Date(data.profile.last_active_at).toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Discover ranking prefs (journal-driven)</dt>
                <dd>
                  {data.retention?.rankingPrefs ? (
                    <>
                      ×{data.retention.rankingPrefs.engagement_multiplier.toFixed(3)} ·{" "}
                      {data.retention.rankingPrefs.journal_entries_30d} entries (30d) · updated{" "}
                      {new Date(data.retention.rankingPrefs.updated_at).toLocaleDateString()}
                    </>
                  ) : (
                    "No row (default multiplier)"
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-zinc-500">In-app nudge toggles</dt>
                <dd className="mt-1 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {(() => {
                    const p = parseNotificationPrefs(data.profile.notification_prefs);
                    return `journal ${p.retention_journal ? "on" : "off"} · re-engage ${p.retention_reengage ? "on" : "off"} · weekly ${p.retention_weekly_hint ? "on" : "off"}`;
                  })()}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">Matches ({data.matches.length})</h2>
            {!data.matches.length ? (
              <p className="mt-2 text-sm text-zinc-500">No matches yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {data.matches.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2 dark:border-zinc-800/80">
                    <span>
                      <Link
                        href={`/admin/users/${m.other_user_id}`}
                        className="text-rose-700 hover:underline dark:text-rose-400"
                      >
                        {m.other_display_name}
                      </Link>
                      <span className="text-zinc-500"> · {new Date(m.created_at).toLocaleDateString()}</span>
                    </span>
                    <Link href={`/chat/${m.id}`} className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400">
                      Chat
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AdminJournalSection userId={id} />
          <AdminQuestionnaireSection userId={id} />
          <AdminMessagesSection userId={id} />
          <AdminActivitySection userId={id} />
        </>
      )}
    </div>
  );
}
