drop function if exists public.approve_disputed_milestone_fix(uuid);

create function public.approve_disputed_milestone_fix(p_milestone_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_homeowner_id uuid;
  v_contractor_id uuid;
  v_milestone public.milestones%rowtype;
  v_dispute public.disputes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in as the project homeowner to approve this fix';
  end if;

  select *
    into v_milestone
    from public.milestones
   where id = p_milestone_id
   for update;
  if not found then
    raise exception 'Milestone not found';
  end if;

  select p.homeowner_id, q.contractor_id
    into v_homeowner_id, v_contractor_id
    from public.projects p
    join public.quotes q on q.id = v_milestone.quote_id
   where p.id = v_milestone.project_id
     and p.awarded_quote_id = q.id;

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
     set status = 'resolved_fix',
         resolution = 'Homeowner accepted the contractor fix; milestone returned to in progress without payout',
         contractor_fix_status = 'fixed',
         contractor_fixed_at = coalesce(contractor_fixed_at, now()),
         resolved_by = auth.uid(),
         resolved_at = now(),
         updated_at = now()
   where id = v_dispute.id;

  update public.milestones
     set status = 'in_progress',
         approved_at = null,
         paid_at = null,
         approve_by = null,
         updated_at = now()
   where id = v_milestone.id;

  update public.milestones
     set status = 'locked',
         updated_at = now()
   where project_id = v_milestone.project_id
     and seq = v_milestone.seq + 1
     and status = 'in_progress';

  update public.projects
     set status = 'in_progress',
         updated_at = now()
   where id = v_milestone.project_id
     and status = 'disputed';
end;
$$;

revoke all on function public.approve_disputed_milestone_fix(uuid) from public, anon;
grant execute on function public.approve_disputed_milestone_fix(uuid) to authenticated;

do $$
begin
  insert into public.financial_audit_logs (
    actor_id,
    action_type,
    entity_type,
    entity_id,
    previous_state,
    new_state,
    reason
  )
  select
    null,
    'REVERT_FIX_ACCEPTANCE_MILESTONE_PAYOUT',
    'milestones',
    m.id,
    jsonb_build_object(
      'milestone', to_jsonb(m),
      'payout', to_jsonb(po),
      'ledger_entries', coalesce((
        select jsonb_agg(to_jsonb(el))
        from public.escrow_ledger el
        where el.milestone_id = m.id
          and el.entry_type in ('release', 'fee')
          and el.note in (
            'Contractor milestone amount; homeowner commission billed separately',
            'Platform commission charged to homeowner'
          )
      ), '[]'::jsonb)
    ),
    jsonb_build_object(
      'milestone_status', 'in_progress',
      'payout_removed', true,
      'project_status', 'in_progress'
    ),
    'Prior fix approval incorrectly marked the milestone paid and created a pending payout; restored it to construction without a disbursement.'
  from public.disputes d
  join public.milestones m on m.id = d.milestone_id
  join public.payouts po on po.milestone_id = m.id
  where d.status = 'resolved_paid'
    and d.resolution = 'Homeowner accepted the contractor rectification'
    and m.status = 'paid'
    and po.status = 'pending'
    and po.sent_at is null
    and po.provider_ref is null
    and po.payout_tx_ref is null
    and po.released_at is null;

  delete from public.escrow_ledger el
  where el.milestone_id in (
    select m.id
    from public.disputes d
    join public.milestones m on m.id = d.milestone_id
    join public.payouts po on po.milestone_id = m.id
    where d.status = 'resolved_paid'
      and d.resolution = 'Homeowner accepted the contractor rectification'
      and m.status = 'paid'
      and po.status = 'pending'
      and po.sent_at is null
      and po.provider_ref is null
      and po.payout_tx_ref is null
      and po.released_at is null
  )
    and el.entry_type in ('release', 'fee')
    and el.note in (
      'Contractor milestone amount; homeowner commission billed separately',
      'Platform commission charged to homeowner'
    );

  delete from public.payouts po
  where po.milestone_id in (
    select d.milestone_id
    from public.disputes d
    join public.milestones m on m.id = d.milestone_id
    join public.payouts existing_payout on existing_payout.milestone_id = m.id
    where d.status = 'resolved_paid'
      and d.resolution = 'Homeowner accepted the contractor rectification'
      and m.status = 'paid'
      and existing_payout.status = 'pending'
      and existing_payout.sent_at is null
      and existing_payout.provider_ref is null
      and existing_payout.payout_tx_ref is null
      and existing_payout.released_at is null
  )
    and po.status = 'pending'
    and po.sent_at is null
    and po.provider_ref is null
    and po.payout_tx_ref is null
    and po.released_at is null;

  update public.milestones m
     set status = 'in_progress',
         approved_at = null,
         paid_at = null,
         approve_by = null,
         updated_at = now()
   where m.status = 'paid'
     and exists (
       select 1
       from public.financial_audit_logs fal
       where fal.entity_id = m.id
         and fal.action_type = 'REVERT_FIX_ACCEPTANCE_MILESTONE_PAYOUT'
     );

  update public.disputes d
     set status = 'resolved_fix',
         resolution = 'Homeowner accepted the contractor fix; milestone returned to in progress without payout',
         updated_at = now()
   where exists (
       select 1
       from public.financial_audit_logs fal
       where fal.entity_id = d.milestone_id
         and fal.action_type = 'REVERT_FIX_ACCEPTANCE_MILESTONE_PAYOUT'
     )
     and d.status = 'resolved_paid'
     and d.resolution = 'Homeowner accepted the contractor rectification';

  update public.milestones next_milestone
     set status = 'locked',
         updated_at = now()
    from public.milestones current_milestone
    join public.disputes d on d.milestone_id = current_milestone.id
   where next_milestone.project_id = current_milestone.project_id
     and next_milestone.seq = current_milestone.seq + 1
     and next_milestone.status = 'in_progress'
     and d.status = 'resolved_fix'
     and d.resolution = 'Homeowner accepted the contractor fix; milestone returned to in progress without payout';

  update public.projects p
     set status = 'in_progress',
         updated_at = now()
    from public.disputes d
   where d.project_id = p.id
     and d.status = 'resolved_fix'
     and d.resolution = 'Homeowner accepted the contractor fix; milestone returned to in progress without payout'
     and p.status = 'disputed';
end;
$$;

notify pgrst, 'reload schema';
