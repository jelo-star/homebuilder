-- Use the milestone's own quote relationship when authorizing homeowner image reads.
-- This remains valid even when projects.awarded_quote_id is not populated.
drop policy if exists milestone_proofs_homeowner_object_read on storage.objects;
create policy milestone_proofs_homeowner_object_read on storage.objects
for select to authenticated
using (
  bucket_id = 'milestone-proofs'
  and exists (
    select 1
    from public.milestones m
    join public.projects p on p.id = m.project_id
    join public.quotes q on q.id = m.quote_id
    where p.homeowner_id = auth.uid()
      and (storage.foldername(name))[1] = q.contractor_id::text
      and (storage.foldername(name))[2] = m.id::text
  )
);
