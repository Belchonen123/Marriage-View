"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type BreakdownRow = { label: string; count: number };

type CrossRow = { gender: string; seeking: string; count: number };

type CityRow = { city: string; count: number };

type MonthRow = { month: string; count: number };

type MatchMonthRow = { month: string; newMatches: number };

type QuizVerRow = { version: number; count: number };

type PhotoHistRow = { bucket: string; count: number };

type Stats = {
  profilesTotal: number;
  profilesOnboardingComplete: number;
  matches: number;
  pendingReports: number;
  questions: number;
  likes: number;
  passes: number;
  interactionsTotal: number;
  messages: number;
  blocks: number;
  plusTierUsers: number;
  explicitFreeTierUsers: number;
  notificationsUnread: number;
  notificationsTotal: number;
  answersRowsTotal: number;
  journalEntriesTotal: number;
  reportsUrgentPending: number;
  reports: {
    pending: number;
    reviewed: number;
    actioned: number;
    total: number;
  };
  derived: {
    likePassRatio: number | null;
    messagesPerMatch: number | null;
    mutualPairsPerOnboardedProfile: number | null;
    plusAttachRate: number | null;
    onboardingRate: number | null;
  };
  matchesByMonth: MatchMonthRow[];
  profilesSampleSize: number;
  demographics: {
    byAgeBucket: BreakdownRow[];
    byGender: BreakdownRow[];
    bySeeking: BreakdownRow[];
    genderSeekingCross: CrossRow[];
    birthYearMissing: number;
    medianAge: number | null;
  };
  preferences: {
    quizVersion: QuizVerRow[];
    maxDistanceKm: BreakdownRow[];
    ageRangeSpan: BreakdownRow[];
  };
  profileHealth: {
    photoCountHistogram: PhotoHistRow[];
    withBio: number;
    emptyBio: number;
    onboardedComplete: number;
    onboardedIncomplete: number;
    unknownCity: number;
  };
  geography: {
    topCities: CityRow[];
  };
  growth: {
    signupsByMonth: MonthRow[];
  };
  engagement: {
    activeLast7d: number;
    activeLast30d: number;
  };
};

function StatCard({
  label,
  value,
  href,
  sub,
}: {
  label: string;
  value: number | string;
  href?: string;
  sub?: string;
}) {
  const inner = (
    <>
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
      {sub ? <p className="mt-1 text-xs text-zinc-500">{sub}</p> : null}
    </>
  );
  const className =
    "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";
  if (href) {
    return (
      <Link href={href} className={`${className} block transition hover:border-rose-400/60 dark:hover:border-rose-800`}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

function BarList({
  title,
  rows,
  maxRows = 14,
}: {
  title: string;
  rows: BreakdownRow[] | PhotoHistRow[] | QuizVerRow[] | CrossRow[] | CityRow[];
  maxRows?: number;
}) {
  const max = useMemo(() => {
    let m = 0;
    for (const r of rows) {
      const c = "count" in r ? r.count : 0;
      if (c > m) m = c;
    }
    return m || 1;
  }, [rows]);

  const slice = rows.slice(0, maxRows);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">{title}</h3>
      <ul className="mt-3 space-y-2">
        {slice.map((r, i) => {
          const label =
            "label" in r
              ? r.label
              : "bucket" in r
                ? r.bucket
                : "city" in r
                  ? r.city
                  : "gender" in r
                    ? `${r.gender} × ${r.seeking}`
                    : "version" in r
                      ? `Quiz v${r.version}`
                      : String(i);
          const count = "count" in r ? r.count : 0;
          const pct = Math.round((count / max) * 100);
          return (
            <li key={`${label}-${i}`} className="text-sm">
              <div className="flex justify-between gap-2 tabular-nums">
                <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300" title={label}>
                  {label}
                </span>
                <span className="shrink-0 font-medium text-zinc-900 dark:text-zinc-100">{count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-600 to-amber-500 dark:from-rose-500 dark:to-amber-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MiniTable({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: Record<string, string | number>[];
  columns: { key: string; header: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">{title}</h3>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-white dark:bg-zinc-900">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/80">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-1.5 tabular-nums text-zinc-800 dark:text-zinc-200">
                    {r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminHomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [entUserId, setEntUserId] = useState("");
  const [entTier, setEntTier] = useState<"free" | "plus">("plus");
  const [entMsg, setEntMsg] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setError(null);
    const res = await adminApiFetch("/api/admin/stats");
    const data = await res.json();
    if (!res.ok) {
      setError((data.error as string) ?? "Failed to load");
      setStats(null);
      return;
    }
    setStats(data as Stats);
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  async function refreshStats() {
    setRefreshing(true);
    try {
      await loadStats();
    } finally {
      setRefreshing(false);
    }
  }

  async function saveEntitlement() {
    setEntMsg(null);
    if (!entUserId.trim()) {
      setEntMsg("Enter a user id.");
      return;
    }
    const res = await adminApiFetch("/api/admin/entitlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: entUserId.trim(), tier: entTier }),
    });
    const data = await res.json();
    if (!res.ok) {
      setEntMsg(data.error ?? "Failed");
      return;
    }
    setEntMsg("Saved.");
  }

  const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 1000) / 10}%`);

  const growthRows = useMemo(() => {
    if (!stats) return [];
    return stats.growth.signupsByMonth.map((m) => ({
      month: m.month,
      signups: m.count,
      newMatches: stats.matchesByMonth.find((x) => x.month === m.month)?.newMatches ?? "—",
    }));
  }, [stats]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-16">
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Mission overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Dense product telemetry from live tables. Demographics and preferences are computed from{" "}
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">all profile rows</strong> (paginated
            server-side). Refresh to re-sync.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Access:{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">ADMIN_USER_IDS</code> /{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">ADMIN_EMAILS</code> in production;{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">next dev</code> relaxes to any signed-in user.
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          className="shrink-0 rounded-lg border border-zinc-300 bg-zinc-900 px-4 py-2 font-mono text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          onClick={() => void refreshStats()}
        >
          {refreshing ? "Scanning…" : "Refresh telemetry"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !stats ? (
        <p className="font-mono text-sm text-zinc-500">Loading observatory…</p>
      ) : (
        <>
          <p className="font-mono text-xs text-zinc-500">
            Sample: <strong>{stats.profilesSampleSize}</strong> profiles ingested · median age{" "}
            <strong>{stats.demographics.medianAge ?? "—"}</strong> · birth year missing{" "}
            <strong>{stats.demographics.birthYearMissing}</strong>
          </p>

          <section>
            <h2 className="mb-3 font-mono text-sm font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-500">
              Core counters
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              <StatCard label="Registered profiles" value={stats.profilesTotal} href="/admin/users" />
              <StatCard label="Onboarding complete" value={stats.profilesOnboardingComplete} href="/admin/users" />
              <StatCard
                label="Onboarding rate"
                value={pct(stats.derived.onboardingRate)}
                sub={`${stats.derived.onboardingRate != null ? stats.profilesOnboardingComplete + " / " + stats.profilesTotal : ""}`}
              />
              <StatCard label="Mutual matches (pairs)" value={stats.matches} href="/admin/matches" />
              <StatCard label="Chat messages" value={stats.messages} />
              <StatCard label="Discover likes" value={stats.likes} />
              <StatCard label="Discover passes" value={stats.passes} />
              <StatCard label="Interactions total" value={stats.interactionsTotal} />
              <StatCard
                label="Like share of swipes"
                value={stats.derived.likePassRatio ?? "—"}
                sub={stats.derived.likePassRatio != null ? "0–1 ratio" : undefined}
              />
              <StatCard label="Blocks" value={stats.blocks} />
              <StatCard label="Question bank rows" value={stats.questions} href="/admin/questions" />
              <StatCard label="Answer rows (all users)" value={stats.answersRowsTotal} />
              <StatCard
                label="Profiles on Plus tier"
                value={stats.plusTierUsers}
                sub={`default Plus; minus ${stats.explicitFreeTierUsers} explicit Free`}
              />
              <StatCard label="Explicit Free tier rows" value={stats.explicitFreeTierUsers} />
              <StatCard label="Plus share of profiles" value={pct(stats.derived.plusAttachRate)} />
              <StatCard label="Unread notifications" value={stats.notificationsUnread} />
              <StatCard label="Notifications total" value={stats.notificationsTotal} />
              <StatCard label="Journal entries (all users)" value={stats.journalEntriesTotal} />
              <StatCard
                label="Urgent reports (pending)"
                value={stats.reportsUrgentPending}
                href="/admin/reports"
                sub="post-call / fast-track"
              />
              <StatCard label="Reports pending" value={stats.reports.pending} href="/admin/reports" />
              <StatCard label="Reports reviewed" value={stats.reports.reviewed} href="/admin/reports" />
              <StatCard label="Reports actioned" value={stats.reports.actioned} href="/admin/reports" />
              <StatCard label="Reports all statuses" value={stats.reports.total} href="/admin/reports" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-sm font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-500">
              Derived ratios
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Messages / mutual match"
                value={stats.derived.messagesPerMatch ?? "—"}
                sub="Total messages divided by pair count"
              />
              <StatCard
                label="Mutual pairs / onboarded profile"
                value={stats.derived.mutualPairsPerOnboardedProfile ?? "—"}
                sub="Rough density; not unique-per-user"
              />
              <StatCard label="Active (last7d)" value={stats.engagement.activeLast7d} sub="last_active_at ping" />
              <StatCard label="Active (last 30d)" value={stats.engagement.activeLast30d} sub="last_active_at ping" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-sm font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-500">
              Demographics
            </h2>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <BarList title="Age buckets (from birth year)" rows={stats.demographics.byAgeBucket} maxRows={12} />
              <BarList title="Gender" rows={stats.demographics.byGender} />
              <BarList title="Seeking" rows={stats.demographics.bySeeking} />
            </div>
            <div className="mt-4">
              <BarList title="Gender × seeking (cross-tab)" rows={stats.demographics.genderSeekingCross} maxRows={20} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-sm font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-500">
              Preferences & profile health
            </h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <BarList title="Quiz version" rows={stats.preferences.quizVersion} />
              <BarList title="Max distance (km)" rows={stats.preferences.maxDistanceKm} />
              <BarList title="Partner age range span" rows={stats.preferences.ageRangeSpan} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <BarList title="Photos per profile" rows={stats.profileHealth.photoCountHistogram} />
              <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                  Bio & onboarding (row counts)
                </h3>
                <dl className="mt-4 space-y-3 font-mono text-sm tabular-nums">
                  <div className="flex justify-between border-b border-zinc-100 pb-2 dark:border-zinc-800">
                    <dt className="text-zinc-600 dark:text-zinc-400">Non-empty bio</dt>
                    <dd className="font-medium">{stats.profileHealth.withBio}</dd>
                  </div>
                  <div className="flex justify-between border-b border-zinc-100 pb-2 dark:border-zinc-800">
                    <dt className="text-zinc-600 dark:text-zinc-400">Empty bio</dt>
                    <dd className="font-medium">{stats.profileHealth.emptyBio}</dd>
                  </div>
                  <div className="flex justify-between border-b border-zinc-100 pb-2 dark:border-zinc-800">
                    <dt className="text-zinc-600 dark:text-zinc-400">Onboarding complete</dt>
                    <dd className="font-medium">{stats.profileHealth.onboardedComplete}</dd>
                  </div>
                  <div className="flex justify-between border-b border-zinc-100 pb-2 dark:border-zinc-800">
                    <dt className="text-zinc-600 dark:text-zinc-400">Onboarding incomplete</dt>
                    <dd className="font-medium">{stats.profileHealth.onboardedIncomplete}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-600 dark:text-zinc-400">No city string</dt>
                    <dd className="font-medium">{stats.profileHealth.unknownCity}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-sm font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-500">
              Geography & growth
            </h2>
            <div className="grid gap-4 xl:grid-cols-2">
              <BarList title="Top cities (25)" rows={stats.geography.topCities} maxRows={25} />
              <MiniTable
                title="Signups & new mutual pairs by month"
                columns={[
                  { key: "month", header: "Month" },
                  { key: "signups", header: "Signups" },
                  { key: "newMatches", header: "New pairs" },
                ]}
                rows={growthRows}
              />
            </div>
          </section>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/admin/flags"
              className="rounded-lg border border-zinc-300 px-4 py-2 font-medium hover:border-amber-500/50 dark:border-zinc-600"
            >
              Feature flags
            </Link>
            <Link
              href="/admin/matches"
              className="rounded-lg border border-zinc-300 px-4 py-2 font-medium hover:border-amber-500/50 dark:border-zinc-600"
            >
              Browse matches
            </Link>
            <Link
              href="/admin/users"
              className="rounded-lg border border-zinc-300 px-4 py-2 font-medium hover:border-amber-500/50 dark:border-zinc-600"
            >
              All users
            </Link>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">User entitlements</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Grant or revoke Plus tier (higher discover interaction cap). Uses service role on the server.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-xs font-medium text-zinc-500">User id (UUID)</span>
                <input
                  className="w-full rounded-lg border border-zinc-200 bg-[var(--background)] px-3 py-2 font-mono text-xs dark:border-zinc-700"
                  value={entUserId}
                  onChange={(e) => setEntUserId(e.target.value)}
                  placeholder="auth user id"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Tier</span>
                <select
                  className="rounded-lg border border-zinc-200 bg-[var(--background)] px-3 py-2 text-sm dark:border-zinc-700"
                  value={entTier}
                  onChange={(e) => setEntTier(e.target.value as "free" | "plus")}
                >
                  <option value="plus">plus</option>
                  <option value="free">free (remove row)</option>
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
        </>
      )}
    </div>
  );
}
