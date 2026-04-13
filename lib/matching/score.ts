import type { AnswerType, PublicProfile, QuestionRow } from "@/lib/types";

export type ScoreResult = {
  score: number;
  maxScore: number;
  hardFail: boolean;
};

/** Multipliers for questionnaire sections (by normalized category key). */
export const CATEGORY_MULTIPLIERS: Record<string, number> = {
  values: 1.2,
  lifestyle: 1.05,
  religion: 1.15,
  family: 1.25,
  goals: 1.2,
  communication: 1.1,
  general: 1,
};

export type CategoryBreakdownEntry = {
  percent: number;
  points: number;
  maxPoints: number;
};

export type ExplainableScore = {
  /** 0–100 before dealbreaker; 0 if dealbreaker triggered. */
  totalPercent: number;
  hardFail: boolean;
  dealbreakerPrompt: string | null;
  categoryBreakdown: Record<string, CategoryBreakdownEntry>;
  /** Up to 3 short, human-readable positives (empty if dealbreaker). */
  reasons: string[];
};

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
  return [];
}

/** Map DB `section` text to a category key for weighting. */
export function resolveCategoryKey(section: string | null): string {
  if (!section) return "general";
  const s = section.toLowerCase();
  if (/value|principle|belief|faithful/i.test(s)) return "values";
  if (/life|habit|daily|routine|fitness|diet|money|financ|budget|debt|home|chore/i.test(s))
    return "lifestyle";
  if (/relig|spiritual|denomination|church|mosque/i.test(s)) return "religion";
  if (/family|children|kid|parent|in.?law|extended family/i.test(s)) return "family";
  if (/goal|future|career|marriage|vision|long.?term|commitment timeline/i.test(s)) return "goals";
  if (/communicat|conflict|emotion|honest|intimacy|affection|boundary/i.test(s)) return "communication";
  return "general";
}

export function categoryMultiplierForSection(section: string | null): number {
  const k = resolveCategoryKey(section);
  return CATEGORY_MULTIPLIERS[k] ?? CATEGORY_MULTIPLIERS.general;
}

/** True when both sides gave the same answer (used for “things in common” in chat). */
export function answersExactlyEqual(q: QuestionRow, a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false;
  switch (q.answer_type as AnswerType) {
    case "single":
    case "likert":
      return String(a) === String(b);
    case "multi": {
      const A = new Set(asStringArray(a));
      const B = new Set(asStringArray(b));
      if (A.size !== B.size) return false;
      for (const x of A) if (!B.has(x)) return false;
      return true;
    }
    case "number": {
      const na = Number(a);
      const nb = Number(b);
      return !Number.isNaN(na) && !Number.isNaN(nb) && na === nb;
    }
    case "text":
    default:
      return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  }
}

function similarityForQuestion(
  q: QuestionRow,
  a: unknown,
  b: unknown,
): { s: number; w: number; hardFail: boolean } {
  const w = Number(q.weight) || 0;
  if (a == null || b == null) return { s: 0, w, hardFail: false };

  switch (q.answer_type as AnswerType) {
    case "single": {
      const same = String(a) === String(b);
      if (q.dealbreaker && !same) return { s: 0, w, hardFail: true };
      return { s: same ? 1 : 0, w, hardFail: false };
    }
    case "likert": {
      const opts = asStringArray(q.options);
      const ia = opts.indexOf(String(a));
      const ib = opts.indexOf(String(b));
      if (ia < 0 || ib < 0) return { s: 0, w, hardFail: false };
      const span = Math.max(1, opts.length - 1);
      const sim = 1 - Math.abs(ia - ib) / span;
      return { s: sim, w, hardFail: false };
    }
    case "multi": {
      const A = new Set(asStringArray(a));
      const B = new Set(asStringArray(b));
      if (A.size === 0 && B.size === 0) return { s: 1, w, hardFail: false };
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      const union = A.size + B.size - inter;
      const j = union === 0 ? 0 : inter / union;
      if (q.dealbreaker && j < 0.5) return { s: 0, w, hardFail: true };
      return { s: j, w, hardFail: false };
    }
    case "number": {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isNaN(na) || Number.isNaN(nb)) return { s: 0, w, hardFail: false };
      const diff = Math.abs(na - nb);
      const sim = 1 / (1 + diff);
      return { s: sim, w, hardFail: false };
    }
    case "text":
    default: {
      const same = String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
      return { s: same ? 1 : 0.35, w: w * 0.5, hardFail: false };
    }
  }
}

function truncatePrompt(prompt: string, max = 56): string {
  const t = prompt.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Weighted, explainable compatibility: category multipliers, same per-question logic,
 * dealbreakers force total score to 0 with a clear reason.
 */
export function scorePairExplain(
  questions: QuestionRow[],
  answersA: Record<string, unknown>,
  answersB: Record<string, unknown>,
): ExplainableScore {
  let rawScore = 0;
  let maxRaw = 0;
  let hardFail = false;
  let dealbreakerPrompt: string | null = null;

  const byCategory: Record<string, { num: number; den: number }> = {};
  const reasonCandidates: { prompt: string; contribution: number; sim: number }[] = [];

  for (const q of questions) {
    const a = answersA[q.id];
    const b = answersB[q.id];
    const { s, w, hardFail: hf } = similarityForQuestion(q, a, b);
    const cat = resolveCategoryKey(q.section);
    const mult = categoryMultiplierForSection(q.section);
    const effW = w * mult;

    if (hf) {
      hardFail = true;
      if (!dealbreakerPrompt) dealbreakerPrompt = q.prompt;
    }

    maxRaw += effW;
    rawScore += effW * s;

    if (!byCategory[cat]) byCategory[cat] = { num: 0, den: 0 };
    byCategory[cat].den += effW;
    byCategory[cat].num += effW * s;

    if (s >= 0.45 && effW > 0) {
      reasonCandidates.push({
        prompt: q.prompt,
        contribution: effW * s,
        sim: s,
      });
    }
  }

  const categoryBreakdown: Record<string, CategoryBreakdownEntry> = {};
  for (const [k, v] of Object.entries(byCategory)) {
    const maxPoints = v.den;
    const points = v.num;
    categoryBreakdown[k] = {
      maxPoints,
      points,
      percent: maxPoints > 0 ? Math.round((points / maxPoints) * 1000) / 10 : 0,
    };
  }

  if (hardFail) {
    return {
      totalPercent: 0,
      hardFail: true,
      dealbreakerPrompt,
      categoryBreakdown,
      reasons: dealbreakerPrompt
        ? [
            `Dealbreaker: you answered differently on "${truncatePrompt(dealbreakerPrompt, 72)}". This area matters for long-term fit.`,
          ]
        : ["Dealbreaker: incompatible on a must-align question."],
    };
  }

  const totalPercent = maxRaw > 0 ? Math.round((rawScore / maxRaw) * 1000) / 10 : 0;

  reasonCandidates.sort((x, y) => y.contribution - x.contribution);
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const r of reasonCandidates) {
    if (reasons.length >= 3) break;
    const key = r.prompt.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.sim >= 0.92) {
      reasons.push(`Strong alignment on: ${truncatePrompt(r.prompt)}`);
    } else if (r.sim >= 0.75) {
      reasons.push(`Similar views on: ${truncatePrompt(r.prompt)}`);
    } else {
      reasons.push(`Overlap on: ${truncatePrompt(r.prompt)}`);
    }
  }

  return {
    totalPercent,
    hardFail: false,
    dealbreakerPrompt: null,
    categoryBreakdown,
    reasons: reasons.slice(0, 3),
  };
}

export function scorePair(
  questions: QuestionRow[],
  answersA: Record<string, unknown>,
  answersB: Record<string, unknown>,
): ScoreResult {
  const ex = scorePairExplain(questions, answersA, answersB);
  let maxScore = 0;
  let score = 0;
  for (const q of questions) {
    const a = answersA[q.id];
    const b = answersB[q.id];
    const { s, w } = similarityForQuestion(q, a, b);
    const mult = categoryMultiplierForSection(q.section);
    const effW = Number(w) * mult;
    maxScore += effW;
    if (!ex.hardFail) score += effW * s;
  }
  if (ex.hardFail) return { score: 0, maxScore, hardFail: true };
  return { score, maxScore, hardFail: false };
}

export function normalizedScore(result: ScoreResult): number {
  if (result.maxScore <= 0) return 0;
  return result.score / result.maxScore;
}

/** 0–1 profile completeness for ranking boost. */
export function profileCompletenessRatio(p: {
  display_name: string;
  bio: string;
  birth_year: number | null;
  city: string | null;
  photo_urls: string[];
}): number {
  let pts = 0;
  const max = 5;
  if (p.display_name?.trim().length >= 2) pts++;
  if ((p.bio?.trim().length ?? 0) >= 20) pts++;
  if (p.birth_year != null) pts++;
  if (p.city?.trim()) pts++;
  if ((p.photo_urls?.length ?? 0) >= 1) pts++;
  return pts / max;
}

/**0–1 recency boost from last_active_at (older = lower). */
export function recencyBoost(lastActiveAt: string | null | undefined, now = Date.now()): number {
  if (!lastActiveAt) return 0.65;
  const t = new Date(lastActiveAt).getTime();
  if (Number.isNaN(t)) return 0.65;
  const days = (now - t) / (86400 * 1000);
  if (days <= 1) return 1;
  if (days <= 7) return 0.9;
  if (days <= 30) return 0.75;
  return 0.6;
}

/** Map message count in window to 0–1 engagement factor. */
export function engagementFactor(messageCount: number): number {
  if (messageCount <= 0) return 0.5;
  return Math.min(1, 0.5 + Math.log1p(messageCount) / 8);
}

export function ageFromBirthYear(birthYear: number | null, now = new Date()): number | null {
  if (birthYear == null) return null;
  return now.getFullYear() - birthYear;
}

export function passesAgePreference(
  viewer: { age_min: number; age_max: number },
  candidateBirthYear: number | null,
): boolean {
  const age = ageFromBirthYear(candidateBirthYear);
  if (age == null) return true;
  return age >= viewer.age_min && age <= viewer.age_max;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Deterministic shuffle within score tiers to diversify consecutive cards. */
export function diversifyByScoreTier<T extends { rankScore: number; profile: PublicProfile }>(
  items: T[],
  viewerId: string,
): T[] {
  const tiers = new Map<number, T[]>();
  for (const it of items) {
    const tier = Math.round(it.rankScore * 100) / 100;
    if (!tiers.has(tier)) tiers.set(tier, []);
    tiers.get(tier)!.push(it);
  }
  const sortedTiers = [...tiers.keys()].sort((a, b) => b - a);
  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  const out: T[] = [];
  for (const t of sortedTiers) {
    const g = tiers.get(t)!;
    g.sort((a, b) => {
      const ka = `${viewerId}:${a.profile.id}`;
      const kb = `${viewerId}:${b.profile.id}`;
      return hash(ka) - hash(kb);
    });
    out.push(...g);
  }
  return out;
}
