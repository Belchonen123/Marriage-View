import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { setCustomModerationWords } from "@/lib/moderation/profanity";

/** Pulls admin-curated word rows and pushes them into the in-memory scanner. */
export async function loadCustomModerationWords(admin: SupabaseClient): Promise<void> {
  try {
    const { data, error } = await admin
      .from("moderation_words")
      .select("word, flag");
    if (error) {
      // Table not yet migrated — silently fall back to built-in lists.
      const m = (error.message ?? "").toLowerCase();
      if (m.includes("moderation_words") && (m.includes("does not exist") || m.includes("could not find"))) {
        setCustomModerationWords({});
        return;
      }
      setCustomModerationWords({});
      return;
    }
    const grouped: { profanity: string[]; sexual: string[]; contact: string[] } = {
      profanity: [],
      sexual: [],
      contact: [],
    };
    for (const row of data ?? []) {
      const word = ((row.word as string) ?? "").trim();
      const flag = row.flag as "profanity" | "sexual" | "contact";
      if (!word) continue;
      if (flag === "profanity" || flag === "sexual" || flag === "contact") {
        grouped[flag].push(word);
      }
    }
    setCustomModerationWords(grouped);
  } catch {
    setCustomModerationWords({});
  }
}
