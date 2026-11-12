-- Contractor-controlled public profile imagery.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select to public
  using (bucket_id = 'avatars');

drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

alter table public.contractor_profiles
  add column if not exists profile_image_path text,
  add column if not exists cover_image_path text,
  add column if not exists cover_image_position text default 'center';

create or replace view public.contractor_directory
with (security_barrier = true, security_invoker = false)
as
select
  cp.profile_id,
  cp.business_name,
  cp.bio,
  cp.years_experience,
  cp.service_cities,
  cp.specialties,
  cp.finish_levels,
  cp.work_types,
  cp.license_no,
  cp.verification_status,
  cp.rating_avg,
  cp.rating_count,
  cp.projects_completed,
  cp.business_type,
  cp.trade_name,
  coalesce(nullif(btrim(cp.authorized_representative), ''), nullif(btrim(p.full_name), '')) as authorized_representative,
  cp.business_email,
  cp.business_phone,
  cp.business_address,
  cp.province,
  cp.pcab_category,
  cp.pcab_license_no,
  cp.dti_sec_no,
  cp.team_capacity,
  cp.min_project_budget,
  cp.max_project_budget,
  cp.is_active,
  cp.pcab_expiration_date,
  cp.profile_image_path,
  cp.cover_image_path,
  cp.cover_image_position
from public.contractor_profiles cp
join public.profiles p on p.id = cp.profile_id
where cp.is_active = true
  and cp.verification_status = 'approved';

create or replace view public.homeowner_contractor_profiles
with (security_invoker = false)
as
select
  cp.profile_id,
  cp.business_name,
  cp.bio,
  cp.years_experience,
  cp.service_cities,
  cp.specialties,
  cp.finish_levels,
  cp.work_types,
  cp.license_no,
  cp.verification_status,
  cp.rating_avg,
  cp.rating_count,
  cp.projects_completed,
  cp.business_type,
  cp.trade_name,
  coalesce(nullif(btrim(cp.authorized_representative), ''), nullif(btrim(p.full_name), '')) as authorized_representative,
  cp.business_email,
  cp.business_phone,
  cp.business_address,
  cp.province,
  cp.pcab_category,
  cp.pcab_license_no,
  cp.pcab_expiration_date,
  cp.dti_sec_no,
  cp.team_capacity,
  cp.min_project_budget,
  cp.max_project_budget,
  cp.is_active,
  cp.profile_image_path,
  cp.cover_image_path,
  cp.cover_image_position
from public.contractor_profiles cp
join public.profiles p on p.id = cp.profile_id
where cp.is_active
  and (
    cp.verification_status = 'approved'
    or exists (
      select 1 from public.quotes q
      join public.projects project on project.id = q.project_id
      where q.contractor_id = cp.profile_id
        and project.homeowner_id = auth.uid()
    )
  );

revoke all on public.contractor_directory from public;
grant select on public.contractor_directory to anon, authenticated;
revoke all on public.homeowner_contractor_profiles from public, anon;
grant select on public.homeowner_contractor_profiles to authenticated;
notify pgrst, 'reload schema';
