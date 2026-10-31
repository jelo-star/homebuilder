-- Allow homeowners to delete their own unawarded projects without granting
-- direct DELETE access to project, quote, or financial tables.
create or replace function public.delete_homeowner_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_project public.projects%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to delete a project.';
  end if;

  select *
    into v_project
  from public.projects
  where id = p_project_id
    and homeowner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Project not found or you do not have permission to delete it.';
  end if;

  if v_project.awarded_quote_id is not null
    or v_project.status not in ('draft', 'open', 'quoted') then
    raise exception 'Only unawarded draft, open, or quoted projects can be deleted.';
  end if;

  if exists (select 1 from public.milestones where project_id = p_project_id)
    or exists (select 1 from public.payments where project_id = p_project_id)
    or exists (select 1 from public.payment_transactions where project_id = p_project_id)
    or exists (select 1 from public.escrow_ledger where project_id = p_project_id)
    or exists (select 1 from public.disputes where project_id = p_project_id)
    or exists (select 1 from public.project_agreements where project_id = p_project_id)
    or exists (select 1 from public.reviews where project_id = p_project_id) then
    raise exception 'This project has payment, contract, milestone, dispute, or review history and cannot be deleted.';
  end if;

  delete from public.projects
  where id = p_project_id
    and homeowner_id = auth.uid();

  if not found then
    raise exception 'Project could not be deleted.';
  end if;
end;
$$;

revoke all on function public.delete_homeowner_project(uuid) from public, anon;
grant execute on function public.delete_homeowner_project(uuid) to authenticated;
