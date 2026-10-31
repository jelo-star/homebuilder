-- Register payout destinations through a narrowly scoped authenticated RPC so
-- contractors do not depend on direct table-insert privileges or RLS setup.
create or replace function public.register_contractor_payout_account(
  p_payout_method text,
  p_bank_name text,
  p_account_name text,
  p_account_number_mask text
)
returns setof public.contractor_payout_accounts
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_contractor_id uuid := auth.uid();
begin
  if v_contractor_id is null then
    raise exception 'Sign in to register a payout account';
  end if;

  if not exists (
    select 1
      from public.contractor_profiles
     where profile_id = v_contractor_id
  ) then
    raise exception 'A contractor profile is required to register a payout account';
  end if;

  if p_payout_method not in ('bank_transfer', 'gcash', 'maya') then
    raise exception 'Select a supported payout method';
  end if;

  if nullif(btrim(p_account_name), '') is null
     or nullif(btrim(p_account_number_mask), '') is null
     or nullif(btrim(p_bank_name), '') is null then
    raise exception 'Complete all required payout account details';
  end if;

  return query
  insert into public.contractor_payout_accounts (
    contractor_id,
    payout_method,
    bank_name,
    account_name,
    account_number_mask,
    status,
    is_primary,
    created_at,
    updated_at
  )
  values (
    v_contractor_id,
    p_payout_method,
    btrim(p_bank_name),
    btrim(p_account_name),
    btrim(p_account_number_mask),
    'PENDING_VERIFICATION',
    not exists (
      select 1
        from public.contractor_payout_accounts
       where contractor_id = v_contractor_id
    ),
    now(),
    now()
  )
  returning *;
end;
$$;

revoke all on function public.register_contractor_payout_account(text, text, text, text) from public, anon;
grant execute on function public.register_contractor_payout_account(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
