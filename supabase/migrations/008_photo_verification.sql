-- Photo verification MVP: selfie path + status; only service_role may change verification fields.

alter table public.profiles
  add column if not exists photo_verification_status text not null default 'none'
    check (photo_verification_status in ('none', 'pending', 'verified', 'rejected')),
  add column if not exists photo_verified_at timestamptz,
  add column if not exists verification_selfie_path text;

create index if not exists profiles_verification_status_idx
  on public.profiles (photo_verification_status)
  where photo_verification_status in ('pending', 'verified');

create or replace function public.profiles_photo_verification_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  jwt_role := coalesce((select auth.jwt()->>'role'), '');

  if jwt_role = 'service_role' then
    return new;
  end if;

  if new.photo_verification_status is distinct from old.photo_verification_status
     or new.photo_verified_at is distinct from old.photo_verified_at
     or new.verification_selfie_path is distinct from old.verification_selfie_path
  then
    raise exception 'Photo verification fields can only be updated via server';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_photo_verification_guard_trg on public.profiles;
create trigger profiles_photo_verification_guard_trg
  before update on public.profiles
  for each row
  execute procedure public.profiles_photo_verification_guard();
