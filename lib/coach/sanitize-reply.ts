/** Plain-text coach replies: strip common markdown so the UI stays easy to read. */
export function sanitizeCoachReply(text: string): string {
  let t = text.trim();
  if (!t) return t;

  t = t.replace(/\*\*([^*]*)\*\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^\s*\*\s+/gm, "- ");
  t = t.replace(/^\s*-\s{2,}/gm, "- ");
  t = t.replace(/^[\s*\-_]{3,}\s*$/gm, "");
  t = t.replace(/\*([^*\n]+)\*/g, "$1");
  t = t.replace(/_([^_\n]+)_/g, "$1");
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}
