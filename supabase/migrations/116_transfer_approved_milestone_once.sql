drop function if exists public.admin_record_contractor_payout(
  uuid, numeric, text, uuid, text, text, text, text
);

create or replace function public.admin_record_contractor_milestone_payout(
  p_payment_id uuid,
  p_milestone_id uuid,
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
  v_milestone public.milestones%rowtype;
  v_project public.projects%rowtype;
  v_contractor_id uuid;
  v_commission_amount numeric := 0;
  v_gross_amount numeric := 0;
  v_funded numeric := 0;
  v_spent numeric := 0;
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

  if not found or v_transaction.payment_status <> 'PAID' then
    raise exception 'A verified homeowner payment is required before disbursement';
  end if;

  if v_transaction.project_id is null or v_transaction.recipient_id is null then
    raise exception 'The homeowner payment must include a project and contractor';
  end if;

  select *
    into v_project
    from public.projects
   where id = v_transaction.project_id
   for update;

  if not found then
    raise exception 'Project not found for payment transaction';
  end if;

  select *
    into v_milestone
    from public.milestones
   where id = p_milestone_id
   for update;

  if not found
     or v_milestone.project_id is distinct from v_transaction.project_id
     or v_milestone.status <> 'approved'
     or v_milestone.approved_at is null then
    raise exception 'Only an approved milestone from this project can be transferred';
  end if;

  if v_transaction.milestone_id is not null
     and v_transaction.milestone_id is distinct from v_milestone.id then
    raise exception 'The selected homeowner payment is allocated to a different milestone';
  end if;

  if round(p_amount, 2) <> round(v_milestone.amount, 2) then
    raise exception 'The transfer amount must match the full approved milestone amount';
  end if;

  if v_project.awarded_quote_id is distinct from v_milestone.quote_id then
    raise exception 'Milestone is not part of the awarded project quote';
  end if;

  select contractor_id
    into v_contractor_id
    from public.quotes
   where id = v_milestone.quote_id;

  if v_contractor_id is null or v_contractor_id is distinct from v_transaction.recipient_id then
    raise exception 'The homeowner payment contractor does not match the approved milestone';
  end if;

  if exists (
    select 1
      from public.payouts
     where milestone_id = v_milestone.id
  ) then
    raise exception 'This milestone has already been transferred';
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

  v_gross_amount := greatest(
    v_milestone.amount + coalesce(v_milestone.platform_commission_amount, 0),
    coalesce(v_milestone.homeowner_total_amount, v_milestone.amount)
  );
  v_commission_amount := v_gross_amount - p_amount;

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

  if v_funded - v_spent < v_gross_amount then
    raise exception 'Insufficient verified project escrow for this approved milestone';
  end if;

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
    v_project.id,
    v_transaction.id,
    v_contractor_id,
    v_milestone.id,
    v_gross_amount,
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
    coalesce(v_notes, format('Disbursement for approved milestone %s', v_milestone.name)),
    v_now,
    v_now
  )
  returning id into v_payout_id;

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
   where project_id = v_project.id
     and milestone_id = v_milestone.id
     and payment_status = 'PAID';

  update public.milestones
     set status = 'paid',
         paid_at = v_now,
         updated_at = v_now
   where id = v_milestone.id;

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
    v_project.id,
    v_milestone.id,
    'release',
    p_amount,
    v_transaction.payer_id,
    v_contractor_id,
    format('Milestone payout released to contractor (Proof Ref: %s)', v_reference)
  );

  if v_commission_amount > 0 then
    insert into public.escrow_ledger (
      project_id,
      milestone_id,
      entry_type,
      amount,
      from_party,
      note
    )
    values (
      v_project.id,
      v_milestone.id,
      'fee',
      v_commission_amount,
      v_transaction.payer_id,
      'Homeowner platform commission for milestone'
    );
  end if;
end;
$$;

revoke all on function public.admin_record_contractor_milestone_payout(
  uuid, uuid, numeric, text, uuid, text, text, text, text
) from public, anon;
grant execute on function public.admin_record_contractor_milestone_payout(
  uuid, uuid, numeric, text, uuid, text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';
