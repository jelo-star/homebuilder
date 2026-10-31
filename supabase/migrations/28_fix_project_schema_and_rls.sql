-- Add fields used by the homeowner project form and remove recursive project
-- visibility checks across projects, project_matches, and quotes.
alter table public.projects
  add column if not exists payment_tranches integer not null default 3
    check (payment_tranches between 1 and 12),
  add column if not exists payment_terms text;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
$$;

revoke all on function public.current_role() from public, anon;
grant execute on function public.current_role() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select coalesce(public.current_role() = 'admin'::public.user_role, false)
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        p.homeowner_id = auth.uid()
        or p.status in ('open', 'quoted')
        or exists (
          select 1
          from public.profiles profile
          where profile.id = auth.uid()
            and profile.role = 'admin'
        )
        or exists (
          select 1
          from public.project_matches pm
          where pm.project_id = p.id
            and pm.contractor_id = auth.uid()
        )
        or exists (
          select 1
          from public.quotes q
          where q.project_id = p.id
            and q.contractor_id = auth.uid()
        )
      )
  )
$$;

revoke all on function public.can_access_project(uuid) from public, anon;
grant execute on function public.can_access_project(uuid) to authenticated;

create or replace function public.is_project_homeowner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
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

do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('projects', 'project_matches')
  loop
    execute format(
      'drop policy %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end
$$;

create policy projects_select_policy on public.projects
  for select to authenticated
  using (public.can_access_project(id));

create policy projects_insert_own on public.projects
  for insert to authenticated
  with check (homeowner_id = auth.uid() and public.current_role() = 'homeowner');

create policy projects_update_own_draft on public.projects
  for update to authenticated
  using (
    (homeowner_id = auth.uid() and status in ('draft', 'open'))
    or public.is_admin()
  )
  with check (
    (homeowner_id = auth.uid() and status in ('draft', 'open', 'quoted'))
    or public.is_admin()
  );

create policy projects_admin_delete on public.projects
  for delete to authenticated
  using (public.is_admin());

create policy project_matches_select_policy on public.project_matches
  for select to authenticated
  using (
    public.is_admin()
    or contractor_id = auth.uid()
    or public.is_project_homeowner(project_id)
  );

create policy project_matches_admin_all on public.project_matches
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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

notify pgrst, 'reload schema';
