"use client";

import { adminApiFetch } from "@/lib/admin-api-fetch";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ThreadSummary = {
  match_id: string;
  match_created_at: string;
  other_user_id: string;
  other_display_name: string;
  messages: {
    id: string;
    body: string;
    created_at: string;
    sender_id: string;
    from_self: boolean;
  }[];
};

type ThreadsResponse = { threads: ThreadSummary[] };

type SingleThreadResponse = {
  match_id: string;
  other_user_id: string;
  other_display_name: string;
  messages: ThreadSummary["messages"];
};

export function AdminMessagesSection({ userId }: { userId: string }) {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [fullThread, setFullThread] = useState<SingleThreadResponse | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    const res = await adminApiFetch(`/api/admin/profiles/${userId}/messages`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load chats");
      setThreads(null);
      setLoadingList(false);
      return;
    }
    const data = json as ThreadsResponse;
    setThreads(data.threads ?? []);
    setLoadingList(false);
  }, [userId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    setSelectedMatchId(null);
    setFullThread(null);
  }, [userId]);

  const loadFullThread = useCallback(
    async (matchId: string) => {
      setLoadingThread(true);
      setError(null);
      const params = new URLSearchParams({ matchId, limit: "200" });
      const res = await adminApiFetch(`/api/admin/profiles/${userId}/messages?${params}`);
      const json = await res.json();
      setLoadingThread(false);
      if (!res.ok) {
        setError(json.error ?? "Failed to load messages");
        setFullThread(null);
        return;
      }
      setFullThread(json as SingleThreadResponse);
    },
    [userId],
  );

  useEffect(() => {
    if (!selectedMatchId) {
      setFullThread(null);
      return;
    }
    void loadFullThread(selectedMatchId);
  }, [selectedMatchId, loadFullThread]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Chat history</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Support and moderation only. Preview shows recent messages per match; open a thread for full history (up to 200).
      </p>

      {loadingList ? (
        <p className="mt-3 text-sm text-zinc-500">Loading threads…</p>
      ) : error && !threads?.length ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-zinc-500">Matches</p>
            {!threads?.length ? (
              <p className="mt-2 text-sm text-zinc-500">No matches.</p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                {threads.map((t) => (
                  <li key={t.match_id}>
                    <button
                      type="button"
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        selectedMatchId === t.match_id
                          ? "border-rose-500 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40"
                          : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                      }`}
                      onClick={() => setSelectedMatchId(t.match_id)}
                    >
                      <span className="font-medium">{t.other_display_name}</span>
                      <span className="block text-xs text-zinc-500">
                        {t.messages.length} preview {t.messages.length === 1 ? "message" : "messages"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500">Transcript</p>
            {!selectedMatchId ? (
              <p className="mt-2 text-sm text-zinc-500">Select a match.</p>
            ) : loadingThread ? (
              <p className="mt-2 text-sm text-zinc-500">Loading…</p>
            ) : error ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : fullThread ? (
              <div className="mt-2 space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Link
                    href={`/admin/users/${fullThread.other_user_id}`}
                    className="text-rose-700 underline-offset-2 hover:underline dark:text-rose-400"
                  >
                    {fullThread.other_display_name} (admin)
                  </Link>
                  <span className="text-zinc-400">·</span>
                  <Link
                    href={`/chat/${fullThread.match_id}`}
                    className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
                  >
                    Open app chat
                  </Link>
                </div>
                <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/50">
                  {fullThread.messages.length === 0 ? (
                    <p className="text-zinc-500">No messages in this match.</p>
                  ) : (
                    fullThread.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-md px-2 py-1.5 ${
                          m.from_self
                            ? "ml-4 bg-white dark:bg-zinc-900"
                            : "mr-4 bg-rose-100/80 dark:bg-rose-950/50"
                        }`}
                      >
                        <p className="text-xs text-zinc-500">
                          {m.from_self ? "This user" : fullThread.other_display_name} ·{" "}
                          {new Date(m.created_at).toLocaleString()}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">{m.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
