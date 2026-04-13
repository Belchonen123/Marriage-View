-- Discover ranking: activity + engagement helpers (idempotent-ish; safe to run once per project)

alter table public.profiles
  add column if not exists last_active_at timestamptz not null default now();

create index if not exists profiles_last_active_idx on public.profiles (last_active_at desc);

comment on column public.profiles.last_active_at is 'Updated when user hits discover (and can be extended to other activity pings).';

-- Aggregate message counts per sender in a rolling window (service role only)
create or replace function public.message_counts_last_days(p_user_ids uuid[], p_days int default 30)
returns table (user_id uuid, msg_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select m.sender_id, count(*)::bigint
  from public.messages m
  where m.sender_id = any(p_user_ids)
    and m.created_at > now() - (p_days::text || ' days')::interval
  group by m.sender_id;
$$;

revoke all on function public.message_counts_last_days(uuid[], int) from public;
grant execute on function public.message_counts_last_days(uuid[], int) to service_role;
