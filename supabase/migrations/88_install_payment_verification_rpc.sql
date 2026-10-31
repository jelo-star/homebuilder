-- Install the atomic admin payment-verification RPC for hosted environments
-- where migration 71 was not applied or the function is missing from PostgREST.
create or replace function public.admin_verify_homeowner_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_transaction public.payment_transactions%rowtype;
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
end;
$$;

revoke all on function public.admin_verify_homeowner_payment(uuid) from public, anon;
grant execute on function public.admin_verify_homeowner_payment(uuid) to authenticated;

notify pgrst, 'reload schema';
