const STORAGE_KEY = "nexus_match_last_read_v1";

function readMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

/** Latest message id the user has seen in this thread (opens chat / scrolls to bottom). */
export function setLastReadMessageId(matchId: string, messageId: string) {
  const map = readMap();
  map[matchId] = messageId;
  writeMap(map);
  try {
    window.dispatchEvent(new CustomEvent("nexus-match-read"));
  } catch {
    /* ignore */
  }
}

export function getLastReadMessageId(matchId: string): string | null {
  return readMap()[matchId] ?? null;
}
