-- LOCAL DEVELOPMENT ONLY. This script is destructive:
-- it clears every row in public tables and all Supabase Auth users, then seeds
-- an admin account, five contractor accounts, three homeowner accounts,
-- contractor portfolios with illustrative project images, contractor payout
-- accounts, admin payment channels, license-document samples, and three open
-- projects. It preserves the schema and storage files.
--
-- Login password for every account: 12341234
-- Contractor emails are the first word of each business name @gmail.com.
-- Homeowner emails: home1@gmail.com, home2@gmail.com, home3@gmail.com.
--
-- Do not run this in a shared or production Supabase project.

begin;

do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'truncate table %I.%I cascade',
      table_record.schemaname,
      table_record.tablename
    );
  end loop;
end
$$;

delete from auth.users;

do $$
declare
  v_password_hash text := extensions.crypt('12341234', extensions.gen_salt('bf'));
begin
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    seed.email,
    v_password_hash,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', seed.full_name,
      'role', seed.account_role,
      'city', seed.city,
      'phone', seed.phone,
      'business_name', seed.business_name
    ),
    now(),
    now()
  from (
    values
      ('northstar@gmail.com', 'contractor', 'Northstar Builders', 'Quezon City', '09170001001', 'Northstar Builders'),
      ('harborline@gmail.com', 'contractor', 'Harborline Construction', 'Cebu City', '09170001002', 'Harborline Construction'),
      ('stonebridge@gmail.com', 'contractor', 'Stonebridge Build Group', 'Davao City', '09170001003', 'Stonebridge Build Group'),
      ('cedarcrest@gmail.com', 'contractor', 'Cedarcrest Homes', 'Iloilo City', '09170001004', 'Cedarcrest Homes'),
      ('summitcraft@gmail.com', 'contractor', 'Summitcraft Builders', 'Antipolo', '09170001005', 'Summitcraft Builders'),
      ('admin@gmail.com', 'admin', 'Platform Administrator', 'Manila', '09170003001', ''),
      ('home1@gmail.com', 'homeowner', 'Mara Santos', 'Quezon City', '09170002001', ''),
      ('home2@gmail.com', 'homeowner', 'Luis Dela Cruz', 'Cebu City', '09170002002', ''),
      ('home3@gmail.com', 'homeowner', 'Ana Villanueva', 'Davao City', '09170002003', '')
  ) as seed(email, account_role, full_name, city, phone, business_name);

  update auth.users
  set
    confirmation_token = coalesce(confirmation_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    recovery_token = coalesce(recovery_token, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    reauthentication_token = coalesce(reauthentication_token, '')
  where lower(email) in (
    'northstar@gmail.com',
    'harborline@gmail.com',
    'stonebridge@gmail.com',
    'cedarcrest@gmail.com',
    'summitcraft@gmail.com',
    'admin@gmail.com',
    'home1@gmail.com',
    'home2@gmail.com',
    'home3@gmail.com'
  );
end
$$;

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  id::text,
  id,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
from auth.users
where lower(email) in (
  'northstar@gmail.com',
  'harborline@gmail.com',
  'stonebridge@gmail.com',
  'cedarcrest@gmail.com',
  'summitcraft@gmail.com',
  'admin@gmail.com',
  'home1@gmail.com',
  'home2@gmail.com',
  'home3@gmail.com'
);

update public.profiles
set
  role = 'admin',
  full_name = 'Platform Administrator',
  city = 'Manila',
  updated_at = now()
where id = (select id from auth.users where lower(email) = 'admin@gmail.com');

update public.contractor_profiles cp
set
  business_name = seed.business_name,
  bio = seed.bio,
  years_experience = seed.years_experience,
  service_cities = seed.service_cities,
  specialties = seed.specialties,
  finish_levels = array['basic', 'standard', 'premium']::public.finish_level[],
  work_types = array['new_build', 'renovation', 'extension']::public.work_type[],
  trade_name = seed.trade_name,
  authorized_representative = seed.representative,
  business_email = seed.email,
  business_phone = seed.phone,
  business_address = seed.city,
  province = seed.province,
  team_capacity = seed.team_capacity,
  accepted_project_types = array['new_build', 'renovation', 'extension'],
  min_project_budget = 800000,
  max_project_budget = 25000000,
  verification_status = 'pending',
  is_active = true,
  updated_at = now()
from auth.users u
join (
  values
    ('northstar@gmail.com', 'Northstar Builders', 'Residential construction team focused on durable family homes and practical site coordination.', 14, array['Quezon City', 'Manila', 'Antipolo']::text[], array['one_storey', 'two_storey']::public.house_type[], 'Northstar Build', 'Engr. Rafael Mendoza', '09170001001', 'Quezon City', 'Metro Manila', 16),
    ('harborline@gmail.com', 'Harborline Construction', 'Home building and renovation contractor serving residential clients across Cebu and nearby communities.', 12, array['Cebu City', 'Mandaue', 'Lapu-Lapu']::text[], array['one_storey', 'townhouse']::public.house_type[], 'Harborline Homes', 'Engr. Beatriz Lim', '09170001002', 'Cebu City', 'Cebu', 14),
    ('stonebridge@gmail.com', 'Stonebridge Build Group', 'General building team delivering family residences, structural upgrades, and carefully managed renovations.', 18, array['Davao City', 'Panabo', 'Tagum']::text[], array['two_storey', 'townhouse']::public.house_type[], 'Stonebridge Residential', 'Engr. Miguel Flores', '09170001003', 'Davao City', 'Davao del Sur', 20),
    ('cedarcrest@gmail.com', 'Cedarcrest Homes', 'Residential builder specializing in efficient layouts, finishing works, and home extensions.', 10, array['Iloilo City', 'Pavia', 'Oton']::text[], array['one_storey', 'two_storey']::public.house_type[], 'Cedarcrest Construction', 'Ar. Sofia Reyes', '09170001004', 'Iloilo City', 'Iloilo', 12),
    ('summitcraft@gmail.com', 'Summitcraft Builders', 'Construction company providing new home builds, additions, and coordinated renovation services.', 16, array['Antipolo', 'Cainta', 'Marikina']::text[], array['two_storey', 'townhouse']::public.house_type[], 'Summitcraft Residential', 'Engr. Daniel Bautista', '09170001005', 'Antipolo', 'Rizal', 18)
) as seed(email, business_name, bio, years_experience, service_cities, specialties, trade_name, representative, phone, city, province, team_capacity)
  on lower(u.email) = seed.email
where cp.profile_id = u.id;

insert into public.contractor_documents (
  contractor_id,
  doc_type,
  doc_title,
  doc_number,
  issuing_authority,
  file_path,
  status
)
select
  u.id,
  'license'::public.doc_type,
  'Sample PCAB credential - not verified',
  'SAMPLE-NOT-VALID-' || upper(split_part(u.email, '@', 1)),
  'Sample document; not issued by a licensing authority',
  '/demo-credentials/pcab-sample.png',
  'pending'::public.verification_status
from auth.users u
where lower(u.email) in (
  'northstar@gmail.com',
  'harborline@gmail.com',
  'stonebridge@gmail.com',
  'cedarcrest@gmail.com',
  'summitcraft@gmail.com'
);

insert into public.portfolio_items (
  contractor_id,
  title,
  description,
  house_type,
  floors,
  floor_area_sqm,
  year_completed
)
select
  u.id,
  seed.title,
  seed.description,
  seed.house_type,
  seed.floors,
  seed.floor_area_sqm,
  seed.year_completed
from (
  values
    ('northstar@gmail.com', 'Two-Storey Family Residence', 'A family home with an open living area, practical storage, and a shaded outdoor space.', 'two_storey'::public.house_type, 2, 168.00::numeric, 2024),
    ('northstar@gmail.com', 'Compact City Bungalow', 'A single-level residence planned around natural light and efficient circulation.', 'one_storey'::public.house_type, 1, 96.00::numeric, 2023),
    ('northstar@gmail.com', 'Expanded Family Home', 'A two-storey home addition with upgraded kitchen, bedrooms, and utility areas.', 'two_storey'::public.house_type, 2, 142.00::numeric, 2022),
    ('harborline@gmail.com', 'Coastal Family Home', 'A concrete family residence with a covered entry and cross-ventilated living spaces.', 'two_storey'::public.house_type, 2, 154.00::numeric, 2024),
    ('harborline@gmail.com', 'Cebu Garden Bungalow', 'A single-storey home arranged around a small landscaped courtyard.', 'one_storey'::public.house_type, 1, 112.00::numeric, 2023),
    ('harborline@gmail.com', 'Townhouse Interior Renewal', 'A multi-level townhouse renovation with refreshed kitchen, bathrooms, and finishes.', 'townhouse'::public.house_type, 3, 176.00::numeric, 2022),
    ('stonebridge@gmail.com', 'Davao Two-Storey Home', 'A reinforced-concrete residence with a family room and covered parking.', 'two_storey'::public.house_type, 2, 184.00::numeric, 2025),
    ('stonebridge@gmail.com', 'Modern Townhouse Build', 'A three-level townhouse with compact service areas and flexible upper-floor rooms.', 'townhouse'::public.house_type, 3, 192.00::numeric, 2024),
    ('stonebridge@gmail.com', 'Residential Structural Upgrade', 'A home improvement project covering structural repairs and interior reconfiguration.', 'one_storey'::public.house_type, 1, 104.00::numeric, 2023),
    ('cedarcrest@gmail.com', 'Iloilo Starter Home', 'A practical single-storey residence with a bright shared living and dining space.', 'one_storey'::public.house_type, 1, 88.00::numeric, 2024),
    ('cedarcrest@gmail.com', 'Two-Storey Courtyard House', 'A family residence with a central lightwell and flexible ground-floor rooms.', 'two_storey'::public.house_type, 2, 146.00::numeric, 2023),
    ('cedarcrest@gmail.com', 'Home Extension and Renewal', 'An existing residence extended with a new bedroom wing and updated finishes.', 'one_storey'::public.house_type, 1, 118.00::numeric, 2022),
    ('summitcraft@gmail.com', 'Rizal Hillside Residence', 'A two-storey home with a covered terrace and family-oriented interior layout.', 'two_storey'::public.house_type, 2, 172.00::numeric, 2025),
    ('summitcraft@gmail.com', 'Townhouse Family Build', 'A compact townhouse planned for comfortable daily use and straightforward maintenance.', 'townhouse'::public.house_type, 3, 164.00::numeric, 2024),
    ('summitcraft@gmail.com', 'Kitchen and Living Renovation', 'A residential renovation updating the kitchen, shared living spaces, and finishes.', 'two_storey'::public.house_type, 2, 136.00::numeric, 2023)
) as seed(email, title, description, house_type, floors, floor_area_sqm, year_completed)
join auth.users u on lower(u.email) = seed.email;

insert into public.portfolio_images (
  portfolio_item_id,
  file_path,
  sort_order
)
select
  item.id,
  seed.file_path,
  1
from (
  values
    ('northstar@gmail.com', 'Two-Storey Family Residence', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'),
    ('northstar@gmail.com', 'Compact City Bungalow', 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80'),
    ('northstar@gmail.com', 'Expanded Family Home', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80'),
    ('harborline@gmail.com', 'Coastal Family Home', 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80'),
    ('harborline@gmail.com', 'Cebu Garden Bungalow', 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80'),
    ('harborline@gmail.com', 'Townhouse Interior Renewal', 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80'),
    ('stonebridge@gmail.com', 'Davao Two-Storey Home', 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=80'),
    ('stonebridge@gmail.com', 'Modern Townhouse Build', 'https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=1200&q=80'),
    ('stonebridge@gmail.com', 'Residential Structural Upgrade', 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1200&q=80'),
    ('cedarcrest@gmail.com', 'Iloilo Starter Home', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80'),
    ('cedarcrest@gmail.com', 'Two-Storey Courtyard House', 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80'),
    ('cedarcrest@gmail.com', 'Home Extension and Renewal', 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80'),
    ('summitcraft@gmail.com', 'Rizal Hillside Residence', 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80'),
    ('summitcraft@gmail.com', 'Townhouse Family Build', 'https://images.unsplash.com/photo-1600585153490-76fb20a32601?auto=format&fit=crop&w=1200&q=80'),
    ('summitcraft@gmail.com', 'Kitchen and Living Renovation', 'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1200&q=80')
) as seed(email, title, file_path)
join auth.users u on lower(u.email) = seed.email
join public.portfolio_items item
  on item.contractor_id = u.id
 and item.title = seed.title;

insert into public.contractor_payout_accounts (
  contractor_id,
  payout_method,
  bank_name,
  account_name,
  account_number_mask,
  status,
  is_primary
)
select
  u.id,
  payout.payout_method,
  payout.bank_name,
  'LOCAL TEST - ' || cp.business_name,
  payout.account_number_mask,
  'PENDING_VERIFICATION',
  payout.is_primary
from auth.users u
join public.contractor_profiles cp on cp.profile_id = u.id
cross join lateral (
  values
    ('bank_transfer', 'Local Test Bank', 'LOCAL-TEST-BANK-' || upper(split_part(u.email, '@', 1)), true),
    ('gcash', 'GCash (Local Test)', 'LOCAL-TEST-GCASH-' || upper(split_part(u.email, '@', 1)), false),
    ('maya', 'Maya (Local Test)', 'LOCAL-TEST-MAYA-' || upper(split_part(u.email, '@', 1)), false)
) as payout(payout_method, bank_name, account_number_mask, is_primary)
where lower(u.email) in (
  'northstar@gmail.com',
  'harborline@gmail.com',
  'stonebridge@gmail.com',
  'cedarcrest@gmail.com',
  'summitcraft@gmail.com'
);

insert into public.payment_provider_configs (
  provider_name,
  display_name,
  is_enabled,
  environment,
  transaction_fee_pct,
  transaction_fee_fixed,
  supports_automatic_disbursement,
  metadata,
  updated_by,
  updated_at
)
select
  provider.provider_name,
  provider.display_name,
  true,
  'sandbox',
  provider.transaction_fee_pct,
  provider.transaction_fee_fixed,
  provider.supports_automatic_disbursement,
  '{"environment":"local-test","credentials_configured":false}'::jsonb,
  admin_user.id,
  now()
from auth.users admin_user
cross join (
  values
    ('gcash', 'GCash Wallet (Local Test)', 0.00::numeric, 0.00::numeric, false),
    ('maya', 'Maya Wallet (Local Test)', 0.00::numeric, 0.00::numeric, false),
    ('card_gateway', 'Card Gateway (Local Test)', 0.00::numeric, 0.00::numeric, false),
    ('bank_transfer', 'Bank Transfer (Local Test)', 0.00::numeric, 0.00::numeric, false),
    ('sandbox', 'Payment Sandbox', 0.00::numeric, 0.00::numeric, false)
) as provider(provider_name, display_name, transaction_fee_pct, transaction_fee_fixed, supports_automatic_disbursement)
where lower(admin_user.email) = 'admin@gmail.com'
on conflict (provider_name) do update set
  display_name = excluded.display_name,
  is_enabled = excluded.is_enabled,
  environment = excluded.environment,
  transaction_fee_pct = excluded.transaction_fee_pct,
  transaction_fee_fixed = excluded.transaction_fee_fixed,
  supports_automatic_disbursement = excluded.supports_automatic_disbursement,
  metadata = excluded.metadata,
  updated_by = excluded.updated_by,
  updated_at = now();

insert into public.payment_methods (
  code,
  display_name,
  category,
  bank_or_provider_name,
  account_holder_name,
  account_number_or_id,
  payment_instructions,
  min_amount,
  max_amount,
  transaction_fee_pct,
  transaction_fee_fixed,
  is_active,
  requires_proof,
  requires_admin_verification,
  sort_order,
  updated_at
)
values
  ('local_test_bank', 'Bank Transfer (Local Test)', 'bank_transfer', 'Local Test Bank', 'Platform Test Account', 'LOCAL-TEST-BANK-001', 'Local testing only. No real transfer or deposit can be made with this placeholder.', 1, 10000000, 0, 0, true, true, true, 1, now()),
  ('local_test_gcash', 'GCash (Local Test)', 'ewallet', 'GCash (Local Test)', 'Platform Test Account', 'LOCAL-TEST-GCASH-001', 'Local testing only. This placeholder is not a payment destination.', 1, 1000000, 0, 0, true, true, true, 2, now()),
  ('local_test_maya', 'Maya (Local Test)', 'ewallet', 'Maya (Local Test)', 'Platform Test Account', 'LOCAL-TEST-MAYA-001', 'Local testing only. This placeholder is not a payment destination.', 1, 1000000, 0, 0, true, true, true, 3, now()),
  ('local_test_qrph', 'QR Ph (Local Test)', 'qr_ph', 'QR Ph (Local Test)', 'Platform Test Account', 'LOCAL-TEST-QRPH-001', 'Local testing only. No real QR payment is configured.', 1, 1000000, 0, 0, true, true, true, 4, now())
on conflict (code) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  bank_or_provider_name = excluded.bank_or_provider_name,
  account_holder_name = excluded.account_holder_name,
  account_number_or_id = excluded.account_number_or_id,
  payment_instructions = excluded.payment_instructions,
  min_amount = excluded.min_amount,
  max_amount = excluded.max_amount,
  transaction_fee_pct = excluded.transaction_fee_pct,
  transaction_fee_fixed = excluded.transaction_fee_fixed,
  is_active = excluded.is_active,
  requires_proof = excluded.requires_proof,
  requires_admin_verification = excluded.requires_admin_verification,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.projects (
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
  status
)
select
  u.id,
  seed.title,
  seed.house_type,
  'new_build'::public.work_type,
  seed.lot_area_sqm,
  seed.floor_area_sqm,
  seed.floors,
  seed.bedrooms,
  seed.bathrooms,
  seed.finish_level,
  seed.city,
  seed.province,
  seed.budget,
  seed.desired_start,
  seed.budget * 0.90,
  seed.budget,
  seed.budget * 1.10,
  'open'::public.project_status
from (
  values
    ('home1@gmail.com', 'Two-Storey Family Home', 'two_storey'::public.house_type, 160.00::numeric, 142.00::numeric, 2, 4, 3, 'standard'::public.finish_level, 'Quezon City', 'Metro Manila', 5200000.00::numeric, 'in_2_months'::public.start_window),
    ('home2@gmail.com', 'Modern Bungalow Residence', 'one_storey'::public.house_type, 210.00::numeric, 118.00::numeric, 1, 3, 2, 'premium'::public.finish_level, 'Cebu City', 'Cebu', 4600000.00::numeric, 'in_6_months'::public.start_window),
    ('home3@gmail.com', 'Three-Level Townhouse', 'townhouse'::public.house_type, 92.00::numeric, 176.00::numeric, 3, 4, 3, 'standard'::public.finish_level, 'Davao City', 'Davao del Sur', 6100000.00::numeric, 'asap'::public.start_window)
) as seed(email, title, house_type, lot_area_sqm, floor_area_sqm, floors, bedrooms, bathrooms, finish_level, city, province, budget, desired_start)
join auth.users u on lower(u.email) = seed.email;

do $$
begin
  if (select count(*) from auth.users) <> 9
    or (select count(*) from public.contractor_profiles) <> 5
    or (select count(*) from public.contractor_documents where doc_type = 'license' and status = 'pending') <> 5
    or (select count(*) from public.contractor_payout_accounts) <> 15
    or (select count(*) from public.payment_provider_configs) <> 5
    or (select count(*) from public.payment_methods) <> 4
    or (select count(*) from public.portfolio_items) <> 15
    or (select count(*) from public.portfolio_images) <> 15
    or (select count(*) from public.profiles where role = 'admin') <> 1
    or (select count(*) from public.profiles where role = 'homeowner') <> 3
    or (select count(*) from public.projects where status = 'open') <> 3
  then
    raise exception 'Seed verification failed; rolling back the reset and seed.';
  end if;
end
$$;

commit;

select
  (select count(*) from auth.users) as auth_accounts,
  (select count(*) from public.profiles where role = 'admin') as admins,
  (select count(*) from public.contractor_profiles) as contractors,
  (select count(*) from public.contractor_documents where doc_type = 'license') as sample_license_records,
  (select count(*) from public.contractor_payout_accounts) as contractor_payout_methods,
  (select count(*) from public.payment_provider_configs) as admin_payment_providers,
  (select count(*) from public.payment_methods) as admin_payment_channels,
  (select count(*) from public.portfolio_items) as portfolio_items,
  (select count(*) from public.portfolio_images) as portfolio_project_images,
  (select count(*) from public.profiles where role = 'homeowner') as homeowners,
  (select count(*) from public.projects where status = 'open') as projects_waiting_for_contractors;
