create or replace function public.is_quote_awardable(
  p_project_id uuid,
  p_quote_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select exists (
    select 1
    from public.quotes q
    where q.id = p_quote_id
      and q.project_id = p_project_id
      and q.status in ('submitted', 'revised')
  )
$$;

revoke all on function public.is_quote_awardable(uuid, uuid) from public, anon;
grant execute on function public.is_quote_awardable(uuid, uuid) to authenticated;

drop policy if exists projects_update_own_draft on public.projects;
create policy projects_update_own_draft on public.projects
  for update to authenticated
  using (
    (homeowner_id = auth.uid() and status in ('draft', 'open', 'quoted'))
    or public.is_admin()
  )
  with check (
    (
      homeowner_id = auth.uid()
      and (
        status in ('draft', 'open', 'quoted')
        or (
          status = 'project_planning'
          and public.is_quote_awardable(id, awarded_quote_id)
        )
      )
    )
    or public.is_admin()
  );

notify pgrst, 'reload schema';
