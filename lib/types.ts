export type AnswerType = "single" | "multi" | "likert" | "text" | "number";

export type QuestionRow = {
  id: string;
  version: number;
  sort_order: number;
  section: string | null;
  prompt: string;
  answer_type: AnswerType;
  options: unknown;
  weight: number;
  required: boolean;
  dealbreaker: boolean;
};

export type ProfileRow = {
  id: string;
  display_name: string;
  birth_year: number | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  bio: string;
  gender: string | null;
  seeking: string | null;
  age_min: number;
  age_max: number;
  max_distance_km: number;
  photo_urls: string[];
  questionnaire_version: number;
  onboarding_complete: boolean;
  /** Set by migration 002; used for discover recency ranking. */
  last_active_at?: string | null;
  /** Migration 008 — MVP admin-reviewed photo verification. */
  photo_verification_status?: "none" | "pending" | "verified" | "rejected";
  photo_verified_at?: string | null;
  verification_selfie_path?: string | null;
  /** Saved daily icebreaker replies; jsonb array of IcebreakerAnswerEntry. */
  icebreaker_answers?: unknown;
  /** Retention notification category toggles (migration 014). */
  notification_prefs?: unknown;
};

/** One saved icebreaker (daily prompt) answer; stored in profiles.icebreaker_answers. */
export type IcebreakerAnswerEntry = {
  day: string;
  slot: number;
  prompt: string;
  answer: string;
  updated_at: string;
};

export type PublicProfile = Pick<
  ProfileRow,
  | "id"
  | "display_name"
  | "birth_year"
  | "city"
  | "bio"
  | "gender"
  | "photo_urls"
> & {
  /** True when `photo_verification_status === "verified"` (public signal on Discover). */
  photo_verified: boolean;
};

/** Curated row from `GET /api/profiles/[userId]/viewer` (no lat/lng or verification selfie). */
export type ViewerProfile = {
  id: string;
  display_name: string;
  birth_year: number | null;
  city: string | null;
  bio: string;
  gender: string | null;
  seeking: string | null;
  age_min: number;
  age_max: number;
  max_distance_km: number;
  photo_urls: string[];
  photo_verified: boolean;
  questionnaire_version: number;
  /** Recent icebreaker Q&A the member chose to save (newest first). */
  icebreaker_snippets?: IcebreakerAnswerEntry[];
};

/** Explainable compatibility payload from /api/discover. */
export type MatchInsight = {
  totalPercent: number;
  hardFail: boolean;
  reasons: string[];
  categoryBreakdown: Record<
    string,
    { percent: number; points: number; maxPoints: number }
  >;
};

/** `GET /api/matches/[matchId]/common-answers` — shared questionnaire overlaps in chat. */
export type CommonAnswerItem = {
  questionId: string;
  section: string | null;
  prompt: string;
  answer_type: AnswerType;
  agreedLabel: string;
};

export type CommonAnswersPayload = {
  items: CommonAnswerItem[];
  versionSelf: number;
  versionOther: number;
  versionMismatch: boolean;
};
