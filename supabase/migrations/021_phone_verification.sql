-- Phone verification via Twilio Verify. Used as an SMS fallback when web push
-- doesn't ring (iOS without PWA install, Android silent notifications, etc.)
-- and as a future channel for transactional alerts.

alter table public.profiles
  add column if not exists phone_number text,
  add column if not exists phone_verified_at timestamptz;

-- Ensure E.164-ish format if present (lightweight check; Twilio Verify enforces real validity).
alter table public.profiles
  drop constraint if exists profiles_phone_number_format;
alter table public.profiles
  add constraint profiles_phone_number_format
  check (phone_number is null or phone_number ~ '^\+[1-9][0-9]{6,14}$');

-- Only one profile per verified number (prevents reuse for spam/abuse).
create unique index if not exists profiles_phone_number_unique
  on public.profiles (phone_number)
  where phone_verified_at is not null;
