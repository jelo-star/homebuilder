create or replace function public.milestone_verified_funding(p_milestone_id uuid)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  with target as (
    select id, project_id
      from public.milestones
     where id = p_milestone_id
  ),
  allocations as (
    select
      m.id,
      m.seq,
      m.status,
      coalesce(m.homeowner_total_amount, m.amount)::numeric as required,
      coalesce(
        sum(coalesce(tx.verified_amount, tx.amount_centavos::numeric / 100))
          filter (where tx.payment_status in ('PAID', 'SUCCEEDED')),
        0
      )::numeric as direct_funding
    from public.milestones m
    join target t on t.project_id = m.project_id
    left join public.payment_transactions tx
      on tx.project_id = m.project_id
     and tx.milestone_id = m.id
     and tx.payment_status in ('PAID', 'SUCCEEDED')
    group by m.id, m.seq, m.status, m.homeowner_total_amount, m.amount
  ),
  direct_allocations as (
    select
      id,
      seq,
      status,
      required,
      least(direct_funding, required) as allocated,
      greatest(0, required - least(direct_funding, required)) as remaining
    from allocations
  ),
  unallocated_funding as (
    select greatest(
      0,
      coalesce((
        select sum(coalesce(tx.verified_amount, tx.amount_centavos::numeric / 100))
          from public.payment_transactions tx
          join target t on t.project_id = tx.project_id
         where tx.payment_status in ('PAID', 'SUCCEEDED')
      ), 0) - coalesce(sum(allocated), 0)
    ) as amount
    from direct_allocations
  )
  select coalesce(
    case
      when current_milestone.status = 'paid' then current_milestone.required
      else current_milestone.allocated + least(
        current_milestone.remaining,
        greatest(
          0,
          unallocated_funding.amount - coalesce((
            select sum(previous.remaining)
              from direct_allocations previous
             where previous.seq < current_milestone.seq
          ), 0)
        )
      )
    end,
    0
  )
    from direct_allocations current_milestone
    cross join unallocated_funding
   where current_milestone.id = p_milestone_id;
$$;

revoke all on function public.milestone_verified_funding(uuid) from public, anon, authenticated;

create or replace function public.guard_milestone_approval_funding()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_required_amount numeric;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;
  if old.status not in ('proof_submitted', 'payment_verification_pending', 'disputed') then
    raise exception 'Milestone must be submitted for homeowner approval';
  end if;
  if old.status = 'payment_verification_pending' and not public.is_admin() then
    raise exception 'Administrator payment verification is required before milestone approval';
  end if;
  if old.status = 'payment_verification_pending' and not exists (
    select 1
      from public.payment_transactions
     where milestone_id = old.id
       and milestone_approval_requested
       and payment_status in ('PAID', 'SUCCEEDED')
       and verified_at is not null
  ) then
    raise exception 'The requested milestone payment must be verified before approval';
  end if;
  if old.status = 'disputed' and not exists (
    select 1
      from public.disputes
     where milestone_id = old.id
       and status in ('open', 'need_more_proof')
       and contractor_fix_status = 'fixed'
  ) then
    raise exception 'The contractor must submit a fix before homeowner approval';
  end if;

  v_required_amount := coalesce(new.homeowner_total_amount, new.amount);
  if public.milestone_verified_funding(new.id) < v_required_amount then
    raise exception 'Insufficient verified milestone funds. Required: %', v_required_amount;
  end if;

  new.approved_at := coalesce(new.approved_at, now());
  return new;
end;
$$;

revoke all on function public.guard_milestone_approval_funding() from public, anon, authenticated;

drop trigger if exists milestones_guard_approval_funding on public.milestones;
create trigger milestones_guard_approval_funding
before update of status on public.milestones
for each row
execute function public.guard_milestone_approval_funding();

create or replace function public.notify_verified_milestone_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_homeowner_id uuid;
  v_contractor_id uuid;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  select p.homeowner_id, q.contractor_id
    into v_homeowner_id, v_contractor_id
    from public.projects p
    join public.quotes q on q.id = new.quote_id
   where p.id = new.project_id;

  if v_homeowner_id is not null then
    insert into public.notifications(user_id, type, title, body, data)
    values (
      v_homeowner_id,
      'milestone_status',
      'Milestone approved',
      format('%s is approved. Verified funds remain in escrow until administrator release.', new.name),
      jsonb_build_object('project_id', new.project_id, 'milestone_id', new.id, 'status', 'approved')
    );
  end if;
  if v_contractor_id is not null then
    insert into public.notifications(user_id, type, title, body, data)
    values (
      v_contractor_id,
      'milestone_status',
      'Milestone approved',
      format('%s is approved. Funds remain in escrow until administrator release.', new.name),
      jsonb_build_object('project_id', new.project_id, 'milestone_id', new.id, 'status', 'approved')
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_verified_milestone_approval() from public, anon, authenticated;

drop trigger if exists milestones_notify_verified_approval on public.milestones;
create trigger milestones_notify_verified_approval
after update of status on public.milestones
for each row
execute function public.notify_verified_milestone_approval();

create or replace function public.approve_milestone(p_milestone_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_milestone public.milestones%rowtype;
  v_project public.projects%rowtype;
  v_project_id uuid;
  v_user_id uuid := auth.uid();
  v_required_amount numeric;
  v_verified_funding numeric;
begin
  select project_id
    into v_project_id
    from public.milestones
   where id = p_milestone_id;
  if not found then
    raise exception 'Milestone not found';
  end if;

  perform 1
    from public.projects
   where id = v_project_id
   for update;

  select *
    into v_milestone
    from public.milestones
   where id = p_milestone_id
   for update;

  select *
    into v_project
    from public.projects
   where id = v_milestone.project_id;

  if v_project.homeowner_id is distinct from v_user_id and not public.is_admin() then
    if v_user_id is not null then
      raise exception 'Not authorized';
    end if;
    if v_milestone.status <> 'proof_submitted'
       or v_milestone.approve_by is null
       or v_milestone.approve_by >= now() then
      raise exception 'Not authorized';
    end if;
  end if;

  if v_milestone.status in ('approved', 'paid') then
    return v_milestone.id;
  end if;
  if v_milestone.status = 'payment_verification_pending' and not public.is_admin() then
    raise exception 'Milestone approval is pending administrator payment verification';
  end if;
  if v_milestone.status = 'payment_verification_pending' and not exists (
    select 1
      from public.payment_transactions
     where milestone_id = v_milestone.id
       and milestone_approval_requested
       and payment_status in ('PAID', 'SUCCEEDED')
       and verified_at is not null
  ) then
    raise exception 'The requested milestone payment must be verified before approval';
  end if;
  if v_milestone.status not in ('proof_submitted', 'payment_verification_pending', 'disputed') then
    raise exception 'Milestone has not been submitted for approval';
  end if;
  if v_milestone.status = 'disputed' and not exists (
    select 1
      from public.disputes
     where milestone_id = v_milestone.id
       and status in ('open', 'need_more_proof')
       and contractor_fix_status = 'fixed'
  ) then
    raise exception 'The contractor must submit a fix before homeowner approval';
  end if;

  v_required_amount := coalesce(v_milestone.homeowner_total_amount, v_milestone.amount);
  v_verified_funding := public.milestone_verified_funding(v_milestone.id);
  if v_verified_funding < v_required_amount then
    raise exception 'Insufficient verified milestone funds. Available: %, required: %',
      v_verified_funding, v_required_amount;
  end if;

  update public.milestones
     set status = 'approved',
         approved_at = coalesce(approved_at, now()),
         updated_at = now()
   where id = v_milestone.id;

  if v_milestone.status = 'disputed' then
    update public.disputes
       set status = 'resolved_fix',
           resolution = 'Homeowner accepted the contractor rectification; escrow release remains subject to admin authorization',
           contractor_amount = 0,
           homeowner_amount = 0,
           resolved_by = v_user_id,
           resolved_at = now(),
           updated_at = now()
     where milestone_id = v_milestone.id
       and status in ('open', 'need_more_proof');
  end if;

  update public.milestones
     set status = 'in_progress',
         updated_at = now()
   where project_id = v_milestone.project_id
     and status = 'locked'
     and seq = (
       select min(seq)
         from public.milestones
        where project_id = v_milestone.project_id
          and status = 'locked'
     );

  return v_milestone.id;
end;
$$;

revoke all on function public.approve_milestone(uuid) from public, anon;
grant execute on function public.approve_milestone(uuid) to authenticated;

create or replace function public.request_milestone_payment_approval(
  p_milestone_id uuid,
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_milestone public.milestones%rowtype;
  v_project public.projects%rowtype;
  v_transaction public.payment_transactions%rowtype;
  v_admin_id uuid;
begin
  select *
    into v_transaction
    from public.payment_transactions
   where id = p_payment_id
   for update;
  if not found then
    raise exception 'Payment transaction not found';
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
   where id = v_milestone.project_id;
  if v_project.homeowner_id is distinct from auth.uid() then
    raise exception 'Only the project homeowner can request milestone approval';
  end if;

  if v_transaction.project_id is distinct from v_milestone.project_id
     or v_transaction.milestone_id is distinct from v_milestone.id
     or v_transaction.payer_id is distinct from v_project.homeowner_id then
    raise exception 'Payment transaction does not match this homeowner milestone';
  end if;
  if v_transaction.payment_status not in ('PENDING_VERIFICATION', 'PENDING', 'CREATED') then
    raise exception 'Only a pending payment can be submitted for milestone approval';
  end if;
  if v_transaction.proof_file_url is null then
    raise exception 'Payment proof is required for milestone approval';
  end if;
  if v_transaction.milestone_approval_requested is not true then
    raise exception 'This payment was not submitted for milestone approval';
  end if;

  if v_milestone.status = 'payment_verification_pending' then
    return;
  end if;
  if v_milestone.status <> 'proof_submitted' then
    raise exception 'Milestone must have submitted contractor proof before payment approval';
  end if;
  if exists (
    select 1
      from public.payment_transactions
     where milestone_id = v_milestone.id
       and id <> v_transaction.id
       and payment_status in ('PENDING_VERIFICATION', 'PENDING', 'CREATED')
  ) then
    raise exception 'Another milestone payment is already awaiting verification';
  end if;

  update public.milestones
     set status = 'payment_verification_pending',
         updated_at = now()
   where id = v_milestone.id;

  insert into public.notifications(user_id, type, title, body, data)
  values (
    v_project.homeowner_id,
    'milestone_status',
    'Payment awaiting verification',
    format('Payment proof for %s was submitted. The milestone remains unapproved until an administrator verifies it.', v_milestone.name),
    jsonb_build_object(
      'project_id', v_milestone.project_id,
      'milestone_id', v_milestone.id,
      'payment_id', v_transaction.id,
      'status', 'payment_verification_pending'
    )
  );

  for v_admin_id in
    select id from public.profiles where role = 'admin'
  loop
    insert into public.notifications(user_id, type, title, body, data)
    values (
      v_admin_id,
      'milestone_payment',
      'Milestone payment requires verification',
      format('Review payment proof for %s before approving the milestone.', v_milestone.name),
      jsonb_build_object(
        'project_id', v_milestone.project_id,
        'milestone_id', v_milestone.id,
        'payment_id', v_transaction.id
      )
    );
  end loop;
end;
$$;

revoke all on function public.request_milestone_payment_approval(uuid, uuid) from public, anon;
grant execute on function public.request_milestone_payment_approval(uuid, uuid) to authenticated;

create or replace function public.request_milestone_payment_approval_on_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if new.milestone_approval_requested then
    if new.milestone_id is null then
      raise exception 'A milestone is required for a milestone approval payment';
    end if;
    perform public.request_milestone_payment_approval(new.milestone_id, new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.request_milestone_payment_approval_on_insert() from public, anon, authenticated;

drop trigger if exists payment_transactions_request_milestone_approval on public.payment_transactions;
create trigger payment_transactions_request_milestone_approval
after insert on public.payment_transactions
for each row
when (new.milestone_approval_requested)
execute function public.request_milestone_payment_approval_on_insert();

create or replace function public.admin_verify_homeowner_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_transaction public.payment_transactions%rowtype;
  v_project public.projects%rowtype;
  v_quote public.quotes%rowtype;
  v_milestone public.milestones%rowtype;
  v_agreed_amount numeric := 0;
  v_verified_total numeric := 0;
  v_payment_amount numeric := 0;
  v_required_amount numeric := 0;
  v_milestone_funding numeric := 0;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can verify homeowner payments';
  end if;

  select *
    into v_transaction
    from public.payment_transactions
   where id = p_payment_id
   for update;
  if not found then
    raise exception 'Payment transaction not found';
  end if;
  if v_transaction.payment_status not in ('PENDING_VERIFICATION', 'PENDING', 'CREATED') then
    raise exception 'Only pending homeowner payments can be verified';
  end if;

  select *
    into v_project
    from public.projects
   where id = v_transaction.project_id
   for update;
  if not found then
    raise exception 'Project not found for payment transaction';
  end if;
  if v_project.homeowner_id is distinct from v_transaction.payer_id then
    raise exception 'The payment payer must be the homeowner who owns this project';
  end if;

  select *
    into v_quote
    from public.quotes
   where id = v_project.awarded_quote_id;
  v_agreed_amount := coalesce(nullif(v_project.homeowner_total_amount, 0), v_quote.price, 0);
  if v_project.awarded_quote_id is null or v_agreed_amount <= 0 then
    raise exception 'An accepted contractor proposal is required before verifying project payments';
  end if;
  if v_transaction.recipient_id is not null
     and v_transaction.recipient_id is distinct from v_quote.contractor_id then
    raise exception 'Payment recipient does not match the awarded contractor';
  end if;
  if v_transaction.milestone_id is not null and not exists (
    select 1
      from public.milestones
     where id = v_transaction.milestone_id
       and project_id = v_project.id
       and quote_id = v_project.awarded_quote_id
  ) then
    raise exception 'Payment milestone does not belong to the awarded project quote';
  end if;

  v_payment_amount := v_transaction.amount_centavos::numeric / 100;
  select coalesce(sum(coalesce(verified_amount, amount_centavos::numeric / 100)), 0)
    into v_verified_total
    from public.payment_transactions
   where project_id = v_transaction.project_id
     and id <> v_transaction.id
     and payment_status in ('PAID', 'SUCCEEDED');
  if v_verified_total + v_payment_amount > v_agreed_amount then
    raise exception 'This payment exceeds the remaining agreed project balance of %',
      greatest(0, v_agreed_amount - v_verified_total);
  end if;

  update public.payment_transactions
     set payment_status = 'PAID',
         verified_amount = v_payment_amount,
         reviewer_id = auth.uid(),
         reviewer_notes = 'Deposit confirmed by admin into Safekeeping Vault',
         verified_at = now(),
         updated_at = now()
   where id = v_transaction.id;

  insert into public.escrow_ledger (
    project_id, milestone_id, entry_type, amount, from_party, note
  )
  values (
    v_transaction.project_id,
    v_transaction.milestone_id,
    'deposit',
    v_payment_amount,
    v_transaction.payer_id,
    format(
      'Verified homeowner deposit (Transaction: %s; Trace Ref: %s)',
      v_transaction.transaction_ref,
      coalesce(v_transaction.provider_tx_ref, v_transaction.transaction_ref)
    )
  );

  if v_transaction.milestone_id is null then
    return;
  end if;
  if v_transaction.milestone_approval_requested is not true then
    return;
  end if;

  select *
    into v_milestone
    from public.milestones
   where id = v_transaction.milestone_id
   for update;
  if not found
     or v_milestone.status not in ('payment_verification_pending', 'proof_submitted') then
    return;
  end if;

  v_required_amount := coalesce(v_milestone.homeowner_total_amount, v_milestone.amount);
  v_milestone_funding := public.milestone_verified_funding(v_milestone.id);
  if v_milestone_funding >= v_required_amount then
    perform public.approve_milestone(v_milestone.id);
  elsif not exists (
    select 1
      from public.payment_transactions
     where milestone_id = v_milestone.id
       and payment_status in ('PENDING_VERIFICATION', 'PENDING', 'CREATED')
  ) then
    update public.milestones
       set status = 'proof_submitted',
           updated_at = now()
     where id = v_milestone.id;

    insert into public.notifications(user_id, type, title, body, data)
    values (
      v_project.homeowner_id,
      'milestone_status',
      'Additional milestone payment required',
      format('The verified payment did not fully fund %s. Submit proof for the remaining amount before approval.', v_milestone.name),
      jsonb_build_object(
        'project_id', v_milestone.project_id,
        'milestone_id', v_milestone.id,
        'status', 'proof_submitted'
      )
    );
  end if;
end;
$$;

revoke all on function public.admin_verify_homeowner_payment(uuid) from public, anon;
grant execute on function public.admin_verify_homeowner_payment(uuid) to authenticated;

create or replace function public.admin_reject_homeowner_payment(
  p_payment_id uuid,
  p_rejection_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_transaction public.payment_transactions%rowtype;
  v_milestone public.milestones%rowtype;
  v_reason text := nullif(btrim(p_rejection_reason), '');
  v_homeowner_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can reject homeowner payments';
  end if;
  if v_reason is null then
    raise exception 'A rejection reason is required';
  end if;

  select *
    into v_transaction
    from public.payment_transactions
   where id = p_payment_id
   for update;
  if not found then
    raise exception 'Payment transaction not found';
  end if;
  if v_transaction.payment_status not in ('PENDING_VERIFICATION', 'PENDING', 'CREATED') then
    raise exception 'Only pending homeowner payments can be rejected';
  end if;

  update public.payment_transactions
     set payment_status = 'REJECTED',
         reviewer_id = auth.uid(),
         rejection_reason = v_reason,
         reviewer_notes = v_reason,
         updated_at = now()
   where id = v_transaction.id;

  if v_transaction.milestone_id is null then
    return;
  end if;

  select *
    into v_milestone
    from public.milestones
   where id = v_transaction.milestone_id
   for update;
  if not found or v_milestone.status <> 'payment_verification_pending' then
    return;
  end if;

  if exists (
    select 1
      from public.payment_transactions
     where milestone_id = v_milestone.id
       and payment_status in ('PENDING_VERIFICATION', 'PENDING', 'CREATED')
  ) then
    return;
  end if;

  update public.milestones
     set status = 'proof_submitted',
         updated_at = now()
   where id = v_milestone.id;

  select homeowner_id
    into v_homeowner_id
    from public.projects
   where id = v_milestone.project_id;
  if v_homeowner_id is not null then
    insert into public.notifications(user_id, type, title, body, data)
    values (
      v_homeowner_id,
      'milestone_status',
      'Milestone payment rejected',
      format('Payment proof for %s was rejected: %s. The milestone remains unapproved; submit new payment proof to continue.', v_milestone.name, v_reason),
      jsonb_build_object(
        'project_id', v_milestone.project_id,
        'milestone_id', v_milestone.id,
        'payment_id', v_transaction.id,
        'status', 'proof_submitted',
        'rejection_reason', v_reason
      )
    );
  end if;
end;
$$;

revoke all on function public.admin_reject_homeowner_payment(uuid, text) from public, anon;
grant execute on function public.admin_reject_homeowner_payment(uuid, text) to authenticated;

notify pgrst, 'reload schema';
