import type { IcebreakerAnswerEntry } from "@/lib/types";

const MAX_STORED = 60;

export function parseIcebreakerAnswers(raw: unknown): IcebreakerAnswerEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: IcebreakerAnswerEntry[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const day = typeof o.day === "string" ? o.day : "";
    const slot = typeof o.slot === "number" && Number.isInteger(o.slot) ? o.slot : -1;
    const prompt = typeof o.prompt === "string" ? o.prompt : "";
    const answer = typeof o.answer === "string" ? o.answer : "";
    const updated_at = typeof o.updated_at === "string" ? o.updated_at : "";
    if (!day || slot < 0 || !prompt || !answer) continue;
    out.push({ day, slot, prompt, answer, updated_at });
  }
  return out;
}

export function mergeIcebreakerAnswer(
  existing: unknown,
  entry: Omit<IcebreakerAnswerEntry, "updated_at">,
): IcebreakerAnswerEntry[] {
  const list = parseIcebreakerAnswers(existing);
  const updated_at = new Date().toISOString();
  const rest = list.filter((e) => !(e.day === entry.day && e.slot === entry.slot));
  const next = [...rest, { ...entry, updated_at }];
  if (next.length > MAX_STORED) {
    next.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    return next.slice(-MAX_STORED);
  }
  return next;
}

export function answersForDay(list: IcebreakerAnswerEntry[], day: string): Map<number, IcebreakerAnswerEntry> {
  const m = new Map<number, IcebreakerAnswerEntry>();
  for (const e of list) {
    if (e.day === day) m.set(e.slot, e);
  }
  return m;
}

export function viewerIcebreakerSnippets(raw: unknown, limit = 12): IcebreakerAnswerEntry[] {
  const list = parseIcebreakerAnswers(raw);
  return [...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, limit);
}
