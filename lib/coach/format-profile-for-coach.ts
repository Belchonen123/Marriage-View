import { formatAnswerValue } from "@/lib/questionnaire-display";
import type { IcebreakerAnswerEntry, QuestionRow } from "@/lib/types";

/** Full bio cap for coach system context (separate from legacy short excerpt). */
const BIO_COACH_MAX = 4000;
/** Max chars per questionnaire answer after formatting (text answers can be huge). */
const PER_ANSWER_MAX = 720;
/** Max total chars for the questionnaire subsection. */
const QUESTIONNAIRE_SECTION_BUDGET = 12_000;
const ICEBREAKER_MAX = 6;
const ICEBREAKER_ANSWER_MAX = 400;

function ageFromBirthYear(birthYear: number | null): number | null {
  if (birthYear == null) return null;
  const y = new Date().getFullYear() - birthYear;
  return y > 0 && y < 120 ? y : null;
}

function trimBio(bio: string | null | undefined): string | null {
  if (!bio?.trim()) return null;
  const t = bio.trim();
  return t.length <= BIO_COACH_MAX ? t : `${t.slice(0, BIO_COACH_MAX)}…`;
}

function trimAnswerLine(s: string): string {
  const t = s.trim();
  if (t.length <= PER_ANSWER_MAX) return t;
  return `${t.slice(0, PER_ANSWER_MAX)}…`;
}

function photoVerificationPlain(status: string | null | undefined): string {
  switch (status) {
    case "verified":
      return "Photo verification: verified";
    case "pending":
      return "Photo verification: pending review";
    case "rejected":
      return "Photo verification: not verified";
    case "none":
    default:
      return "Photo verification: not submitted";
  }
}

function parseIcebreakerEntries(raw: unknown): IcebreakerAnswerEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: IcebreakerAnswerEntry[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.prompt !== "string" || typeof o.answer !== "string") continue;
    const day = typeof o.day === "string" ? o.day : "";
    const slot = typeof o.slot === "number" ? o.slot : 0;
    const updated_at = typeof o.updated_at === "string" ? o.updated_at : "";
    out.push({ day, slot, prompt: o.prompt, answer: o.answer, updated_at });
  }
  out.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  return out;
}

export type CoachProfileContextInput = {
  displayName: string;
  city: string | null;
  bio: string | null;
  gender: string | null;
  seeking: string | null;
  ageMin: number;
  ageMax: number;
  birthYear: number | null;
  maxDistanceKm: number;
  questionnaireVersion: number;
  onboardingComplete: boolean;
  photoVerificationStatus: string | null | undefined;
  icebreakerAnswersRaw: unknown;
  matchNote: string | null;
  questions: QuestionRow[];
  answersByQuestionId: Record<string, unknown>;
};

/**
 * Builds the member context block for the coach system prompt: profile, icebreakers,
 * and questionnaire Q&A with size limits.
 */
export function buildCoachProfileContext(input: CoachProfileContextInput): string {
  const age = ageFromBirthYear(input.birthYear);
  const bio = trimBio(input.bio);

  const headerLines = [
    "Context about this member (from their profile and in-app questionnaire; use only for personalization—do not invent facts beyond what appears here; do not recite verbatim unless helpful):",
    `- Name on profile: ${input.displayName || "(not set)"}`,
    input.city ? `- Metro / city: ${input.city}` : null,
    age != null ? `- Approximate age (from birth year): ${age}` : null,
    input.gender ? `- Their gender: ${input.gender}` : null,
    input.seeking ? `- Seeking: ${input.seeking}` : null,
    `- Age preference range they set: ${input.ageMin}–${input.ageMax}`,
    `- Max distance preference: ${input.maxDistanceKm} km`,
    `- Onboarding complete: ${input.onboardingComplete ? "yes" : "no"}`,
    `- Questionnaire version: ${input.questionnaireVersion}`,
    photoVerificationPlain(input.photoVerificationStatus),
    bio ? `- Bio: ${bio}` : null,
  ].filter(Boolean) as string[];

  const ice = parseIcebreakerEntries(input.icebreakerAnswersRaw).slice(0, ICEBREAKER_MAX);
  if (ice.length) {
    headerLines.push("Saved icebreaker replies (recent):");
    for (const e of ice) {
      const ans =
        e.answer.trim().length > ICEBREAKER_ANSWER_MAX
          ? `${e.answer.trim().slice(0, ICEBREAKER_ANSWER_MAX)}…`
          : e.answer.trim();
      headerLines.push(`- Q: ${e.prompt} — A: ${ans}`);
    }
  }

  const qLines: string[] = ["Questionnaire (their answers on file):"];
  let qBudgetUsed = qLines.join("\n").length + 1;

  let omitted = false;
  for (const q of input.questions) {
    const raw = input.answersByQuestionId[q.id];
    if (raw === undefined) continue;
    const formatted = formatAnswerValue(q, raw);
    if (formatted === "—" || !formatted.trim()) continue;

    const section = q.section?.trim();
    const prefix = section ? `[${section}] ` : "";
    const line = `- ${prefix}${q.prompt}: ${trimAnswerLine(formatted)}`;
    const addLen = line.length + 1;
    if (qBudgetUsed + addLen > QUESTIONNAIRE_SECTION_BUDGET) {
      omitted = true;
      break;
    }
    qLines.push(line);
    qBudgetUsed += addLen;
  }

  if (qLines.length === 1) {
    qLines.push("- (No questionnaire answers stored yet.)");
  } else if (omitted) {
    qLines.push("(Additional questionnaire answers omitted for length.)");
  }

  if (input.matchNote) {
    headerLines.push(`- Current chat context: ${input.matchNote}`);
  }

  return [...headerLines, "", ...qLines].join("\n");
}
