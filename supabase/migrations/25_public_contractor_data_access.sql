-- Expose only approved public contractor details to unauthenticated visitors.
drop policy if exists contractor_profiles_public_read on public.contractor_profiles;
create policy contractor_profiles_public_read
  on public.contractor_profiles
  for select
  to anon
  using (verification_status = 'approved' and is_active);

revoke select on public.contractor_profiles from anon;
grant select (
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
) on public.contractor_profiles to anon;

create or replace view public.contractor_directory
with (security_invoker = true)
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
where verification_status = 'approved' and is_active;

grant select on public.contractor_directory to anon, authenticated;

drop policy if exists portfolio_items_public_read on public.portfolio_items;
create policy portfolio_items_public_read
  on public.portfolio_items
  for select
  to anon
  using (
    exists (
      select 1
      from public.contractor_profiles cp
      where cp.profile_id = portfolio_items.contractor_id
        and cp.verification_status = 'approved'
        and cp.is_active
    )
  );

revoke select on public.portfolio_items from anon;
grant select (
  id,
  contractor_id,
  title,
  description,
  house_type,
  floors,
  floor_area_sqm,
  year_completed,
  created_at,
  updated_at
) on public.portfolio_items to anon;

drop policy if exists reviews_public_read on public.reviews;
create policy reviews_public_read
  on public.reviews
  for select
  to anon
  using (
    exists (
      select 1
      from public.contractor_profiles cp
      where cp.profile_id = reviews.contractor_id
        and cp.verification_status = 'approved'
        and cp.is_active
    )
  );

revoke select on public.reviews from anon;
grant select (
  id,
  contractor_id,
  rating,
  comment,
  created_at
) on public.reviews to anon;
