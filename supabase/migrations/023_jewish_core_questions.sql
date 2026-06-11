-- Three mandatory dealbreaker questions for the Shidduch View / Marriage View audience.
-- These run BEFORE every other question (sort_order 0 / -1 / -2) and are both
-- required (cannot complete onboarding without answering) and dealbreakers
-- (mismatched answers force compatibility score to 0, hiding the pair from Discover).
--
-- Idempotent: uses NOT EXISTS guards keyed by exact prompt so re-running the
-- migration won't double-seed.

do $$
begin
  if not exists (select 1 from public.questions where prompt = 'Are you Jewish?') then
    insert into public.questions (version, sort_order, section, prompt, answer_type, options, weight, required, dealbreaker)
    values (1, -3, 'About you', 'Are you Jewish?', 'single',
            '["Yes","No"]'::jsonb, 5, true, true);
  end if;

  if not exists (select 1 from public.questions where prompt = 'Do you keep Shabbat?') then
    insert into public.questions (version, sort_order, section, prompt, answer_type, options, weight, required, dealbreaker)
    values (1, -2, 'About you', 'Do you keep Shabbat?', 'single',
            '["Yes","No"]'::jsonb, 5, true, true);
  end if;

  if not exists (select 1 from public.questions where prompt = 'Do you keep kosher?') then
    insert into public.questions (version, sort_order, section, prompt, answer_type, options, weight, required, dealbreaker)
    values (1, -1, 'About you', 'Do you keep kosher?', 'single',
            '["Yes","No"]'::jsonb, 5, true, true);
  end if;
end$$;

-- If the discover compatibility cache exists, wipe it so the new dealbreakers
-- recompute on first read instead of returning stale "they're a match" scores.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'discover_compatibility_cache'
  ) then
    delete from public.discover_compatibility_cache;
  end if;
end$$;
