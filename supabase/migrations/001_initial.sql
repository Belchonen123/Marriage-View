  -- Marriage-focused dating app — schema, RLS, triggers, storage
  -- Run in Supabase SQL editor or via CLI.
  -- If anything "already exists", do not re-run this whole file — use supabase/verify_schema.sql in the dashboard to see gaps, then apply only missing pieces (or use a fresh project).

  create extension if not exists "pgcrypto";

  -- ---------- Profiles ----------
  create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text not null default '',
    birth_year int,
    city text,
    latitude double precision,
    longitude double precision,
    bio text default '',
    gender text,
    seeking text,
    age_min int default 18,
    age_max int default 99,
    max_distance_km int default 500,
    photo_urls text[] not null default '{}',
    questionnaire_version int not null default 1,
    onboarding_complete boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create index profiles_onboarding_idx on public.profiles (onboarding_complete) where onboarding_complete = true;

  -- ---------- Questions (versioned content) ----------
  create table public.questions (
    id uuid primary key default gen_random_uuid(),
    version int not null default 1,
    sort_order int not null,
    section text,
    prompt text not null,
    answer_type text not null check (answer_type in ('single', 'multi', 'likert', 'text', 'number')),
    options jsonb,
    weight numeric not null default 1,
    required boolean not null default true,
    dealbreaker boolean not null default false
  );

  create index questions_version_idx on public.questions (version, sort_order);

  -- ---------- Answers (private; no cross-user reads via RLS) ----------
  create table public.answers (
    user_id uuid not null references auth.users (id) on delete cascade,
    question_id uuid not null references public.questions (id) on delete cascade,
    value jsonb not null,
    primary key (user_id, question_id)
  );

  -- ---------- Interactions ----------
  create table public.interactions (
    id uuid primary key default gen_random_uuid(),
    from_user uuid not null references auth.users (id) on delete cascade,
    to_user uuid not null references auth.users (id) on delete cascade,
    action text not null check (action in ('like', 'pass')),
    created_at timestamptz not null default now(),
    unique (from_user, to_user)
  );

  create index interactions_from_idx on public.interactions (from_user);
  create index interactions_to_idx on public.interactions (to_user);

  -- ---------- Blocks ----------
  create table public.blocks (
    blocker_id uuid not null references auth.users (id) on delete cascade,
    blocked_id uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (blocker_id, blocked_id),
    check (blocker_id <> blocked_id)
  );

  -- ---------- Reports ----------
  create table public.reports (
    id uuid primary key default gen_random_uuid(),
    reporter_id uuid not null references auth.users (id) on delete cascade,
    reported_user_id uuid not null references auth.users (id) on delete cascade,
    reason text not null,
    details text,
    status text not null default 'pending' check (status in ('pending', 'reviewed', 'actioned')),
    created_at timestamptz not null default now()
  );

  create index reports_status_idx on public.reports (status);

  -- ---------- Matches ----------
  create table public.matches (
    id uuid primary key default gen_random_uuid(),
    user_a uuid not null references auth.users (id) on delete cascade,
    user_b uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    check (user_a < user_b),
    unique (user_a, user_b)
  );

  create index matches_user_a_idx on public.matches (user_a);
  create index matches_user_b_idx on public.matches (user_b);

  -- ---------- Messages ----------
  create table public.messages (
    id uuid primary key default gen_random_uuid(),
    match_id uuid not null references public.matches (id) on delete cascade,
    sender_id uuid not null references auth.users (id) on delete cascade,
    body text not null,
    created_at timestamptz not null default now()
  );

  create index messages_match_idx on public.messages (match_id, created_at);

  -- ---------- Rate limits (server-managed) ----------
  create table public.rate_limits (
    user_id uuid not null references auth.users (id) on delete cascade,
    action text not null,
    window_start timestamptz not null,
    count int not null default 0,
    primary key (user_id, action, window_start)
  );

  -- ---------- Auth: auto profile ----------
  create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
  begin
    insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
    return new;
  end;
  $$;

  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

  -- ---------- Mutual match on like ----------
  create or replace function public.handle_like_match()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
  begin
    if new.action = 'like' then
      if exists (
        select 1 from public.interactions i
        where i.from_user = new.to_user
          and i.to_user = new.from_user
          and i.action = 'like'
      ) and not exists (
        select 1 from public.matches m
        where m.user_a = least(new.from_user, new.to_user)
          and m.user_b = greatest(new.from_user, new.to_user)
      ) then
        insert into public.matches (user_a, user_b)
        values (
          least(new.from_user, new.to_user),
          greatest(new.from_user, new.to_user)
        );
      end if;
    end if;
    return new;
  end;
  $$;

  drop trigger if exists on_interaction_like on public.interactions;
  create trigger on_interaction_like
    after insert on public.interactions
    for each row execute procedure public.handle_like_match();

  -- ---------- RLS ----------
  alter table public.profiles enable row level security;
  alter table public.questions enable row level security;
  alter table public.answers enable row level security;
  alter table public.interactions enable row level security;
  alter table public.blocks enable row level security;
  alter table public.reports enable row level security;
  alter table public.matches enable row level security;
  alter table public.messages enable row level security;
  alter table public.rate_limits enable row level security;

  -- Profiles: own row full access; others readable if complete and not blocked
  create policy "profiles_select_own"
    on public.profiles for select
    using (auth.uid() = id);

  create policy "profiles_select_others"
    on public.profiles for select
    using (
      auth.uid() is not null
      and id <> auth.uid()
      and onboarding_complete = true
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = id)
          or (b.blocker_id = id and b.blocked_id = auth.uid())
      )
    );

  create policy "profiles_insert_own"
    on public.profiles for insert
    with check (auth.uid() = id);

  create policy "profiles_update_own"
    on public.profiles for update
    using (auth.uid() = id);

  -- Questions: read for authenticated
  create policy "questions_read"
    on public.questions for select
    using (auth.uid() is not null);

  -- Answers: only own
  create policy "answers_select_own"
    on public.answers for select
    using (auth.uid() = user_id);

  create policy "answers_insert_own"
    on public.answers for insert
    with check (auth.uid() = user_id);

  create policy "answers_update_own"
    on public.answers for update
    using (auth.uid() = user_id);

  create policy "answers_delete_own"
    on public.answers for delete
    using (auth.uid() = user_id);

  -- Interactions: read own rows; insert where from_user = self
  create policy "interactions_select_own"
    on public.interactions for select
    using (auth.uid() = from_user or auth.uid() = to_user);

  create policy "interactions_insert_own"
    on public.interactions for insert
    with check (auth.uid() = from_user);

  -- Blocks
  create policy "blocks_select_own"
    on public.blocks for select
    using (auth.uid() = blocker_id);

  create policy "blocks_insert_own"
    on public.blocks for insert
    with check (auth.uid() = blocker_id);

  create policy "blocks_delete_own"
    on public.blocks for delete
    using (auth.uid() = blocker_id);

  -- Reports: insert and read own
  create policy "reports_select_own"
    on public.reports for select
    using (auth.uid() = reporter_id);

  create policy "reports_insert_own"
    on public.reports for insert
    with check (auth.uid() = reporter_id);

  -- Matches: participants only
  create policy "matches_select_participant"
    on public.matches for select
    using (auth.uid() = user_a or auth.uid() = user_b);

  -- Messages: sender or match participant
  create policy "messages_select_participant"
    on public.messages for select
    using (
      exists (
        select 1 from public.matches m
        where m.id = match_id
          and (m.user_a = auth.uid() or m.user_b = auth.uid())
      )
    );

  create policy "messages_insert_participant"
    on public.messages for insert
    with check (
      sender_id = auth.uid()
      and exists (
        select 1 from public.matches m
        where m.id = match_id
          and (m.user_a = auth.uid() or m.user_b = auth.uid())
      )
    );

  -- Rate limits: no client access (service role only) — deny all for authenticated
  -- Leave no policies = only service role

  -- ---------- Realtime ----------
  alter publication supabase_realtime add table public.messages;

  -- ---------- Storage bucket (profile photos) ----------
  insert into storage.buckets (id, name, public)
  values ('profile-photos', 'profile-photos', true)
  on conflict (id) do nothing;

  create policy "photo_upload_own"
    on storage.objects for insert
    with check (
      bucket_id = 'profile-photos'
      and auth.uid() is not null
      and split_part(name, '/', 1) = auth.uid()::text
    );

  create policy "photo_update_own"
    on storage.objects for update
    using (
      bucket_id = 'profile-photos'
      and auth.uid() is not null
      and split_part(name, '/', 1) = auth.uid()::text
    );

  create policy "photo_delete_own"
    on storage.objects for delete
    using (
      bucket_id = 'profile-photos'
      and auth.uid() is not null
      and split_part(name, '/', 1) = auth.uid()::text
    );

  create policy "photo_public_read"
    on storage.objects for select
    using (bucket_id = 'profile-photos');

  -- ---------- Seed marriage-oriented questions (version 1) ----------
  insert into public.questions (version, sort_order, section, prompt, answer_type, options, weight, required, dealbreaker)
  values
    (1, 1, 'Faith & values', 'How important is shared religious practice in your marriage?', 'likert',
    '["Not important","Somewhat","Important","Essential"]'::jsonb, 2, true, false),
    (1, 2, 'Faith & values', 'Do you want children?', 'single',
    '["Yes, soon","Yes, later","Open to discussion","No"]'::jsonb, 3, true, true),
    (1, 3, 'Lifestyle', 'How do you handle finances in a partnership?', 'single',
    '["Fully joint","Mostly joint with personal","Mostly separate","Fully separate"]'::jsonb, 1.5, true, false),
    (1, 4, 'Lifestyle', 'Where do you prefer to live long-term?', 'single',
    '["Urban","Suburban","Rural","Flexible"]'::jsonb, 1, true, false),
    (1, 5, 'Communication', 'When conflict arises, you tend to:', 'single',
    '["Address immediately","Need time then talk","Avoid until calm","Seek mediation/counseling"]'::jsonb, 1.5, true, false),
    (1, 6, 'Boundaries', 'Family involvement in major decisions should be:', 'likert',
    '["Minimal","Low","Moderate","High"]'::jsonb, 1, true, false),
    (1, 7, 'Commitment', 'Marriage timeline expectation (honest best guess)', 'single',
    '["< 6 months","6-12 months","1-2 years","2+ years / unsure"]'::jsonb, 2, true, false),
    (1, 8, 'Health & habits', 'Substance use stance for a partner', 'multi',
    '["No tobacco","Moderate alcohol ok","No recreational drugs","Cannabis ok where legal"]'::jsonb, 1.5, true, false);
