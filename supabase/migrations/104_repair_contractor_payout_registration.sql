-- Reinstall the contractor payout registration RPC and allow owners to remove
-- payout destinations that are not referenced by payment history.
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

grant usage on schema public to authenticated;
grant select, insert, delete on public.contractor_payout_accounts to authenticated;

drop policy if exists payout_accounts_owner_insert on public.contractor_payout_accounts;
create policy payout_accounts_owner_insert
  on public.contractor_payout_accounts
  for insert
  to authenticated
  with check (contractor_id = (select auth.uid()));

drop policy if exists payout_accounts_owner_delete on public.contractor_payout_accounts;
create policy payout_accounts_owner_delete
  on public.contractor_payout_accounts
  for delete
  to authenticated
  using (contractor_id = (select auth.uid()) or public.is_admin());

create or replace function public.set_primary_payout_account_after_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if old.is_primary then
    update public.contractor_payout_accounts
       set is_primary = true
     where id = (
       select id
         from public.contractor_payout_accounts
        where contractor_id = old.contractor_id
        order by created_at, id
        limit 1
     )
       and not exists (
         select 1
           from public.contractor_payout_accounts
          where contractor_id = old.contractor_id
            and is_primary
       );
  end if;

  return old;
end;
$$;

drop trigger if exists payout_accounts_set_primary_after_delete on public.contractor_payout_accounts;
create trigger payout_accounts_set_primary_after_delete
  after delete on public.contractor_payout_accounts
  for each row execute function public.set_primary_payout_account_after_delete();

notify pgrst, 'reload schema';
