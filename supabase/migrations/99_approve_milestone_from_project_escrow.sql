create or replace function public.approve_milestone(p_milestone_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  m public.milestones%rowtype;
  p public.projects%rowtype;
  q public.quotes%rowtype;
  v_payout uuid;
  v_user_id uuid := auth.uid();
  v_funded_amount numeric := 0;
  v_spent_amount numeric := 0;
  v_required_amount numeric := 0;
begin
  select * into m
  from public.milestones
  where id = p_milestone_id
  for update;
  if not found then
    raise exception 'Milestone not found';
  end if;

  select * into p
  from public.projects
  where id = m.project_id
  for update;
  select * into q
  from public.quotes
  where id = m.quote_id;

  if p.homeowner_id is distinct from v_user_id and not public.is_admin() then
    if v_user_id is not null then
      raise exception 'Not authorized';
    end if;
    if m.status <> 'proof_submitted' then
      raise exception 'Not authorized';
    end if;
    if m.approve_by is null or m.approve_by >= now() then
      raise exception 'Not authorized';
    end if;
  end if;

  if m.status not in ('proof_submitted', 'approved', 'disputed') then
    raise exception 'Milestone has not been submitted for approval';
  end if;

  if m.status = 'disputed' and not exists (
    select 1
    from public.disputes
    where milestone_id = m.id
      and status in ('open', 'need_more_proof')
      and contractor_fix_status = 'fixed'
  ) then
    raise exception 'The contractor must submit a fix before homeowner approval';
  end if;

  if exists (
    select 1
    from public.payouts
    where milestone_id = m.id
  ) then
    select id into v_payout
    from public.payouts
    where milestone_id = m.id;
    return v_payout;
  end if;

  if not exists (
    select 1
    from public.payments
    where project_id = m.project_id
      and quote_id = m.quote_id
      and status = 'held'
  ) then
    select coalesce(sum(coalesce(verified_amount, amount_centavos::numeric / 100)), 0)
      into v_funded_amount
      from public.payment_transactions
     where project_id = m.project_id
       and payment_status in ('PAID', 'SUCCEEDED');

    select coalesce(sum(amount), 0)
      into v_spent_amount
      from public.escrow_ledger
     where project_id = m.project_id
       and entry_type in ('release', 'fee', 'refund');

    v_required_amount := greatest(m.amount, coalesce(m.homeowner_total_amount, m.amount));

    if v_funded_amount - v_spent_amount < v_required_amount then
      raise exception 'Insufficient verified project escrow for this milestone. Funded: %, already released or refunded: %, required: %',
        v_funded_amount, v_spent_amount, v_required_amount;
    end if;
  end if;

  update public.milestones
  set status = 'paid',
      approved_at = coalesce(approved_at, now()),
      paid_at = now()
  where id = m.id;

  insert into public.escrow_ledger (
    project_id, milestone_id, entry_type, amount, from_party, to_party, note
  )
  values (
    p.id, m.id, 'release', m.amount, null, q.contractor_id,
    'Contractor milestone amount; homeowner commission billed separately'
  );

  if m.platform_commission_amount > 0 then
    insert into public.escrow_ledger (
      project_id, milestone_id, entry_type, amount, from_party, to_party, note
    )
    values (
      p.id, m.id, 'fee', m.platform_commission_amount, null, null,
      'Platform commission charged to homeowner'
    );
  end if;

  insert into public.payouts (
    contractor_id, milestone_id, gross_amount, fee_amount, net_amount, status
  )
  values (
    q.contractor_id, m.id, m.homeowner_total_amount,
    m.platform_commission_amount, m.amount, 'pending'
  )
  returning id into v_payout;

  if m.status = 'disputed' then
    update public.disputes
    set status = 'resolved_paid',
        resolution = 'Homeowner accepted the contractor rectification',
        contractor_amount = m.amount,
        homeowner_amount = 0,
        resolved_by = v_user_id,
        resolved_at = now()
    where milestone_id = m.id
      and status in ('open', 'need_more_proof');
  end if;

  if not exists (
    select 1
    from public.milestones
    where project_id = m.project_id
      and status not in ('paid', 'refunded')
  ) then
    update public.projects
    set status = 'completed'
    where id = m.project_id;
    update public.contractor_profiles
    set projects_completed = projects_completed + 1
    where profile_id = q.contractor_id;
  else
    update public.milestones
    set status = 'in_progress'
    where project_id = m.project_id
      and status = 'locked'
      and seq = (
        select min(seq)
        from public.milestones
        where project_id = m.project_id
          and status = 'locked'
      );
  end if;

  return v_payout;
end;
$$;

revoke all on function public.approve_milestone(uuid) from public, anon;
grant execute on function public.approve_milestone(uuid) to authenticated;

notify pgrst, 'reload schema';
