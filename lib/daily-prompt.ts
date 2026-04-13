/** Deterministic community prompts; each UTC day surfaces a batch of icebreakers. */

export const ICE_BREAKERS_PER_DAY = 5;

const PROMPTS: string[] = [
  "What is one value you hope your future spouse shares without needing to negotiate it?",
  "How do you prefer to resolve tension after a disagreement?",
  "What does rest look like for you — and how often do you need it?",
  "What role do your parents or extended family play in your life decisions today?",
  "What is a dream you are actively working toward this year?",
  "How do you like to celebrate small wins?",
  "What is something you are learning to be patient with in yourself?",
  "What does financial teamwork mean to you in marriage?",
  "How do you recharge when you feel spiritually or emotionally dry?",
  "What is a boundary you are proud of keeping lately?",
  "What is your favorite way to serve others in your community?",
  "What is a tradition you would like to build in a future family?",
  "How do you stay connected to friends when life gets busy?",
  "What is a book or teaching that recently challenged you?",
  "What does “home” mean to you beyond four walls?",
];

export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function hashDayToSeed(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic shuffle of prompt indices; take first `count` unique icebreakers for the day. */
export function icebreakerIndicesForDay(day: string, count: number): number[] {
  const n = PROMPTS.length;
  const k = Math.min(count, n);
  if (k === 0) return [];

  let seed = hashDayToSeed(day);
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const a = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = a;
  }
  return idx.slice(0, k);
}

export function dailyIcebreakersForUtcDate(d: Date): {
  day: string;
  prompts: string[];
  indices: number[];
} {
  const day = utcDayKey(d);
  const indices = icebreakerIndicesForDay(day, ICE_BREAKERS_PER_DAY);
  const prompts = indices.map((i) => PROMPTS[i]!);
  return { day, prompts, indices };
}

/** First icebreaker of the day (backward compatible). */
export function dailyPromptForUtcDate(d: Date): { day: string; prompt: string } {
  const { day, prompts } = dailyIcebreakersForUtcDate(d);
  return { day, prompt: prompts[0] ?? "" };
}
