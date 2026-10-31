-- Reset public application data while preserving Supabase Auth users.
-- Seeds the three requested demo accounts and a complete homeowner/contractor workflow.

do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('truncate table %I.%I cascade', table_record.schemaname, table_record.tablename);
  end loop;
end $$;

do $$
declare
  v_admin uuid;
  v_home uuid;
  v_contractor uuid;
  v_admin_seed uuid := 'a4300000-0000-0000-0000-000000000001';
  v_home_seed uuid := 'a4300000-0000-0000-0000-000000000002';
  v_contractor_seed uuid := 'a4300000-0000-0000-0000-000000000003';
  v_open_project uuid := 'b4300000-0000-0000-0000-000000000001';
  v_active_project uuid := 'b4300000-0000-0000-0000-000000000002';
  v_open_quote uuid := 'c4300000-0000-0000-0000-000000000001';
  v_accepted_quote uuid := 'c4300000-0000-0000-0000-000000000002';
  v_milestone_1 uuid := 'd4300000-0000-0000-0000-000000000001';
  v_milestone_2 uuid := 'd4300000-0000-0000-0000-000000000002';
  v_payment uuid := 'e4300000-0000-0000-0000-000000000001';
  v_hash text := extensions.crypt('123123', extensions.gen_salt('bf'));
begin
  select id into v_admin from auth.users where lower(email) = 'admin@gmail.com' limit 1;
  select id into v_home from auth.users where lower(email) = 'home@gmail.com' limit 1;
  select id into v_contractor from auth.users where lower(email) = 'cont@gmail.com' limit 1;

  if v_admin is null then
    v_admin := v_admin_seed;
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@gmail.com', v_hash, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Platform Administrator","role":"admin"}'::jsonb, now(), now()
    );
  end if;

  if v_home is null then
    v_home := v_home_seed;
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      v_home, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'home@gmail.com', v_hash, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Juan Homeowner","role":"homeowner"}'::jsonb, now(), now()
    );
  end if;

  if v_contractor is null then
    v_contractor := v_contractor_seed;
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      v_contractor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'cont@gmail.com', v_hash, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Apex Builders Construction Co.","role":"contractor"}'::jsonb, now(), now()
    );
  end if;

  update auth.users
  set
    encrypted_password = v_hash,
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    confirmation_token = coalesce(confirmation_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    recovery_token = coalesce(recovery_token, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    reauthentication_token = coalesce(reauthentication_token, '')
  where id in (v_admin, v_home, v_contractor);

  insert into public.profiles (id, role, full_name, phone, city)
  values
    (v_admin, 'admin', 'Platform Administrator', '09170000001', 'Manila'),
    (v_home, 'homeowner', 'Juan Homeowner', '09170000002', 'Quezon City'),
    (v_contractor, 'contractor', 'Apex Builders Construction Co.', '09170000003', 'Quezon City')
  on conflict (id) do update set
    role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    city = excluded.city;

  insert into public.contractor_profiles (
    profile_id, business_name, bio, years_experience, service_cities, specialties,
    finish_levels, work_types, license_no, verification_status, rating_avg,
    rating_count, projects_completed, is_active, trade_name, authorized_representative,
    business_email, business_phone, business_address, province, pcab_category,
    pcab_license_no, dti_sec_no, bir_tin, team_capacity, min_project_budget, max_project_budget
  )
  values (
    v_contractor, 'Apex Builders Construction Co.',
    'Demo contractor profile for testing project matching, proposals, milestones, and homeowner review.',
    10, array['Quezon City', 'Manila', 'Antipolo'], array['two_storey', 'one_storey']::public.house_type[],
    array['basic', 'standard', 'premium']::public.finish_level[],
    array['new_build', 'renovation', 'extension']::public.work_type[],
    'DEMO-ONLY-NOT-A-VALID-LICENSE', 'approved', 4.80, 12, 8, true,
    'Apex Builders', 'Engr. Carlo Reyes', 'cont@gmail.com', '09170000003',
    'Quezon City, Metro Manila', 'Metro Manila', 'Demo - Unverified',
    'DEMO-ONLY-NOT-A-VALID-PCAB-LICENSE', 'DEMO-ONLY-NOT-A-VALID-DTI-SEC',
    'DEMO-ONLY-NOT-A-VALID-TIN', 12, 500000, 50000000
  );

  insert into public.projects (
    id, homeowner_id, title, house_type, work_type, lot_area_sqm, floor_area_sqm,
    floors, bedrooms, bathrooms, finish_level, city, province, budget, desired_start,
    est_low, est_mid, est_high, estimate_confidence, status
  )
  values
    (
      v_open_project, v_home, 'Two-Storey Family Home - Open for Proposals',
      'two_storey', 'new_build', 180, 140, 2, 3, 2, 'standard', 'Quezon City',
      'Metro Manila', 4200000, 'in_2_months', 3800000, 4200000, 4600000,
      'preliminary', 'open'
    ),
    (
      v_active_project, v_home, 'Modern Family Residence - Accepted Proposal',
      'two_storey', 'new_build', 200, 160, 2, 4, 3, 'premium', 'Quezon City',
      'Metro Manila', 5200000, 'asap', 4700000, 5100000, 5600000,
      'contractor_submitted', 'in_progress'
    );

  insert into public.project_matches (project_id, contractor_id, match_score, reasons)
  values
    (v_open_project, v_contractor, 96, '{"summary":"Strong match for a Quezon City two-storey build","service_city_match":true,"specialty_fit":98}'::jsonb),
    (v_active_project, v_contractor, 99, '{"summary":"Accepted contractor for active project","service_city_match":true,"specialty_fit":100}'::jsonb);

  insert into public.quotes (
    id, project_id, contractor_id, status, price, duration_months, notes,
    scope_of_work, inclusions, exclusions, assumptions, warranty_terms, payment_terms,
    breakdown, material_quotation, valid_until, requested_at, submitted_at,
    decided_at, revision_number, materials_subtotal, labor_cost, equipment_cost,
    logistics_cost, overhead_profit_cost, other_charges, taxes_cost,
    total_materials_quotation, delivery_charges, quotation_arrangement
  )
  values
    (
      v_open_quote, v_open_project, v_contractor, 'submitted', 3975000, 5,
      'Demo proposal awaiting homeowner review.',
      'Complete construction of the proposed two-storey family home.',
      'Materials, labor, machinery, site overhead, profit, contingency, and taxes.',
      'Utility connection fees and owner-selected furniture.',
      'Normal soil condition and clear site access.',
      'Ten-year structural warranty and one-year workmanship warranty.',
      'Five milestone payments through simulated escrow.',
      '[{"item":"Materials","amount":1850000},{"item":"Labor","amount":1200000},{"item":"Machinery","amount":360000},{"item":"Site management and overhead","amount":180000},{"item":"Contractor profit","amount":240000},{"item":"Contingency","amount":95000},{"item":"Taxes and charges","amount":50000}]'::jsonb,
      '{
        "materials":[
          {"name":"Ready-mix concrete","quantity":"80","unit":"cu.m.","unitPrice":"8500"},
          {"name":"Concrete hollow blocks","quantity":"3200","unit":"pcs","unitPrice":"18.75"}
        ],
        "labor":[{"position":"Construction crew","workers":"8","dailyRate":"2500","days":"60"}],
        "equipment":[{"name":"Concrete mixer","quantity":"1","rate":"45000","duration":"3","arrangement":"rental","fuel":"12000","maintenance":"3000"}],
        "overhead":[{"name":"Site supervision","amount":"180000","description":"Project supervision and temporary site facilities"}],
        "profit":{"amount":240000},
        "contingency":{"amount":95000},
        "taxes":{"amount":50000},
        "calculated_total":3975000
      }'::jsonb,
      now() + interval '14 days', now() - interval '2 days', now() - interval '1 day',
      null, 1, 1850000, 1200000, 360000, 0, 420000, 0, 50000,
      1850000, 0, 'itemized'
    ),
    (
      v_accepted_quote, v_active_project, v_contractor, 'accepted', 4850000, 6,
      'Demo accepted proposal with itemized construction costs.',
      'Complete construction of the modern family residence.',
      'Materials, labor, machinery, site management, profit, contingency, and taxes.',
      'Landscaping and owner-supplied appliances.',
      'Normal soil condition and available construction access.',
      'Ten-year structural warranty and one-year workmanship warranty.',
      'Six milestone payments through simulated escrow.',
      '[{"item":"Materials","amount":2300000},{"item":"Labor","amount":1350000},{"item":"Machinery","amount":420000},{"item":"Site management and overhead","amount":220000},{"item":"Contractor profit","amount":300000},{"item":"Contingency","amount":160000},{"item":"Taxes and charges","amount":100000}]'::jsonb,
      '{
        "materials":[
          {"name":"Ready-mix concrete","quantity":"100","unit":"cu.m.","unitPrice":"9000"},
          {"name":"Reinforcing steel bars","quantity":"7200","unit":"kg","unitPrice":"75"},
          {"name":"Architectural floor tiles","quantity":"160","unit":"sq.m.","unitPrice":"1250"}
        ],
        "labor":[{"position":"Skilled construction crew","workers":"10","dailyRate":"2700","days":"50"}],
        "equipment":[{"name":"Boom lift","quantity":"1","rate":"60000","duration":"4","arrangement":"rental","fuel":"18000","maintenance":"6000"}],
        "overhead":[{"name":"Site management","amount":"220000","description":"Foreman, safety coordination, temporary facilities, and site administration"}],
        "profit":{"amount":300000},
        "contingency":{"amount":160000},
        "taxes":{"amount":100000},
        "calculated_total":4850000
      }'::jsonb,
      now() + interval '10 days', now() - interval '35 days', now() - interval '34 days',
      now() - interval '30 days', 1, 2300000, 1350000, 420000, 0, 520000, 0, 100000,
      2300000, 0, 'itemized'
    );

  update public.projects set awarded_quote_id = v_accepted_quote where id = v_active_project;

  insert into public.milestones (
    id, project_id, quote_id, seq, name, percent, amount, status, approved_at, paid_at
  )
  values
    (v_milestone_1, v_active_project, v_accepted_quote, 1, 'Mobilization and foundation', 25, 1212500, 'paid', now() - interval '12 days', now() - interval '10 days'),
    (v_milestone_2, v_active_project, v_accepted_quote, 2, 'Structural framing and slab', 25, 1212500, 'proof_submitted', null, null);

  insert into public.payments (
    id, project_id, quote_id, payer_id, amount, method, provider, provider_ref, status, paid_at
  )
  values (
    v_payment, v_active_project, v_accepted_quote, v_home, 1212500, 'bank_transfer',
    'Demo Escrow Sandbox', 'DEMO-ESCROW-43001', 'held', now() - interval '10 days'
  );

  insert into public.escrow_ledger (
    project_id, milestone_id, payment_id, entry_type, amount, from_party, to_party, note
  )
  values
    (v_active_project, v_milestone_1, v_payment, 'deposit', 1212500, v_home, null, 'Demo homeowner milestone funding held in simulated escrow.'),
    (v_active_project, v_milestone_1, v_payment, 'release', 1212500, null, v_contractor, 'Demo first milestone released after homeowner approval.');

  insert into public.reviews (project_id, homeowner_id, contractor_id, rating, comment)
  values (v_active_project, v_home, v_contractor, 5, 'Demo review: clear proposal, organized progress updates, and reliable workmanship.');

  insert into public.notifications (user_id, type, title, body, data)
  values
    (v_home, 'quote_submitted', 'New contractor proposal', 'Apex Builders submitted an itemized proposal for your open project.', jsonb_build_object('project_id', v_open_project, 'quote_id', v_open_quote)),
    (v_contractor, 'project_awarded', 'Project awarded', 'Your itemized proposal was accepted for the modern family residence.', jsonb_build_object('project_id', v_active_project, 'quote_id', v_accepted_quote)),
    (v_admin, 'seed_ready', 'Demo system data ready', 'The reset-and-seed demo workflow is ready for review.', '{}'::jsonb);
end $$;
