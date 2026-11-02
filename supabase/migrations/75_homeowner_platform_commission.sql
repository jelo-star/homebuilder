alter table public.projects
  add column if not exists platform_commission_percent numeric(5,2) not null default 0
    check (platform_commission_percent between 0 and 100),
  add column if not exists platform_commission_amount numeric(14,2) not null default 0
    check (platform_commission_amount >= 0),
  add column if not exists homeowner_total_amount numeric(14,2) not null default 0
    check (homeowner_total_amount >= 0);

alter table public.milestones
  add column if not exists platform_commission_amount numeric(14,2) not null default 0
    check (platform_commission_amount >= 0),
  add column if not exists homeowner_total_amount numeric(14,2) not null default 0
    check (homeowner_total_amount >= 0);

create or replace function public.get_current_platform_commission_percent()
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select coalesce(
    (select (value #>> '{}')::numeric
       from public.app_settings
      where key = 'platform_fee_percent'),
    0
  )
$$;

revoke all on function public.get_current_platform_commission_percent() from public, anon;
grant execute on function public.get_current_platform_commission_percent() to authenticated;

create or replace function public.set_project_platform_commission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_quote_price numeric(14,2);
  v_commission_percent numeric(5,2);
begin
  if tg_op = 'INSERT' then
    v_commission_percent := public.get_current_platform_commission_percent();
    if v_commission_percent < 0 or v_commission_percent > 100 then
      raise exception 'Configured platform commission must be between 0 and 100 percent';
    end if;

    new.platform_commission_percent := v_commission_percent;
    new.platform_commission_amount := 0;
    new.homeowner_total_amount := 0;
    return new;
  end if;

  new.platform_commission_percent := old.platform_commission_percent;
  new.platform_commission_amount := old.platform_commission_amount;
  new.homeowner_total_amount := old.homeowner_total_amount;

  if new.awarded_quote_id is distinct from old.awarded_quote_id then
    if new.awarded_quote_id is null then
      new.platform_commission_amount := 0;
      new.homeowner_total_amount := 0;
    else
      select price
        into v_quote_price
        from public.quotes
       where id = new.awarded_quote_id
         and project_id = new.id
         and status = 'accepted';

      if not found or v_quote_price is null then
        raise exception 'The awarded quote must be accepted and belong to this project';
      end if;

      new.platform_commission_amount := 0;
      new.homeowner_total_amount := v_quote_price;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.set_milestone_platform_commission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_commission_percent numeric(5,2);
begin
  select platform_commission_percent
    into v_commission_percent
    from public.projects
   where id = new.project_id;

  if not found then
    raise exception 'Project not found for milestone commission calculation';
  end if;

  new.platform_commission_amount := 0;
  new.homeowner_total_amount := new.amount;

  return new;
end;
$$;

update public.projects p
   set platform_commission_percent = public.get_current_platform_commission_percent()
 where p.platform_commission_percent = 0;

update public.projects p
   set platform_commission_amount = 0,
       homeowner_total_amount = q.price
  from public.quotes q
 where p.awarded_quote_id = q.id
   and q.status = 'accepted';

update public.milestones m
   set platform_commission_amount = 0,
       homeowner_total_amount = m.amount
  from public.projects p
 where p.id = m.project_id;

drop trigger if exists projects_platform_commission_insert on public.projects;
create trigger projects_platform_commission_insert
before insert on public.projects
for each row
execute function public.set_project_platform_commission();

drop trigger if exists projects_platform_commission_update on public.projects;
create trigger projects_platform_commission_update
before update of awarded_quote_id, platform_commission_percent,
  platform_commission_amount, homeowner_total_amount
on public.projects
for each row
execute function public.set_project_platform_commission();

drop trigger if exists milestones_platform_commission_insert on public.milestones;
create trigger milestones_platform_commission_insert
before insert on public.milestones
for each row
execute function public.set_milestone_platform_commission();

drop trigger if exists milestones_platform_commission_update on public.milestones;
create trigger milestones_platform_commission_update
before update of project_id, amount, platform_commission_amount, homeowner_total_amount
on public.milestones
for each row
execute function public.set_milestone_platform_commission();

create or replace function public.phase_one_accept_quote(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_quote record;
  v_project public.projects%rowtype;
begin
  select q.*, p.homeowner_id as project_homeowner_id, p.status as project_status
    into v_quote
    from public.quotes q
    join public.projects p on p.id = q.project_id
   where q.id = p_quote_id
   for update of q, p;

  if not found or v_quote.project_homeowner_id <> auth.uid() then
    raise exception 'Only the project homeowner may accept this proposal.';
  end if;
  if v_quote.status not in ('submitted', 'revised') then
    raise exception 'Only a submitted proposal may be accepted.';
  end if;
  if v_quote.price is null or v_quote.duration_months is null then
    raise exception 'The proposal is missing its price or duration.';
  end if;

  update public.quotes
     set status = 'accepted', decided_at = now(), updated_at = now()
   where id = p_quote_id;

  update public.quotes
     set status = 'declined', decided_at = now(), updated_at = now()
   where project_id = v_quote.project_id
     and id <> p_quote_id
     and status in ('submitted', 'revision_requested', 'revised', 'requested');

  update public.projects
     set awarded_quote_id = p_quote_id,
         status = 'project_planning',
         updated_at = now()
   where id = v_quote.project_id;

  select *
    into v_project
    from public.projects
   where id = v_quote.project_id;

  return jsonb_build_object(
    'success', true,
    'project_id', v_quote.project_id,
    'quote_id', p_quote_id,
    'contract_amount', v_quote.price,
    'commission_percent', v_project.platform_commission_percent,
    'commission_amount', v_project.platform_commission_amount,
    'homeowner_total_amount', v_project.homeowner_total_amount
  );
end;
$$;

revoke all on function public.phase_one_accept_quote(uuid) from public, anon;
grant execute on function public.phase_one_accept_quote(uuid) to authenticated;

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
begin
  select * into m from public.milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found'; end if;
  select * into p from public.projects where id = m.project_id for update;
  select * into q from public.quotes where id = m.quote_id;

  if p.homeowner_id <> auth.uid() and not public.is_admin()
     and not (auth.uid() is null and m.status = 'proof_submitted'
       and m.approve_by is not null and m.approve_by < now()) then
    raise exception 'Not authorized';
  end if;
  if m.status not in ('proof_submitted', 'approved', 'disputed') then
    raise exception 'Milestone has not been submitted for approval';
  end if;
  if m.status = 'disputed' and not exists (
    select 1 from public.disputes
     where milestone_id = m.id
       and status in ('open', 'need_more_proof')
       and contractor_fix_status = 'fixed'
  ) then
    raise exception 'The contractor must mark the disputed work fixed before homeowner approval';
  end if;
  if exists (select 1 from public.payouts where milestone_id = m.id) then
    select id into v_payout from public.payouts where milestone_id = m.id;
    return v_payout;
  end if;
  if not exists (
    select 1 from public.payments
     where project_id = m.project_id and quote_id = m.quote_id and status = 'held'
  ) and not exists (
    select 1 from public.payment_transactions
     where project_id = m.project_id
       and milestone_id = m.id
       and payment_status in ('PAID', 'SUCCEEDED')
  ) then
    raise exception 'No held payment exists for this accepted quote';
  end if;

  update public.milestones
     set status = 'paid',
         approved_at = coalesce(approved_at, now()),
         paid_at = now()
   where id = m.id;

  insert into public.escrow_ledger(project_id, milestone_id, entry_type, amount, from_party, to_party, note)
  values(p.id, m.id, 'release', m.amount, null, q.contractor_id,
         'Contractor milestone amount; homeowner commission billed separately');

  if m.platform_commission_amount > 0 then
    insert into public.escrow_ledger(project_id, milestone_id, entry_type, amount, from_party, to_party, note)
    values(p.id, m.id, 'fee', m.platform_commission_amount, null, null,
           'Platform commission charged to homeowner');
  end if;

  insert into public.payouts(contractor_id, milestone_id, gross_amount, fee_amount, net_amount, status)
  values(q.contractor_id, m.id, m.homeowner_total_amount, m.platform_commission_amount, m.amount, 'pending')
  returning id into v_payout;

  if m.status = 'disputed' then
    update public.disputes
       set status = 'resolved_paid',
           resolution = 'Homeowner accepted the contractor rectification',
           contractor_amount = m.amount,
           homeowner_amount = 0,
           resolved_by = auth.uid(),
           resolved_at = now()
     where milestone_id = m.id
       and status in ('open', 'need_more_proof');
  end if;

  if not exists (
    select 1 from public.milestones
     where project_id = m.project_id and status not in ('paid', 'refunded')
  ) then
    update public.projects set status = 'completed' where id = m.project_id;
    update public.contractor_profiles
       set projects_completed = projects_completed + 1
     where profile_id = q.contractor_id;
  else
    update public.milestones
       set status = 'in_progress'
     where project_id = m.project_id
       and status = 'locked'
       and seq = (
         select min(seq) from public.milestones
          where project_id = m.project_id and status = 'locked'
       );
  end if;

  return v_payout;
end;
$$;

revoke all on function public.approve_milestone(uuid) from public, anon;
grant execute on function public.approve_milestone(uuid) to authenticated;

create or replace function public.resolve_dispute(
  p_dispute_id uuid,
  p_resolution public.dispute_status,
  p_contractor_amount numeric,
  p_homeowner_amount numeric
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  d public.disputes%rowtype;
  m public.milestones%rowtype;
  p public.projects%rowtype;
  q public.quotes%rowtype;
  v_fee numeric(14,2);
  v_refund numeric(14,2);
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_resolution is null or p_contractor_amount is null or p_homeowner_amount is null
     or p_resolution not in ('resolved_paid', 'resolved_refund', 'resolved_split') then
    raise exception 'Invalid final resolution';
  end if;

  select * into d from public.disputes where id = p_dispute_id for update;
  if not found or d.status not in ('open', 'need_more_proof') then
    raise exception 'Dispute not found or already resolved';
  end if;
  select * into m from public.milestones where id = d.milestone_id for update;
  select * into p from public.projects where id = m.project_id for update;
  select * into q from public.quotes where id = m.quote_id;

  if p_contractor_amount < 0 or p_homeowner_amount < 0
     or round(p_contractor_amount + p_homeowner_amount, 2) <> m.amount then
    raise exception 'Contractor and homeowner amounts must be nonnegative and sum to the milestone amount';
  end if;
  if not exists (
    select 1 from public.payments
     where project_id = m.project_id and quote_id = m.quote_id and status = 'held'
  ) then
    raise exception 'No held payment exists for this accepted quote';
  end if;

  v_fee := round(p_contractor_amount * p.platform_commission_percent / 100, 2);
  v_refund := p_homeowner_amount + greatest(0, m.platform_commission_amount - v_fee);

  if p_contractor_amount > 0 then
    insert into public.escrow_ledger(project_id, milestone_id, entry_type, amount, from_party, to_party, note)
    values(m.project_id, m.id, 'release', p_contractor_amount, null, q.contractor_id,
           'Dispute settlement contractor payout; homeowner commission billed separately');
  end if;
  if v_fee > 0 then
    insert into public.escrow_ledger(project_id, milestone_id, entry_type, amount, from_party, to_party, note)
    values(m.project_id, m.id, 'fee', v_fee, null, null,
           'Homeowner platform commission on contractor amount awarded in dispute');
  end if;
  if v_refund > 0 then
    insert into public.escrow_ledger(project_id, milestone_id, entry_type, amount, from_party, to_party, note)
    values(m.project_id, m.id, 'refund', v_refund, null, d.opened_by,
           'Dispute refund including unearned homeowner commission');
  end if;
  if p_contractor_amount > 0 then
    insert into public.payouts(contractor_id, milestone_id, gross_amount, fee_amount, net_amount, status)
    values(q.contractor_id, m.id, p_contractor_amount + v_fee, v_fee, p_contractor_amount, 'pending')
    on conflict(milestone_id) do nothing;
  end if;

  update public.disputes
     set status = p_resolution,
         resolution = p_resolution::text,
         contractor_amount = p_contractor_amount,
         homeowner_amount = p_homeowner_amount,
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = d.id;
  update public.milestones
     set status = case when p_contractor_amount = 0
                       then 'refunded'::public.milestone_status
                       else 'paid'::public.milestone_status end,
         paid_at = case when p_contractor_amount > 0 then now() else paid_at end
   where id = m.id;

  if not exists (
    select 1 from public.milestones
     where project_id = m.project_id and status not in ('paid', 'refunded')
  ) then
    update public.projects set status = 'completed' where id = m.project_id;
  else
    update public.projects set status = 'in_progress' where id = m.project_id;
  end if;
end;
$$;

revoke all on function public.resolve_dispute(uuid, public.dispute_status, numeric, numeric) from public, anon;
grant execute on function public.resolve_dispute(uuid, public.dispute_status, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';