-- Fix project visibility recursion introduced by phase-one policy changes.
-- Cross-table visibility checks run with RLS disabled inside a trusted helper,
-- so evaluating projects policies cannot recursively evaluate quotes/projects.

create or replace function public.phase_one_can_access_project(p_project_id uuid)
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
        or public.is_admin()
        or (
          p.status in ('open', 'quoted')
          and exists (
            select 1
            from public.contractor_profiles cp
            where cp.profile_id = auth.uid()
              and cp.verification_status = 'approved'
              and cp.is_active
          )
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
  );
$$;

revoke all on function public.phase_one_can_access_project(uuid) from public, anon;
grant execute on function public.phase_one_can_access_project(uuid) to authenticated;

drop policy if exists projects_select_policy on public.projects;
create policy projects_select_policy on public.projects
for select to authenticated
using (public.phase_one_can_access_project(id));

notify pgrst, 'reload schema';
