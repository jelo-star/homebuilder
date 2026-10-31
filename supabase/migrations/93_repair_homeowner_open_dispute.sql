-- Open a homeowner dispute atomically without relying on direct table writes
-- or an approval deadline that may not be populated for submitted proofs.
create or replace function public.open_dispute(p_milestone_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_milestone public.milestones%rowtype;
  v_project public.projects%rowtype;
  v_dispute_id uuid;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in to open a dispute';
  end if;

  if v_reason is null then
    raise exception 'A dispute reason is required';
  end if;

  select *
    into v_milestone
    from public.milestones
   where id = p_milestone_id
   for update;

  if not found then
    raise exception 'Milestone not found';
  end if;

  select *
    into v_project
    from public.projects
   where id = v_milestone.project_id
   for update;

  if not found or v_project.homeowner_id <> auth.uid() then
    raise exception 'Only the project homeowner can open a dispute';
  end if;

  if v_milestone.status <> 'proof_submitted' then
    raise exception 'A dispute can only be opened for a milestone awaiting review';
  end if;

  insert into public.disputes (
    milestone_id,
    project_id,
    opened_by,
    reason,
    status,
    contractor_amount,
    homeowner_amount
  )
  values (
    v_milestone.id,
    v_project.id,
    auth.uid(),
    v_reason,
    'open',
    v_milestone.amount,
    v_milestone.amount
  )
  returning id into v_dispute_id;

  update public.milestones
     set status = 'disputed',
         updated_at = now()
   where id = v_milestone.id;

  update public.projects
     set status = 'disputed',
         updated_at = now()
   where id = v_project.id;

  return v_dispute_id;
end;
$$;

revoke all on function public.open_dispute(uuid, text) from public, anon;
grant execute on function public.open_dispute(uuid, text) to authenticated;

notify pgrst, 'reload schema';
