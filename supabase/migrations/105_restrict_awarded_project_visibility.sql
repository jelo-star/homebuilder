-- Once a project is awarded, only its homeowner, admins, and awarded
-- contractor retain access to the project record.
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
          and (
            exists (
              select 1
              from public.contractor_profiles cp
              where cp.profile_id = auth.uid()
                and cp.verification_status = 'approved'
                and cp.is_active
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
        or exists (
          select 1
          from public.quotes awarded_quote
          where awarded_quote.id = p.awarded_quote_id
            and awarded_quote.contractor_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.phase_one_can_access_project(uuid) from public, anon;
grant execute on function public.phase_one_can_access_project(uuid) to authenticated;

notify pgrst, 'reload schema';
