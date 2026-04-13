-- Match journal (private reflections), notification prefs, ranking personalization, notification metadata.

-- ---------- Match journal ----------
create table public.match_journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  mood text not null check (mood in ('great', 'good', 'neutral', 'unsure', 'not_a_fit')),
  note text not null default '' check (char_length(note) <= 2000),
  call_occurred_at timestamptz,
  created_at timestamptz not null default now()
);

create index match_journal_entries_user_idx on public.match_journal_entries (user_id, created_at desc);
create index match_journal_entries_match_idx on public.match_journal_entries (match_id);

alter table public.match_journal_entries enable row level security;

create policy "match_journal_select_own"
  on public.match_journal_entries for select
  using (auth.uid() = user_id);

create policy "match_journal_insert_own"
  on public.match_journal_entries for insert
  with check (auth.uid() = user_id);

create policy "match_journal_update_own"
  on public.match_journal_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "match_journal_delete_own"
  on public.match_journal_entries for delete
  using (auth.uid() = user_id);

-- ---------- Notification preferences (per user, JSON) ----------
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{
    "retention_journal": true,
    "retention_reengage": true,
    "retention_weekly_hint": true
  }'::jsonb;

comment on column public.profiles.notification_prefs is 'User toggles for retention notification categories.';

-- ---------- user_notifications metadata ----------
alter table public.user_notifications
  add column if not exists metadata jsonb;

-- ---------- Discover ranking personalization (bounded multiplier) ----------
create table public.user_ranking_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  engagement_multiplier numeric not null default 1.0
    check (engagement_multiplier >= 0.94 and engagement_multiplier <= 1.06),
  journal_entries_30d integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_ranking_prefs enable row level security;

create policy "user_ranking_prefs_select_own"
  on public.user_ranking_prefs for select
  using (auth.uid() = user_id);

-- Updates via service role cron only (no insert/update for authenticated)
