-- Speed admin / analytics queries for post-date (post-call) journal reflections.

create index if not exists match_journal_entries_post_date_created_idx
  on public.match_journal_entries (created_at desc)
  where call_occurred_at is not null;
