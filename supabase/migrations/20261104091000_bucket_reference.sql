-- Bucket list: an optional reference link and an optional picture per item.
--
--   reference_url  one http(s) link (an Instagram post, a Maps place, a menu)
--   image_path     the picture's object name in the PRIVATE `bucket-items`
--                  storage bucket: <couple_id>/<item_id>/<file>.jpg
--
-- Pictures follow the Moments pattern: private bucket, the first path segment
-- is the couple id, read through short-lived signed URLs only. The app
-- uploads first (to a fresh file name), then points the row at it, then
-- removes the file it replaced; deleting an item removes its whole folder,
-- and deleting a couple removes <couple_id>/ (api/couple/leave,
-- api/account/delete).
--
-- Re-runnable: every statement is "if not exists" or drop-then-create.

-- ============================================================
-- Columns (table grants to authenticated already cover new columns)
-- ============================================================

alter table public.bucket_items add column if not exists reference_url text;
alter table public.bucket_items add column if not exists image_path text;

-- http/https only, a host part, no whitespace or control characters, and a
-- sane length. The app normalises with new URL(...).href before saving.
alter table public.bucket_items drop constraint if exists bucket_items_reference_url_check;
alter table public.bucket_items add constraint bucket_items_reference_url_check check (
  reference_url is null
  or (
    char_length(reference_url) <= 2000
    and reference_url ~* '^https?://[^/?#[:space:][:cntrl:]]+[^[:space:][:cntrl:]]*$'
  )
);

-- The picture must live in this item's own folder, with a plain file name.
-- (A row can't point at another couple's or another item's file.)
alter table public.bucket_items drop constraint if exists bucket_items_image_path_check;
alter table public.bucket_items add constraint bucket_items_image_path_check check (
  image_path is null
  or image_path ~ ('^' || couple_id::text || '/' || id::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$')
);

-- ============================================================
-- Storage: private bucket, <couple_id>/<item_id>/<file>
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bucket-items', 'bucket-items', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Exactly three segments (couple uuid / item uuid / plain file name) and the
-- caller belongs to that couple. Safe for any object name: anything else is
-- simply "no access". can_access_couple_folder comes from the Moments
-- migration and is itself safe for non-uuid names.
create or replace function public.can_access_bucket_picture(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'
      and public.can_access_couple_folder(object_name),
    false
  )
$$;
revoke execute on function public.can_access_bucket_picture(text) from public, anon;
grant execute on function public.can_access_bucket_picture(text) to authenticated, service_role;

-- No UPDATE policy on purpose: files are never overwritten or moved, a new
-- picture always gets a new name (so old signed URLs can't show the new one).
drop policy if exists bucket_items_objects_select on storage.objects;
drop policy if exists bucket_items_objects_insert on storage.objects;
drop policy if exists bucket_items_objects_delete on storage.objects;
create policy bucket_items_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'bucket-items' and public.can_access_bucket_picture(name));
create policy bucket_items_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'bucket-items' and public.can_access_bucket_picture(name));
create policy bucket_items_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bucket-items' and public.can_access_bucket_picture(name));
