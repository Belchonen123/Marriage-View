"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import { useEffect, useRef, useState } from "react";

type Question = {
  id: string;
  version: number;
  sort_order: number;
  section: string | null;
  prompt: string;
  answer_type: string;
  options: unknown;
  weight: number;
  required: boolean;
  dealbreaker: boolean;
};

const emptyForm = {
  id: "" as string,
  version: 1,
  sort_order: 0,
  section: "",
  prompt: "",
  answer_type: "single",
  optionsText: "[]",
  weight: 1,
  required: true,
  dealbreaker: false,
};

function finiteNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function optionsToEditorText(options: unknown): { text: string; serializeError: boolean } {
  try {
    return { text: JSON.stringify(options ?? null, null, 2), serializeError: false };
  } catch {
    return { text: "null", serializeError: true };
  }
}

async function fetchQuestionsList() {
  const res = await adminApiFetch("/api/admin/questions");
  const data = await res.json();
  if (!res.ok) {
    return { ok: false as const, error: data.error ?? "Failed to load", items: [] as Question[] };
  }
  return { ok: true as const, error: null as string | null, items: (data.items ?? []) as Question[] };
}

export default function AdminQuestionsPage() {
  const formSectionRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchQuestionsList();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setItems([]);
        return;
      }
      setError(null);
      setItems(result.items);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    const result = await fetchQuestionsList();
    if (!result.ok) {
      setError(result.error);
      setItems([]);
      return;
    }
    setError(null);
    setItems(result.items);
  }

  function scrollEditorIntoView() {
    window.setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function startNew() {
    setError(null);
    const nextOrder = items.length ? Math.max(...items.map((q) => q.sort_order)) + 1 : 1;
    const maxVersion = items.length ? Math.max(...items.map((q) => q.version)) : 1;
    setForm({
      ...emptyForm,
      sort_order: nextOrder,
      version: maxVersion,
      optionsText: '["Option A","Option B"]',
    });
    scrollEditorIntoView();
  }

  function startEdit(q: Question) {
    setError(null);
    const { text: optionsText, serializeError } = optionsToEditorText(q.options);
    if (serializeError) {
      setError(
        "Options for this question could not be serialized (invalid JSON value). Showing null — fix in DB or re-enter options below.",
      );
    }
    setForm({
      id: q.id,
      version: Math.round(finiteNum(q.version, 1)),
      sort_order: Math.round(finiteNum(q.sort_order, 0)),
      section: q.section ?? "",
      prompt: q.prompt,
      answer_type: q.answer_type,
      optionsText,
      weight: finiteNum(q.weight, 1),
      required: Boolean(q.required),
      dealbreaker: Boolean(q.dealbreaker),
    });
    scrollEditorIntoView();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(form.weight) || form.weight < 0) {
      setError("Weight must be a non-negative number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let options: unknown = null;
      const trimmed = form.optionsText.trim();
      if (trimmed) {
        try {
          options = JSON.parse(trimmed);
        } catch {
          throw new Error("Options must be valid JSON.");
        }
      }
      if (form.id) {
        const res = await adminApiFetch(`/api/admin/questions/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: form.version,
            sort_order: form.sort_order,
            section: form.section || null,
            prompt: form.prompt,
            answer_type: form.answer_type,
            options,
            weight: form.weight,
            required: form.required,
            dealbreaker: form.dealbreaker,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Save failed");
      } else {
        const res = await adminApiFetch("/api/admin/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: form.version,
            sort_order: form.sort_order,
            section: form.section || null,
            prompt: form.prompt,
            answer_type: form.answer_type,
            options,
            weight: form.weight,
            required: form.required,
            dealbreaker: form.dealbreaker,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Save failed");
      }
      setForm(emptyForm);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this question? Existing answers for this question will be removed (cascade).")) return;
    const res = await adminApiFetch(`/api/admin/questions/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Delete failed");
      return;
    }
    if (form.id === id) setForm(emptyForm);
    await refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Questionnaire</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Changes apply to new completions; bump <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">version</code>{" "}
            when you materially alter scoring.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800"
        >
          New question
        </button>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <ul className="space-y-2">
        {items.map((q) => (
          <li
            key={q.id}
            className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{q.prompt}</p>
              <p className="mt-1 text-xs text-zinc-500">
                v{q.version} · order {q.sort_order} · {q.answer_type} · weight {q.weight}
                {q.dealbreaker ? " · dealbreaker" : ""}
                {q.section ? ` · ${q.section}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-600"
                onClick={() => startEdit(q)}
              >
                Edit
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-800 dark:border-rose-900 dark:text-rose-300"
                onClick={() => void remove(q.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div
        ref={formSectionRef}
        className="scroll-mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-sm font-semibold">{form.id ? "Edit question" : "Create question"}</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          After you click <strong>Edit</strong> on a row, the form loads here — scroll down if you don&apos;t see it.
        </p>
        <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs sm:col-span-2">
            <span className="text-zinc-600 dark:text-zinc-400">Prompt</span>
            <textarea
              required
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              rows={2}
            />
          </label>
          <label className="text-xs">
            <span className="text-zinc-600 dark:text-zinc-400">Section</span>
            <input
              value={form.section}
              onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="text-xs">
            <span className="text-zinc-600 dark:text-zinc-400">Answer type</span>
            <select
              value={form.answer_type}
              onChange={(e) => setForm((f) => ({ ...f, answer_type: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="single">single</option>
              <option value="multi">multi</option>
              <option value="likert">likert</option>
              <option value="text">text</option>
              <option value="number">number</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="text-zinc-600 dark:text-zinc-400">Version</span>
            <input
              type="number"
              required
              value={form.version}
              onChange={(e) => {
                const v = Number(e.target.value);
                setForm((f) => ({ ...f, version: Number.isFinite(v) ? v : f.version }));
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="text-xs">
            <span className="text-zinc-600 dark:text-zinc-400">Sort order</span>
            <input
              type="number"
              required
              value={form.sort_order}
              onChange={(e) => {
                const v = Number(e.target.value);
                setForm((f) => ({ ...f, sort_order: Number.isFinite(v) ? v : f.sort_order }));
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="text-xs">
            <span className="text-zinc-600 dark:text-zinc-400">Weight</span>
            <input
              type="number"
              step="0.1"
              min={0}
              required
              value={form.weight}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setForm((f) => ({ ...f, weight: Number.isFinite(v) ? v : f.weight }));
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="flex items-center gap-2 text-xs sm:col-span-2">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))}
            />
            Required
            <input
              type="checkbox"
              className="ml-4"
              checked={form.dealbreaker}
              onChange={(e) => setForm((f) => ({ ...f, dealbreaker: e.target.checked }))}
            />
            Dealbreaker
          </label>
          <label className="text-xs sm:col-span-2">
            <span className="text-zinc-600 dark:text-zinc-400">Options (JSON array or null)</span>
            <textarea
              value={form.optionsText}
              onChange={(e) => setForm((f) => ({ ...f, optionsText: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
              rows={4}
              placeholder='["A","B"] or []'
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {form.id ? (
              <button
                type="button"
                onClick={() => setForm(emptyForm)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
