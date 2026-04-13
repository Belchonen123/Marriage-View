-- Incoming video call signals (Realtime). Inserted by API when someone requests a LiveKit token.

create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  caller_id uuid not null references auth.users (id) on delete cascade,
  callee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (caller_id <> callee_id)
);

create index if not exists call_signals_callee_created_idx
  on public.call_signals (callee_id, created_at desc);

alter table public.call_signals enable row level security;

create policy "call_signals_select_callee"
  on public.call_signals for select
  using (auth.uid() = callee_id);

create policy "call_signals_delete_callee"
  on public.call_signals for delete
  using (auth.uid() = callee_id);

-- Inserts only via service role (API route)

alter publication supabase_realtime add table public.call_signals;
