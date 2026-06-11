/**
 * Lightweight server-side moderation scanner. Not perfect — meant to surface
 * candidate strings for an admin to review, not to be the final word.
 *
 * Heuristic flags:
 *   - "profanity"   common English curse words (whole-word, case-insensitive)
 *   - "sexual"      explicit sexual vocabulary that has no place in profile copy
 *   - "contact"     phone numbers, emails, or external chat handles (off-platform funnels)
 *
 * NOTE: keep the word lists deliberately small. Bigger lists = more false
 * positives on a marriage-focused product where members talk about family,
 * children, etc. Add words as moderators observe abuse, don't bulk-import
 * generic blocklists.
 */

const PROFANITY_WORDS = [
  "fuck",
  "fucking",
  "shit",
  "bitch",
  "bastard",
  "asshole",
  "dick",
  "douche",
  "piss",
  "slut",
  "whore",
  "cunt",
  "motherfucker",
  "wtf",
  "stfu",
] as const;

const SEXUAL_WORDS = [
  "sex",
  "sexy",
  "horny",
  "naked",
  "nude",
  "nudes",
  "boobs",
  "tits",
  "ass",
  "blowjob",
  "handjob",
  "porn",
  "xxx",
  "nsfw",
  "fwb",
  "hookup",
  "hookups",
  "hooking up",
  "one night",
  "onenight",
  "kinky",
  "kink",
  "bdsm",
  "dtf",
  "netflix and chill",
] as const;

const PHONE_RE = /(?:\+?\d[\s\-\.]?){7,}/;
const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;
// Off-platform handle attempts (snapchat/insta/telegram/whatsapp/kik/discord/wechat)
const HANDLE_RE =
  /\b(?:snap(?:chat)?|insta(?:gram)?|ig|telegram|whats?app|wa|kik|discord|wechat|line|signal)\b[ \t:@\-]*[a-z0-9_.\-]{2,}/i;

export type ModerationFlag = "profanity" | "sexual" | "contact";

export type ModerationHit = {
  flag: ModerationFlag;
  match: string;
};

function buildWordRegex(words: readonly string[]): RegExp | null {
  if (!words.length) return null;
  const parts = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(?:${parts.join("|")})\\b`, "i");
}

const BUILTIN_PROFANITY_RE = buildWordRegex(PROFANITY_WORDS);
const BUILTIN_SEXUAL_RE = buildWordRegex(SEXUAL_WORDS);

/**
 * Custom admin-added word regexes (set by lib/moderation/load-custom-words.ts
 * before scanning, then read by scanForModeration). They're scanned IN ADDITION
 * to the built-in word lists.
 */
let customProfanityRe: RegExp | null = null;
let customSexualRe: RegExp | null = null;
let customContactRe: RegExp | null = null;

export function setCustomModerationWords(words: {
  profanity?: string[];
  sexual?: string[];
  contact?: string[];
}): void {
  customProfanityRe = buildWordRegex(words.profanity ?? []);
  customSexualRe = buildWordRegex(words.sexual ?? []);
  customContactRe = buildWordRegex(words.contact ?? []);
}

function firstMatch(text: string, ...patterns: (RegExp | null)[]): string | null {
  for (const p of patterns) {
    if (!p) continue;
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

/** Returns at most one hit per flag (we just need to know it's suspect). */
export function scanForModeration(text: string | null | undefined): ModerationHit[] {
  if (!text) return [];
  const hits: ModerationHit[] = [];
  const lower = text.toLowerCase();

  const p = firstMatch(lower, BUILTIN_PROFANITY_RE, customProfanityRe);
  if (p) hits.push({ flag: "profanity", match: p });

  const s = firstMatch(lower, BUILTIN_SEXUAL_RE, customSexualRe);
  if (s) hits.push({ flag: "sexual", match: s });

  const phone = text.match(PHONE_RE);
  if (phone) hits.push({ flag: "contact", match: phone[0].trim() });
  const email = text.match(EMAIL_RE);
  if (email) hits.push({ flag: "contact", match: email[0] });
  const handle = text.match(HANDLE_RE);
  if (handle) hits.push({ flag: "contact", match: handle[0] });
  const customContact = firstMatch(lower, customContactRe);
  if (customContact) hits.push({ flag: "contact", match: customContact });

  return hits;
}

export function hasAnyFlag(text: string | null | undefined): boolean {
  return scanForModeration(text).length > 0;
}

/** Truncate around the first hit for preview UI. */
export function previewWithHit(text: string, hit: ModerationHit, radius = 40): string {
  const i = text.toLowerCase().indexOf(hit.match.toLowerCase());
  if (i < 0) return text.slice(0, 120);
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + hit.match.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end) + suffix;
}
