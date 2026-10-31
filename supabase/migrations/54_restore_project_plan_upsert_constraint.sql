-- Migration 54: Restore the project-plan uniqueness required by project-plan upserts.
--
-- Some databases already had project_plans when migration 23 ran. In that case
-- CREATE TABLE IF NOT EXISTS did not add its uq_project_plans_project constraint,
-- so PostgREST could not resolve onConflict=project_id.

do $$
begin
  if exists (
    select 1
    from public.project_plans
    group by project_id
    having count(*) > 1
  ) then
    raise exception
      'Cannot add project_plans(project_id) uniqueness: duplicate project plans exist';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.project_plans'::regclass
      and contype in ('u', 'p')
      and conname = 'uq_project_plans_project'
  ) then
    alter table public.project_plans
      add constraint uq_project_plans_project unique (project_id);
  end if;
end
$$;

notify pgrst, 'reload schema';
