-- Expose approved contractor license metadata to public profile pages only.
create or replace view public.public_verified_contractor_licenses
with (security_barrier = true, security_invoker = false)
as
select
  d.id,
  d.contractor_id,
  d.doc_title,
  d.doc_number,
  d.issuing_authority,
  d.file_path,
  d.created_at
from public.contractor_documents d
where d.doc_type = 'license'
  and d.status = 'approved'
;

grant select on public.public_verified_contractor_licenses to anon, authenticated;
