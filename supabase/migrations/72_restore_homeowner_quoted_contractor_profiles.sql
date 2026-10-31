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
  cp.authorized_representative,
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
where cp.is_active
  and (
    cp.verification_status = 'approved'
    or exists (
      select 1
      from public.quotes q
      join public.projects p on p.id = q.project_id
      where q.contractor_id = cp.profile_id
        and p.homeowner_id = auth.uid()
    )
  );

revoke all on public.homeowner_contractor_profiles from anon;
grant select on public.homeowner_contractor_profiles to authenticated;

notify pgrst, 'reload schema';
