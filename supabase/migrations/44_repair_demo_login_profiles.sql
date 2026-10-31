-- Repair demo app profiles after a partial seed or an older missing-profile state.
-- Safe to rerun and does not remove any data.

do $$
declare
begin
  insert into public.profiles (id, role, full_name, phone, city)
  select
  u.id,
  case
    when lower(u.email) = 'admin@gmail.com' then 'admin'::public.user_role
    when lower(u.email) = 'cont@gmail.com' then 'contractor'::public.user_role
    when lower(u.email) = 'homeowner@gmail.com' then 'homeowner'::public.user_role
    when lower(coalesce(u.raw_user_meta_data ->> 'role', '')) = 'contractor' then 'contractor'::public.user_role
    else 'homeowner'::public.user_role
  end,
  case lower(u.email)
    when 'admin@gmail.com' then 'Platform Administrator'
    when 'cont@gmail.com' then 'Apex Builders Construction Co.'
    else left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, 'User'), '@', 1)), 160)
  end,
  case lower(u.email)
    when 'admin@gmail.com' then '09170000001'
    when 'cont@gmail.com' then '09170000003'
    else nullif(btrim(u.raw_user_meta_data ->> 'phone'), '')
  end,
  case lower(u.email)
    when 'admin@gmail.com' then 'Manila'
    else nullif(btrim(u.raw_user_meta_data ->> 'city'), '')
  end
  from auth.users u
  where u.deleted_at is null
  on conflict (id) do update set
    role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    city = excluded.city,
    updated_at = now();

  insert into public.contractor_profiles (
    profile_id, business_name, bio, years_experience, service_cities,
    specialties, finish_levels, work_types, license_no, verification_status,
    rating_avg, rating_count, projects_completed, is_active
  )
  select
    p.id,
    left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'business_name'), ''), p.full_name), 200),
    case when lower(u.email) = 'cont@gmail.com' then 'Demo contractor profile for testing the contractor workflow.' else null end,
    0,
    case when nullif(btrim(u.raw_user_meta_data ->> 'city'), '') is null then '{}'::text[] else array[nullif(btrim(u.raw_user_meta_data ->> 'city'), '')] end,
    '{}'::public.house_type[],
    '{}'::public.finish_level[],
    '{}'::public.work_type[],
    case when lower(u.email) = 'cont@gmail.com' then 'DEMO-ONLY-NOT-A-VALID-LICENSE' else null end,
    case when lower(u.email) = 'cont@gmail.com' then 'approved'::public.verification_status else 'pending'::public.verification_status end,
    case when lower(u.email) = 'cont@gmail.com' then 4.80 else 0 end,
    case when lower(u.email) = 'cont@gmail.com' then 12 else 0 end,
    case when lower(u.email) = 'cont@gmail.com' then 8 else 0 end,
    true
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'contractor'::public.user_role
    and u.deleted_at is null
  on conflict (profile_id) do update set
      business_name = excluded.business_name,
      is_active = true,
      updated_at = now();
end $$;
