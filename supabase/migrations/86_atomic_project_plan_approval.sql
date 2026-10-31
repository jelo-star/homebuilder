-- Approve the project plan and activate only its first milestone atomically.
create or replace function public.phase_one_approve_project_plan(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_plan public.project_plans%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select pp.*
    into v_plan
    from public.project_plans pp
    join public.projects p on p.id = pp.project_id
   where pp.project_id = p_project_id
     and p.homeowner_id = auth.uid()
     and pp.status in ('submitted', 'approved')
   for update of pp;

  if not found then
    raise exception 'No submitted project plan is available for approval';
  end if;

  if not exists (
    select 1
      from public.milestones m
     where m.project_id = p_project_id
       and m.seq = 1
  ) then
    raise exception 'The project plan has no first milestone';
  end if;

  update public.project_plans
     set status = 'approved',
         approved_at = coalesce(approved_at, now()),
         updated_at = now()
   where id = v_plan.id;

  update public.projects
     set status = 'in_progress',
         updated_at = now()
   where id = p_project_id;

  update public.milestones
     set status = 'locked',
         updated_at = now()
   where project_id = p_project_id
     and seq > 1
     and status = 'in_progress';

  update public.milestones
     set status = 'in_progress',
         updated_at = now()
   where project_id = p_project_id
     and seq = 1
     and status = 'locked';
end;
$$;

revoke all on function public.phase_one_approve_project_plan(uuid) from public, anon;
grant execute on function public.phase_one_approve_project_plan(uuid) to authenticated;

notify pgrst, 'reload schema';
