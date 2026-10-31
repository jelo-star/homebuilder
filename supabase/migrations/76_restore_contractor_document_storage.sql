-- Restore the private bucket used for contractor verification documents.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'contractor-docs',
  'contractor-docs',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists contractor_docs_select_owner_admin on storage.objects;
create policy contractor_docs_select_owner_admin on storage.objects for select to authenticated
using (
  bucket_id = 'contractor-docs'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists contractor_docs_insert_owner on storage.objects;
create policy contractor_docs_insert_owner on storage.objects for insert to authenticated
with check (
  bucket_id = 'contractor-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.current_role() = 'contractor'
);

drop policy if exists contractor_docs_update_owner on storage.objects;
create policy contractor_docs_update_owner on storage.objects for update to authenticated
using (
  bucket_id = 'contractor-docs'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
)
with check (
  bucket_id = 'contractor-docs'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists contractor_docs_delete_owner_admin on storage.objects;
create policy contractor_docs_delete_owner_admin on storage.objects for delete to authenticated
using (
  bucket_id = 'contractor-docs'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
