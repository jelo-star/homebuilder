-- SMART CONTRACTOR MATCHING | 42
-- Private evidence files attached to contractor quotation breakdowns.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-documents',
  'quote-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists quote_documents_select_participants on storage.objects;
create policy quote_documents_select_participants on storage.objects for select to authenticated
using (
  bucket_id = 'quote-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
    or exists (
      select 1
      from public.quotes q
      join public.projects p on p.id = q.project_id
      where q.id::text = (storage.foldername(name))[2]
        and p.homeowner_id = auth.uid()
    )
  )
);

drop policy if exists quote_documents_insert_contractor on storage.objects;
create policy quote_documents_insert_contractor on storage.objects for insert to authenticated
with check (
  bucket_id = 'quote-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.current_role() = 'contractor'
);

drop policy if exists quote_documents_delete_owner_admin on storage.objects;
create policy quote_documents_delete_owner_admin on storage.objects for delete to authenticated
using (
  bucket_id = 'quote-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
