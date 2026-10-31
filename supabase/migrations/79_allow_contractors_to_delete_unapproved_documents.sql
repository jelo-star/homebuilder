-- Allow contractors to remove their own pending or rejected documents.
-- Approved verification documents remain protected until an administrator
-- changes their review status.
drop policy if exists contractor_documents_owner_delete_unapproved
  on public.contractor_documents;

create policy contractor_documents_owner_delete_unapproved
  on public.contractor_documents
  for delete
  to authenticated
  using (
    contractor_id = auth.uid()
    and public.current_role() = 'contractor'
    and status <> 'approved'
  );
