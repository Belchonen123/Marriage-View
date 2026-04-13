-- Participant unmatch: allow deleting own match rows; keep private journal when match ends.

-- Journal entries survive match deletion (historical note; match_id cleared).
alter table public.match_journal_entries
  drop constraint if exists match_journal_entries_match_id_fkey;

alter table public.match_journal_entries
  alter column match_id drop not null;

alter table public.match_journal_entries
  add constraint match_journal_entries_match_id_fkey
  foreign key (match_id) references public.matches (id) on delete set null;

-- Either participant may end the match (cascades to messages, call_signals, etc. per existing FKs).
create policy "matches_delete_participant"
  on public.matches for delete
  using (auth.uid() = user_a or auth.uid() = user_b);
