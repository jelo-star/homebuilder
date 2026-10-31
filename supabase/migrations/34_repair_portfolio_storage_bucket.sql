-- Ensure the public portfolio image bucket exists and contractor uploads are
-- restricted to the contractor's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio',
  'portfolio',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists portfolio_public_read on storage.objects;
create policy portfolio_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'portfolio');

drop policy if exists portfolio_owner_write on storage.objects;
create policy portfolio_owner_write
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'portfolio'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  )
  with check (
    bucket_id = 'portfolio'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
