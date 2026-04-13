import type { AnswerType, QuestionRow } from "@/lib/types";

function optionStrings(q: QuestionRow): string[] {
  return Array.isArray(q.options) ? (q.options as string[]) : [];
}

/** Returns error message or null if value is acceptable for upsert (non-null value). */
export function validateAnswerValueForUpsert(q: QuestionRow, value: unknown): string | null {
  if (value == null) return "Value required (use null at patch key level to clear)";

  const opts = optionStrings(q);

  switch (q.answer_type as AnswerType) {
    case "single":
    case "likert": {
      if (typeof value !== "string") return "Expected string";
      const s = value.trim();
      if (!s) return q.required ? "Answer cannot be empty" : null;
      if (opts.length && !opts.includes(s)) return "Value must be one of the question options";
      return null;
    }
    case "multi": {
      if (!Array.isArray(value)) return "Expected array of strings";
      const arr = value as unknown[];
      if (!arr.every((x) => typeof x === "string")) return "Multi answers must be strings";
      const strings = arr as string[];
      if (q.required && strings.length === 0) return "Select at least one option";
      if (opts.length) {
        for (const s of strings) {
          if (!opts.includes(s)) return "Each value must be one of the question options";
        }
      }
      return null;
    }
    case "number": {
      if (typeof value !== "number" || Number.isNaN(value)) return "Expected a number";
      return null;
    }
    case "text":
    default: {
      if (typeof value !== "string") return "Expected string";
      if (q.required && !value.trim()) return "Answer cannot be empty";
      return null;
    }
  }
}

/** Normalize stored value after validation. */
export function normalizeAnswerForStorage(q: QuestionRow, value: unknown): unknown {
  if (value == null) return null;
  switch (q.answer_type as AnswerType) {
    case "single":
    case "likert":
      return typeof value === "string" ? value.trim() : value;
    case "multi":
      return Array.isArray(value) ? value : value;
    case "number":
      return value;
    case "text":
    default:
      return typeof value === "string" ? value : value;
  }
}

/** After validation + normalize: optional questions may be cleared instead of upserted. */
export function shouldClearOptionalAnswer(q: QuestionRow, normalized: unknown): boolean {
  if (q.required) return false;
  switch (q.answer_type as AnswerType) {
    case "single":
    case "likert":
    case "text":
      return typeof normalized === "string" && normalized.trim() === "";
    case "multi":
      return Array.isArray(normalized) && (normalized as unknown[]).length === 0;
    default:
      return false;
  }
}
