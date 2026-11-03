-- Moments: a record of each date — up to 7 photos, title, date, place (+ GPS)
-- and a description. Kept so dates can later be compiled into a scrapbook.
--
-- Photos live in the PRIVATE `moments` bucket at
--   <couple_id>/<moment_id>/<file>.jpg
-- and are shown through short-lived signed URLs, never public URLs.

create table public.moments (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples(id) on delete cascade,
  created_by    uuid references public.profiles(id) on delete set null,
  title         text not null check (char_length(btrim(title)) between 1 and 100),
  description   text check (description is null or char_length(description) <= 2000),
  moment_date   date not null,
  location_name text check (location_name is null or char_length(location_name) <= 200),
  latitude      double precision check (latitude between -90 and 90),
  longitude     double precision check (longitude between -180 and 180),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint moments_coords_together check ((latitude is null) = (longitude is null))
);
create index moments_couple_date_idx on public.moments (couple_id, moment_date desc, created_at desc);

-- sort_order 0 is the cover photo.
create table public.moment_photos (
  id           uuid primary key default gen_random_uuid(),
  moment_id    uuid not null references public.moments(id) on delete cascade,
  couple_id    uuid not null references public.couples(id) on delete cascade,
  storage_path text not null unique,
  width        integer,
  height       integer,
  taken_at     timestamptz,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index moment_photos_moment_idx on public.moment_photos (moment_id, sort_order);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger moments_touch_updated_at
  before update on public.moments
  for each row execute function public.touch_updated_at();

-- A photo must belong to its moment's couple, live under that moment's folder,
-- and a moment holds at most 7 photos. Locking the moment row serialises
-- concurrent uploads so two parallel inserts can't both pass the count.
create or replace function public.check_moment_photo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  moment_couple uuid;
begin
  select couple_id into moment_couple from public.moments where id = new.moment_id for update;
  if moment_couple is null or moment_couple <> new.couple_id then
    raise exception 'Foto tidak cocok dengan moment ini' using errcode = 'check_violation';
  end if;
  if new.storage_path not like new.couple_id::text || '/' || new.moment_id::text || '/%' then
    raise exception 'Lokasi file foto tidak valid' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and
     (select count(*) from public.moment_photos where moment_id = new.moment_id) >= 7 then
    raise exception 'Maksimal 7 foto per moment' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger moment_photos_check
  before insert or update of moment_id, couple_id, storage_path on public.moment_photos
  for each row execute function public.check_moment_photo();

grant select, insert, update, delete on public.moments, public.moment_photos to authenticated, service_role;

alter table public.moments       enable row level security;
alter table public.moment_photos enable row level security;

-- Couple-private: no admin read policy on purpose.
create policy moments_member_all on public.moments for all to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id));
create policy moment_photos_member_all on public.moment_photos for all to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id));

-- ============================================================
-- Storage: private bucket, first path segment is the couple id
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moments', 'moments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Safe for any object name: a non-uuid first segment simply means "no access".
create or replace function public.can_access_couple_folder(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_couple_member(split_part(object_name, '/', 1)::uuid)
    else false
  end
$$;
grant execute on function public.can_access_couple_folder(text) to authenticated, service_role;

create policy moments_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'moments' and public.can_access_couple_folder(name));
create policy moments_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'moments' and public.can_access_couple_folder(name));
create policy moments_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'moments' and public.can_access_couple_folder(name));
create policy moments_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'moments' and public.can_access_couple_folder(name));
