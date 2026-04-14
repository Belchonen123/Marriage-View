"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import type { AnswerType, QuestionRow } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type QuestionnairePayload = {
  version: number;
  questions: QuestionRow[];
  answers: Record<string, unknown>;
};

function optionStrings(q: QuestionRow): string[] {
  return Array.isArray(q.options) ? (q.options as string[]) : [];
}

export function AdminQuestionnaireSection({ userId }: { userId: string }) {
  const [data, setData] = useState<QuestionnairePayload | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const initialRef = useRef<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await adminApiFetch(`/api/admin/profiles/${userId}/questionnaire`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load questionnaire");
      setData(null);
      setLoading(false);
      return;
    }
    const payload = json as QuestionnairePayload;
    setData(payload);
    const ans = { ...payload.answers };
    initialRef.current = JSON.parse(JSON.stringify(ans)) as Record<string, unknown>;
    setDraft(ans);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setAnswer(questionId: string, value: unknown) {
    setDraft((d) => ({ ...d, [questionId]: value }));
    setSaveMsg(null);
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setSaveMsg(null);
    const patch: Record<string, unknown | null> = {};
    const initial = initialRef.current;

    for (const q of data.questions) {
      const id = q.id;
      const cur = draft[id];
      const orig = initial[id];
      const curJson = JSON.stringify(cur ?? null);
      const origJson = JSON.stringify(orig ?? null);
      if (curJson !== origJson) {
        patch[id] = cur === undefined ? null : cur;
      }
    }

    if (Object.keys(patch).length === 0) {
      setSaveMsg("No changes.");
      setSaving(false);
      return;
    }

    const res = await adminApiFetch(`/api/admin/profiles/${userId}/questionnaire`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: patch }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setSaveMsg(json.error ?? "Save failed");
      return;
    }
    setSaveMsg(`Saved (${json.updated ?? 0} updated, ${json.deleted ?? 0} cleared).`);
    await load();
  }

  function renderInput(q: QuestionRow) {
    const value = draft[q.id];
    const opts = optionStrings(q);

    switch (q.answer_type as AnswerType) {
      case "single":
      case "likert":
        return (
          <select
            className="mt-1 w-full max-w-md rounded-lg border border-zinc-200 bg-[var(--background)] px-3 py-2 text-sm dark:border-zinc-700"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => {
              const v = e.target.value;
              setAnswer(q.id, v === "" && !q.required ? null : v);
            }}
          >
            <option value="">{q.required ? "— Select —" : "(optional)"}</option>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      case "multi": {
        const set = new Set(Array.isArray(value) ? (value as string[]) : []);
        return (
          <div className="mt-1 flex flex-col gap-2">
            {opts.map((o) => {
              const checked = set.has(o);
              return (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-300"
                    checked={checked}
                    onChange={() => {
                      const next = new Set(set);
                      if (checked) next.delete(o);
                      else next.add(o);
                      setAnswer(q.id, [...next]);
                    }}
                  />
                  {o}
                </label>
              );
            })}
          </div>
        );
      }
      case "number":
        return (
          <input
            type="number"
            className="mt-1 w-full max-w-xs rounded-lg border border-zinc-200 bg-[var(--background)] px-3 py-2 text-sm dark:border-zinc-700"
            value={value == null || typeof value !== "number" ? "" : String(value)}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") setAnswer(q.id, null);
              else setAnswer(q.id, Number(raw));
            }}
          />
        );
      case "text":
      default:
        return (
          <textarea
            className="mt-1 min-h-[80px] w-full rounded-lg border border-zinc-200 bg-[var(--background)] px-3 py-2 text-sm dark:border-zinc-700"
            value={value == null ? "" : String(value)}
            onChange={(e) => setAnswer(q.id, e.target.value)}
          />
        );
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Questionnaire</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Support and moderation only. Answers follow this user&apos;s quiz version ({data?.version ?? "…"}).
      </p>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        To change question <strong>weights</strong>, prompts, or the bank, use{" "}
        <Link
          href="/admin/questions"
          className="font-medium text-rose-700 underline-offset-2 hover:underline dark:text-rose-400"
        >
          Admin → Questionnaire
        </Link>
        .
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-zinc-500">Loading questionnaire…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !data?.questions.length ? (
        <p className="mt-3 text-sm text-zinc-500">No questions for this version.</p>
      ) : (
        <>
          <div className="mt-4 space-y-6">
            {data.questions.map((q, idx) => {
              const prev = data.questions[idx - 1];
              const showHeading = Boolean(q.section && (!prev || prev.section !== q.section));
              return (
                <div key={q.id} className="border-b border-zinc-100 pb-4 dark:border-zinc-800/80">
                  {showHeading ? (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">
                      {q.section}
                    </p>
                  ) : null}
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {q.prompt}
                    {q.required ? <span className="text-rose-600"> *</span> : null}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {q.answer_type}
                    {!q.required ? " · optional" : null}
                  </p>
                  {renderInput(q)}
                  {!q.required ? (
                    <button
                      type="button"
                      className="mt-2 text-xs text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
                      onClick={() => setAnswer(q.id, null)}
                    >
                      Clear answer
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving}
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save questionnaire"}
            </button>
            <button
              type="button"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              onClick={() => void load()}
              disabled={saving}
            >
              Reload
            </button>
            {saveMsg ? <span className="text-sm text-zinc-600 dark:text-zinc-400">{saveMsg}</span> : null}
          </div>
        </>
      )}
    </div>
  );
}
