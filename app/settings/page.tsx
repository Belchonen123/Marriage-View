"use client";

import { createClient } from "@/lib/supabase/client";
import { ThemeSegmentedControl } from "@/components/ThemeSync";
import { useToast } from "@/components/ToastProvider";
import {
  isDesktopNotificationDesired,
  isPushDesired,
  isSoundEnabled,
  setDesktopNotificationDesired,
  setPushDesired,
  setSoundEnabled,
} from "@/lib/notification-prefs";
import { PhotoVerificationSection } from "@/components/PhotoVerificationSection";
import { DiscoverSelfPreview } from "@/components/DiscoverSelfPreview";
import { ProfileStrengthSection } from "@/components/ProfileStrengthSection";
import { ProfilePhotosSection } from "@/components/ProfilePhotosSection";
import { DatingJourneyCard, type DatingJourneyStage } from "@/components/DatingJourneyCard";
import { urlBase64ToUint8Array } from "@/lib/vapid";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { RetentionNotificationPrefs } from "@/lib/retention/notification-prefs";

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { show } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState("");
  const [reason, setReason] = useState("harassment");
  const [details, setDetails] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<{ blocked_id: string }[]>([]);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [photoGuidelines, setPhotoGuidelines] = useState(false);
  const [tier, setTier] = useState<string>("free");
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [desktopAlertsOn, setDesktopAlertsOn] = useState(() => isDesktopNotificationDesired());
  const [pushOn, setPushOn] = useState(() => isPushDesired());
  const [retentionNotifPrefs, setRetentionNotifPrefs] = useState<RetentionNotificationPrefs | null>(null);
  const [retentionProgress, setRetentionProgress] = useState<{
    journalEntriesTotal: number;
    reflectionsAfterVideo: number;
    purposefulReflections: number;
    datingJourney: { progressPercent: number; stages: DatingJourneyStage[] };
    discoverPersonalization: { engagementMultiplier: number; journalEntries30d: number };
  } | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      if (user) {
        const confirmed = Boolean(
          (user as { email_confirmed_at?: string }).email_confirmed_at ??
            (user as { confirmed_at?: string }).confirmed_at,
        );
        setEmailVerified(confirmed);
      }
      if (!user) return;
      const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id);
      setBlocks(data ?? []);
      const { data: profile } = await supabase
        .from("profiles")
        .select("photo_guidelines_acknowledged")
        .eq("id", user.id)
        .maybeSingle();
      setPhotoGuidelines(Boolean(profile?.photo_guidelines_acknowledged));

      const entRes = await fetch("/api/me/entitlements");
      if (entRes.ok) {
        const e = (await entRes.json()) as { tier: string };
        setTier(e.tier ?? "free");
      }

      const [npRes, rpRes] = await Promise.all([
        fetch("/api/me/notification-prefs"),
        fetch("/api/me/retention-progress"),
      ]);
      if (npRes.ok) {
        const j = (await npRes.json()) as { prefs: RetentionNotificationPrefs };
        setRetentionNotifPrefs(j.prefs);
      }
      if (rpRes.ok) {
        const j = (await rpRes.json()) as {
          journalEntriesTotal: number;
          reflectionsAfterVideo?: number;
          purposefulReflections?: number;
          datingJourney?: { progressPercent: number; stages: DatingJourneyStage[] };
          discoverPersonalization: { engagementMultiplier: number; journalEntries30d: number };
        };
        setRetentionProgress({
          journalEntriesTotal: j.journalEntriesTotal,
          reflectionsAfterVideo: j.reflectionsAfterVideo ?? 0,
          purposefulReflections: j.purposefulReflections ?? 0,
          datingJourney: j.datingJourney ?? {
            progressPercent: 0,
            stages: [],
          },
          discoverPersonalization: j.discoverPersonalization,
        });
      }
    })();
  }, [supabase]);

  async function patchRetentionNotifPrefs(patch: Partial<RetentionNotificationPrefs>) {
    if (!retentionNotifPrefs) return;
    const prev = retentionNotifPrefs;
    const next = { ...prev, ...patch };
    setRetentionNotifPrefs(next);
    const res = await fetch("/api/me/notification-prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setRetentionNotifPrefs(prev);
      show((data as { error?: string })?.error ?? "Could not update preferences", "error");
      return;
    }
    if (data && typeof data === "object" && "prefs" in data) {
      setRetentionNotifPrefs((data as { prefs: RetentionNotificationPrefs }).prefs);
    }
    show("Notification preferences updated.", "success");
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function submitReport() {
    setMsg(null);
    if (!reportTarget.trim()) {
      const text = "Enter a user id to report (UUID from admin tools or support).";
      setMsg(text);
      show(text, "error");
      return;
    }
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportedUserId: reportTarget.trim(),
        reason,
        details: details.trim() || null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const raw = typeof data.error === "string" ? data.error : "";
      const friendly =
        res.status === 401
          ? "Sign in again, then try submitting the report."
          : raw || `Could not submit the report (error ${res.status}). Check the user id and try again.`;
      setMsg(friendly);
      show(friendly, "error");
    } else {
      setMsg("Report submitted. Thank you.");
      show("Report submitted. Thank you.", "success");
    }
  }

  async function unblock(id: string) {
    const res = await fetch(`/api/block?blockedId=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      setBlocks((b) => b.filter((x) => x.blocked_id !== id));
      show("Unblocked.", "success");
    }
  }

  async function savePhotoGuidelines(next: boolean) {
    setPhotoGuidelines(next);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ photo_guidelines_acknowledged: next })
      .eq("id", user.id);
    if (error) {
      show(error.message, "error");
      setPhotoGuidelines(!next);
      return;
    }
    show(next ? "Thanks — we’ll show you as having acknowledged photo guidelines." : "Updated.", "success");
  }

  async function enableBrowserNotifications() {
    if (typeof Notification === "undefined") {
      show("Notifications are not supported in this browser.", "error");
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm !== "granted") {
      show("Permission denied — you can enable alerts in the browser site settings.", "error");
      return;
    }
    setDesktopNotificationDesired(true);
    setDesktopAlertsOn(true);
    show("Desktop alerts enabled for this browser.", "success");
  }

  async function registerWebPush() {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      show("Push is not configured (missing VAPID keys on the server).", "error");
      return;
    }
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      show("Service workers are not available here.", "error");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission();
      setNotifPerm(perm);
      if (perm !== "granted") {
        show("Notification permission is required for push.", "error");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error ?? "Could not save subscription", "error");
        return;
      }
      setPushDesired(true);
      setPushOn(true);
      show("Push notifications registered.", "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "Push setup failed", "error");
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Settings
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Appearance, account details, safety tools, and sign out.
        </p>
      </div>

      <section className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Appearance</h2>
        <p className="text-xs text-zinc-500">Theme applies across Marriage View (stored on this device).</p>
        <ThemeSegmentedControl />
      </section>

      <section className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Privacy at a glance</h2>
        <ul className="list-inside list-disc space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <strong className="text-zinc-800 dark:text-zinc-200">Profile &amp; Discover:</strong> Your card shows name,
            age, city, photos, and bio to people you may match with. Update anytime under{" "}
            <Link href="/onboarding/profile" className="font-medium text-[var(--accent)] hover:underline">
              Profile
            </Link>
            .
          </li>
          <li>
            <strong className="text-zinc-800 dark:text-zinc-200">Messages:</strong> Chat is only available with mutual
            matches.
          </li>
          <li>
            <strong className="text-zinc-800 dark:text-zinc-200">Alerts:</strong> This device vs account preferences are
            split between{" "}
            <a href="#alerts-prefs" className="font-medium text-[var(--accent)] hover:underline">
              Alerts
            </a>{" "}
            and{" "}
            <a href="#reflections-nudges" className="font-medium text-[var(--accent)] hover:underline">
              Reflections &amp; gentle nudges
            </a>
            .
          </li>
        </ul>
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 text-xs text-zinc-600 dark:border-zinc-700/80 dark:bg-zinc-900/40 dark:text-zinc-400">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Data export &amp; account deletion</p>
          <p className="mt-1">
            Self-serve export and full account deletion are not available in-app in this build. For requests, use your
            host&apos;s support channel or administrator.
          </p>
        </div>
      </section>

      <section className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Dating coach</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Ask for help with pacing, boundaries, and conversation — powered by AI when the server has an API key
          configured.
        </p>
        <Link
          href="/coach"
          className="inline-flex rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)]"
        >
          Open coach
        </Link>
      </section>

      <section className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Plan</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Current tier: <span className="font-semibold capitalize text-zinc-900 dark:text-zinc-100">{tier}</span>
        </p>
        <p className="text-xs text-zinc-500">
          Premium entitlements are managed by admins for now. Higher tiers may raise discover interaction limits.
        </p>
      </section>

      <section className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Trust &amp; verification</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Email status:{" "}
          {emailVerified === null ? (
            "…"
          ) : emailVerified ? (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">Verified</span>
          ) : (
            <span className="font-medium text-amber-800 dark:text-amber-200">Not confirmed — check your inbox</span>
          )}
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            className="input-focus mt-1 h-4 w-4 rounded border-zinc-300"
            checked={photoGuidelines}
            onChange={(e) => void savePhotoGuidelines(e.target.checked)}
          />
          <span>
            I agree to upload only photos that meet the{" "}
            <Link href="/community" className="font-medium text-[var(--accent)] hover:underline">
              community guidelines
            </Link>{" "}
            (authentic, respectful imagery).
          </span>
        </label>
        <div className="border-t border-zinc-200/80 pt-4 dark:border-zinc-700/80">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Photo verification badge</h3>
          <div className="mt-2">
            <PhotoVerificationSection />
          </div>
        </div>
      </section>

      <section className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Profile strength</h2>
        <ProfileStrengthSection />
      </section>

      <section className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">How you appear on Discover</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Others see the same photos, name, age, city, and bio as on your public card. Refine details anytime.
        </p>
        <DiscoverSelfPreview />
      </section>

      <section className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Profile photos</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Add up to six photos. They appear on Discover and in matches — same upload rules as onboarding.
        </p>
        <ProfilePhotosSection variant="settings" />
      </section>

      <section
        id="alerts-prefs"
        className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80 scroll-mt-24"
      >
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Alerts</h2>
        <p className="text-xs text-zinc-500">
          New accounts default to alerts on. The toggles below apply on this browser only. Weekly digest and reflection
          nudges (saved to your account) are in{" "}
          <a href="#reflections-nudges" className="font-medium text-[var(--accent)] hover:underline">
            Reflections &amp; gentle nudges
          </a>
          . Web Push needs VAPID keys on the server.
        </p>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            className="input-focus h-4 w-4 rounded border-zinc-300"
            checked={soundOn}
            onChange={(e) => {
              const on = e.target.checked;
              setSoundEnabled(on);
              setSoundOn(on);
            }}
          />
          In-app sounds (calls &amp; message ping)
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            className="input-focus h-4 w-4 rounded border-zinc-300"
            checked={desktopAlertsOn}
            onChange={(e) => {
              const on = e.target.checked;
              setDesktopNotificationDesired(on);
              setDesktopAlertsOn(on);
            }}
          />
          Desktop banners when the tab is in the background (requires permission)
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            className="input-focus h-4 w-4 rounded border-zinc-300"
            checked={pushOn}
            onChange={(e) => {
              const on = e.target.checked;
              setPushDesired(on);
              setPushOn(on);
            }}
          />
          Allow Web Push registration after sign-in (when configured)
        </label>
        {notifPerm !== "unsupported" ? (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Permission: {notifPerm}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void enableBrowserNotifications()}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Enable desktop alerts
          </button>
          <button
            type="button"
            onClick={() => void registerWebPush()}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)]"
          >
            Register Web Push
          </button>
        </div>
      </section>

      <section
        id="reflections-nudges"
        className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80 scroll-mt-24"
      >
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Reflections &amp; gentle nudges
        </h2>
        <p className="text-xs text-zinc-500">
          Private notes after video dates stay only on your account. In-app nudges respect caps; you can turn categories
          off anytime.
        </p>
        {retentionProgress ? (
          <div className="space-y-3">
            {retentionProgress.datingJourney.stages.length > 0 ? (
              <DatingJourneyCard
                progressPercent={retentionProgress.datingJourney.progressPercent}
                stages={retentionProgress.datingJourney.stages}
              />
            ) : null}
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700/80 dark:bg-zinc-900/40 dark:text-zinc-300">
            <p>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">Reflections logged (all time):</span>{" "}
              {retentionProgress.journalEntriesTotal}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              After video: {retentionProgress.reflectionsAfterVideo} · With purposeful prompts:{" "}
              {retentionProgress.purposefulReflections}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Recent reflections (last 30 days) feed a small, bounded boost to how often you appear in other
              people&apos;s Discover stacks (typically ±6%). Current multiplier:{" "}
              <span className="font-mono text-zinc-700 dark:text-zinc-300">
                ×{retentionProgress.discoverPersonalization.engagementMultiplier.toFixed(3)}
              </span>
              {retentionProgress.discoverPersonalization.journalEntries30d > 0
                ? ` — ${retentionProgress.discoverPersonalization.journalEntries30d} entr${
                    retentionProgress.discoverPersonalization.journalEntries30d === 1 ? "y" : "ies"
                  } counted in that window.`
                : " — add a reflection after a call to start shaping this signal."}
            </p>
          </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Loading progress…</p>
        )}
        {retentionNotifPrefs ? (
          <div className="space-y-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-700/80">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">In-app nudge categories</p>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                className="input-focus mt-0.5 h-4 w-4 rounded border-zinc-300"
                checked={retentionNotifPrefs.retention_journal}
                onChange={(e) => void patchRetentionNotifPrefs({ retention_journal: e.target.checked })}
              />
              <span>Remind me to add a short private reflection after video dates</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                className="input-focus mt-0.5 h-4 w-4 rounded border-zinc-300"
                checked={retentionNotifPrefs.retention_reengage}
                onChange={(e) => void patchRetentionNotifPrefs({ retention_reengage: e.target.checked })}
              />
              <span>Occasional check-in if I have been away for a while</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                className="input-focus mt-0.5 h-4 w-4 rounded border-zinc-300"
                checked={retentionNotifPrefs.retention_weekly_hint}
                onChange={(e) => void patchRetentionNotifPrefs({ retention_weekly_hint: e.target.checked })}
              />
              <span>Weekly compatibility-style hints in my notification list</span>
            </label>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Loading notification preferences…</p>
        )}
      </section>

      <section className="card-surface space-y-2 border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Legal</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <Link href="/terms" className="text-[var(--accent)] hover:underline">
              Terms of use
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="text-[var(--accent)] hover:underline">
              Privacy policy
            </Link>
          </li>
          <li>
            <Link href="/community" className="text-[var(--accent)] hover:underline">
              Community guidelines
            </Link>
          </li>
        </ul>
      </section>

      <section className="card-surface border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Your user id</h2>
        <p className="mt-2 break-all font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {userId ?? "…"}
        </p>
      </section>

      <section id="report-someone" className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80 scroll-mt-24">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Report someone</h2>
        <p className="text-xs text-zinc-500">
          Paste the other person&apos;s user id (UUID). In production, this would usually be prefilled from their
          profile or chat.
        </p>
        <details className="rounded-lg border border-zinc-200/80 bg-zinc-50/50 px-3 py-2 text-xs dark:border-zinc-700/80 dark:bg-zinc-900/30">
          <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">
            Why we ask · what happens next
          </summary>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Reports help us spot harassment, scams, and policy violations. We review tickets as we can; you may not get
            a personal reply. For emergencies, contact local authorities.
          </p>
        </details>
        <input
          className="input-focus w-full rounded-xl border border-zinc-200 bg-[var(--background)] px-3 py-2.5 text-sm dark:border-zinc-700"
          placeholder="Reported user id"
          value={reportTarget}
          onChange={(e) => setReportTarget(e.target.value)}
        />
        <select
          className="input-focus w-full rounded-xl border border-zinc-200 bg-[var(--background)] px-3 py-2.5 text-sm dark:border-zinc-700"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {["harassment", "spam", "fake_profile", "other"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <textarea
          className="input-focus min-h-[88px] w-full rounded-xl border border-zinc-200 bg-[var(--background)] px-3 py-2.5 text-sm dark:border-zinc-700"
          placeholder="Optional details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void submitReport()}
          className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)] active:scale-[0.98]"
        >
          Submit report
        </button>
        {msg ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
      </section>

      <section className="card-surface border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">Blocked users</h2>
        <details className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          <summary className="cursor-pointer font-medium text-zinc-600 dark:text-zinc-300">About blocking</summary>
          <p className="mt-2">
            Unblocking restores the possibility of seeing each other in the app again; it does not restore past chats
            automatically.
          </p>
        </details>
        {!blocks.length ? (
          <p className="mt-3 text-sm text-zinc-500">No blocked accounts.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {blocks.map((b) => (
              <li key={b.blocked_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {b.blocked_id}
                </span>
                <button
                  type="button"
                  onClick={() => void unblock(b.blocked_id)}
                  className="shrink-0 text-[var(--accent)] hover:underline"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="card-surface flex flex-wrap gap-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80">
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-full border-2 border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 active:scale-[0.98] dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Sign out
        </button>
        <Link
          href="/admin"
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Admin panel
        </Link>
      </div>
    </div>
  );
}
