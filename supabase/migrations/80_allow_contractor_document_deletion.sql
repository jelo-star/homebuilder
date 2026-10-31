-- Contractors may delete their own verification documents.
-- Deleting an approved document returns the contractor to pending review.
drop policy if exists contractor_documents_owner_delete_unapproved
  on public.contractor_documents;

drop policy if exists contractor_documents_owner_delete
  on public.contractor_documents;

create policy contractor_documents_owner_delete
  on public.contractor_documents
  for delete
  to authenticated
  using (
    contractor_id = auth.uid()
    and public.current_role() = 'contractor'
  );

create or replace function public.return_contractor_to_pending_after_document_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if old.status = 'approved' then
    update public.contractor_profiles
       set verification_status = 'pending'::public.verification_status,
           verified_at = null,
           verified_by = null,
           updated_at = now()
     where profile_id = old.contractor_id;
  end if;

  return old;
end;
$$;

drop trigger if exists contractor_document_delete_resets_verification
  on public.contractor_documents;

create trigger contractor_document_delete_resets_verification
before delete on public.contractor_documents
for each row
execute function public.return_contractor_to_pending_after_document_delete();
