"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";

type PhoneState = {
  phone_number: string | null;
  phone_verified_at: string | null;
};

export function PhoneVerificationSection() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<PhoneState | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("phone_number, phone_verified_at")
        .eq("id", user.id)
        .maybeSingle();
      setState(
        data
          ? {
              phone_number: (data.phone_number as string | null) ?? null,
              phone_verified_at: (data.phone_verified_at as string | null) ?? null,
            }
          : { phone_number: null, phone_verified_at: null },
      );
    })();
  }, [supabase]);

  const verified = Boolean(state?.phone_verified_at);

  async function startVerification() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/phone/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        phone?: string;
        error?: string;
      };
      if (!res.ok) {
        setErr(data.error ?? "Could not send code.");
        return;
      }
      setPendingPhone(data.phone ?? phoneInput);
      setMsg(`Code sent to ${data.phone ?? phoneInput}. Check SMS.`);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!pendingPhone) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/phone/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: pendingPhone, code: codeInput }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        phone?: string;
        error?: string;
      };
      if (!res.ok) {
        setErr(data.error ?? "Could not verify code.");
        return;
      }
      setState({ phone_number: data.phone ?? pendingPhone, phone_verified_at: new Date().toISOString() });
      setPendingPhone(null);
      setPhoneInput("");
      setCodeInput("");
      setMsg("Phone number verified ✅");
    } finally {
      setBusy(false);
    }
  }

  async function removePhone() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/phone/verify", { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(data.error ?? "Could not unlink.");
        return;
      }
      setState({ phone_number: null, phone_verified_at: null });
      setMsg("Phone unlinked.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-surface space-y-3 border border-zinc-200/80 p-5 dark:border-zinc-700/80">
      <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Phone number (SMS alerts)
      </h2>
      <p className="text-xs text-zinc-500">
        On iPhone — and on any device where browser notifications don&apos;t reliably ring — we&apos;ll
        SMS you when a match calls or messages. Adding your number is optional but strongly
        recommended.
      </p>

      {verified ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
          <p>
            <span className="font-semibold">{state?.phone_number}</span> verified.
          </p>
          <button
            type="button"
            onClick={() => void removePhone()}
            disabled={busy}
            className="mt-2 rounded-full border border-emerald-700/40 px-3 py-1 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 dark:hover:bg-emerald-900/40"
          >
            Unlink number
          </button>
        </div>
      ) : !pendingPhone ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Mobile number
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1 646 504 4236"
              className="input-focus mt-1 w-full rounded-xl border border-zinc-200 bg-[var(--background)] px-3 py-2.5 text-sm dark:border-zinc-700"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!phoneInput.trim() || busy}
            onClick={() => void startVerification()}
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send code"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Code sent to <span className="font-mono">{pendingPhone}</span>. Enter the 6-digit code
            from your SMS.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              className="input-focus w-full rounded-xl border border-zinc-200 bg-[var(--background)] px-3 py-2.5 text-center font-mono text-lg tracking-widest dark:border-zinc-700 sm:w-40"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ""))}
            />
            <button
              type="button"
              disabled={codeInput.length < 4 || busy}
              onClick={() => void submitCode()}
              className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {busy ? "Checking…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingPhone(null);
                setCodeInput("");
              }}
              className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium dark:border-zinc-600"
            >
              Use a different number
            </button>
          </div>
        </div>
      )}

      {msg ? <p className="text-xs text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
      {err ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}
    </section>
  );
}

export default PhoneVerificationSection;
