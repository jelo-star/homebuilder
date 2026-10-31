-- Use the contractor's account name when an authorized representative was not
-- explicitly entered on the business profile.
create or replace view public.contractor_directory
with (security_barrier = true, security_invoker = false)
as
select
  cp.profile_id,
  cp.business_name,
  cp.bio,
  cp.years_experience,
  cp.service_cities,
  cp.specialties,
  cp.finish_levels,
  cp.work_types,
  cp.license_no,
  cp.verification_status,
  cp.rating_avg,
  cp.rating_count,
  cp.projects_completed,
  cp.business_type,
  cp.trade_name,
  coalesce(nullif(btrim(cp.authorized_representative), ''), nullif(btrim(p.full_name), '')) as authorized_representative,
  cp.business_email,
  cp.business_phone,
  cp.business_address,
  cp.province,
  cp.pcab_category,
  cp.pcab_license_no,
  cp.dti_sec_no,
  cp.team_capacity,
  cp.min_project_budget,
  cp.max_project_budget,
  cp.is_active,
  cp.pcab_expiration_date
from public.contractor_profiles cp
join public.profiles p on p.id = cp.profile_id
where cp.verification_status = 'approved'
  and cp.is_active = true;

create or replace view public.homeowner_contractor_profiles
with (security_invoker = false)
as
select
  cp.profile_id,
  cp.business_name,
  cp.bio,
  cp.years_experience,
  cp.service_cities,
  cp.specialties,
  cp.finish_levels,
  cp.work_types,
  cp.license_no,
  cp.verification_status,
  cp.rating_avg,
  cp.rating_count,
  cp.projects_completed,
  cp.business_type,
  cp.trade_name,
  coalesce(nullif(btrim(cp.authorized_representative), ''), nullif(btrim(p.full_name), '')) as authorized_representative,
  cp.business_email,
  cp.business_phone,
  cp.business_address,
  cp.province,
  cp.pcab_category,
  cp.pcab_license_no,
  cp.pcab_expiration_date,
  cp.dti_sec_no,
  cp.team_capacity,
  cp.min_project_budget,
  cp.max_project_budget,
  cp.is_active
from public.contractor_profiles cp
join public.profiles p on p.id = cp.profile_id
where cp.is_active
  and (
    cp.verification_status = 'approved'
    or exists (
      select 1
      from public.quotes q
      join public.projects project on project.id = q.project_id
      where q.contractor_id = cp.profile_id
        and project.homeowner_id = auth.uid()
    )
  );

revoke all on public.contractor_directory from public;
grant select on public.contractor_directory to anon, authenticated;
revoke all on public.homeowner_contractor_profiles from public, anon;
grant select on public.homeowner_contractor_profiles to authenticated;

notify pgrst, 'reload schema';
