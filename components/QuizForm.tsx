"use client";

import { createClient } from "@/lib/supabase/client";
import type { AnswerType, QuestionRow } from "@/lib/types";
import { useToast } from "@/components/ToastProvider";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

const CHECKPOINT_SS_KEY = "mv:quiz-checkpoint-shown";

type Answers = Record<string, unknown>;

function answerIsComplete(q: QuestionRow, value: unknown): boolean {
  if (!q.required) return true;
  if (value == null) return false;
  switch (q.answer_type as AnswerType) {
    case "single":
    case "likert":
      return typeof value === "string" && value.trim().length > 0;
    case "multi":
      return Array.isArray(value) && (value as unknown[]).length > 0;
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "text":
    default:
      return typeof value === "string" && value.trim().length > 0;
  }
}

function isAutoAdvanceType(q: QuestionRow): boolean {
  return q.answer_type === "single" || q.answer_type === "likert";
}

export function QuizForm({
  version,
  initialQuestionId,
}: {
  version: number;
  initialQuestionId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { show } = useToast();
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [checkpointShown, setCheckpointShown] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(CHECKPOINT_SS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const advancingRef = useRef(false);
  const appliedInitialQuestionRef = useRef(false);
  const questionHeadingId = useId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: qs } = await supabase
        .from("questions")
        .select("*")
        .eq("version", version)
        .order("sort_order", { ascending: true });
      if (!cancelled) setQuestions((qs ?? []) as QuestionRow[]);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: existing } = await supabase
        .from("answers")
        .select("question_id, value")
        .eq("user_id", user.id);
      const map: Answers = {};
      for (const row of existing ?? []) {
        map[row.question_id as string] = row.value;
      }
      if (!cancelled) {
        setAnswers(map);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, version]);

  useEffect(() => {
    if (!initialQuestionId?.trim() || !questions.length || appliedInitialQuestionRef.current) return;
    const idx = questions.findIndex((x) => x.id === initialQuestionId.trim());
    if (idx >= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(idx);
      appliedInitialQuestionRef.current = true;
    }
  }, [initialQuestionId, questions]);

  const total = questions.length;
  const q = total > 0 ? questions[Math.min(step, total - 1)] : null;
  const needsManualNext = q
    ? !isAutoAdvanceType(q) || (isAutoAdvanceType(q) && answerIsComplete(q, answers[q.id]))
    : false;

  // Required vs optional bookkeeping for the two-phase progress bar
  // and the post-essentials checkpoint.
  const requiredQuestions = useMemo(
    () => questions.filter((x) => x.required),
    [questions],
  );
  const optionalQuestions = useMemo(
    () => questions.filter((x) => !x.required),
    [questions],
  );
  const lastRequiredIndex = useMemo(() => {
    let last = -1;
    questions.forEach((x, i) => {
      if (x.required) last = i;
    });
    return last;
  }, [questions]);

  const requiredIdSet = useMemo(
    () => new Set(requiredQuestions.map((x) => x.id)),
    [requiredQuestions],
  );
  const answeredIds = useMemo(() => Object.keys(answers), [answers]);
  const essentialsDone = useMemo(
    () => answeredIds.filter((id) => requiredIdSet.has(id)).length,
    [answeredIds, requiredIdSet],
  );
  const bonusDone = useMemo(
    () => answeredIds.filter((id) => !requiredIdSet.has(id)).length,
    [answeredIds, requiredIdSet],
  );

  const isInEssentials = q ? q.required : true;
  const progress = isInEssentials
    ? requiredQuestions.length > 0
      ? (essentialsDone / requiredQuestions.length) * 100
      : 0
    : optionalQuestions.length > 0
      ? (bonusDone / optionalQuestions.length) * 100
      : 0;

  // If the user re-enters on a bonus-phase question (e.g. via ?q=<id>),
  // mark the checkpoint as seen so we don't ambush them with it mid-flow.
  // Lazy state init already handled the sessionStorage read; this handles
  // the deep-link case where the bonus step is set but storage was clear.
  useEffect(() => {
    if (!questions.length || lastRequiredIndex < 0) return;
    if (step > lastRequiredIndex && !checkpointShown) {
      try {
        sessionStorage.setItem(CHECKPOINT_SS_KEY, "1");
      } catch {
        /* ignore */
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheckpointShown(true);
    }
  }, [questions.length, lastRequiredIndex, step, checkpointShown]);

  const persistAndGoNext = useCallback(
    async (merged: Answers, currentQ: QuestionRow) => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      setSaving(true);
      setMessage(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        show("Sign in required", "error");
        setSaving(false);
        advancingRef.current = false;
        return;
      }

      const rows = Object.entries(merged).map(([question_id, value]) => ({
        user_id: user.id,
        question_id,
        value,
      }));

      const { error } = await supabase.from("answers").upsert(rows, {
        onConflict: "user_id,question_id",
      });

      if (error) {
        setMessage(error.message);
        show(error.message, "error");
        setSaving(false);
        advancingRef.current = false;
        return;
      }

      setAnswers(merged);
      const idx = questions.findIndex((x) => x.id === currentQ.id);
      const n = questions.length;
      if (idx < 0) {
        setSaving(false);
        advancingRef.current = false;
        return;
      }

      // If the user just answered the last required question, pause on
      // a checkpoint card instead of advancing straight into the bonus
      // round. Only shows once per session.
      let stored = false;
      try {
        stored = sessionStorage.getItem(CHECKPOINT_SS_KEY) === "1";
      } catch {
        /* ignore */
      }
      const justFinishedEssentials =
        currentQ.required &&
        idx === lastRequiredIndex &&
        optionalQuestions.length > 0 &&
        !stored;
      if (justFinishedEssentials) {
        try {
          sessionStorage.setItem(CHECKPOINT_SS_KEY, "1");
        } catch {
          /* ignore */
        }
        setCheckpointShown(true);
        setMessage(null);
        setSaving(false);
        advancingRef.current = false;
        return;
      }

      if (idx < n - 1) {
        setStep(idx + 1);
        setMessage(null);
      } else {
        show("All answers saved.", "success");
        setMessage("You’re all set. Continue to Photos when ready.");
      }
      setSaving(false);
      advancingRef.current = false;
    },
    [questions, show, supabase, lastRequiredIndex, optionalQuestions.length],
  );

  function dismissCheckpointKeepGoing() {
    if (lastRequiredIndex >= 0 && optionalQuestions.length > 0) {
      setStep(lastRequiredIndex + 1);
    }
    // The card disappears because we render a different branch when the
    // current step is past the last required — keep checkpointShown true
    // so it doesn't re-appear if they navigate back.
  }

  function finishViaCheckpoint() {
    router.push("/onboarding/photos");
  }

  // Show the checkpoint card when the user has finished essentials and
  // hasn't moved into the bonus phase yet. The `step` cursor is still
  // pointing at the last required question at this moment because
  // persistAndGoNext returned early before incrementing.
  const showingCheckpoint =
    checkpointShown &&
    lastRequiredIndex >= 0 &&
    step <= lastRequiredIndex &&
    optionalQuestions.length > 0 &&
    essentialsDone >= requiredQuestions.length;

  function handleChoiceChange(newValue: unknown) {
    if (!q) return;
    const merged = { ...answers, [q.id]: newValue };
    setAnswers(merged);
    if (!isAutoAdvanceType(q)) return;
    if (!answerIsComplete(q, newValue)) return;
    void persistAndGoNext(merged, q);
  }

  function skipOptionalChoice() {
    if (!q || q.required || !isAutoAdvanceType(q)) return;
    const merged = { ...answers };
    delete merged[q.id];
    void persistAndGoNext(merged, q);
  }

  function nextManual() {
    if (!q) return;
    if (!answerIsComplete(q, answers[q.id])) {
      const msg = "Please answer this question before continuing (required for Discover).";
      setMessage(msg);
      show(msg, "error");
      return;
    }
    void persistAndGoNext({ ...answers }, q);
  }

  function goBack() {
    setMessage(null);
    setStep((s) => Math.max(0, s - 1));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton-shimmer h-3 w-full max-w-md rounded-md" />
        <div className="skeleton-shimmer h-48 w-full rounded-[var(--radius-lg)]" />
        <div className="skeleton-shimmer h-11 w-40 rounded-full" />
      </div>
    );
  }

  if (!q) {
    return <p className="text-sm text-zinc-500">No questions for this version.</p>;
  }

  const progressLabel = isInEssentials ? "Essentials" : "Bonus";
  const progressCurrent = isInEssentials ? essentialsDone : bonusDone;
  const progressTotal = isInEssentials ? requiredQuestions.length : optionalQuestions.length;

  if (showingCheckpoint) {
    return (
      <div className="relative">
        <div className="card-surface motion-card animate-card-in border border-zinc-200/80 p-6 text-center dark:border-zinc-700/80 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Essentials done
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            You&apos;re ready to start matching.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            You can start matching right now, or answer the {optionalQuestions.length} bonus
            questions to sharpen your compatibility score over time.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <button
              type="button"
              onClick={finishViaCheckpoint}
              className="motion-tap min-h-11 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)]"
            >
              I&apos;m done — take me matching
            </button>
            <button
              type="button"
              onClick={dismissCheckpointKeepGoing}
              className="motion-tap min-h-11 rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Keep answering for better matches
            </button>
          </div>
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Bonus questions are optional — you can stop anytime.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="sticky top-[max(0px,calc(env(safe-area-inset-top)+4.5rem))] z-20 -mx-1 mb-6 border-b border-zinc-200/80 bg-[var(--background)]/90 px-1 pb-4 pt-1 backdrop-blur-md dark:border-zinc-800/80">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
            {progressLabel}{" "}
            <strong className="text-zinc-900 dark:text-zinc-50">{progressCurrent}</strong> of{" "}
            <strong className="text-zinc-900 dark:text-zinc-50">{progressTotal}</strong>
          </span>
          {q.section ? (
            <span className="truncate text-xs font-medium text-[var(--accent)]">{q.section}</span>
          ) : null}
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="progressbar"
          aria-valuenow={progressCurrent}
          aria-valuemin={0}
          aria-valuemax={progressTotal}
        >
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <h2
        id={questionHeadingId}
        className="mb-3 px-0.5 font-display text-lg font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-xl"
      >
        {q.prompt}
        {q.required ? <span className="text-[var(--accent)]"> *</span> : null}
      </h2>

      <fieldset
        className="card-surface motion-card mb-24 animate-card-in border border-zinc-200/80 p-5 dark:border-zinc-700/80 sm:p-6"
        disabled={saving}
        aria-labelledby={questionHeadingId}
      >
        <legend className="sr-only">
          {q.prompt}
          {q.required ? " (required)" : ""}
        </legend>
        {isAutoAdvanceType(q) ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Tap an option to go to the next question{q.required ? "" : ", or skip below"}.
          </p>
        ) : null}
        <div className="mt-4">
          <AnswerInput q={q} value={answers[q.id]} onChange={handleChoiceChange} disabled={saving} />
        </div>
        {!q.required && isAutoAdvanceType(q) ? (
          <button
            type="button"
            onClick={() => skipOptionalChoice()}
            disabled={saving}
            className="mt-4 text-sm font-medium text-zinc-600 underline-offset-2 hover:text-[var(--accent)] hover:underline disabled:opacity-50 dark:text-zinc-400"
          >
            Skip for now
          </button>
        ) : null}
        {!q.required ? (
          <button
            type="button"
            onClick={finishViaCheckpoint}
            disabled={saving}
            className="mt-2 block text-xs text-zinc-500 underline-offset-2 hover:text-[var(--accent)] hover:underline disabled:opacity-50 dark:text-zinc-400"
          >
            I&apos;m done — take me matching →
          </button>
        ) : null}
      </fieldset>

      {message ? (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400" role="status">
          {message}
        </p>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200/80 bg-[var(--background)]/95 px-4 py-3 backdrop-blur-lg dark:border-zinc-800/80 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0 || saving}
            className="motion-tap min-h-11 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200"
          >
            Back
          </button>
          {needsManualNext ? (
            <button
              type="button"
              onClick={() => {
                if (!q) return;
                if (isAutoAdvanceType(q) && answerIsComplete(q, answers[q.id])) {
                  void persistAndGoNext({ ...answers }, q);
                } else {
                  nextManual();
                }
              }}
              disabled={saving}
              className="motion-tap min-h-11 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {saving ? "Saving…" : step >= total - 1 ? "Save & finish" : "Next"}
            </button>
          ) : (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {saving ? "Saving…" : "Choose an option above"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AnswerInput({
  q,
  value,
  onChange,
  disabled,
}: {
  q: QuestionRow;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const opts = Array.isArray(q.options) ? (q.options as string[]) : [];

  switch (q.answer_type as AnswerType) {
    case "single":
    case "likert":
      return (
        <div className="flex flex-col gap-2">
          {opts.map((o) => (
            <label
              key={o}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                value === o
                  ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                  : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
              } ${disabled ? "pointer-events-none opacity-60" : ""}`}
            >
              <input
                type="radio"
                name={q.id}
                checked={value === o}
                disabled={disabled}
                onChange={() => onChange(o)}
                className="h-4 w-4 border-zinc-300 text-[var(--accent)] focus:ring-[var(--ring)]"
              />
              {o}
            </label>
          ))}
        </div>
      );
    case "multi":
      return (
        <div className="flex flex-col gap-2">
          {opts.map((o) => {
            const set = new Set(Array.isArray(value) ? (value as string[]) : []);
            const checked = set.has(o);
            return (
              <label
                key={o}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  checked
                    ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                } ${disabled ? "pointer-events-none opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    const next = new Set(set);
                    if (checked) next.delete(o);
                    else next.add(o);
                    onChange([...next]);
                  }}
                  className="h-4 w-4 rounded border-zinc-300 text-[var(--accent)] focus:ring-[var(--ring)]"
                />
                {o}
              </label>
            );
          })}
        </div>
      );
    case "number":
      return (
        <input
          type="number"
          disabled={disabled}
          className="input-focus w-full rounded-xl border border-zinc-200 bg-[var(--background)] px-3 py-2.5 text-sm dark:border-zinc-700"
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "text":
    default:
      return (
        <textarea
          disabled={disabled}
          className="input-focus min-h-[120px] w-full rounded-xl border border-zinc-200 bg-[var(--background)] px-3 py-2.5 text-sm dark:border-zinc-700"
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
