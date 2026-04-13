"use client";

import { ModalCloseButton } from "@/components/ModalCloseButton";
import { useToast } from "@/components/ToastProvider";
import { DatingJourneyCard } from "@/components/DatingJourneyCard";
import { JOURNAL_FOCUS_KEYS, JOURNAL_FOCUS_LABELS, type JournalFocusKey } from "@/lib/journal-focus-areas";
import { useEffect, useState } from "react";

const MOODS = [
  { value: "great", label: "Great" },
  { value: "good", label: "Good" },
  { value: "neutral", label: "Neutral" },
  { value: "unsure", label: "Unsure" },
  { value: "not_a_fit", label: "Not a fit" },
] as const;

const CONCERN_OPTIONS = [
  { value: "discomfort", label: "I felt uncomfortable" },
  { value: "unsafe", label: "I felt unsafe or pressured" },
  { value: "harassment", label: "Harassment or inappropriate behavior" },
  { value: "other", label: "Something else — I want a person to review this" },
] as const;

export function MatchJournalPostCallModal({
  open,
  matchId,
  otherName,
  otherUserId,
  variant = "inline",
  onClose,
  onSaved,
  onReflectSaved,
  onUnmatched,
}: {
  open: boolean;
  matchId: string;
  otherName: string;
  /** Required for post-call fast-track support. */
  otherUserId?: string;
  variant?: "post_call" | "inline";
  onClose: () => void;
  onSaved?: () => void;
  /** Fires after a reflection is saved (e.g. parent shows a gentle return-to-chat hint). */
  onReflectSaved?: () => void;
  onUnmatched?: () => void;
}) {
  const { show } = useToast();
  const [mood, setMood] = useState<string>("good");
  const [note, setNote] = useState("");
  const [focusPicked, setFocusPicked] = useState<Set<JournalFocusKey>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [endMatchStep, setEndMatchStep] = useState<"idle" | "confirm">("idle");
  const [supportOpen, setSupportOpen] = useState(false);
  const [concernType, setConcernType] = useState<string>("discomfort");
  const [concernNote, setConcernNote] = useState("");
  const [escalationBusy, setEscalationBusy] = useState(false);
  const [journeyPreview, setJourneyPreview] = useState<{
    progressPercent: number;
    stages: { id: string; label: string; hint: string; done: boolean }[];
  } | null>(null);

  const showSafety = variant === "post_call" && Boolean(otherUserId);
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

  useEffect(() => {
    if (!open) {
      setEndMatchStep("idle");
      setErr(null);
      setSupportOpen(false);
      setConcernNote("");
      setConcernType("discomfort");
      setFocusPicked(new Set());
      setJourneyPreview(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || variant !== "post_call") return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/me/retention-progress");
      const j = await res.json().catch(() => null);
      if (cancelled || !res.ok || !j?.datingJourney) return;
      setJourneyPreview({
        progressPercent: j.datingJourney.progressPercent as number,
        stages: j.datingJourney.stages as { id: string; label: string; hint: string; done: boolean }[],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setErr(null);
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function dismiss() {
    setErr(null);
    onClose();
  }

  function toggleFocus(key: JournalFocusKey) {
    setFocusPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/matches/${matchId}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mood,
        note,
        call_occurred_at: new Date().toISOString(),
        focus_areas: Array.from(focusPicked),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Could not save");
      return;
    }
    onSaved?.();
    onReflectSaved?.();
    const followUp = `Thanks for the video date, ${otherName} — I'd love to plan our next step when you're free.`;
    show("Reflection saved — nice work staying intentional.", "success", {
      durationMs: 14_000,
      actions: [
        {
          label: "Copy follow-up for chat",
          onClick: () => {
            void navigator.clipboard.writeText(followUp);
            show("Copied — paste in your match chat if it fits.", "info", { durationMs: 4000 });
          },
        },
      ],
    });
    setNote("");
    setMood("good");
    setFocusPicked(new Set());
    onClose();
  }

  async function submitEscalation() {
    if (!otherUserId) return;
    setEscalationBusy(true);
    setErr(null);
    const res = await fetch("/api/support/post-call-concern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId,
        reportedUserId: otherUserId,
        concernType,
        narrative: concernNote || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setEscalationBusy(false);
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Could not send");
      return;
    }
    show(
      "We prioritized this for our team. If you need to reach someone directly, use the email link below.",
      "success",
    );
    setSupportOpen(false);
    setConcernNote("");
  }

  async function endMatch() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/matches/${matchId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Could not end match");
      setEndMatchStep("idle");
      return;
    }
    setNote("");
    setMood("good");
    setFocusPicked(new Set());
    setEndMatchStep("idle");
    onClose();
    onUnmatched?.();
  }

  const mailtoHref =
    supportEmail &&
    `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent(
      `Marriage View — support after video call (match ${matchId.slice(0, 8)})`,
    )}&body=${encodeURIComponent(
      `I need help after a video date with ${otherName}.\n\n(Our team also received an in-app report if you used "Get help.")\n`,
    )}`;

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="journal-postcall-title"
    >
      <div className="card-surface relative flex max-h-[min(92vh,42rem)] w-full max-w-md flex-col overflow-hidden border border-zinc-200/90 dark:border-zinc-700/90">
        <div className="sticky top-0 z-10 flex shrink-0 justify-end border-b border-zinc-200/70 bg-[var(--surface-elevated)] px-3 py-2 dark:border-zinc-700/70">
          <ModalCloseButton onClick={dismiss} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
        {showSafety ? (
          <div className="mb-4 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/40">
            <button
              type="button"
              className="w-full text-left text-sm font-medium text-amber-950 dark:text-amber-100"
              onClick={() => setSupportOpen((v) => !v)}
              aria-expanded={supportOpen}
            >
              {supportOpen ? "\u2212 " : "+ "}
              Felt uncomfortable or unsafe? Get human support — fast track, no red tape.
            </button>
            {supportOpen ? (
              <div className="mt-2 space-y-2 border-t border-amber-200/80 pt-2 dark:border-amber-900/40">
                <p className="text-xs text-amber-900/90 dark:text-amber-200/90">
                  This sends a priority flag to our moderation team with your match context. You can share only what you
                  are comfortable with.
                </p>
                <label className="block text-xs font-medium text-amber-950 dark:text-amber-100">
                  What fits best?
                  <select
                    className="mt-1 w-full rounded-lg border border-amber-300/80 bg-white px-2 py-1.5 text-sm dark:border-amber-800 dark:bg-zinc-950"
                    value={concernType}
                    onChange={(e) => setConcernType(e.target.value)}
                  >
                    {CONCERN_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-amber-950 dark:text-amber-100">
                  Anything you want us to know (optional)
                  <textarea
                    className="mt-1 min-h-[72px] w-full rounded-lg border border-amber-300/80 bg-white px-2 py-1.5 text-sm dark:border-amber-800 dark:bg-zinc-950"
                    value={concernNote}
                    onChange={(e) => setConcernNote(e.target.value)}
                    maxLength={4000}
                    placeholder="Optional — helps our team respond with care."
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={escalationBusy}
                    className="rounded-full bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-50 dark:bg-amber-700"
                    onClick={() => void submitEscalation()}
                  >
                    {escalationBusy ? "Sending…" : "Send to care team"}
                  </button>
                  {mailtoHref ? (
                    <a
                      href={mailtoHref}
                      className="inline-flex items-center rounded-full border border-amber-800/40 px-3 py-1.5 text-xs font-medium text-amber-950 dark:text-amber-200"
                    >
                      Email support
                    </a>
                  ) : null}
                </div>
                {!supportEmail ? (
                  <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80">
                    Set <code className="rounded bg-amber-100/80 px-0.5 dark:bg-amber-900/50">NEXT_PUBLIC_SUPPORT_EMAIL</code>{" "}
                    to show a one-tap mail link. Alerts to staff can use{" "}
                    <code className="rounded bg-amber-100/80 px-0.5 dark:bg-amber-900/50">SUPPORT_ALERT_EMAIL</code> with
                    Resend.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {variant === "post_call" && journeyPreview ? (
          <div className="mb-4">
            <DatingJourneyCard progressPercent={journeyPreview.progressPercent} stages={journeyPreview.stages} />
          </div>
        ) : null}

        <h2
          id="journal-postcall-title"
          className="font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          How did the connection feel?
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Private to you — trust your gut. Nothing here is shared with {otherName}.
        </p>

        <p className="mt-4 text-xs font-medium text-zinc-600 dark:text-zinc-400">Overall</p>
        <div
          className="mt-1.5 flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label="How you felt about the connection"
        >
          {MOODS.map((m) => {
            const selected = mood === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
                onClick={() => setMood(m.value)}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Optional prompts — make this reflection purposeful
        </p>
        <p className="mt-0.5 text-[10px] text-zinc-500">Tap any that fit; they are only for your own clarity.</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {JOURNAL_FOCUS_KEYS.map((key) => {
            const on = focusPicked.has(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  on
                    ? "border-emerald-600/50 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-100"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                }`}
                onClick={() => toggleFocus(key)}
              >
                {JOURNAL_FOCUS_LABELS[key]}
              </button>
            );
          })}
        </div>

        <label className="mt-4 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Note (optional)
          <textarea
            className="mt-1 min-h-[88px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="e.g. Values felt aligned, or I want clearer pacing — your words only."
          />
        </label>

        {onUnmatched ? (
          <div className="mt-5 border-t border-zinc-200/80 pt-4 dark:border-zinc-700/80">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              If you are done here, you can end the match. The other person is not told why — chat and this thread go
              away for both of you. Your saved reflections stay in your account.
            </p>
            {endMatchStep === "idle" ? (
              <button
                type="button"
                disabled={busy}
                className="mt-2 text-sm font-medium text-red-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-red-400"
                onClick={() => setEndMatchStep("confirm")}
              >
                End match with {otherName}
              </button>
            ) : (
              <div className="mt-2 flex flex-col gap-2 rounded-lg border border-red-200/80 bg-red-50/80 p-3 dark:border-red-900/50 dark:bg-red-950/30">
                <p className="text-sm font-medium text-red-900 dark:text-red-200">End this match?</p>
                <p className="text-xs text-red-800/90 dark:text-red-300/90">
                  This cannot be undone. You can always match again later if you both like each other on Discover.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                    onClick={() => setEndMatchStep("idle")}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    onClick={() => void endMatch()}
                  >
                    {busy ? "Ending…" : "Yes, end match"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {err ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p> : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
            onClick={dismiss}
          >
            Skip
          </button>
          <button
            type="button"
            disabled={busy}
            className="motion-tap rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-[var(--accent-hover)] disabled:opacity-50"
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : "Save reflection"}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
