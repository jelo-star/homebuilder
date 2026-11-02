-- Seed clearly labeled fictional portfolio examples and pending license
-- placeholders for the explicitly requested demo contractor accounts only.
-- These records must never be treated as authentic projects or credentials.

begin;

do $$
declare
  v_contractor_count integer;
begin
  select count(*)
    into v_contractor_count
    from auth.users u
    join public.profiles p on p.id = u.id and p.role = 'contractor'
    join public.contractor_profiles cp on cp.profile_id = u.id
   where lower(u.email) in ('cont@gmail.com', 'test@gmail.com');

  if v_contractor_count = 0 then
    raise exception 'No contractor profiles found for cont@gmail.com or test@gmail.com; demo seed was not applied.';
  end if;

  if v_contractor_count < 2 then
    raise notice 'Found % of the 2 requested demo contractor profiles; missing accounts will be skipped.', v_contractor_count;
  end if;
end;
$$;

-- Keep invented portfolio examples out of the public directory by leaving
-- these explicitly seeded accounts pending until a real license is reviewed.
update public.contractor_profiles cp
   set pcab_category = 'Demo - Unverified',
       pcab_license_no = 'DEMO-ONLY-NOT-A-VALID-PCAB-LICENSE',
       license_no = 'DEMO-ONLY-NOT-A-VALID-PCAB-LICENSE',
       verification_status = 'pending'::public.verification_status,
       verified_at = null,
       verified_by = null,
       updated_at = now()
  from auth.users u
  join public.profiles p on p.id = u.id and p.role = 'contractor'
 where cp.profile_id = u.id
   and lower(u.email) in ('cont@gmail.com', 'test@gmail.com');

with demo_contractor as (
  select u.id as profile_id, lower(u.email) as email
    from auth.users u
    join public.profiles p on p.id = u.id and p.role = 'contractor'
    join public.contractor_profiles cp on cp.profile_id = u.id
   where lower(u.email) in ('cont@gmail.com', 'test@gmail.com')
),
license_seed(email, id) as (
  values
    ('cont@gmail.com', '36000000-0000-0000-0000-000000000001'::uuid),
    ('test@gmail.com', '78000000-0000-0000-0000-000000000001'::uuid)
)
insert into public.contractor_documents (
  id,
  contractor_id,
  doc_type,
  doc_title,
  doc_number,
  issuing_authority,
  file_path,
  status
)
select
  license_seed.id,
  demo_contractor.profile_id,
  'license'::public.doc_type,
  'DEMO ONLY - sample license preview, not a real credential',
  'DEMO-ONLY-NOT-A-VALID-PCAB-LICENSE',
  'None - fictional demonstration data',
  '/demo-credentials/pcab-sample.png',
  'pending'::public.verification_status
from demo_contractor
join license_seed using (email)
on conflict (id) do update
set contractor_id = excluded.contractor_id,
    doc_type = excluded.doc_type,
    doc_title = excluded.doc_title,
    doc_number = excluded.doc_number,
    issuing_authority = excluded.issuing_authority,
    file_path = excluded.file_path,
    status = 'pending'::public.verification_status,
    reject_reason = null,
    reviewed_by = null,
    reviewed_at = null,
    updated_at = now();

with demo_contractor as (
  select u.id as profile_id, lower(u.email) as email
    from auth.users u
    join public.profiles p on p.id = u.id and p.role = 'contractor'
    join public.contractor_profiles cp on cp.profile_id = u.id
   where lower(u.email) in ('cont@gmail.com', 'test@gmail.com')
),
examples(email, id, title, description, house_type, floors, floor_area_sqm, year_completed) as (
  values
    (
      'cont@gmail.com',
      '36000000-0000-0000-0000-000000000011'::uuid,
      'DEMO SAMPLE - Two-storey family home',
      'FICTIONAL DEMO ONLY. This is not work performed by this contractor. Replace with authentic project details and photos before public display.',
      'two_storey'::public.house_type, 2, 145.00::numeric, 2025
    ),
    (
      'cont@gmail.com',
      '36000000-0000-0000-0000-000000000012'::uuid,
      'DEMO SAMPLE - Contemporary bungalow',
      'FICTIONAL DEMO ONLY. This is sample content, not a claim of completed work by this contractor.',
      'one_storey'::public.house_type, 1, 98.00::numeric, 2024
    ),
    (
      'cont@gmail.com',
      '36000000-0000-0000-0000-000000000013'::uuid,
      'DEMO SAMPLE - Urban townhouse renovation',
      'FICTIONAL DEMO ONLY. Replace this sample description and stock image with authentic project information.',
      'townhouse'::public.house_type, 3, 175.00::numeric, 2025
    ),
    (
      'test@gmail.com',
      '78000000-0000-0000-0000-000000000011'::uuid,
      'DEMO SAMPLE - Two-storey family home',
      'FICTIONAL DEMO ONLY. This is not work performed by this contractor. Replace with authentic project details and photos before public display.',
      'two_storey'::public.house_type, 2, 145.00::numeric, 2025
    ),
    (
      'test@gmail.com',
      '78000000-0000-0000-0000-000000000012'::uuid,
      'DEMO SAMPLE - Contemporary bungalow',
      'FICTIONAL DEMO ONLY. This is sample content, not a claim of completed work by this contractor.',
      'one_storey'::public.house_type, 1, 98.00::numeric, 2024
    ),
    (
      'test@gmail.com',
      '78000000-0000-0000-0000-000000000013'::uuid,
      'DEMO SAMPLE - Urban townhouse renovation',
      'FICTIONAL DEMO ONLY. Replace this sample description and stock image with authentic project information.',
      'townhouse'::public.house_type, 3, 175.00::numeric, 2025
    )
)
insert into public.portfolio_items (
  id,
  contractor_id,
  title,
  description,
  house_type,
  floors,
  floor_area_sqm,
  year_completed
)
select
  examples.id,
  demo_contractor.profile_id,
  examples.title,
  examples.description,
  examples.house_type,
  examples.floors,
  examples.floor_area_sqm,
  examples.year_completed
from examples
join demo_contractor using (email)
on conflict (id) do update
set contractor_id = excluded.contractor_id,
    title = excluded.title,
    description = excluded.description,
    house_type = excluded.house_type,
    floors = excluded.floors,
    floor_area_sqm = excluded.floor_area_sqm,
    year_completed = excluded.year_completed,
    updated_at = now();

with demo_contractor as (
  select u.id as profile_id, lower(u.email) as email
    from auth.users u
    join public.profiles p on p.id = u.id and p.role = 'contractor'
    join public.contractor_profiles cp on cp.profile_id = u.id
   where lower(u.email) in ('cont@gmail.com', 'test@gmail.com')
),
example_images(email, id, portfolio_item_id, file_path) as (
  values
    ('cont@gmail.com', '36000000-0000-0000-0000-000000000021'::uuid, '36000000-0000-0000-0000-000000000011'::uuid, 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'),
    ('cont@gmail.com', '36000000-0000-0000-0000-000000000022'::uuid, '36000000-0000-0000-0000-000000000012'::uuid, 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80'),
    ('cont@gmail.com', '36000000-0000-0000-0000-000000000023'::uuid, '36000000-0000-0000-0000-000000000013'::uuid, 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80'),
    ('test@gmail.com', '78000000-0000-0000-0000-000000000021'::uuid, '78000000-0000-0000-0000-000000000011'::uuid, 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'),
    ('test@gmail.com', '78000000-0000-0000-0000-000000000022'::uuid, '78000000-0000-0000-0000-000000000012'::uuid, 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80'),
    ('test@gmail.com', '78000000-0000-0000-0000-000000000023'::uuid, '78000000-0000-0000-0000-000000000013'::uuid, 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80')
)
insert into public.portfolio_images (id, portfolio_item_id, file_path, sort_order)
select example_images.id, example_images.portfolio_item_id, example_images.file_path, 1
from example_images
join demo_contractor using (email)
where exists (
  select 1
    from public.portfolio_items pi
   where pi.id = example_images.portfolio_item_id
     and pi.contractor_id = demo_contractor.profile_id
)
on conflict (id) do update
set portfolio_item_id = excluded.portfolio_item_id,
    file_path = excluded.file_path,
    sort_order = excluded.sort_order;

commit;
