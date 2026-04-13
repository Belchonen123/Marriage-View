export type MessageRow = { body: string | null; sender_id: string; created_at: string };

/** Format DB messages as a readable transcript for the coach (You / Them). */
export function formatMatchTranscript(
  rows: MessageRow[],
  selfId: string,
  themLabel: string,
): { text: string; count: number } {
  const them = themLabel.trim() || "Them";
  const lines: string[] = [];
  for (const r of rows) {
    const who = r.sender_id === selfId ? "You" : them;
    const t = new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ");
    const body = (r.body ?? "").trim().replace(/\s+/g, " ");
    if (!body) continue;
    lines.push(`[${t}] ${who}: ${body}`);
  }
  const text = lines.join("\n");
  return { text, count: lines.length };
}
