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
  v_user_id uuid := auth.uid();
begin
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
  if v_milestone.status not in ('proof_submitted', 'disputed') then
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

-- Payment verification records funds in escrow only; it never approves work.
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
  v_agreed_amount numeric := 0;
  v_verified_total numeric := 0;
  v_payment_amount numeric := 0;
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

  if v_agreed_amount > 0 and v_verified_total + v_payment_amount > v_agreed_amount then
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
end;
$$;

revoke all on function public.admin_verify_homeowner_payment(uuid) from public, anon;
grant execute on function public.admin_verify_homeowner_payment(uuid) to authenticated;

create or replace function public.guard_milestone_paid_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_funded numeric := 0;
  v_spent numeric := 0;
  v_required numeric := 0;
  v_awarded_quote_id uuid;
begin
  if new.status <> 'paid' or old.status = 'paid' then
    return new;
  end if;

  if not public.is_admin() or old.status <> 'approved' or new.approved_at is null then
    raise exception 'A homeowner-approved milestone is required before admin release';
  end if;

  perform 1
    from public.projects
   where id = new.project_id
   for update;
  select awarded_quote_id
    into v_awarded_quote_id
    from public.projects
   where id = new.project_id;
  if v_awarded_quote_id is distinct from new.quote_id then
    raise exception 'Only milestones for the awarded project quote can be released';
  end if;

  select coalesce(sum(coalesce(verified_amount, amount_centavos::numeric / 100)), 0)
    into v_funded
    from public.payment_transactions
   where project_id = new.project_id
     and payment_status in ('PAID', 'SUCCEEDED');
  select coalesce(sum(amount), 0)
    into v_spent
    from public.escrow_ledger
   where project_id = new.project_id
     and entry_type in ('release', 'fee', 'refund');

  v_required := greatest(
    new.amount + coalesce(new.platform_commission_amount, 0),
    coalesce(new.homeowner_total_amount, new.amount)
  );
  if v_funded - v_spent < v_required then
    raise exception 'Insufficient verified project escrow. Available: %, required: %',
      greatest(0, v_funded - v_spent), v_required;
  end if;

  new.paid_at := coalesce(new.paid_at, now());
  return new;
end;
$$;

drop trigger if exists milestones_guard_paid_transition on public.milestones;
create trigger milestones_guard_paid_transition
before update of status on public.milestones
for each row
execute function public.guard_milestone_paid_transition();

create or replace function public.guard_escrow_release_balance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_funded numeric := 0;
  v_spent numeric := 0;
  v_milestone_released numeric := 0;
  v_milestone_fee numeric := 0;
  v_contractor_id uuid;
  v_awarded_quote_id uuid;
  v_milestone public.milestones%rowtype;
begin
  if new.entry_type not in ('release', 'fee', 'refund') then
    return new;
  end if;

  select awarded_quote_id
    into v_awarded_quote_id
    from public.projects
   where id = new.project_id
   for update;
  if not found then
    raise exception 'Project not found for escrow release';
  end if;

  if new.entry_type in ('release', 'fee') then
    if new.milestone_id is null then
      raise exception 'A milestone is required for contractor releases and fees';
    end if;
    select *
      into v_milestone
      from public.milestones
     where id = new.milestone_id
       and project_id = new.project_id
     for update;
    if not found
       or v_milestone.status not in ('approved', 'paid')
       or v_milestone.approved_at is null then
      raise exception 'The milestone must be approved by the homeowner before funds can be released';
    end if;
    if v_awarded_quote_id is distinct from v_milestone.quote_id then
      raise exception 'Only milestones for the awarded project quote can be released';
    end if;
    select contractor_id
      into v_contractor_id
      from public.quotes
     where id = v_milestone.quote_id;
    if new.entry_type = 'release' and new.to_party is distinct from v_contractor_id then
      raise exception 'Milestone funds can only be released to its awarded contractor';
    end if;

    select coalesce(sum(amount), 0)
      into v_milestone_released
      from public.escrow_ledger
     where milestone_id = v_milestone.id
       and entry_type = 'release';
    select coalesce(sum(amount), 0)
      into v_milestone_fee
      from public.escrow_ledger
     where milestone_id = v_milestone.id
       and entry_type = 'fee';
    if new.entry_type = 'release'
       and v_milestone_released + new.amount > v_milestone.amount then
      raise exception 'Release amount exceeds the approved milestone contractor allocation';
    end if;
    if new.entry_type = 'fee'
       and v_milestone_fee + new.amount > coalesce(v_milestone.platform_commission_amount, 0) then
      raise exception 'Fee amount exceeds the approved milestone commission allocation';
    end if;
  end if;

  select coalesce(sum(coalesce(verified_amount, amount_centavos::numeric / 100)), 0)
    into v_funded
    from public.payment_transactions
   where project_id = new.project_id
     and payment_status in ('PAID', 'SUCCEEDED');
  select coalesce(sum(amount), 0)
    into v_spent
    from public.escrow_ledger
   where project_id = new.project_id
     and entry_type in ('release', 'fee', 'refund');

  if v_funded - v_spent < new.amount then
    raise exception 'Insufficient verified project escrow. Available: %, requested: %',
      greatest(0, v_funded - v_spent), new.amount;
  end if;
  return new;
end;
$$;

drop trigger if exists escrow_ledger_guard_release_balance on public.escrow_ledger;
create trigger escrow_ledger_guard_release_balance
before insert on public.escrow_ledger
for each row
execute function public.guard_escrow_release_balance();

create or replace function public.guard_payout_approval_and_funding()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_milestone public.milestones%rowtype;
  v_project_id uuid;
  v_funded numeric := 0;
  v_spent numeric := 0;
  v_reserved numeric := 0;
  v_required numeric := 0;
  v_quote_contractor_id uuid;
  v_awarded_quote_id uuid;
begin
  if new.status not in ('pending', 'sent') then
    return new;
  end if;

  select project_id
    into v_project_id
    from public.milestones
   where id = new.milestone_id;
  if not found then
    raise exception 'Payout milestone not found';
  end if;
  if new.project_id is not null and new.project_id <> v_project_id then
    raise exception 'Payout project does not match its milestone';
  end if;

  select awarded_quote_id
    into v_awarded_quote_id
    from public.projects
   where id = v_project_id
   for update;
  if not found then
    raise exception 'Project not found for payout';
  end if;
  select *
    into v_milestone
    from public.milestones
   where id = new.milestone_id
   for update;
  if v_milestone.status not in ('approved', 'paid')
     or v_milestone.approved_at is null then
    raise exception 'The milestone must be approved by the homeowner before a payout can be authorized';
  end if;
  if v_awarded_quote_id is distinct from v_milestone.quote_id then
    raise exception 'Only milestones for the awarded project quote can be paid';
  end if;
  select contractor_id
    into v_quote_contractor_id
    from public.quotes
   where id = v_milestone.quote_id;
  if new.contractor_id is distinct from v_quote_contractor_id then
    raise exception 'Payout contractor does not match the awarded milestone contractor';
  end if;

  v_required := greatest(
    v_milestone.amount + coalesce(v_milestone.platform_commission_amount, 0),
    coalesce(v_milestone.homeowner_total_amount, v_milestone.amount)
  );
  if new.gross_amount <> v_required then
    raise exception 'Payout amount must match the full approved milestone allocation of %',
      v_required;
  end if;

  select coalesce(sum(coalesce(verified_amount, amount_centavos::numeric / 100)), 0)
    into v_funded
    from public.payment_transactions
   where project_id = v_project_id
     and payment_status in ('PAID', 'SUCCEEDED');
  select coalesce(sum(amount), 0)
    into v_spent
    from public.escrow_ledger
   where project_id = v_project_id
     and entry_type in ('release', 'fee', 'refund');
  select coalesce(sum(amount), 0)
    into v_reserved
    from public.escrow_ledger
   where project_id = v_project_id
     and milestone_id = new.milestone_id
     and entry_type in ('release', 'fee');

  if v_funded - v_spent + v_reserved < new.gross_amount then
    raise exception 'Insufficient verified project escrow for this payout. Available: %, required: %',
      greatest(0, v_funded - v_spent + v_reserved), new.gross_amount;
  end if;

  if new.status = 'sent'
     and (new.transaction_id is null or new.payout_tx_ref is null)
     and v_reserved < new.gross_amount then
    raise exception 'Authorize and reserve the approved milestone from verified escrow before marking its payout sent';
  end if;

  if new.status = 'sent' and v_milestone.status = 'approved' then
    update public.milestones
       set status = 'paid',
           paid_at = now(),
           updated_at = now()
     where id = v_milestone.id;

    if not exists (
      select 1
        from public.milestones
       where project_id = v_project_id
         and status not in ('paid', 'refunded')
    ) then
      update public.projects
         set status = 'completed',
             updated_at = now()
       where id = v_project_id
         and status <> 'completed';
      if found then
        update public.contractor_profiles
           set projects_completed = projects_completed + 1
         where profile_id = new.contractor_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payouts_guard_approval_and_funding on public.payouts;
create trigger payouts_guard_approval_and_funding
before insert or update of status, gross_amount, milestone_id on public.payouts
for each row
execute function public.guard_payout_approval_and_funding();

create or replace function public.admin_release_approved_milestone(p_milestone_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_milestone public.milestones%rowtype;
  v_project public.projects%rowtype;
  v_contractor_id uuid;
  v_payout_id uuid;
  v_funded numeric := 0;
  v_spent numeric := 0;
  v_fee numeric := 0;
  v_required numeric := 0;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can authorize milestone releases';
  end if;

  select *
    into v_milestone
    from public.milestones
   where id = p_milestone_id;
  if not found then
    raise exception 'Milestone not found';
  end if;

  select *
    into v_project
    from public.projects
   where id = v_milestone.project_id
   for update;
  select *
    into v_milestone
    from public.milestones
   where id = p_milestone_id
   for update;

  if v_milestone.status = 'paid' then
    select id
      into v_payout_id
      from public.payouts
     where milestone_id = v_milestone.id;
    if v_payout_id is not null then
      return v_payout_id;
    end if;
  end if;
  if v_milestone.status <> 'approved' or v_milestone.approved_at is null then
    raise exception 'Only a homeowner-approved milestone can be released';
  end if;
  if v_project.awarded_quote_id is distinct from v_milestone.quote_id then
    raise exception 'Milestone is not part of the awarded project quote';
  end if;

  select contractor_id
    into v_contractor_id
    from public.quotes
   where id = v_milestone.quote_id;
  if v_contractor_id is null then
    raise exception 'Contractor for the approved milestone could not be found';
  end if;

  v_fee := coalesce(v_milestone.platform_commission_amount, 0);
  v_required := greatest(
    v_milestone.amount + v_fee,
    coalesce(v_milestone.homeowner_total_amount, v_milestone.amount)
  );

  select coalesce(sum(coalesce(verified_amount, amount_centavos::numeric / 100)), 0)
    into v_funded
    from public.payment_transactions
   where project_id = v_project.id
     and payment_status in ('PAID', 'SUCCEEDED');
  select coalesce(sum(amount), 0)
    into v_spent
    from public.escrow_ledger
   where project_id = v_project.id
     and entry_type in ('release', 'fee', 'refund');
  if v_funded - v_spent < v_required then
    raise exception 'Insufficient verified project escrow. Available: %, required for milestone: %',
      greatest(0, v_funded - v_spent), v_required;
  end if;

  update public.milestones
     set status = 'paid',
         paid_at = now(),
         updated_at = now()
   where id = v_milestone.id;

  insert into public.escrow_ledger (
    project_id, milestone_id, entry_type, amount, from_party, to_party, note
  )
  values (
    v_project.id, v_milestone.id, 'release', v_milestone.amount,
    null, v_contractor_id, 'Admin-authorized release for homeowner-approved milestone'
  );

  if v_fee > 0 then
    insert into public.escrow_ledger (
      project_id, milestone_id, entry_type, amount, from_party, note
    )
    values (
      v_project.id, v_milestone.id, 'fee', v_fee, null,
      'Platform commission for homeowner-approved milestone'
    );
  end if;

  insert into public.payouts (
    project_id, contractor_id, milestone_id, gross_amount, fee_amount, net_amount, status,
    released_by, released_at
  )
  values (
    v_project.id, v_contractor_id, v_milestone.id, v_milestone.amount + v_fee,
    v_fee, v_milestone.amount, 'pending', auth.uid(), now()
  )
  returning id into v_payout_id;

  insert into public.financial_audit_logs (
    actor_id, action_type, entity_type, entity_id, new_state, reason
  )
  values (
    auth.uid(),
    'AUTHORIZE_APPROVED_MILESTONE_RELEASE',
    'milestones',
    v_milestone.id,
    jsonb_build_object(
      'milestone_status', 'paid',
      'payout_id', v_payout_id,
      'released_amount', v_milestone.amount,
      'commission_amount', v_fee
    ),
    'Admin authorized release after homeowner approval and verified escrow balance check'
  );

  if not exists (
    select 1
      from public.milestones
     where project_id = v_project.id
       and status not in ('paid', 'refunded')
  ) then
    update public.projects
       set status = 'completed',
           updated_at = now()
     where id = v_project.id
       and status <> 'completed';
    if found then
      update public.contractor_profiles
         set projects_completed = projects_completed + 1
       where profile_id = v_contractor_id;
    end if;
  end if;

  return v_payout_id;
end;
$$;

revoke all on function public.admin_release_approved_milestone(uuid) from public, anon;
grant execute on function public.admin_release_approved_milestone(uuid) to authenticated;

notify pgrst, 'reload schema';
