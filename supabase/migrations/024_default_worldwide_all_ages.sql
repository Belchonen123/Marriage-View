-- Default Discover reach to "worldwide, all ages" for every user.
--
-- Previously: new accounts started at 500 km / 18-99 (DB defaults) but the
-- onboarding form re-typed 22-45 / 200 km, so the typical user had a tight
-- search window even though the schema would have allowed wider.
--
-- New behavior: schema defaults match what the user expects from a marriage-
-- minded platform with a relatively small pool — cast the widest net by
-- default. Users can still narrow it from Settings.

alter table public.profiles
  alter column age_min set default 18,
  alter column age_max set default 99,
  alter column max_distance_km set default 20000;

-- Apply to every existing user too. 20000 km is half the earth's
-- circumference — effectively worldwide for the haversine filter in
-- /api/discover.
update public.profiles
   set age_min = 18,
       age_max = 99,
       max_distance_km = 20000
 where (age_min is distinct from 18)
    or (age_max is distinct from 99)
    or (max_distance_km is distinct from 20000);

-- Clear the discover compatibility cache so the new wide-open filters
-- recompute on next read.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'discover_compatibility_cache'
  ) then
    delete from public.discover_compatibility_cache;
  end if;
end$$;
