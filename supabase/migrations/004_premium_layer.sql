-- Typing, read receipts, in-app notifications, push subs, entitlements, feature flags, legal/trust profile field.

-- ---------- Typing (Realtime) ----------
create table if not exists public.match_typing (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create index if not exists match_typing_match_idx on public.match_typing (match_id);

alter table public.match_typing enable row level security;

create policy "match_typing_select_participant"
  on public.match_typing for select
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );

create policy "match_typing_upsert_own"
  on public.match_typing for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );

create policy "match_typing_update_own"
  on public.match_typing for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- Read state (Realtime) ----------
create table if not exists public.match_read_state (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_message_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create index if not exists match_read_state_match_idx on public.match_read_state (match_id);

alter table public.match_read_state enable row level security;

create policy "match_read_state_select_participant"
  on public.match_read_state for select
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );

create policy "match_read_state_upsert_own"
  on public.match_read_state for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );

create policy "match_read_state_update_own"
  on public.match_read_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- In-app notifications ----------
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_unread_idx
  on public.user_notifications (user_id)
  where read_at is null;

alter table public.user_notifications enable row level security;

create policy "user_notifications_select_own"
  on public.user_notifications for select
  using (auth.uid() = user_id);

create policy "user_notifications_update_own"
  on public.user_notifications for update
  using (auth.uid() = user_id);

-- Inserts via triggers / service role only (no insert policy for authenticated)

-- ---------- Web push subscriptions ----------
create table if not exists public.push_subscriptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- ---------- Feature flags (read via API; optional direct read for admins later) ----------
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text
);

alter table public.feature_flags enable row level security;

-- No policies: service role / server only (authenticated users read through Next API with service role)

-- ---------- Entitlements ----------
create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'plus')),
  effective_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_entitlements enable row level security;

create policy "user_entitlements_select_own"
  on public.user_entitlements for select
  using (auth.uid() = user_id);

-- Inserts/updates via admin API (service role) only

-- ---------- Trust: photo guidelines ----------
alter table public.profiles
  add column if not exists photo_guidelines_acknowledged boolean not null default false;

-- ---------- Seed feature flags ----------
insert into public.feature_flags (key, enabled, description) values
  ('premium_filters', false, 'Advanced discover filters (future)'),
  ('see_who_liked_you', false, 'Likes inbox (future)')
on conflict (key) do nothing;

-- ---------- Triggers: notifications ----------
create or replace function public.notify_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  snippet text;
begin
  select case when m.user_a = new.sender_id then m.user_b else m.user_a end
  into recipient
  from public.matches m
  where m.id = new.match_id;

  if recipient is null then
    return new;
  end if;

  snippet := left(trim(both from regexp_replace(new.body, '[[:space:]]+', ' ', 'g')), 160);
  if snippet is null or snippet = '' then
    snippet := 'New message';
  end if;

  insert into public.user_notifications (user_id, kind, title, body, href)
  values (recipient, 'message', 'New message', snippet, '/chat/' || new.match_id::text);

  return new;
end;
$$;

drop trigger if exists on_message_user_notify on public.messages;
create trigger on_message_user_notify
  after insert on public.messages
  for each row execute procedure public.notify_message_insert();

create or replace function public.notify_match_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_notifications (user_id, kind, title, body, href) values
    (new.user_a, 'match', 'New match', 'You matched — say hello!', '/matches'),
    (new.user_b, 'match', 'New match', 'You matched — say hello!', '/matches');
  return new;
end;
$$;

drop trigger if exists on_match_user_notify on public.matches;
create trigger on_match_user_notify
  after insert on public.matches
  for each row execute procedure public.notify_match_created();

-- ---------- Realtime (skip if already added) ----------
alter publication supabase_realtime add table public.match_typing;
alter publication supabase_realtime add table public.match_read_state;
alter publication supabase_realtime add table public.user_notifications;
