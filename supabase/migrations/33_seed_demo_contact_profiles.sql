-- Add profile contact details for the explicitly provisioned demo homeowner
-- and contractor accounts. The contractor credential is intentionally unverified.
alter table public.profiles
  add column if not exists address text;

insert into public.profiles (id, role, full_name, phone, city, address)
select
  u.id,
  'homeowner'::public.user_role,
  'Juan Homeowner',
  '09170000002',
  'Quezon City',
  '123 Sample Street, Quezon City, Metro Manila'
from auth.users u
where lower(u.email) = lower('home@gmail.com')
on conflict (id) do update
set role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    city = excluded.city,
    address = excluded.address,
    updated_at = now();

insert into public.profiles (id, role, full_name, phone, city)
select
  u.id,
  'contractor'::public.user_role,
  'Apex Builders Construction',
  '09170000003',
  'Quezon City'
from auth.users u
where lower(u.email) = lower('cont@gmail.com')
on conflict (id) do update
set role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    city = excluded.city,
    updated_at = now();

insert into public.contractor_profiles (
  profile_id,
  business_name,
  trade_name,
  business_type,
  authorized_representative,
  business_email,
  business_phone,
  business_address,
  province,
  bio,
  years_experience,
  team_capacity,
  pcab_category,
  pcab_license_no,
  dti_sec_no,
  service_cities,
  specialties,
  finish_levels,
  work_types,
  license_no,
  verification_status,
  verified_at,
  verified_by,
  is_active
)
select
  u.id,
  'Apex Builders Construction Co.',
  'Apex Home Builders',
  'corporation',
  'Juan Dela Cruz',
  'contact@apexbuilders.example',
  '09170000003',
  '123 Sample Business Road, Quezon City, Metro Manila',
  'Metro Manila',
  'Demo contractor profile. Replace sample details and submit real credentials for verification.',
  10,
  12,
  'Demo - Unverified',
  'DEMO-ONLY-NOT-A-VALID-PCAB-LICENSE',
  'DEMO-ONLY-NOT-A-VALID-REGISTRATION',
  array['Quezon City', 'Pasig', 'Makati', 'Taguig'],
  array['one_storey'::public.house_type, 'two_storey'::public.house_type, 'townhouse'::public.house_type],
  array['basic'::public.finish_level, 'standard'::public.finish_level, 'premium'::public.finish_level],
  array['new_build'::public.work_type, 'renovation'::public.work_type, 'extension'::public.work_type],
  'DEMO-ONLY-NOT-A-VALID-PCAB-LICENSE',
  'pending'::public.verification_status,
  null,
  null,
  true
from auth.users u
where lower(u.email) = lower('cont@gmail.com')
on conflict (profile_id) do update
set business_name = excluded.business_name,
    trade_name = excluded.trade_name,
    business_type = excluded.business_type,
    authorized_representative = excluded.authorized_representative,
    business_email = excluded.business_email,
    business_phone = excluded.business_phone,
    business_address = excluded.business_address,
    province = excluded.province,
    bio = excluded.bio,
    years_experience = excluded.years_experience,
    team_capacity = excluded.team_capacity,
    pcab_category = excluded.pcab_category,
    pcab_license_no = excluded.pcab_license_no,
    dti_sec_no = excluded.dti_sec_no,
    service_cities = excluded.service_cities,
    specialties = excluded.specialties,
    finish_levels = excluded.finish_levels,
    work_types = excluded.work_types,
    license_no = excluded.license_no,
    verification_status = 'pending'::public.verification_status,
    verified_at = null,
    verified_by = null,
    is_active = excluded.is_active,
    updated_at = now();
