-- Let authenticated homeowners see safe contractor profile fields, portfolio
-- projects, and portfolio images when that contractor has quoted on their project.
-- Public visitors continue to see approved contractors through contractor_directory.
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

drop policy if exists portfolio_items_read on public.portfolio_items;
create policy portfolio_items_read
  on public.portfolio_items
  for select
  to authenticated
  using (
    public.is_admin()
    or contractor_id = auth.uid()
    or exists (
      select 1
      from public.contractor_profiles cp
      where cp.profile_id = portfolio_items.contractor_id
        and cp.verification_status = 'approved'
        and cp.is_active
    )
    or exists (
      select 1
      from public.quotes q
      join public.projects p on p.id = q.project_id
      where q.contractor_id = portfolio_items.contractor_id
        and p.homeowner_id = auth.uid()
    )
  );

drop policy if exists portfolio_images_read on public.portfolio_images;
create policy portfolio_images_read
  on public.portfolio_images
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.portfolio_items pi
      where pi.id = portfolio_images.portfolio_item_id
        and (
          pi.contractor_id = auth.uid()
          or exists (
            select 1
            from public.contractor_profiles cp
            where cp.profile_id = pi.contractor_id
              and cp.verification_status = 'approved'
              and cp.is_active
          )
          or exists (
            select 1
            from public.quotes q
            join public.projects p on p.id = q.project_id
            where q.contractor_id = pi.contractor_id
              and p.homeowner_id = auth.uid()
          )
        )
    )
  );