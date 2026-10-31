-- Expose only active, approved contractor fields through a public read-only view.
-- The view owner performs the underlying read so anon does not need broad access
-- to contractor_profiles or its RLS policies.
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

notify pgrst, 'reload schema';
