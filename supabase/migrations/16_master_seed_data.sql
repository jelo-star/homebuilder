-- SMART CONTRACTOR MATCHING | 16: Comprehensive Master Seed Data
-- Populates complete, realistic Philippine residential projects, contractors, credentials,
-- portfolio items, quotes, milestone schedules, escrow ledger entries, and reviews.
-- Safe to re-run (idempotent with UPSERT / ON CONFLICT); existing passwords
-- are preserved when demo accounts already exist.

do $$
declare
  -- Deterministic Auth User IDs
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_home_id  uuid := 'a0000000-0000-0000-0000-000000000002';
  v_home2_id uuid := 'a0000000-0000-0000-0000-000000000012';
  v_cont_id  uuid := 'a0000000-0000-0000-0000-000000000003';
  v_cont2_id uuid := 'a0000000-0000-0000-0000-000000000004';
  v_cont3_id uuid := 'a0000000-0000-0000-0000-000000000005';

  -- Projects
  v_proj1_id uuid := 'b0000000-0000-0000-0000-000000000001'; -- In Progress (Awarded to Apex Builders)
  v_proj2_id uuid := 'b0000000-0000-0000-0000-000000000002'; -- Open for Bidding (New build in Antipolo)
  v_proj3_id uuid := 'b0000000-0000-0000-0000-000000000003'; -- Completed (Turnover done)
  v_proj4_id uuid := 'b0000000-0000-0000-0000-000000000004'; -- Open Renovation in Makati

  -- Quotes
  v_quote1_id uuid := 'c0000000-0000-0000-0000-000000000001'; -- Accepted on Proj 1
  v_quote2_id uuid := 'c0000000-0000-0000-0000-000000000002'; -- Competing submitted on Proj 1
  v_quote3_id uuid := 'c0000000-0000-0000-0000-000000000003'; -- Submitted on Proj 2
  v_quote4_id uuid := 'c0000000-0000-0000-0000-000000000004'; -- Accepted on Proj 3

  -- Milestones for Project 1
  v_ms1_id uuid := 'd0000000-0000-0000-0000-000000000001';
  v_ms2_id uuid := 'd0000000-0000-0000-0000-000000000002';
  v_ms3_id uuid := 'd0000000-0000-0000-0000-000000000003';
  v_ms4_id uuid := 'd0000000-0000-0000-0000-000000000004';
  v_ms5_id uuid := 'd0000000-0000-0000-0000-000000000005';
  v_ms6_id uuid := 'd0000000-0000-0000-0000-000000000006';

  -- Payments & Payouts
  v_pay1_id uuid := 'e0000000-0000-0000-0000-000000000001';
  v_payout1_id uuid := 'f0000000-0000-0000-0000-000000000001';

  v_hash text;
begin
  -- Secure bcrypt hash for password '123123'
  v_hash := extensions.crypt('123123', extensions.gen_salt('bf'));

  -- =========================================================================
  -- 1. AUTH USERS (All Core and Extended Accounts)
  -- =========================================================================
  -- Admin (admin@gmail.com)
  if not exists (select 1 from auth.users where id = v_admin_id or email = 'admin@gmail.com') then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@gmail.com', v_hash, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Platform Administrator","role":"admin"}'::jsonb, now(), now());
  else
    select id into v_admin_id from auth.users where email = 'admin@gmail.com';
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_admin_id;
  end if;

  -- Homeowner 1 (home@gmail.com)
  if not exists (select 1 from auth.users where id = v_home_id or email = 'home@gmail.com') then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_home_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'home@gmail.com', v_hash, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Juan Homeowner","role":"homeowner"}'::jsonb, now(), now());
  else
    select id into v_home_id from auth.users where email = 'home@gmail.com';
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_home_id;
  end if;

  -- Homeowner 2 (maria.home@gmail.com)
  if not exists (select 1 from auth.users where id = v_home2_id or email = 'maria.home@gmail.com') then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_home2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maria.home@gmail.com', v_hash, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Maria Santos","role":"homeowner"}'::jsonb, now(), now());
  else
    select id into v_home2_id from auth.users where email = 'maria.home@gmail.com';
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_home2_id;
  end if;

  -- Contractor 1 (cont@gmail.com)
  if not exists (select 1 from auth.users where id = v_cont_id or email = 'cont@gmail.com') then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_cont_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cont@gmail.com', v_hash, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Apex Builders Construction","role":"contractor"}'::jsonb, now(), now());
  else
    select id into v_cont_id from auth.users where email = 'cont@gmail.com';
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_cont_id;
  end if;

  -- Contractor 2 (metrobuild@gmail.com)
  if not exists (select 1 from auth.users where id = v_cont2_id or email = 'metrobuild@gmail.com') then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_cont2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'metrobuild@gmail.com', v_hash, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Engr. Carlo Gomez","role":"contractor"}'::jsonb, now(), now());
  else
    select id into v_cont2_id from auth.users where email = 'metrobuild@gmail.com';
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_cont2_id;
  end if;

  -- Contractor 3 (solidrock@gmail.com)
  if not exists (select 1 from auth.users where id = v_cont3_id or email = 'solidrock@gmail.com') then
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_cont3_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'solidrock@gmail.com', v_hash, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Arch. Roberto Diaz","role":"contractor"}'::jsonb, now(), now());
  else
    select id into v_cont3_id from auth.users where email = 'solidrock@gmail.com';
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_cont3_id;
  end if;

  -- =========================================================================
  -- 2. PROFILES (Ensured for ALL accounts)
  -- =========================================================================
  insert into public.profiles (id, role, full_name, phone, city)
  values
    (v_admin_id, 'admin', 'Platform Administrator', '09170000001', 'Manila'),
    (v_home_id, 'homeowner', 'Juan Homeowner', '09170000002', 'Quezon City'),
    (v_home2_id, 'homeowner', 'Maria Santos', '09180000004', 'Pasig'),
    (v_cont_id, 'contractor', 'Apex Builders Construction Co.', '09170000003', 'Quezon City'),
    (v_cont2_id, 'contractor', 'Metro Manila Design & Build Corp.', '09170000005', 'Pasig'),
    (v_cont3_id, 'contractor', 'SolidRock Engineering & Builders', '09170000006', 'Antipolo')
  on conflict (id) do update set
    role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    city = excluded.city;

  -- =========================================================================
  -- 3. CONTRACTOR PROFILES (Detailed Philippine Business Data)
  -- =========================================================================
  -- Contractor 1: Apex Builders (cont@gmail.com)
  insert into public.contractor_profiles (
    profile_id, business_name, trade_name, business_type, authorized_representative,
    business_email, business_phone, business_address, province, bio,
    years_experience, team_capacity, pcab_category, pcab_license_no, dti_sec_no, bir_tin,
    service_cities, specialties, finish_levels, work_types, license_no,
    verification_status, verified_at, verified_by, rating_avg, rating_count, projects_completed, is_active
  ) values (
    v_cont_id, 'Apex Builders Construction Co.', 'Apex Home Builders', 'corporation', 'Engr. Juan Dela Cruz, P.E.',
    'contact@apexbuilders.ph', '09170000003', 'Unit 804, JMT Corporate Condominium, ADB Ave., Ortigas Center, Pasig City', 'Metro Manila',
    'Philippine Contractors Accreditation Board (PCAB) licensed general builder with over 10 years of structural engineering excellence. We specialize in residential two-storey houses, reinforced concrete framing, and turnkey finishes.',
    10, 24, 'Category B', 'PCAB-2026-REG-8921', 'CS2016-09214', '009-412-881-000',
    array['Quezon City', 'Pasig', 'Makati', 'Taguig', 'Mandaluyong', 'Antipolo'],
    array['one_storey'::public.house_type, 'two_storey'::public.house_type, 'townhouse'::public.house_type],
    array['basic'::public.finish_level, 'standard'::public.finish_level, 'premium'::public.finish_level],
    array['new_build'::public.work_type, 'renovation'::public.work_type, 'extension'::public.work_type],
    'PCAB-2026-REG-8921', 'approved'::public.verification_status, now(), v_admin_id,
    4.95, 24, 38, true
  )
  on conflict (profile_id) do update set
    business_name = excluded.business_name,
    trade_name = excluded.trade_name,
    business_type = excluded.business_type,
    authorized_representative = excluded.authorized_representative,
    business_email = excluded.business_email,
    business_phone = excluded.business_phone,
    business_address = excluded.business_address,
    pcab_category = excluded.pcab_category,
    pcab_license_no = excluded.pcab_license_no,
    verification_status = 'approved',
    is_active = true,
    rating_avg = 4.95,
    projects_completed = 38;

  -- Contractor 2: Metro Manila Design & Build (metrobuild@gmail.com)
  insert into public.contractor_profiles (
    profile_id, business_name, trade_name, business_type, authorized_representative,
    business_email, business_phone, business_address, province, bio,
    years_experience, team_capacity, pcab_category, pcab_license_no, dti_sec_no, bir_tin,
    service_cities, specialties, finish_levels, work_types, license_no,
    verification_status, verified_at, verified_by, rating_avg, rating_count, projects_completed, is_active
  ) values (
    v_cont2_id, 'Metro Manila Design & Build Corp.', 'MetroBuild Studio', 'corporation', 'Engr. Carlo Gomez',
    'info@metrobuild.ph', '09170000005', '12 F. Manalo St., Pasig City', 'Metro Manila',
    'Architectural design and general construction firm focusing on modern contemporary residential townhouses and premium architectural finishes across Metro Manila.',
    8, 16, 'Category A', 'PCAB-2025-REG-4412', 'CS2018-11042', '008-319-221-000',
    array['Pasig', 'Makati', 'Taguig', 'Quezon City', 'San Juan'],
    array['two_storey'::public.house_type, 'townhouse'::public.house_type],
    array['standard'::public.finish_level, 'premium'::public.finish_level],
    array['new_build'::public.work_type, 'renovation'::public.work_type],
    'PCAB-2025-REG-4412', 'approved'::public.verification_status, now(), v_admin_id,
    4.80, 18, 22, true
  )
  on conflict (profile_id) do update set
    verification_status = 'approved',
    is_active = true,
    rating_avg = 4.80;

  -- Contractor 3: SolidRock General Contracting (solidrock@gmail.com)
  insert into public.contractor_profiles (
    profile_id, business_name, trade_name, business_type, authorized_representative,
    business_email, business_phone, business_address, province, bio,
    years_experience, team_capacity, pcab_category, pcab_license_no, dti_sec_no, bir_tin,
    service_cities, specialties, finish_levels, work_types, license_no,
    verification_status, verified_at, verified_by, rating_avg, rating_count, projects_completed, is_active
  ) values (
    v_cont3_id, 'SolidRock Engineering & Builders', 'SolidRock Homes', 'sole_proprietorship', 'Arch. Roberto Diaz',
    'roberto@solidrock.ph', '09170000006', 'Km. 23 Sumulong Highway, Antipolo City', 'Rizal',
    'Master builders specializing in sloping terrain structural foundations, custom bungalows, and durable long-span roofing for residential owners in Rizal and eastern NCR.',
    12, 14, 'Category C', 'PCAB-2024-REG-1092', 'BN-0429182', '007-882-990-000',
    array['Antipolo', 'Marikina', 'Quezon City', 'Taytay', 'Cainta'],
    array['one_storey'::public.house_type, 'two_storey'::public.house_type],
    array['basic'::public.finish_level, 'standard'::public.finish_level],
    array['new_build'::public.work_type, 'extension'::public.work_type],
    'PCAB-2024-REG-1092', 'approved'::public.verification_status, now(), v_admin_id,
    4.90, 12, 29, true
  )
  on conflict (profile_id) do update set
    verification_status = 'approved',
    is_active = true,
    rating_avg = 4.90;

  -- =========================================================================
  -- 4. CONTRACTOR CREDENTIAL DOCUMENTS
  -- =========================================================================
  insert into public.contractor_documents (
    contractor_id, doc_type, doc_title, doc_number, issuing_authority,
    issue_date, expiry_date, file_path, status, reviewed_by, reviewed_at
  ) values
    (v_cont_id, 'license', 'PCAB General Contractor License 2026', 'PCAB-2026-REG-8921', 'Philippine Contractors Accreditation Board', '2026-01-10', '2027-06-30', 'cont-docs/apex_pcab_license_2026.pdf', 'approved', v_admin_id, now()),
    (v_cont_id, 'permit', 'Mayor’s & Business Tax Permit 2026', 'BP-PASIG-2026-00481', 'City Government of Pasig - BPLO', '2026-01-15', '2026-12-31', 'cont-docs/apex_mayors_permit_2026.pdf', 'approved', v_admin_id, now()),
    (v_cont_id, 'gov_id', 'Authorized Managing Officer PRC ID', 'PRC-CIVIL-009182', 'Professional Regulation Commission', '2023-05-12', '2028-05-12', 'cont-docs/apex_prc_id_managing_officer.jpg', 'approved', v_admin_id, now()),
    (v_cont_id, 'other', 'BIR Form 2303 Certificate of Registration', 'TIN-009-412-881', 'Bureau of Internal Revenue RDO 043', '2016-09-22', null, 'cont-docs/apex_bir_2303.pdf', 'approved', v_admin_id, now()),

    (v_cont2_id, 'license', 'PCAB License Category A', 'PCAB-2025-REG-4412', 'PCAB / CIAP', '2025-07-01', '2027-06-30', 'cont-docs/metrobuild_pcab.pdf', 'approved', v_admin_id, now()),
    (v_cont3_id, 'license', 'PCAB License Category C', 'PCAB-2024-REG-1092', 'PCAB / CIAP', '2024-07-01', '2027-06-30', 'cont-docs/solidrock_pcab.pdf', 'approved', v_admin_id, now())
  on conflict do nothing;

  -- =========================================================================
  -- 5. CONTRACTOR PORTFOLIO PROJECTS (Completed Builds for Homeowner Showcase)
  -- =========================================================================
  insert into public.portfolio_items (id, contractor_id, title, description, house_type, floors, floor_area_sqm, year_completed)
  values
    ('70000000-0000-0000-0000-000000000001', v_cont_id, 'Modern 2-Storey Residence in Antipolo Hills',
     'Turnkey 2-storey reinforced concrete home with standard porcelain floor tiles, rib-type pre-painted roofing, customized modular kitchen, and 3-car garage.',
     'two_storey', 2, 185.00, 2025),
    ('70000000-0000-0000-0000-000000000002', v_cont_id, 'Contemporary Bungalow Home in Quezon City',
     'Single-storey open-concept family bungalow featuring cathedral ceilings, insulated metal roof deck, 3 bedrooms, 2 bathrooms, and perimeter wall with automated gate.',
     'one_storey', 1, 110.00, 2024),
    ('70000000-0000-0000-0000-000000000003', v_cont_id, '3-Storey Urban Townhouse in Pasig City',
     'Structural extension and turnkey multi-family townhouse including complete MEP rough-ins, tempered glass balconies, and premium wood-grain ceramic flooring.',
     'townhouse', 3, 240.00, 2025),

    ('70000000-0000-0000-0000-000000000004', v_cont2_id, 'Minimalist Two-Storey Residence in BGC Taguig',
     'Architectural modern house with high-grade imported tiles, smart LED lighting channels, floor-to-ceiling glass fenestrations, and reinforced retaining wall.',
     'two_storey', 2, 210.00, 2025),

    ('70000000-0000-0000-0000-000000000005', v_cont3_id, 'Elevated View Residence on Sloping Lot',
     'Custom residential structure designed for sloping terrain with deep footing foundation, stepped concrete slabs, and storm-resistant long span metal roofing.',
     'two_storey', 2, 160.00, 2024)
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    floor_area_sqm = excluded.floor_area_sqm,
    year_completed = excluded.year_completed;

  insert into public.portfolio_images (portfolio_item_id, file_path, sort_order)
  values
    ('70000000-0000-0000-0000-000000000001', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80', 1),
    ('70000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80', 1),
    ('70000000-0000-0000-0000-000000000003', 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80', 1),
    ('70000000-0000-0000-0000-000000000004', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80', 1),
    ('70000000-0000-0000-0000-000000000005', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80', 1)
  on conflict do nothing;

  -- =========================================================================
  -- 6. HOMEOWNER PROJECTS (Insert with awarded_quote_id = null first to satisfy FK)
  -- =========================================================================
  -- Project 1: Awarded & In Progress (Juan Homeowner -> Apex Builders)
  insert into public.projects (
    id, homeowner_id, title, house_type, work_type, finish_level,
    floor_area_sqm, floors, bedrooms, bathrooms, city, province,
    budget, desired_start, est_low, est_mid, est_high, estimate_confidence,
    status, awarded_quote_id, created_at, updated_at
  ) values (
    v_proj1_id, v_home_id, '2-Storey Modern Residence in Quezon City', 'two_storey', 'new_build', 'standard',
    150.00, 2, 3, 2, 'Quezon City', 'Metro Manila',
    4200000.00, 'asap', 3800000.00, 4125000.00, 4450000.00, 'preliminary',
    'in_progress', null, now() - interval '25 days', now() - interval '2 days'
  )
  on conflict (id) do update set
    status = 'in_progress';

  -- Project 2: Open for Bidding (New build in Antipolo)
  insert into public.projects (
    id, homeowner_id, title, house_type, work_type, finish_level,
    floor_area_sqm, floors, bedrooms, bathrooms, city, province,
    budget, desired_start, est_low, est_mid, est_high, estimate_confidence,
    status, created_at, updated_at
  ) values (
    v_proj2_id, v_home_id, 'Bungalow Family Home in Antipolo', 'one_storey', 'new_build', 'standard',
    100.00, 1, 3, 2, 'Antipolo', 'Rizal',
    2800000.00, 'in_2_months', 2500000.00, 2750000.00, 3050000.00, 'preliminary',
    'open', now() - interval '3 days', now()
  )
  on conflict (id) do update set
    status = 'open';

  -- Project 3: Completed Construction (Maria Santos -> Apex Builders)
  insert into public.projects (
    id, homeowner_id, title, house_type, work_type, finish_level,
    floor_area_sqm, floors, bedrooms, bathrooms, city, province,
    budget, desired_start, est_low, est_mid, est_high, estimate_confidence,
    status, awarded_quote_id, created_at, updated_at
  ) values (
    v_proj3_id, v_home2_id, 'Single-Storey Townhome in Pasig', 'one_storey', 'new_build', 'basic',
    80.00, 1, 2, 1, 'Pasig', 'Metro Manila',
    1900000.00, 'asap', 1700000.00, 1850000.00, 2050000.00, 'preliminary',
    'completed', null, now() - interval '90 days', now() - interval '10 days'
  )
  on conflict (id) do update set
    status = 'completed';

  -- Project 4: Open Renovation in Makati
  insert into public.projects (
    id, homeowner_id, title, house_type, work_type, finish_level,
    floor_area_sqm, floors, bedrooms, bathrooms, city, province,
    budget, desired_start, est_low, est_mid, est_high, estimate_confidence,
    status, created_at, updated_at
  ) values (
    v_proj4_id, v_home2_id, 'Kitchen & Ground Floor Renovation in Makati', 'two_storey', 'renovation', 'premium',
    75.00, 2, 3, 2, 'Makati', 'Metro Manila',
    1600000.00, 'in_2_months', 1450000.00, 1620000.00, 1800000.00, 'preliminary',
    'open', now() - interval '1 day', now()
  )
  on conflict (id) do update set
    status = 'open';

  -- =========================================================================
  -- 7. PROJECT MATCHES
  -- =========================================================================
  insert into public.project_matches (project_id, contractor_id, match_score, reasons)
  values
    (v_proj1_id, v_cont_id, 96.00, '{"specialty_fit": 100, "rating_component": 98, "experience_component": 95, "service_city_match": true, "summary": "Direct match for 2-storey house in Quezon City • 10 years experience"}'::jsonb),
    (v_proj1_id, v_cont2_id, 88.00, '{"specialty_fit": 95, "rating_component": 92, "experience_component": 85, "service_city_match": true, "summary": "Compatible design-build contractor"}'::jsonb),
    (v_proj2_id, v_cont_id, 92.00, '{"specialty_fit": 95, "rating_component": 98, "experience_component": 95, "service_city_match": true, "summary": "Operates directly in Antipolo • High client satisfaction"}'::jsonb),
    (v_proj2_id, v_cont3_id, 98.00, '{"specialty_fit": 100, "rating_component": 96, "experience_component": 98, "service_city_match": true, "summary": "Local Antipolo builder with sloping lot expertise"}'::jsonb),
    (v_proj4_id, v_cont_id, 90.00, '{"specialty_fit": 92, "rating_component": 98, "experience_component": 95, "service_city_match": true, "summary": "Full renovation capabilities"}'::jsonb),
    (v_proj4_id, v_cont2_id, 95.00, '{"specialty_fit": 98, "rating_component": 95, "experience_component": 92, "service_city_match": true, "summary": "Specialized in Makati luxury interior architectural renovations"}'::jsonb)
  on conflict (project_id, contractor_id) do update set
    match_score = excluded.match_score,
    reasons = excluded.reasons;

  -- =========================================================================
  -- 8. QUOTES & BIDS (Detailed with Scope, Terms & Revisions)
  -- =========================================================================
  -- Quote 1: Apex Builders on Project 1 (Accepted)
  insert into public.quotes (
    id, project_id, contractor_id, status, price, duration_months,
    scope_of_work, inclusions, exclusions, assumptions, warranty_terms,
    valid_until, requested_at, submitted_at, decided_at, revision_number
  ) values (
    v_quote1_id, v_proj1_id, v_cont_id, 'accepted', 4050000.00, 5,
    'Complete construction of 2-storey 150sqm residence including site preparation, earthworks, reinforced concrete framing, 6-inch CHB masonry, long-span metal roofing, electrical rough-ins, sanitary plumbing, and standard porcelain finishes.',
    'Full labor, materials, engineering supervision, temporary facilities, testing of concrete cylinders, rough plumbing, standard ceramic floor and wall tiles.',
    'Meralco permanent service connection fees, Manila Water meter application, specialty chandelier fixtures, customized furniture.',
    'Normal soil bearing capacity of 100 kPa; flat level lot terrain with ready access for transit mixers.',
    '15-year structural warranty on reinforced concrete framing; 1-year architectural warranty on finishes and plumbing leaks.',
    now() + interval '14 days', now() - interval '24 days', now() - interval '23 days', now() - interval '20 days', 1
  )
  on conflict (id) do update set
    status = 'accepted',
    price = 4050000.00;

  -- Quote 2: MetroBuild on Project 1 (Declined)
  insert into public.quotes (
    id, project_id, contractor_id, status, price, duration_months,
    scope_of_work, inclusions, exclusions, valid_until, requested_at, submitted_at, decided_at
  ) values (
    v_quote2_id, v_proj1_id, v_cont2_id, 'declined', 4280000.00, 6,
    'Turnkey design-build construction with imported tile specifications and premium glass balconies.',
    'Turnkey architectural construction, premium fixtures, safety compliance.',
    'Permit fees, utility service deposits.',
    now() - interval '5 days', now() - interval '23 days', now() - interval '22 days', now() - interval '20 days'
  )
  on conflict (id) do update set status = 'declined';

  -- Quote 3: SolidRock on Project 2 (Submitted / Under Review)
  insert into public.quotes (
    id, project_id, contractor_id, status, price, duration_months,
    scope_of_work, inclusions, exclusions, warranty_terms, valid_until, requested_at, submitted_at
  ) values (
    v_quote3_id, v_proj2_id, v_cont3_id, 'submitted', 2680000.00, 4,
    'Turnkey single-storey bungalow construction in Antipolo, reinforced concrete footing, metal framing, pre-painted rib-type roofing.',
    'Structural civil works, labor, materials, sanitary and electrical works, standard tiles and paint.',
    'Site retaining walls (if necessary upon survey), Meralco connection.',
    '10-year structural warranty, 1-year workmanship warranty.',
    now() + interval '11 days', now() - interval '2 days', now() - interval '1 day'
  )
  on conflict (id) do update set status = 'submitted';

  -- Quote 4: Apex Builders on Project 3 (Accepted & Fully Completed)
  insert into public.quotes (
    id, project_id, contractor_id, status, price, duration_months,
    scope_of_work, inclusions, exclusions, valid_until, requested_at, submitted_at, decided_at
  ) values (
    v_quote4_id, v_proj3_id, v_cont_id, 'accepted', 1820000.00, 3,
    'Single-storey starter home construction in Pasig.',
    'Full labor, materials, standard finishes, sanitary lines.',
    'Landscaping, fence gate.',
    now() - interval '60 days', now() - interval '85 days', now() - interval '84 days', now() - interval '80 days'
  )
  on conflict (id) do update set status = 'accepted';

  -- Connect awarded quotes back to projects
  update public.projects set awarded_quote_id = v_quote1_id where id = v_proj1_id;
  update public.projects set awarded_quote_id = v_quote4_id where id = v_proj3_id;

  -- =========================================================================
  -- 9. MILESTONES (For Active Project 1: Total ₱4,050,000)
  -- =========================================================================
  insert into public.milestones (id, project_id, quote_id, seq, name, percent, amount, status, approved_at, paid_at)
  values
    -- Milestone 1: Mobilization & Foundation (20% = ₱810,000) -> Paid
    (v_ms1_id, v_proj1_id, v_quote1_id, 1, 'Mobilization & Foundation Works', 20.00, 810000.00, 'paid', now() - interval '10 days', now() - interval '10 days'),
    -- Milestone 2: Superstructure & Framing (25% = ₱1,012,500) -> Proof Submitted (Ready for Homeowner Sign-off)
    (v_ms2_id, v_proj1_id, v_quote1_id, 2, 'Superstructure, Columns & Second Floor Slab', 25.00, 1012500.00, 'proof_submitted', null, null),
    -- Milestone 3: Roofing & Waterproofing (20% = ₱810,000) -> Locked
    (v_ms3_id, v_proj1_id, v_quote1_id, 3, 'Masonry, Roofing & Waterproofing', 20.00, 810000.00, 'locked', null, null),
    -- Milestone 4: MEP Utilities Rough-in (15% = ₱607,500) -> Locked
    (v_ms4_id, v_proj1_id, v_quote1_id, 4, 'Electrical & Plumbing Rough-Ins', 15.00, 607500.00, 'locked', null, null),
    -- Milestone 5: Architectural Finishes (15% = ₱607,500) -> Locked
    (v_ms5_id, v_proj1_id, v_quote1_id, 5, 'Doors, Windows & Architectural Finishes', 15.00, 607500.00, 'locked', null, null),
    -- Milestone 6: Final Turnover & Testing (5% = ₱202,500) -> Locked
    (v_ms6_id, v_proj1_id, v_quote1_id, 6, 'Final Punchlist, Testing & Turnover', 5.00, 202500.00, 'locked', null, null)
  on conflict (id) do update set
    status = excluded.status,
    amount = excluded.amount;

  -- =========================================================================
  -- 10. MILESTONE PROOFS (Photographic Site Inspection Evidence)
  -- =========================================================================
  insert into public.milestone_proofs (milestone_id, uploaded_by, file_path, note, created_at)
  values
    (v_ms1_id, v_cont_id, 'https://images.unsplash.com/photo-1541888946425-d0fbb18615f3?auto=format&fit=crop&w=1000&q=80',
     'Footing rebar inspection completed. Ready mix concrete poured at 3,000 PSI with laboratory slump test clearance.', now() - interval '12 days'),
    (v_ms2_id, v_cont_id, 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=1000&q=80',
     'Second floor beam and slab casting completed. Curing blankets applied for 14-day hydration. Ready for homeowner stage inspection.', now() - interval '1 day')
  on conflict do nothing;

  -- =========================================================================
  -- 11. ESCROW PAYMENTS, LEDGER & PAYOUT DISBURSEMENTS
  -- =========================================================================
  -- Payment of total project into escrow (Held)
  insert into public.payments (
    id, project_id, quote_id, payer_id, amount, method, provider, provider_ref, status, paid_at
  ) values (
    v_pay1_id, v_proj1_id, v_quote1_id, v_home_id, 4050000.00, 'bank_transfer',
    'BDO Unibank Online Escrow', 'BDO-ESCROW-2026-90412', 'held', now() - interval '18 days'
  )
  on conflict (id) do update set status = 'held';

  -- Escrow Ledger Entries (Deposit & Release)
  insert into public.escrow_ledger (project_id, milestone_id, payment_id, entry_type, amount, from_party, to_party, note, created_at)
  values
    (v_proj1_id, null, v_pay1_id, 'deposit', 4050000.00, v_home_id, null,
     'Homeowner deposited full project funds into protected escrow vault (Ref: BDO-ESCROW-2026-90412)', now() - interval '18 days'),
    (v_proj1_id, v_ms1_id, v_pay1_id, 'release', 810000.00, null, v_cont_id,
     'Stage 1 Mobilization & Foundation milestone payout released to contractor upon homeowner approval', now() - interval '10 days')
  on conflict do nothing;

  -- Payout Record for Milestone 1
  insert into public.payouts (
    id, contractor_id, milestone_id, gross_amount, fee_amount, net_amount, status, provider_ref, sent_at
  ) values (
    v_payout1_id, v_cont_id, v_ms1_id, 810000.00, 0.00, 810000.00, 'sent', 'INSTAPAY-TXN-881920', now() - interval '10 days'
  )
  on conflict (id) do update set status = 'sent';

  -- =========================================================================
  -- 12. CLIENT REVIEWS
  -- =========================================================================
  insert into public.reviews (project_id, homeowner_id, contractor_id, rating, comment, created_at)
  values (
    v_proj3_id, v_home2_id, v_cont_id, 5,
    'Engr. Juan and Apex Builders did an outstanding job on our single-storey home in Pasig. Work was turned over 2 weeks ahead of schedule with zero unexpected variation costs. Every milestone was documented with photos before we released escrow payments. Highly recommended!',
    now() - interval '9 days'
  )
  on conflict (project_id) do update set
    rating = excluded.rating,
    comment = excluded.comment;

  -- =========================================================================
  -- 13. REAL-TIME NOTIFICATIONS
  -- =========================================================================
  insert into public.notifications (user_id, type, title, body, created_at)
  values
    (v_cont_id, 'quote_accepted', 'Quotation Accepted!', 'Juan Homeowner accepted your proposal of ₱4,050,000 for the Quezon City 2-Storey Residence. Escrow funded.', now() - interval '18 days'),
    (v_cont_id, 'payout_sent', 'Payout Released: ₱810,000', 'Stage 1 Foundation milestone payout of ₱810,000 has been sent to your registered BDO account via InstaPay.', now() - interval '10 days'),
    (v_home_id, 'proof_submitted', 'Milestone Proof Submitted', 'Apex Builders submitted photographic proof for Stage 2 (Superstructure & Slab). Please review within 5 days.', now() - interval '1 day'),
    (v_cont_id, 'new_opportunity', 'New Project Lead in Antipolo', 'A homeowner posted a 100 sq.m Bungalow project matching your service coverage and PCAB rating.', now() - interval '3 days')
  on conflict do nothing;

end $$;
