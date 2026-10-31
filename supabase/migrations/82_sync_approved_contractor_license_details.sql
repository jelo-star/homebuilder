-- Keep the public contractor profile aligned with the license document an
-- administrator actually approves.
create or replace function public.sync_approved_contractor_license_details()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if new.doc_type = 'license'
     and new.status = 'approved'
     and nullif(btrim(new.doc_number), '') is not null then
    update public.contractor_profiles
       set license_no = btrim(new.doc_number),
           pcab_license_no = btrim(new.doc_number),
           pcab_expiration_date = coalesce(new.expiry_date, pcab_expiration_date),
           updated_at = now()
     where profile_id = new.contractor_id;
  end if;

  return new;
end;
$$;

drop trigger if exists contractor_license_profile_sync
  on public.contractor_documents;

create trigger contractor_license_profile_sync
after insert or update of doc_type, doc_number, expiry_date, status
on public.contractor_documents
for each row
execute function public.sync_approved_contractor_license_details();

with latest_approved_license as (
  select distinct on (contractor_id)
    contractor_id,
    btrim(doc_number) as doc_number,
    expiry_date
  from public.contractor_documents
  where doc_type = 'license'
    and status = 'approved'
    and nullif(btrim(doc_number), '') is not null
  order by contractor_id, reviewed_at desc nulls last, created_at desc
)
update public.contractor_profiles cp
   set license_no = license.doc_number,
       pcab_license_no = license.doc_number,
       pcab_expiration_date = coalesce(license.expiry_date, cp.pcab_expiration_date),
       updated_at = now()
  from latest_approved_license license
 where cp.profile_id = license.contractor_id
   and (
     cp.license_no is distinct from license.doc_number
     or cp.pcab_license_no is distinct from license.doc_number
     or (license.expiry_date is not null and cp.pcab_expiration_date is distinct from license.expiry_date)
   );

create or replace view public.contractor_directory
with (security_barrier = true, security_invoker = false)
as
select
  profile_id,
  business_name,
  bio,
  years_experience,
  service_cities,
  specialties,
  finish_levels,
  work_types,
  license_no,
  verification_status,
  rating_avg,
  rating_count,
  projects_completed,
  business_type,
  trade_name,
  authorized_representative,
  business_email,
  business_phone,
  business_address,
  province,
  pcab_category,
  pcab_license_no,
  dti_sec_no,
  team_capacity,
  min_project_budget,
  max_project_budget,
  is_active,
  pcab_expiration_date
from public.contractor_profiles
where verification_status = 'approved'
  and is_active = true;

notify pgrst, 'reload schema';
