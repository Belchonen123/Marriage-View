-- Allow up to 5 icebreaker prompts per day (slot 0–4) per user.

alter table public.daily_prompt_answers
  add column if not exists slot smallint not null default 0;

alter table public.daily_prompt_answers
  drop constraint if exists daily_prompt_answers_pkey;

alter table public.daily_prompt_answers
  add constraint daily_prompt_answers_pkey primary key (user_id, prompt_day, slot);

alter table public.daily_prompt_answers
  add constraint daily_prompt_answers_slot_range check (slot >= 0 and slot < 5);
