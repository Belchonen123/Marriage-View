-- Turn on the inbound likes wall by default. Admins can disable via /admin/flags if needed.
insert into public.feature_flags (key, enabled, description) values
  (
    'see_who_liked_you',
    true,
    'See who liked you: Plus unlocks full list; free sees count and silhouettes'
  )
on conflict (key) do update set
  enabled = excluded.enabled,
  description = excluded.description;
