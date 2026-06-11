-- Bug fix for migration 026.
--
-- The profiles_lock_protected_columns BEFORE UPDATE trigger was meant to
-- pin onboarding_complete (and other integrity columns) for non-service-
-- role connections, while letting our server routes (via the service-role
-- admin client) legitimately update them.
--
-- The original check used `current_user = 'service_role'`. That's always
-- false inside a SECURITY DEFINER function — Postgres resets `current_user`
-- to the function owner (postgres / supabase_admin) for the duration of
-- the SECURITY DEFINER body. The correct call is `session_user`, which
-- reflects the original PostgREST session role set from the JWT and is
-- NOT rewritten by SECURITY DEFINER.
--
-- Symptom this caused: /api/onboarding/complete ran successfully (200
-- response), but the UPDATE statement that set onboarding_complete = true
-- was silently reverted by the trigger to its OLD value (false), so users
-- arriving at /discover got the "Complete onboarding first" 403. The
-- write happened, the UPDATE COUNT was 1, the trigger just clobbered the
-- new value before it was written.

create or replace function public.profiles_lock_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- session_user is the role PostgREST set from the JWT (service_role,
  -- authenticated, anon). current_user would point at the function owner
  -- inside this SECURITY DEFINER body, which is why the previous version
  -- couldn't distinguish admin writes from user writes.
  if session_user = 'service_role' then
    return new;
  end if;
  new.onboarding_complete := old.onboarding_complete;
  new.questionnaire_version := old.questionnaire_version;
  new.photo_guidelines_acknowledged := old.photo_guidelines_acknowledged;
  new.created_at := old.created_at;
  new.last_active_at := old.last_active_at;
  return new;
end$$;

comment on function public.profiles_lock_protected_columns() is
  'Pins integrity columns for non-service-role updates. Service-role connections (server routes via the admin client) bypass via session_user = ''service_role''.';
