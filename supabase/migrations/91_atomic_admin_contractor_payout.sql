-- Record the payout, payment transaction update, and escrow ledger entries as
-- one admin-authorized transaction. Existing milestone payouts are updated
-- rather than duplicated when an earlier attempt partially completed.
create or replace function public.admin_record_contractor_payout(
  p_payment_id uuid,
  p_amount numeric,
  p_payout_method text,
  p_payout_account_id uuid,
  p_payout_reference text,
  p_proof_url text,
  p_proof_name text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_transaction public.payment_transactions%rowtype;
  v_commission_percent numeric := 0;
  v_commission_amount numeric := 0;
  v_payout_id uuid;
  v_reference text := nullif(btrim(p_payout_reference), '');
  v_now timestamptz := now();
  v_notes text := nullif(btrim(p_notes), '');
begin
  if not public.is_admin() then
    raise exception 'Only administrators can record contractor payouts';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid payout amount';
  end if;

  if v_reference is null then
    raise exception 'A bank or trace reference is required';
  end if;

  if p_payout_method not in ('bank_transfer', 'gcash', 'maya') then
    raise exception 'Select a supported payout method';
  end if;

  select *
    into v_transaction
    from public.payment_transactions
   where id = p_payment_id
   for update;

  if not found then
    raise exception 'Payment transaction not found';
  end if;

  if v_transaction.payment_status <> 'PAID' then
    raise exception 'Only verified homeowner payments can be disbursed';
  end if;

  if v_transaction.project_id is null
     or v_transaction.recipient_id is null
     or v_transaction.milestone_id is null then
    raise exception 'The transaction must include a project, contractor, and milestone before payout';
  end if;

  if v_transaction.payout_status = 'PAID'
     and v_transaction.payout_tx_ref is not null
     and v_transaction.payout_tx_ref <> v_reference then
    raise exception 'This payment already has a payout recorded with a different reference';
  end if;

  if p_payout_account_id is not null and not exists (
    select 1
      from public.contractor_payout_accounts
     where id = p_payout_account_id
       and contractor_id = v_transaction.recipient_id
       and payout_method = p_payout_method
  ) then
    raise exception 'The selected payout account does not belong to this contractor or method';
  end if;

  select coalesce(platform_commission_percent, 0)
    into v_commission_percent
    from public.projects
   where id = v_transaction.project_id;

  if not found then
    raise exception 'Project not found for payment transaction';
  end if;

  v_commission_amount := round((p_amount * v_commission_percent / 100)::numeric, 2);

  insert into public.payouts (
    project_id,
    transaction_id,
    contractor_id,
    milestone_id,
    gross_amount,
    fee_amount,
    net_amount,
    status,
    provider_ref,
    payout_tx_ref,
    payout_method,
    proof_file_url,
    proof_file_name,
    released_by,
    released_at,
    notes,
    sent_at,
    updated_at
  )
  values (
    v_transaction.project_id,
    v_transaction.id,
    v_transaction.recipient_id,
    v_transaction.milestone_id,
    p_amount + v_commission_amount,
    v_commission_amount,
    p_amount,
    'sent',
    v_reference,
    v_reference,
    p_payout_method,
    p_proof_url,
    p_proof_name,
    auth.uid(),
    v_now,
    coalesce(v_notes, format('Disbursement for homeowner deposit %s', v_transaction.transaction_ref)),
    v_now,
    v_now
  )
  on conflict (milestone_id) do update
     set project_id = excluded.project_id,
         transaction_id = excluded.transaction_id,
         contractor_id = excluded.contractor_id,
         gross_amount = excluded.gross_amount,
         fee_amount = excluded.fee_amount,
         net_amount = excluded.net_amount,
         status = excluded.status,
         provider_ref = excluded.provider_ref,
         payout_tx_ref = excluded.payout_tx_ref,
         payout_method = excluded.payout_method,
         proof_file_url = excluded.proof_file_url,
         proof_file_name = excluded.proof_file_name,
         released_by = excluded.released_by,
         released_at = excluded.released_at,
         notes = excluded.notes,
         sent_at = excluded.sent_at,
         updated_at = excluded.updated_at
   where public.payouts.transaction_id is null
      or public.payouts.transaction_id = excluded.transaction_id
  returning id into v_payout_id;

  if v_payout_id is null then
    raise exception 'This milestone already has a payout recorded for a different payment transaction';
  end if;

  update public.payment_transactions
     set payout_status = 'PAID',
         payout_tx_ref = v_reference,
         payout_account_id = p_payout_account_id,
         payout_method = p_payout_method,
         payout_proof_url = p_proof_url,
         payout_proof_name = p_proof_name,
         payout_released_by = auth.uid(),
         payout_released_at = v_now,
         payout_notes = v_notes
   where id = v_transaction.id;

  if not exists (
    select 1
      from public.escrow_ledger
     where project_id = v_transaction.project_id
       and milestone_id = v_transaction.milestone_id
       and entry_type = 'release'
  ) then
    insert into public.escrow_ledger (
      project_id,
      milestone_id,
      entry_type,
      amount,
      from_party,
      to_party,
      note
    )
    values (
      v_transaction.project_id,
      v_transaction.milestone_id,
      'release',
      p_amount,
      v_transaction.payer_id,
      v_transaction.recipient_id,
      format('Milestone payout released to contractor (Proof Ref: %s)', v_reference)
    );
  end if;

  if v_commission_amount > 0 and not exists (
    select 1
      from public.escrow_ledger
     where project_id = v_transaction.project_id
       and milestone_id = v_transaction.milestone_id
       and entry_type = 'fee'
  ) then
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
      'fee',
      v_commission_amount,
      v_transaction.payer_id,
      'Homeowner platform commission for milestone'
    );
  end if;
end;
$$;

revoke all on function public.admin_record_contractor_payout(uuid, numeric, text, uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_record_contractor_payout(uuid, numeric, text, uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
