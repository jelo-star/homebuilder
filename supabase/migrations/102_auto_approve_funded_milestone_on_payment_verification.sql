create or replace function public.admin_verify_homeowner_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_transaction public.payment_transactions%rowtype;
  v_milestone public.milestones%rowtype;
  v_funded_amount numeric := 0;
  v_spent_amount numeric := 0;
  v_required_amount numeric := 0;
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

  update public.payment_transactions
     set payment_status = 'PAID',
         verified_amount = v_transaction.amount_centavos::numeric / 100,
         reviewer_id = auth.uid(),
         reviewer_notes = 'Deposit confirmed by admin into Safekeeping Vault',
         verified_at = now(),
         updated_at = now()
   where id = v_transaction.id;

  insert into public.escrow_ledger (
    project_id,
    milestone_id,
    entry_type,
    amount,
    from_party,
    note
  )
  values (
    v_transaction.project_id,
    v_transaction.milestone_id,
    'deposit',
    v_transaction.amount_centavos::numeric / 100,
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

  select *
    into v_milestone
    from public.milestones
   where id = v_transaction.milestone_id
   for update;

  if not found
     or v_milestone.status not in ('proof_submitted', 'approved', 'disputed') then
    return;
  end if;

  if v_milestone.status = 'disputed'
     and not exists (
       select 1
         from public.disputes
        where milestone_id = v_milestone.id
          and status in ('open', 'need_more_proof')
          and contractor_fix_status = 'fixed'
     ) then
    return;
  end if;

  if not exists (
    select 1
      from public.payments
     where project_id = v_milestone.project_id
       and quote_id = v_milestone.quote_id
       and status = 'held'
  ) then
    select coalesce(sum(coalesce(verified_amount, amount_centavos::numeric / 100)), 0)
      into v_funded_amount
      from public.payment_transactions
     where project_id = v_milestone.project_id
       and payment_status in ('PAID', 'SUCCEEDED');

    select coalesce(sum(amount), 0)
      into v_spent_amount
      from public.escrow_ledger
     where project_id = v_milestone.project_id
       and entry_type in ('release', 'fee', 'refund');

    v_required_amount := greatest(
      v_milestone.amount,
      coalesce(v_milestone.homeowner_total_amount, v_milestone.amount)
    );

    if v_funded_amount - v_spent_amount < v_required_amount then
      return;
    end if;
  end if;

  perform public.approve_milestone(v_milestone.id);
end;
$$;

revoke all on function public.admin_verify_homeowner_payment(uuid) from public, anon;
grant execute on function public.admin_verify_homeowner_payment(uuid) to authenticated;

notify pgrst, 'reload schema';
