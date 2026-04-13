-- Supabase Realtime postgres_changes: UPDATE payloads must include all columns you read
-- in the client, or handlers see partial `new` rows and miss e.g. last_read_message_id.
alter table public.match_read_state replica identity full;
alter table public.match_typing replica identity full;
