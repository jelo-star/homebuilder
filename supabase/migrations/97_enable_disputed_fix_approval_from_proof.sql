alter table public.disputes
  add column if not exists contractor_fix_status text,
  add column if not exists contractor_fix_note text,
  add column if not exists contractor_fixed_at timestamptz,
  add column if not exists contractor_fix_proof_url text;

create or replace function public.approve_disputed_milestone_fix(p_milestone_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_homeowner_id uuid;
  v_contractor_id uuid;
  v_dispute public.disputes%rowtype;
  v_milestone public.milestones%rowtype;
  v_payout_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in as the project homeowner to approve this fix';
  end if;

  select m.*
    into v_milestone
    from public.milestones m
   where m.id = p_milestone_id
   for update;
  if not found then
    raise exception 'Milestone not found';
  end if;

  select p.homeowner_id, q.contractor_id
    into v_homeowner_id, v_contractor_id
    from public.projects p
    join public.quotes q on q.project_id = p.id
   where p.id = v_milestone.project_id
     and q.id = v_milestone.quote_id;

  if v_homeowner_id is null or v_homeowner_id <> auth.uid() then
    raise exception 'Only the project homeowner can approve this fix';
  end if;
  if v_milestone.status <> 'disputed' then
    raise exception 'This milestone is not in dispute';
  end if;

  select *
    into v_dispute
    from public.disputes
   where milestone_id = p_milestone_id
     and status in ('open', 'need_more_proof')
   for update;
  if not found then
    raise exception 'No active dispute exists for this milestone';
  end if;

  if not exists (
    select 1
      from public.milestone_proofs mp
     where mp.milestone_id = p_milestone_id
       and mp.uploaded_by = v_contractor_id
       and mp.created_at > v_dispute.created_at
  ) then
    raise exception 'The contractor must submit replacement proof photos before approval';
  end if;

  update public.disputes
     set contractor_fix_status = 'fixed',
         contractor_fixed_at = coalesce(contractor_fixed_at, now()),
         updated_at = now()
   where id = v_dispute.id;

  v_payout_id := public.approve_milestone(p_milestone_id);
  return v_payout_id;
end;
$$;

revoke all on function public.approve_disputed_milestone_fix(uuid) from public, anon;
grant execute on function public.approve_disputed_milestone_fix(uuid) to authenticated;

notify pgrst, 'reload schema';
