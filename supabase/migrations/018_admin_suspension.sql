-- Platform moderation: hide suspended users from Discover (API + RLS) and block key actions via app routes.

alter table public.profiles
  add column if not exists admin_suspended boolean not null default false;

comment on column public.profiles.admin_suspended is
  'When true, user is suspended by admins: excluded from Discover for others, cannot use Discover/interact/messages/video (enforced in API).';

-- Hide suspended profiles from other authenticated users (own row still readable via profiles_select_own).
drop policy if exists "profiles_select_others" on public.profiles;
create policy "profiles_select_others"
  on public.profiles for select
  using (
    auth.uid() is not null
    and id <> auth.uid()
    and onboarding_complete = true
    and coalesce(admin_suspended, false) = false
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = id)
        or (b.blocker_id = id and b.blocked_id = auth.uid())
    )
  );
