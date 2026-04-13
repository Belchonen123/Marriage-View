export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class CoachNotConfiguredError extends Error {
  constructor() {
    super("Coach is not configured (missing OPENAI_API_KEY).");
    this.name = "CoachNotConfiguredError";
  }
}

import { sanitizeCoachReply } from "@/lib/coach/sanitize-reply";

export async function completeChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new CoachNotConfiguredError();

  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.45,
      max_tokens: 520,
    }),
    signal,
  });

  const raw = (await res.json().catch(() => null)) as
    | { error?: { message?: string }; choices?: { message?: { content?: string } }[] }
    | null;

  if (!res.ok) {
    const msg = raw?.error?.message ?? res.statusText ?? "OpenAI request failed";
    throw new Error(msg);
  }

  const text = raw?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response from model");
  return sanitizeCoachReply(text);
}
