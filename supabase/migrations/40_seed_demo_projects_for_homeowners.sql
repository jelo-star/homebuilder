-- Ensure both known demo homeowner accounts have a sample project.
-- Deterministic IDs and ON CONFLICT DO NOTHING make the seed repeatable
-- without overwriting projects that a homeowner edits after seeding.
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
  case lower(u.email)
    when 'home@gmail.com' then '39000000-0000-0000-0000-000000000001'::uuid
    when 'homeowner@gmail.com' then '40000000-0000-0000-0000-000000000001'::uuid
  end,
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
where lower(u.email) in ('home@gmail.com', 'homeowner@gmail.com')
  and p.role = 'homeowner'
on conflict (id) do nothing;
