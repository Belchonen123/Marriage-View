import { profileCompletenessRatio } from "@/lib/matching/score";
import type { ProfileRow } from "@/lib/types";

export type OnboardingNextStep = { href: string; label: string };

export type OnboardingQuestionRow = { id: string; required: boolean };

/** First blocking step for users who have not finished onboarding (Discover / finish API). */
export function getNextOnboardingStep(
  profile: Pick<
    ProfileRow,
    | "display_name"
    | "birth_year"
    | "gender"
    | "photo_urls"
    | "questionnaire_version"
    | "onboarding_complete"
  >,
  requiredQuestionIdsInOrder: string[],
  answeredQuestionIds: Set<string>,
): OnboardingNextStep | null {
  if (profile.onboarding_complete) return null;

  if (!profile.display_name?.trim() || profile.birth_year == null) {
    return {
      href: "/onboarding/profile#onboarding-basics",
      label: "Add your name and birth year",
    };
  }

  const g = profile.gender;
  if (g !== "woman" && g !== "man") {
    return {
      href: "/onboarding/profile#onboarding-partner-prefs",
      label: "Choose your gender",
    };
  }

  for (const qid of requiredQuestionIdsInOrder) {
    if (!answeredQuestionIds.has(qid)) {
      return {
        href: `/onboarding/quiz?q=${encodeURIComponent(qid)}`,
        label: "Answer required questionnaire items",
      };
    }
  }

  const urls = (profile.photo_urls as string[]) ?? [];
  if (urls.length < 1) {
    return {
      href: "/onboarding/photos",
      label: "Add a photo",
    };
  }

  return {
    href: "/onboarding/photos",
    label: "Finish onboarding",
  };
}

export function computeOnboardingProgress(
  p: ProfileRow,
  questionsOrdered: OnboardingQuestionRow[],
  answerRows: { question_id: string }[],
): {
  percent: number;
  segments: { profile: number; questionnaire: number; photos: number };
  nextStep: OnboardingNextStep | null;
} {
  const totalQ = questionsOrdered.length || 1;
  const answeredSet = new Set(answerRows.map((r) => r.question_id as string));
  const answered = answeredSet.size;
  const quizRatio = answered / totalQ;
  const profRatio = profileCompletenessRatio(p);
  const photoN = (p.photo_urls ?? []).length;
  const photoRatio = Math.min(1, photoN / 3);
  const percent = Math.min(
    100,
    Math.round(100 * (profRatio * 0.35 + quizRatio * 0.45 + photoRatio * 0.2)),
  );
  const requiredOrdered = questionsOrdered.filter((q) => q.required).map((q) => q.id);
  const nextStep = getNextOnboardingStep(p, requiredOrdered, answeredSet);

  return {
    percent,
    segments: {
      profile: Math.round(profRatio * 100),
      questionnaire: Math.round(quizRatio * 100),
      photos: Math.round(photoRatio * 100),
    },
    nextStep,
  };
}
