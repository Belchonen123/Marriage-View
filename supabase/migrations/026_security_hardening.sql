-- Security hardening per external code review.
--
-- 1. profiles UPDATE policy had USING but no WITH CHECK. A motivated user
--    with the public anon key could write integrity columns directly
--    (onboarding_complete, latitude, longitude, etc.). Adding WITH CHECK
--    blocks them from writing rows they don't own — but field-level
--    protection still needs a server-side allowlist (see /api/profile).
--
-- 2. Same gap is present on other tables that ship USING-only policies.
--    Audited everything writable; this migration patches what we found.

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Lock down columns the client must NEVER write directly, by reverting
-- them to their previous value on any UPDATE that didn't originate from
-- a service-role context. Service role bypasses RLS *and* this trigger
-- (we explicitly opt-out via session var so /api/profile and admin
-- endpoints can still update).
create or replace function public.profiles_lock_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role connections (PostgREST sets current_user='service_role'
  -- for service-role JWTs) bypass the lock — that's our server routes
  -- and admin code. Everyone else (authenticated, anon) has protected
  -- columns reverted to OLD values.
  if current_user = 'service_role' then
    return new;
  end if;
  new.onboarding_complete := old.onboarding_complete;
  new.questionnaire_version := old.questionnaire_version;
  new.photo_guidelines_acknowledged := old.photo_guidelines_acknowledged;
  new.created_at := old.created_at;
  new.last_active_at := old.last_active_at;
  return new;
end$$;

drop trigger if exists profiles_lock_protected_columns on public.profiles;
create trigger profiles_lock_protected_columns
  before update on public.profiles
  for each row
  execute function public.profiles_lock_protected_columns();

-- Coach rate limit table. One row per user per UTC day.
create table if not exists public.coach_usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  request_count int not null default 0,
  primary key (user_id, usage_date)
);

alter table public.coach_usage_daily enable row level security;
-- No client policies — server-only via service role.

comment on table public.coach_usage_daily is
  'Per-user-per-day coach request counts. Server-only; gates OpenAI spend.';
