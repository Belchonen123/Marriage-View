import type { AnswerType, QuestionRow } from "@/lib/types";

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
  return [];
}

/** Human-readable label for a stored answer (for match insights UI). */
export function formatAnswerValue(q: QuestionRow, value: unknown): string {
  if (value == null) return "—";
  switch (q.answer_type as AnswerType) {
    case "single":
    case "likert":
      return String(value);
    case "multi": {
      const arr = asStringArray(value);
      return arr.length ? arr.join(", ") : "—";
    }
    case "number":
      return String(value);
    case "text":
    default: {
      const t = String(value).trim();
      return t || "—";
    }
  }
}
