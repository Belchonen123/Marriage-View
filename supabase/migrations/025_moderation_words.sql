-- Admin-editable moderation word lists. Loaded by the content-flags scanner.
-- The lib/moderation/profanity.ts file ships a small built-in list as a
-- baseline; rows in this table extend it.

create table if not exists public.moderation_words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  flag text not null check (flag in ('profanity', 'sexual', 'contact')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists moderation_words_unique
  on public.moderation_words (lower(word), flag);

alter table public.moderation_words enable row level security;

-- Server-side admin code uses the service role and bypasses RLS; no public
-- policies needed.

comment on table public.moderation_words is
  'Admin-curated terms added on top of the built-in profanity/sexual/contact lists.';
