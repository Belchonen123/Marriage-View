import { formatAnswerValue } from "@/lib/questionnaire-display";
import type { QuestionRow } from "@/lib/types";

/** Short lines for the end-of-onboarding “reveal” screen (deterministic, no ML). */
export function buildPersonalityRevealLines(
  questions: QuestionRow[],
  answers: Record<string, unknown>,
): string[] {
  const weighted = [...questions]
    .filter((q) => answers[q.id] != null && answers[q.id] !== "")
    .sort((a, b) => b.weight - a.weight);

  const snippets: string[] = [];
  for (const q of weighted) {
    if (q.answer_type === "text") continue;
    const lab = formatAnswerValue(q, answers[q.id]);
    if (lab === "—" || lab.length > 120) continue;
    snippets.push(lab);
    if (snippets.length >= 4) break;
  }

  const lines: string[] = [];
  if (snippets[0]) {
    lines.push(`You’ve signaled that “${snippets[0]}” matters for how you want to build a life together.`);
  }
  if (snippets[1]) {
    lines.push(`You also align with “${snippets[1]}” — that consistency reads as intentional, not accidental.`);
  }
  if (snippets[2]) {
    lines.push(`Together, those answers suggest someone who leads with clarity and warmth — a strong foundation for serious dating.`);
  }
  if (!lines.length) {
    lines.push(
      "Thanks for starting the questionnaire — as you add answers, your matches and this summary both get sharper.",
    );
  }
  return lines.slice(0, 3);
}
