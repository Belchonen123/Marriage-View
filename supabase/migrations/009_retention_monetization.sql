-- Daily prompt answers, match milestones, boost sessions, discover impressions, weekly digest cursor.

-- ---------- Daily prompt (answers only; prompts from app logic) ----------
create table if not exists public.daily_prompt_answers (
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt_day date not null,
  prompt_text text not null,
  answer text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, prompt_day)
);

create index if not exists daily_prompt_answers_day_idx on public.daily_prompt_answers (prompt_day desc);

alter table public.daily_prompt_answers enable row level security;

create policy "daily_prompt_answers_select_own"
  on public.daily_prompt_answers for select
  using (auth.uid() = user_id);

create policy "daily_prompt_answers_insert_own"
  on public.daily_prompt_answers for insert
  with check (auth.uid() = user_id);

create policy "daily_prompt_answers_update_own"
  on public.daily_prompt_answers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- Match connection milestones ----------
create table if not exists public.match_connection_milestones (
  match_id uuid primary key references public.matches (id) on delete cascade,
  first_message_at timestamptz,
  first_call_at timestamptz,
  first_shared_answer_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.match_connection_milestones enable row level security;

create policy "match_milestones_select_participant"
  on public.match_connection_milestones for select
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );

-- Inserts/updates via triggers and service role only — no direct user writes
create or replace function public.bump_match_first_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.match_connection_milestones (match_id, first_message_at, updated_at)
  values (new.match_id, new.created_at, now())
  on conflict (match_id) do update set
    first_message_at = case
      when public.match_connection_milestones.first_message_at is null
        or public.match_connection_milestones.first_message_at > excluded.first_message_at
      then excluded.first_message_at
      else public.match_connection_milestones.first_message_at
    end,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists messages_bump_milestone_trg on public.messages;
create trigger messages_bump_milestone_trg
  after insert on public.messages
  for each row execute procedure public.bump_match_first_message();

create or replace function public.bump_match_first_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.match_connection_milestones (match_id, first_call_at, updated_at)
  values (new.match_id, new.created_at, now())
  on conflict (match_id) do update set
    first_call_at = case
      when public.match_connection_milestones.first_call_at is null
        or public.match_connection_milestones.first_call_at > excluded.first_call_at
      then excluded.first_call_at
      else public.match_connection_milestones.first_call_at
    end,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists call_signals_bump_milestone_trg on public.call_signals;
create trigger call_signals_bump_milestone_trg
  after insert on public.call_signals
  for each row execute procedure public.bump_match_first_call();

-- ---------- Boost sessions ----------
create table if not exists public.boost_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists boost_sessions_user_active_idx
  on public.boost_sessions (user_id, ends_at desc);

alter table public.boost_sessions enable row level security;

create policy "boost_sessions_select_own"
  on public.boost_sessions for select
  using (auth.uid() = user_id);

-- ---------- Discover impressions (views during boost / discover) ----------
create table if not exists public.discover_impressions (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users (id) on delete cascade,
  profile_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists discover_impressions_profile_created_idx
  on public.discover_impressions (profile_user_id, created_at desc);

alter table public.discover_impressions enable row level security;

create policy "discover_impressions_insert_own"
  on public.discover_impressions for insert
  with check (auth.uid() = viewer_id);

create policy "discover_impressions_select_own_profile"
  on public.discover_impressions for select
  using (auth.uid() = profile_user_id or auth.uid() = viewer_id);

-- ---------- Weekly top-pick email dedupe ----------
alter table public.profiles
  add column if not exists last_top_pick_digest_at timestamptz;
