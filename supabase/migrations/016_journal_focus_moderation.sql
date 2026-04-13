-- Purposeful reflection tags, fast-track post-call reports for moderation.

alter table public.reports
  add column if not exists priority text not null default 'normal'
 check (priority in ('normal', 'urgent'));

alter table public.reports
  add column if not exists match_id uuid references public.matches (id) on delete set null;

create index if not exists reports_priority_created_idx on public.reports (priority, created_at desc);

comment on column public.reports.priority is 'urgent = fast-track human review (e.g. post-call safety).';
comment on column public.reports.match_id is 'Optional match context when report is tied to a thread.';

-- Optional structured reflection angles (validated in app).
alter table public.match_journal_entries
  add column if not exists focus_areas text[] not null default '{}';

comment on column public.match_journal_entries.focus_areas is 'Optional tags: values_alignment, future_goals, communication_pace, boundaries_safety.';

alter table public.match_journal_entries
  add column if not exists has_purposeful_focus boolean
  generated always as (coalesce(array_length(focus_areas, 1), 0) > 0) stored;

create index if not exists match_journal_entries_user_purpose_idx
  on public.match_journal_entries (user_id)
  where has_purposeful_focus;
