grant update on public.contractor_payout_accounts to authenticated;

drop policy if exists payout_accounts_owner_update on public.contractor_payout_accounts;
create policy payout_accounts_owner_update
  on public.contractor_payout_accounts
  for update
  to authenticated
  using (contractor_id = (select auth.uid()))
  with check (contractor_id = (select auth.uid()));

notify pgrst, 'reload schema';
