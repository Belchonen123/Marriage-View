-- Daily icebreaker answers saved on profile (no dependency on daily_prompt_answers.slot).
-- Each entry: { "day": "YYYY-MM-DD", "slot": 0-4, "prompt": text, "answer": text, "updated_at": timestamptz }

alter table public.profiles
  add column if not exists icebreaker_answers jsonb not null default '[]'::jsonb;

comment on column public.profiles.icebreaker_answers is
  'Array of user-saved daily icebreaker Q&A; shown on their discoverable profile.';
