-- Pick where call/message alerts get delivered when web push isn't ringing:
--   sms       - Twilio SMS via TWILIO_FROM_NUMBER
--   whatsapp  - Twilio WhatsApp via TWILIO_WHATSAPP_FROM
--   none      - just web push (default for new accounts that haven't picked)
alter table public.profiles
  add column if not exists preferred_alert_channel text not null default 'sms';

alter table public.profiles
  drop constraint if exists profiles_preferred_alert_channel_check;
alter table public.profiles
  add constraint profiles_preferred_alert_channel_check
  check (preferred_alert_channel in ('sms', 'whatsapp', 'none'));
