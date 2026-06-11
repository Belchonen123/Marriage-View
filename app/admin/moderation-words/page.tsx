"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Flag = "profanity" | "sexual" | "contact";

type WordRow = {
  id: string;
  word: string;
  flag: Flag;
  created_at: string;
};

const FLAG_TONE: Record<Flag, string> = {
  profanity: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  sexual: "bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100",
  contact: "bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
};

export default function AdminModerationWordsPage() {
  const [items, setItems] = useState<WordRow[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [word, setWord] = useState("");
  const [flag, setFlag] = useState<Flag>("sexual");

  const load = useCallback(async () => {
    setError(null);
    setWarning(null);
    const res = await adminApiFetch("/api/admin/moderation-words");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to load");
      return;
    }
    setItems((data.items ?? []) as WordRow[]);
    if (data.warning) setWarning(data.warning);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!word.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminApiFetch("/api/admin/moderation-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: word.trim(), flag }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not add");
        return;
      }
      setWord("");
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await adminApiFetch(`/api/admin/moderation-words?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not remove");
        return;
      }
      setItems((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/content"
          className="text-sm text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          ← Back to content moderation
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Custom moderation words</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Words added here extend the built-in scanner. They&apos;re matched whole-word and
          case-insensitive against bios, display names, and chat messages.
        </p>
      </div>

      {warning ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
          {warning}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Add a word</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Word or phrase
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="e.g. cougar, sugar daddy"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Flag
            <select
              value={flag}
              onChange={(e) => setFlag(e.target.value as Flag)}
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="sexual">Sexual</option>
              <option value="profanity">Profanity</option>
              <option value="contact">Off-platform contact</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !word.trim()}
            onClick={() => void add()}
            className="rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-800 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Custom list ({items.length})
        </p>
        {!items.length ? (
          <p className="mt-2 text-sm text-zinc-500">
            Nothing custom yet — the scanner is using only the built-in word list.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {items.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${FLAG_TONE[row.flag]}`}>
                    {row.flag}
                  </span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">{row.word}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-[11px] text-zinc-500">
                    {new Date(row.created_at).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(row.id)}
                    disabled={busy}
                    className="rounded-full border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
