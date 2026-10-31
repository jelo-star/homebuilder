-- Break the projects -> quotes/project_matches -> projects RLS cycle.
create or replace function public.is_project_homeowner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.homeowner_id = auth.uid()
  )
$$;

revoke all on function public.is_project_homeowner(uuid) from public, anon;
grant execute on function public.is_project_homeowner(uuid) to authenticated;

drop policy if exists projects_select_policy on public.projects;
create policy projects_select_policy on public.projects
  for select to authenticated
  using (
    homeowner_id = auth.uid()
    or public.is_admin()
    or status in ('open', 'quoted')
    or exists (
      select 1
      from public.project_matches pm
      where pm.project_id = projects.id
        and pm.contractor_id = auth.uid()
    )
    or exists (
      select 1
      from public.quotes q
      where q.project_id = projects.id
        and q.contractor_id = auth.uid()
    )
  );

drop policy if exists project_matches_select_policy on public.project_matches;
create policy project_matches_select_policy on public.project_matches
  for select to authenticated
  using (
    public.is_admin()
    or public.is_project_homeowner(project_id)
    or contractor_id = auth.uid()
  );

drop policy if exists quotes_select_policy on public.quotes;
create policy quotes_select_policy on public.quotes
  for select to authenticated
  using (
    public.is_admin()
    or contractor_id = auth.uid()
    or public.is_project_homeowner(project_id)
  );

drop policy if exists quotes_homeowner_update on public.quotes;
create policy quotes_homeowner_update on public.quotes
  for update to authenticated
  using (public.is_project_homeowner(project_id))
  with check (public.is_project_homeowner(project_id));
