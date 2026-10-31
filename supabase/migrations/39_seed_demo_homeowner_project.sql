-- Add one open example project for the explicitly provisioned demo homeowner.
-- ON CONFLICT DO NOTHING preserves any edits made after the initial seed.
insert into public.projects (
  id,
  homeowner_id,
  title,
  house_type,
  work_type,
  lot_area_sqm,
  floor_area_sqm,
  floors,
  bedrooms,
  bathrooms,
  finish_level,
  city,
  province,
  budget,
  desired_start,
  est_low,
  est_mid,
  est_high,
  status,
  awarded_quote_id
)
select
  '39000000-0000-0000-0000-000000000001'::uuid,
  p.id,
  'Demo Project - Two-Storey Family Home',
  'two_storey'::public.house_type,
  'new_build'::public.work_type,
  180.00,
  140.00,
  2,
  3,
  2,
  'standard'::public.finish_level,
  'Quezon City',
  'Metro Manila',
  4200000.00,
  'in_2_months'::public.start_window,
  3800000.00,
  4200000.00,
  4600000.00,
  'open'::public.project_status,
  null
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = lower('home@gmail.com')
  and p.role = 'homeowner'
on conflict (id) do nothing;
