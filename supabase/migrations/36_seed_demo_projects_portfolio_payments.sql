-- Seed clearly labeled portfolio examples and an unverified license placeholder
-- for the explicitly provisioned cont@gmail.com demo account.
update public.contractor_profiles cp
set pcab_category = 'Demo - Unverified',
    pcab_license_no = 'DEMO-ONLY-NOT-A-VALID-PCAB-LICENSE',
    license_no = 'DEMO-ONLY-NOT-A-VALID-PCAB-LICENSE',
    verification_status = 'pending'::public.verification_status,
    verified_at = null,
    verified_by = null,
    updated_at = now()
from auth.users u
where cp.profile_id = u.id
  and lower(u.email) = lower('cont@gmail.com');

with demo_contractor as (
  select cp.profile_id
  from auth.users u
  join public.contractor_profiles cp on cp.profile_id = u.id
  where lower(u.email) = lower('cont@gmail.com')
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
  '36000000-0000-0000-0000-000000000001'::uuid,
  profile_id,
  'license'::public.doc_type,
  'Demo license placeholder - no real document uploaded',
  'DEMO-ONLY-NOT-A-VALID-PCAB-LICENSE',
  'Demo data - not issued by a licensing authority',
  'demo-placeholder/no-license-document-uploaded',
  'pending'::public.verification_status
from demo_contractor
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
  select cp.profile_id
  from auth.users u
  join public.contractor_profiles cp on cp.profile_id = u.id
  where lower(u.email) = lower('cont@gmail.com')
),
examples(id, title, description, house_type, floors, floor_area_sqm, year_completed) as (
  values
    (
      '36000000-0000-0000-0000-000000000011'::uuid,
      'Example project: Two-storey family home',
      'Demonstration portfolio entry only. Replace with a completed project and verified photos before presenting this as actual contractor work.',
      'two_storey'::public.house_type,
      2,
      145.00::numeric,
      2025
    ),
    (
      '36000000-0000-0000-0000-000000000012'::uuid,
      'Example project: Contemporary bungalow',
      'Demonstration portfolio entry only. The project details are sample content and are not a claim of completed work.',
      'one_storey'::public.house_type,
      1,
      98.00::numeric,
      2024
    ),
    (
      '36000000-0000-0000-0000-000000000013'::uuid,
      'Example project: Urban townhouse renovation',
      'Demonstration portfolio entry only. Replace the sample description and image with authentic project information.',
      'townhouse'::public.house_type,
      3,
      175.00::numeric,
      2025
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
cross join demo_contractor
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
  select cp.profile_id
  from auth.users u
  join public.contractor_profiles cp on cp.profile_id = u.id
  where lower(u.email) = lower('cont@gmail.com')
),
example_images(id, portfolio_item_id, file_path) as (
  values
    (
      '36000000-0000-0000-0000-000000000021'::uuid,
      '36000000-0000-0000-0000-000000000011'::uuid,
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'
    ),
    (
      '36000000-0000-0000-0000-000000000022'::uuid,
      '36000000-0000-0000-0000-000000000012'::uuid,
      'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80'
    ),
    (
      '36000000-0000-0000-0000-000000000023'::uuid,
      '36000000-0000-0000-0000-000000000013'::uuid,
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80'
    )
)
insert into public.portfolio_images (id, portfolio_item_id, file_path, sort_order)
select
  example_images.id,
  example_images.portfolio_item_id,
  example_images.file_path,
  1
from example_images
cross join demo_contractor
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