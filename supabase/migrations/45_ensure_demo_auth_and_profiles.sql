-- Final idempotent repair for the three demo Auth accounts and app profiles.
-- Does not remove application data and does not depend on the Auth trigger.
-- Passwords are set only when creating missing accounts, never on existing users.

do $$
declare
  v_hash text := extensions.crypt('123123', extensions.gen_salt('bf'));
  v_admin uuid;
  v_home uuid;
  v_contractor uuid;
begin
  select id into v_admin from auth.users where lower(email) = 'admin@gmail.com' limit 1;
  select id into v_home from auth.users where lower(email) = 'home@gmail.com' limit 1;
  select id into v_contractor from auth.users where lower(email) = 'cont@gmail.com' limit 1;

  if v_admin is null then
    v_admin := 'a4500000-0000-0000-0000-000000000001';
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
    v_home := 'a4500000-0000-0000-0000-000000000002';
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
    v_contractor := 'a4500000-0000-0000-0000-000000000003';
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
    city = excluded.city,
    updated_at = now();

  insert into public.contractor_profiles (
    profile_id, business_name, bio, years_experience, service_cities,
    specialties, finish_levels, work_types, license_no,
    verification_status, rating_avg, rating_count, projects_completed, is_active
  )
  values (
    v_contractor, 'Apex Builders Construction Co.',
    'Demo contractor profile for testing the contractor workflow.',
    10, array['Quezon City', 'Manila', 'Antipolo'],
    array['two_storey', 'one_storey']::public.house_type[],
    array['basic', 'standard', 'premium']::public.finish_level[],
    array['new_build', 'renovation', 'extension']::public.work_type[],
    'DEMO-ONLY-NOT-A-VALID-LICENSE', 'approved', 4.80, 12, 8, true
  )
  on conflict (profile_id) do update set
    business_name = excluded.business_name,
    is_active = true,
    updated_at = now();
end $$;
