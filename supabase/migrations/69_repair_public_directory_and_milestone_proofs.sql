-- Keep public contractor reads on a view that does not invoke caller-scoped RLS
-- policies on contractor_profiles.
grant usage on schema public to anon, authenticated;

create or replace view public.contractor_directory
with (security_barrier = true, security_invoker = false)
as
select
  profile_id,
  business_name,
  bio,
  years_experience,
  service_cities,
  specialties,
  finish_levels,
  work_types,
  license_no,
  verification_status,
  rating_avg,
  rating_count,
  projects_completed,
  business_type,
  trade_name,
  authorized_representative,
  business_email,
  business_phone,
  business_address,
  province,
  pcab_category,
  pcab_license_no,
  dti_sec_no,
  team_capacity,
  min_project_budget,
  max_project_budget,
  is_active
from public.contractor_profiles
where verification_status = 'approved'
  and is_active = true;

revoke all on public.contractor_directory from public;
grant select on public.contractor_directory to anon, authenticated;

-- Existing proof-read policies use this helper for the authenticated role.
grant execute on function public.is_admin() to authenticated;

-- Authorize homeowner proof reads using the milestone's project and quote.
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

notify pgrst, 'reload schema';
