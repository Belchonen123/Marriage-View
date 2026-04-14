import { createHash } from "crypto";

import type { QuestionRow } from "@/lib/types";

/**
 * Stable hash of the active question bank (viewer’s version). Invalidates discover
 * compatibility cache rows when admins change weights, dealbreakers, or answer types.
 */
export function hashQuestionBankForCache(questions: QuestionRow[]): string {
  const sorted = [...questions].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted
    .map(
      (q) =>
        `${q.id}|${Number(q.weight) || 0}|${q.dealbreaker ? 1 : 0}|${q.answer_type}|${q.section ?? ""}`,
    )
    .join("\n");
  return createHash("sha256").update(payload).digest("hex");
}
