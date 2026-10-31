-- Ensure administrator sessions can create and update configured payment channels.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.payment_methods to authenticated;
grant execute on function public.is_admin() to authenticated;

drop policy if exists payment_methods_admin_all on public.payment_methods;
create policy payment_methods_admin_all
  on public.payment_methods
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
