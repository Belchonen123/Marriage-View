-- Second attempt at fixing the profiles_lock_protected_columns trigger.
--
-- Migration 026 used `current_user = 'service_role'` inside a SECURITY
-- DEFINER function. That's wrong: SECURITY DEFINER rebinds current_user
-- to the function owner.
--
-- Migration 028 swapped to `session_user`. Also wrong: PostgREST uses
-- `SET LOCAL ROLE` to switch roles per request, which affects current_user
-- but NOT session_user. session_user stays at the connection authenticator
-- (postgres / authenticator) regardless of the JWT.
--
-- The fix that actually works:
--   1. Drop SECURITY DEFINER so the trigger runs as the calling role.
--      Then `current_user` reflects what PostgREST set via SET LOCAL ROLE
--      (service_role / authenticated / anon).
--   2. Belt-and-suspenders: also check the JWT role claim directly via
--      current_setting('request.jwt.claim.role'). Works regardless of
--      SECURITY DEFINER setting.
--
-- The function still needs ownership privilege over the protected columns;
-- as the trigger fires on UPDATE, just modifying NEW doesn't require
-- elevated privilege. SECURITY INVOKER (the default when omitted) is
-- fine here.

create or replace function public.profiles_lock_protected_columns()
returns trigger
language plpgsql
-- No SECURITY DEFINER — defaults to SECURITY INVOKER so current_user
-- reflects the SET LOCAL ROLE PostgREST set from the JWT.
set search_path = public
as $$
declare
  v_jwt_role text;
begin
  -- Two independent ways to detect a service-role caller. If either
  -- says service_role, bypass the lock.
  v_jwt_role := coalesce(
    current_setting('request.jwt.claim.role', true),
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    ''
  );

  if current_user = 'service_role' or v_jwt_role = 'service_role' then
    return new;
  end if;

  -- Lock for anon / authenticated callers — they can update mutable
  -- columns but the integrity columns are pinned to OLD.
  new.onboarding_complete := old.onboarding_complete;
  new.questionnaire_version := old.questionnaire_version;
  new.photo_guidelines_acknowledged := old.photo_guidelines_acknowledged;
  new.created_at := old.created_at;
  new.last_active_at := old.last_active_at;
  return new;
end$$;

-- Sanity check the trigger is still attached. If it isn't (e.g. dropped
-- by a previous attempted fix), reattach it.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'profiles_lock_protected_columns'
      and tgrelid = 'public.profiles'::regclass
  ) then
    execute 'create trigger profiles_lock_protected_columns
             before update on public.profiles
             for each row execute function public.profiles_lock_protected_columns()';
  end if;
end$$;

comment on function public.profiles_lock_protected_columns() is
  'Pins integrity columns for anon/authenticated UPDATE callers. Service-role connections (server routes via the admin client) bypass via either current_user or the JWT role claim.';
