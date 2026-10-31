-- Return the homeowner name to an authorized project participant without exposing
-- unrelated profile records through a broad profile query.
create or replace function public.get_project_homeowner_name(p_project_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select pr.full_name
  from public.projects p
  join public.profiles pr on pr.id = p.homeowner_id
  left join public.quotes q on q.id = p.awarded_quote_id
  where p.id = p_project_id
    and (
      p.homeowner_id = auth.uid()
      or public.is_admin()
      or q.contractor_id = auth.uid()
    )
  limit 1;
$$;

revoke all on function public.get_project_homeowner_name(uuid) from public;
grant execute on function public.get_project_homeowner_name(uuid) to authenticated;
