-- Promote the explicitly provisioned admin Auth account.
-- Public signup metadata cannot grant administrator access.
insert into public.profiles (id, role, full_name, phone, city)
select
  u.id,
  'admin'::public.user_role,
  left(
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(u.email, 'Admin'), '@', 1)
    ),
    160
  ),
  nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''),
  nullif(btrim(u.raw_user_meta_data ->> 'city'), '')
from auth.users u
where lower(u.email) = lower('admin@gmail.com')
on conflict (id) do update
set role = 'admin'::public.user_role,
    updated_at = now()
returning id, role, full_name;
