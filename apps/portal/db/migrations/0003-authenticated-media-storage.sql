-- Supabase project migration: private authenticated media bucket.
-- Apply in the Supabase project that owns CENTRAL_SUPABASE_URL/Auth.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'arkom-media',
  'arkom-media',
  false,
  5242880,
  array[
    'image/avif',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "arkom media authenticated read" on storage.objects;
drop policy if exists "arkom media admin upload" on storage.objects;
drop policy if exists "arkom media own avatar upload" on storage.objects;
drop policy if exists "arkom media admin update" on storage.objects;
drop policy if exists "arkom media admin delete" on storage.objects;

create policy "arkom media authenticated read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'arkom-media'
  and (auth.jwt() -> 'app_metadata' ->> 'arkom_role') in ('admin', 'student')
);

create policy "arkom media admin upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'arkom-media'
  and (auth.jwt() -> 'app_metadata' ->> 'arkom_role') = 'admin'
  and (storage.foldername(name))[1] in ('avatars', 'covers', 'resources')
);

create policy "arkom media admin update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'arkom-media'
  and (auth.jwt() -> 'app_metadata' ->> 'arkom_role') = 'admin'
)
with check (
  bucket_id = 'arkom-media'
  and (auth.jwt() -> 'app_metadata' ->> 'arkom_role') = 'admin'
  and (storage.foldername(name))[1] in ('avatars', 'covers', 'resources')
);

create policy "arkom media admin delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'arkom-media'
  and (auth.jwt() -> 'app_metadata' ->> 'arkom_role') = 'admin'
);
