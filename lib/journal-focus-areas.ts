/** Allowed optional reflection prompts (stored in match_journal_entries.focus_areas). */
export const JOURNAL_FOCUS_KEYS = [
  "values_alignment",
  "future_goals",
  "communication_pace",
  "boundaries_safety",
] as const;

export type JournalFocusKey = (typeof JOURNAL_FOCUS_KEYS)[number];

const SET = new Set<string>(JOURNAL_FOCUS_KEYS);

export function normalizeFocusAreas(raw: unknown): JournalFocusKey[] {
  if (!Array.isArray(raw)) return [];
  const out: JournalFocusKey[] = [];
  for (const x of raw) {
    if (typeof x === "string" && SET.has(x) && !out.includes(x as JournalFocusKey)) {
      out.push(x as JournalFocusKey);
    }
  }
  return out;
}

export const JOURNAL_FOCUS_LABELS: Record<JournalFocusKey, string> = {
  values_alignment: "Values & life alignment",
  future_goals: "Marriage & future goals",
  communication_pace: "Communication & pace",
  boundaries_safety: "Boundaries & emotional safety",
};
