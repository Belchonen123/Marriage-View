-- Append-only audit trail for admin mutations (written from API routes using service role).

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null,
  target_type text not null,
  target_id text null,
  payload_json jsonb null,
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);

comment on table public.admin_audit_log is 'Server-side audit of admin actions; insert via service role only.';

alter table public.admin_audit_log enable row level security;
