create or replace function public.require_admin_verified_contractor_license()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if new.verification_status = 'approved' then
    if coalesce(nullif(btrim(new.license_no), ''), nullif(btrim(new.pcab_license_no), '')) is null
       and not exists (
         select 1
         from public.contractor_documents cd
         where cd.contractor_id = new.profile_id
           and cd.doc_type = 'license'
           and nullif(btrim(cd.doc_number), '') is not null
       ) then
      raise exception 'A license number must be provided before approving this contractor';
    end if;

    if not exists (
      select 1
      from public.contractor_documents cd
      where cd.contractor_id = new.profile_id
        and cd.doc_type = 'license'
        and cd.status = 'approved'
    ) then
      raise exception 'An administrator must verify an uploaded license document before approving this contractor';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists contractor_license_required_for_approval on public.contractor_profiles;
create trigger contractor_license_required_for_approval
before insert
on public.contractor_profiles
for each row
execute function public.require_admin_verified_contractor_license();

drop trigger if exists contractor_license_required_on_update on public.contractor_profiles;
create trigger contractor_license_required_on_update
before update of verification_status, license_no, pcab_license_no
on public.contractor_profiles
for each row
execute function public.require_admin_verified_contractor_license();

create or replace function public.admin_set_contractor_verification(
  p_profile_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_contractor public.contractor_profiles%rowtype;
  v_license_document public.contractor_documents%rowtype;
  v_reason text := coalesce(nullif(btrim(p_rejection_reason), ''), 'Rejected by an administrator');
begin
  if not public.is_admin() then
    raise exception 'Only administrators can verify contractors';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Verification decision must be approved or rejected';
  end if;

  select *
    into v_contractor
    from public.contractor_profiles
   where profile_id = p_profile_id
   for update;

  if not found then
    raise exception 'Contractor profile not found';
  end if;

  if p_decision = 'approved' then
    select *
      into v_license_document
      from public.contractor_documents
     where contractor_id = p_profile_id
       and doc_type = 'license'
     order by (nullif(btrim(doc_number), '') is null), created_at desc
     limit 1
     for update;

    if not found then
      raise exception 'Upload a license document before approving this contractor';
    end if;

    if coalesce(
      nullif(btrim(v_contractor.license_no), ''),
      nullif(btrim(v_contractor.pcab_license_no), ''),
      nullif(btrim(v_license_document.doc_number), ''),
      (
        select nullif(btrim(cd.doc_number), '')
        from public.contractor_documents cd
        where cd.contractor_id = p_profile_id
          and cd.doc_type = 'license'
          and nullif(btrim(cd.doc_number), '') is not null
        order by cd.created_at desc
        limit 1
      )
    ) is null then
      raise exception 'A license number must be provided before approving this contractor';
    end if;

    update public.contractor_documents
       set status = 'approved',
           reject_reason = null,
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           updated_at = now()
     where id = v_license_document.id;
  else
    update public.contractor_documents
       set status = 'rejected',
           reject_reason = v_reason,
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           updated_at = now()
     where contractor_id = p_profile_id;
  end if;

  update public.contractor_profiles
     set verification_status = p_decision::public.verification_status,
         verified_at = case when p_decision = 'approved' then now() else null end,
         verified_by = auth.uid(),
         updated_at = now()
   where profile_id = p_profile_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'contractor_verification_' || p_decision,
    'contractor_profile',
    p_profile_id,
    jsonb_build_object('decision', p_decision, 'reason', nullif(btrim(p_rejection_reason), ''))
  );
end;
$$;

revoke all on function public.admin_set_contractor_verification(uuid, text, text) from public, anon;
grant execute on function public.admin_set_contractor_verification(uuid, text, text) to authenticated;

update public.contractor_profiles cp
   set verification_status = 'pending',
       verified_at = null,
       verified_by = null,
       updated_at = now()
 where cp.verification_status = 'approved'
   and (
     coalesce(nullif(btrim(cp.license_no), ''), nullif(btrim(cp.pcab_license_no), '')) is null
     or not exists (
       select 1
       from public.contractor_documents cd
       where cd.contractor_id = cp.profile_id
         and cd.doc_type = 'license'
         and cd.status = 'approved'
     )
     or not exists (
       select 1
       from public.contractor_documents cd
       where cd.contractor_id = cp.profile_id
         and cd.doc_type = 'license'
         and coalesce(nullif(btrim(cd.doc_number), ''), nullif(btrim(cp.license_no), ''), nullif(btrim(cp.pcab_license_no), '')) is not null
     )
   );

notify pgrst, 'reload schema';
