-- Nexus / marriage-app — schema + RLS sanity check
-- Run in Supabase → SQL Editor (whole file). Safe: read-only selects.
--
-- If "profiles already exists", do NOT re-run migrations/001_initial.sql from the top.
-- Use this report to see what is missing, then apply only the missing pieces (or use a fresh project).

-- 1) Expected public tables
WITH expected(name) AS (
  VALUES
    ('profiles'),
    ('questions'),
    ('answers'),
    ('interactions'),
    ('blocks'),
    ('reports'),
    ('matches'),
    ('messages'),
    ('rate_limits'),
    ('admin_audit_log')
)
SELECT
  e.name AS table_name,
  to_regclass('public.' || e.name) IS NOT NULL AS present
FROM expected e
ORDER BY e.name;

-- 2) RLS enabled on public app tables (rate_limits should have RLS, no user policies)
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'profiles', 'questions', 'answers', 'interactions', 'blocks',
    'reports', 'matches', 'messages', 'rate_limits', 'admin_audit_log'
  )
ORDER BY c.relname;

-- 3) Expected RLS policies (public schema)
WITH expected(policyname) AS (
  VALUES
    ('profiles_select_own'),
    ('profiles_select_others'),
    ('profiles_insert_own'),
    ('profiles_update_own'),
    ('questions_read'),
    ('answers_select_own'),
    ('answers_insert_own'),
    ('answers_update_own'),
    ('answers_delete_own'),
    ('interactions_select_own'),
    ('interactions_insert_own'),
    ('blocks_select_own'),
    ('blocks_insert_own'),
    ('blocks_delete_own'),
    ('reports_select_own'),
    ('reports_insert_own'),
    ('matches_select_participant'),
    ('matches_delete_participant'),
    ('messages_select_participant'),
    ('messages_insert_participant')
)
SELECT
  e.policyname,
  EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.policyname = e.policyname
  ) AS present
FROM expected e
ORDER BY e.policyname;

-- 4) Storage bucket + object policies (profile photos)
SELECT id, name, public FROM storage.buckets WHERE id = 'profile-photos';

WITH expected(policyname) AS (
  VALUES
    ('photo_upload_own'),
    ('photo_update_own'),
    ('photo_delete_own'),
    ('photo_public_read')
)
SELECT
  e.policyname,
  EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname = e.policyname
  ) AS present
FROM expected e
ORDER BY e.policyname;

-- 5) Realtime publication includes messages
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'messages';

-- 5b) Realtime publication includes match_read_state (read receipts / Sent vs Read in chat)
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'match_read_state';

-- 6) Auth triggers (new user → profile)
SELECT tgname AS trigger_name, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname IN ('on_auth_user_created', 'on_interaction_like');

-- 7) Question bank by version (v1 includes initial seed + migration 005_expand_questionnaire_v1)
SELECT version, count(*) AS question_count
FROM public.questions
GROUP BY version
ORDER BY version;

-- 8) Premium layer (004): core tables exist
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'match_typing')
  AS has_match_typing;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'match_read_state')
  AS has_match_read_state;
-- Read receipts over Realtime need FULL replica identity (migration 006); expect relreplident = 'f'
SELECT c.relname, c.relreplident
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('match_read_state', 'match_typing');
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_notifications')
  AS has_user_notifications;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_entitlements')
  AS has_user_entitlements;

-- 9) Retention layer (014): journal, ranking prefs, notification prefs column
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'match_journal_entries')
  AS has_match_journal_entries;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_ranking_prefs')
  AS has_user_ranking_prefs;
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'notification_prefs'
) AS profiles_has_notification_prefs;
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_notifications' AND column_name = 'metadata'
) AS user_notifications_has_metadata;

-- 10) Journal focus + urgent reports (016)
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'match_journal_entries' AND column_name = 'focus_areas'
) AS journal_has_focus_areas;
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'priority'
) AS reports_has_priority;
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'match_id'
) AS reports_has_match_id;
