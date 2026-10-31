-- Restore authenticated owner updates for contractor business-profile fields.
-- Verification and rating fields remain protected by the existing trigger.
drop policy if exists contractor_profiles_update_own on public.contractor_profiles;
create policy contractor_profiles_update_own
  on public.contractor_profiles
  for update
  to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

notify pgrst, 'reload schema';
