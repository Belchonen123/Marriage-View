-- Directional discover compatibility snapshots: (viewer, candidate) using viewer’s questionnaire version.
-- Invalidated when either user’s answers change or either user’s questionnaire_version changes.

create table if not exists public.discover_compatibility_cache (
  viewer_id uuid not null references auth.users (id) on delete cascade,
  candidate_id uuid not null references auth.users (id) on delete cascade,
  questionnaire_version int not null,
  question_snapshot_hash text not null,
  total_percent double precision not null,
  hard_fail boolean not null default false,
  category_breakdown jsonb not null,
  reasons jsonb not null,
  normalized_score double precision not null,
  computed_at timestamptz not null default now(),
  primary key (viewer_id, candidate_id)
);

create index if not exists discover_compatibility_cache_viewer_idx
  on public.discover_compatibility_cache (viewer_id);

comment on table public.discover_compatibility_cache is
  'Cached scorePairExplain output per discover viewer/candidate; invalidated via triggers on answers and profile questionnaire_version.';

alter table public.discover_compatibility_cache enable row level security;

-- No policies: only service-role API writes/reads (bypass RLS).

create or replace function public.invalidate_discover_compatibility_cache_answers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if tg_op = 'DELETE' then
    uid := old.user_id;
  else
    uid := new.user_id;
  end if;
  delete from public.discover_compatibility_cache
  where viewer_id = uid or candidate_id = uid;
  return coalesce(new, old);
end;
$$;

drop trigger if exists answers_invalidate_discover_cache on public.answers;
create trigger answers_invalidate_discover_cache
  after insert or update or delete on public.answers
  for each row execute procedure public.invalidate_discover_compatibility_cache_answers();

create or replace function public.invalidate_discover_compatibility_cache_profile_qv()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.questionnaire_version is distinct from old.questionnaire_version then
    delete from public.discover_compatibility_cache
    where viewer_id = new.id or candidate_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_invalidate_discover_cache_qv on public.profiles;
create trigger profiles_invalidate_discover_cache_qv
  after update of questionnaire_version on public.profiles
  for each row execute procedure public.invalidate_discover_compatibility_cache_profile_qv();
