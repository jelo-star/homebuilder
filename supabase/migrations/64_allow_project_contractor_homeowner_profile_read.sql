-- Allow a contractor assigned to a project to read that project's homeowner name.
drop policy if exists profiles_read_policy on public.profiles;
create policy profiles_read_policy on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (
    role = 'homeowner'
    and exists (
      select 1
      from public.quotes q
      join public.projects p on p.id = q.project_id
      where q.contractor_id = auth.uid()
        and p.homeowner_id = profiles.id
    )
  )
);
