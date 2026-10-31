-- Create application profiles from Supabase Auth metadata for confirmed and
-- unconfirmed signups alike. Public registration cannot create administrator accounts.
create or replace function public.create_profile_for_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_full_name text;
  v_business_name text;
  v_city text;
  v_years_experience integer := 0;
begin
  v_role := case
    when new.raw_user_meta_data ->> 'role' = 'contractor' then 'contractor'::public.user_role
    else 'homeowner'::public.user_role
  end;
  v_full_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'User'), '@', 1)
    ),
    160
  );
  v_city := nullif(btrim(new.raw_user_meta_data ->> 'city'), '');
  v_business_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'business_name'), ''),
      v_full_name
    ),
    200
  );

  if coalesce(new.raw_user_meta_data ->> 'years_experience', '') ~ '^[0-9]+$' then
    if length(new.raw_user_meta_data ->> 'years_experience') <= 9 then
      v_years_experience := least(
        (new.raw_user_meta_data ->> 'years_experience')::integer,
        100
      );
    else
      v_years_experience := 100;
    end if;
  end if;

  insert into public.profiles (id, role, full_name, phone, city)
  values (
    new.id,
    v_role,
    v_full_name,
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    v_city
  )
  on conflict (id) do nothing;

  if v_role = 'contractor'::public.user_role then
    insert into public.contractor_profiles (
      profile_id,
      business_name,
      years_experience,
      service_cities
    )
    values (
      new.id,
      v_business_name,
      v_years_experience,
      case when v_city is null then '{}'::text[] else array[v_city] end
    )
    on conflict (profile_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.create_profile_for_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_auth_user();
