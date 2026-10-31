alter table public.disputes
  add column if not exists contractor_fix_status text,
  add column if not exists contractor_fix_note text,
  add column if not exists contractor_fixed_at timestamptz,
  add column if not exists contractor_fix_proof_url text;

create or replace function public.replace_disputed_milestone_proofs(
  p_milestone_id uuid,
  p_file_paths text[],
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_contractor_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_file_paths is null
     or cardinality(p_file_paths) < 1
     or cardinality(p_file_paths) > 3
     or exists (
       select 1
       from unnest(p_file_paths) as paths(file_path)
       where file_path is null or btrim(file_path) = ''
     )
  then
    raise exception 'Provide between 1 and 3 valid replacement proof files';
  end if;

  select q.contractor_id
  into v_contractor_id
  from public.milestones m
  join public.quotes q on q.id = m.quote_id
  join public.projects p on p.id = m.project_id
  where m.id = p_milestone_id
    and m.status = 'disputed'
    and q.contractor_id = auth.uid()
    and p.awarded_quote_id = q.id
  for update of m;

  if not found or v_contractor_id <> auth.uid() then
    raise exception 'Only the assigned contractor can submit a fix for a disputed milestone';
  end if;

  if not exists (
    select 1
    from public.disputes d
    where d.milestone_id = p_milestone_id
      and d.status in ('open', 'need_more_proof')
  ) then
    raise exception 'No active dispute exists for this milestone';
  end if;

  if exists (
       select 1
       from unnest(p_file_paths) as paths(file_path)
       where file_path not like auth.uid()::text || '/' || p_milestone_id::text || '/%'
     )
     or (
       select count(distinct o.name)
       from storage.objects o
       where o.bucket_id = 'milestone-proofs'
         and o.name = any(p_file_paths)
     ) <> cardinality(p_file_paths)
  then
    raise exception 'Replacement proof files must be uploaded to this milestone before submission';
  end if;

  delete from public.milestone_proofs
  where milestone_id = p_milestone_id;

  insert into public.milestone_proofs (milestone_id, uploaded_by, file_path, note)
  select p_milestone_id, auth.uid(), paths.file_path, nullif(btrim(p_note), '')
  from unnest(p_file_paths) as paths(file_path);

  update public.milestones
  set contractor_update = nullif(btrim(p_note), ''),
      proof_submitted_at = now(),
      updated_at = now()
  where id = p_milestone_id;

  update public.disputes
  set contractor_fix_status = 'fixed',
      contractor_fix_note = nullif(btrim(p_note), ''),
      contractor_fixed_at = now(),
      contractor_fix_proof_url = p_file_paths[1],
      updated_at = now()
  where milestone_id = p_milestone_id
    and status in ('open', 'need_more_proof');
end;
$$;

revoke all on function public.replace_disputed_milestone_proofs(uuid, text[], text) from public, anon;
grant execute on function public.replace_disputed_milestone_proofs(uuid, text[], text) to authenticated;

notify pgrst, 'reload schema';
