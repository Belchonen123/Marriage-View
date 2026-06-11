"use client";

import { BrandCard } from "@/components/BrandCard";
import { BrandLockup } from "@/components/BrandLockup";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import {
  maybeRegisterWebPushAfterLogin,
  primeNotificationOptInFromUserGesture,
} from "@/lib/notification-prefs";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function friendlyAuthError(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? String((err as { message: string }).message)
      : err instanceof Error
        ? err.message
        : String(err);
  if (/failed to fetch|networkerror|load failed|typeerror.*fetch/i.test(raw)) {
    return (
      "Could not reach the sign-in service. Check your connection and try again. " +
      "If this keeps happening, WhatsApp Ben at (646) 504-4236."
    );
  }
  return raw;
}

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const supabaseEnvOk = useMemo(() => {
    const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return (
      typeof u === "string" &&
      u.startsWith("https://") &&
      !u.includes("YOUR_PROJECT") &&
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length)
    );
  }, []);
  const router = useRouter();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    primeNotificationOptInFromUserGesture();
    setLoading(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) {
          const text = friendlyAuthError(error);
          setMessage(text);
          show(text, "error");
        } else {
          if (data.session) {
            void maybeRegisterWebPushAfterLogin();
            router.replace("/");
          } else {
            const text =
              "Check your email to confirm, or sign in if confirmations are disabled in Supabase.";
            setMessage(text);
            show(text, "success");
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const text = friendlyAuthError(error);
          setMessage(text);
          show(text, "error");
        } else {
          void maybeRegisterWebPushAfterLogin();
          router.replace("/");
        }
      }
    } catch (e) {
      const text = friendlyAuthError(e);
      setMessage(text);
      show(text, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
    <div className="flex flex-1 flex-col lg:flex-row">
      <div className="relative flex flex-1 flex-col justify-center px-6 py-12 lg:px-12 lg:py-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.2]"
          aria-hidden
        >
          <div className="absolute left-[10%] top-[20%] h-40 w-40 rounded-full bg-[var(--mesh-1)] blur-3xl" />
          <div className="absolute bottom-[15%] right-[15%] h-48 w-48 rounded-full bg-[var(--mesh-3)] blur-3xl" />
        </div>
        <div className="relative max-w-md">
          <BrandLockup size="xl" showTagline />
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-4xl">
            Dating that starts with intention
          </h1>
          <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
            Discover marriage-minded matches, use light chat to coordinate, and meet on real{" "}
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">video dates</strong> — that&apos;s the
            heart of Marriage View.
          </p>
          <div className="mt-8 overflow-hidden rounded-[1.25rem] border border-rose-200/70 bg-white/70 shadow-xl shadow-rose-950/10 dark:border-rose-300/10 dark:bg-zinc-900/45 dark:shadow-black/30">
            <Image
              src="/kosher-connection-hero.svg"
              alt="Kosher dating scene with a Shabbat table, chuppah, and respectful video date cards"
              width={1200}
              height={900}
              priority
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <ul className="mt-8 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent)]">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              Compatibility signals from your questionnaire, not endless swipes.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent)]">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              Built-in safety tools: block, report, and control your presence.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent)]">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              Video Date Room when you&apos;re ready — same match space, no extra apps.
            </li>
          </ul>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10 lg:px-10">
        <div className="card-surface w-full max-w-md border border-zinc-200/80 p-6 dark:border-zinc-700/80 sm:p-8">
          <h2 className="font-display text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {mode === "signin"
              ? "Sign in to continue to Discover and your matches."
              : "Join Marriage View to start your profile and questionnaire."}
          </p>

          {!supabaseEnvOk ? (
            <p
              className="mt-4 rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-600/40 dark:bg-amber-950/50 dark:text-amber-100"
              role="alert"
            >
              Supabase is not configured in this build. Copy{" "}
              <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">.env.local.example</code> to{" "}
              <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">.env.local</code> and set your real
              project URL and anon key, then restart <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">next dev</code>.
            </p>
          ) : null}

          <div className="mt-6 flex gap-1 rounded-full border border-zinc-200/90 bg-zinc-100/80 p-1 dark:border-zinc-700/90 dark:bg-zinc-800/50">
            <button
              type="button"
              className={`min-h-11 flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                mode === "signin"
                  ? "bg-[var(--surface-elevated)] text-[var(--accent)] shadow-sm dark:bg-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
              onClick={() => setMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`min-h-11 flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                mode === "signup"
                  ? "bg-[var(--surface-elevated)] text-[var(--accent)] shadow-sm dark:bg-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Email
              <input
                type="email"
                className="input-focus mt-1.5 w-full rounded-xl border border-zinc-200 bg-[var(--background)] px-3 py-2.5 text-sm dark:border-zinc-700"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Password
              <input
                type="password"
                className="input-focus mt-1.5 w-full rounded-xl border border-zinc-200 bg-[var(--background)] px-3 py-2.5 text-sm dark:border-zinc-700"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={() => void submit()}
              className="min-h-11 w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
            {message ? (
              <p className="text-sm text-zinc-700 dark:text-zinc-300" role="status">
                {message}
              </p>
            ) : null}
            {process.env.NODE_ENV === "development" && supabaseEnvOk ? (
              <p className="text-xs text-zinc-500">
                <Link
                  href="/api/health/supabase"
                  className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Test server → Supabase connection
                </Link>
              </p>
            ) : null}
          </div>

          <p className="mt-8 text-center text-xs text-zinc-500">
            By continuing you agree to our{" "}
            <Link href="/terms" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Privacy
            </Link>
            .
          </p>
          <p className="mt-2 text-center text-xs">
            <Link
              href="/discover"
              className="font-medium text-[var(--accent)] underline-offset-4 hover:underline"
            >
              I already have an account →
            </Link>
          </p>
        </div>
      </div>
    </div>
      <BrandCard variant="full" placement="landing_footer" showCommunityLine />
    </div>
  );
}
