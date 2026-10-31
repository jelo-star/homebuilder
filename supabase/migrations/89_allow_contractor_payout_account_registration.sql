-- Allow contractors to register payout destinations while keeping account
-- visibility limited to the account owner and administrators.
grant select, insert on public.contractor_payout_accounts to authenticated;

drop policy if exists payout_accounts_owner_insert on public.contractor_payout_accounts;
create policy payout_accounts_owner_insert
  on public.contractor_payout_accounts
  for insert
  to authenticated
  with check (contractor_id = (select auth.uid()));

notify pgrst, 'reload schema';
