-- Call lifecycle event log for diagnosing connectivity issues.
CREATE TABLE IF NOT EXISTS public.call_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event      text NOT NULL,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX call_events_match_idx ON public.call_events(match_id, created_at DESC);
CREATE INDEX call_events_user_idx  ON public.call_events(user_id, created_at DESC);

ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;
-- No RLS policies: only the service-role (admin client) can insert.
