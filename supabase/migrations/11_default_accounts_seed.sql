-- SMART CONTRACTOR MATCHING | 11
-- Safe, repeatable seed script for the three required default development accounts.
-- Roles: Admin (admin@gmail.com), Homeowner (home@gmail.com), Contractor (cont@gmail.com)
-- Password for all three: 123123 (hashed using pgcrypto blowfish crypt)

do $$
declare
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_home_id  uuid := 'a0000000-0000-0000-0000-000000000002';
  v_cont_id  uuid := 'a0000000-0000-0000-0000-000000000003';
  v_hash text;
begin
  -- Generate secure bcrypt hash for '123123'
  v_hash := extensions.crypt('123123', extensions.gen_salt('bf'));

  -- 1. Insert/Update Admin auth user
  if not exists (select 1 from auth.users where email = 'admin@gmail.com') then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@gmail.com', v_hash, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Platform Administrator","role":"admin"}'::jsonb,
      now(), now()
    );
  else
    select id into v_admin_id from auth.users where email = 'admin@gmail.com';
    update auth.users set encrypted_password = v_hash, email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = v_admin_id;
  end if;

  -- 2. Insert/Update Homeowner auth user
  if not exists (select 1 from auth.users where email = 'home@gmail.com') then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_home_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'home@gmail.com', v_hash, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Juan Homeowner","role":"homeowner"}'::jsonb,
      now(), now()
    );
  else
    select id into v_home_id from auth.users where email = 'home@gmail.com';
    update auth.users set encrypted_password = v_hash, email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = v_home_id;
  end if;

  -- 3. Insert/Update Contractor auth user
  if not exists (select 1 from auth.users where email = 'cont@gmail.com') then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_cont_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'cont@gmail.com', v_hash, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Apex Builders Construction","role":"contractor"}'::jsonb,
      now(), now()
    );
  else
    select id into v_cont_id from auth.users where email = 'cont@gmail.com';
    update auth.users set encrypted_password = v_hash, email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = v_cont_id;
  end if;

  -- 4. Ensure public.profiles exist with correct roles
  insert into public.profiles (id, role, full_name, phone, city)
  values (v_admin_id, 'admin', 'Platform Administrator', '09170000001', 'Manila')
  on conflict (id) do update set role = 'admin', full_name = 'Platform Administrator';

  insert into public.profiles (id, role, full_name, phone, city)
  values (v_home_id, 'homeowner', 'Juan Homeowner', '09170000002', 'Quezon City')
  on conflict (id) do update set role = 'homeowner', full_name = 'Juan Homeowner';

  insert into public.profiles (id, role, full_name, phone, city)
  values (v_cont_id, 'contractor', 'Apex Builders Construction', '09170000003', 'Quezon City')
  on conflict (id) do update set role = 'contractor', full_name = 'Apex Builders Construction';

  -- 5. Ensure contractor_profiles exists for contractor
  insert into public.contractor_profiles (
    profile_id, business_name, bio, years_experience, service_cities,
    specialties, finish_levels, work_types, license_no, verification_status,
    rating_avg, rating_count, projects_completed, is_active
  ) values (
    v_cont_id, 'Apex Builders Construction Co.',
    'Licensed general construction firm specializing in residential builds and complete structural renovations.',
    10, array['Quezon City', 'Pasig', 'Makati', 'Taguig'],
    array['one_storey'::public.house_type, 'two_storey'::public.house_type, 'townhouse'::public.house_type],
    array['basic'::public.finish_level, 'standard'::public.finish_level, 'premium'::public.finish_level],
    array['new_build'::public.work_type, 'renovation'::public.work_type, 'extension'::public.work_type],
    'PCAB-2026-REG-8921', 'approved'::public.verification_status,
    4.95, 24, 38, true
  )
  on conflict (profile_id) do update set
    verification_status = 'approved',
    is_active = true,
    rating_avg = 4.95,
    business_name = 'Apex Builders Construction Co.';

end $$;
