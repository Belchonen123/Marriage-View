"use client";

import { MatchJournalPostCallModal } from "@/components/MatchJournalPostCallModal";
import { JOURNAL_FOCUS_LABELS, type JournalFocusKey } from "@/lib/journal-focus-areas";
import { useCallback, useEffect, useState } from "react";

type Entry = {
  id: string;
  mood: string;
  note: string;
  call_occurred_at: string | null;
  created_at: string;
  focus_areas?: string[] | null;
};

export function MatchJournalPanel({
  matchId,
  otherName,
  onUnmatched,
}: {
  matchId: string;
  otherName: string;
  onUnmatched?: () => void;
}) {
  const [items, setItems] = useState<Entry[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/matches/${matchId}/journal`);
    const json = (await res.json().catch(() => null)) as { items?: Entry[] } | null;
    if (!res.ok || !json?.items) {
      setItems([]);
      return;
    }
    setItems(json.items);
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (items === null) {
    return (
      <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-700/80 dark:bg-zinc-900/50">
        Loading reflections…
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-zinc-200/80 bg-[var(--surface-elevated)] px-4 py-3 dark:border-zinc-700/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Your reflections · {items.length}
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="motion-tap rounded-full border border-[var(--accent)]/40 bg-[var(--accent-muted)]/50 px-3 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-muted)]"
          >
            Add note
          </button>
        </div>
        {items.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            After a call or anytime, add a private note about how things feel with {otherName}.
          </p>
        ) : (
          <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-sm text-zinc-700 dark:text-zinc-300">
            {items.map((e) => (
              <li key={e.id} className="border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800">
                <span className="font-medium capitalize text-zinc-900 dark:text-zinc-100">{e.mood.replace(/_/g, " ")}</span>
                {e.focus_areas?.length ? (
                  <span className="mt-0.5 block text-[10px] text-emerald-700 dark:text-emerald-400">
                    {e.focus_areas
                      .map((k) => JOURNAL_FOCUS_LABELS[k as JournalFocusKey] ?? k.replace(/_/g, " "))
                      .join(" · ")}
                  </span>
                ) : null}
                {e.note ? <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">{e.note}</span> : null}
                <span className="mt-0.5 block text-[10px] text-zinc-500">
                  {new Date(e.created_at).toLocaleString(undefined, { month: "short", day: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <MatchJournalPostCallModal
        open={modalOpen}
        matchId={matchId}
        otherName={otherName}
        onClose={() => setModalOpen(false)}
        onSaved={() => void load()}
        onUnmatched={onUnmatched}
      />
    </>
  );
}
