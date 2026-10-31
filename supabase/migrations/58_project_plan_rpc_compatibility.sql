-- Migration 58: Keep older deployed clients compatible with the renamed RPC.
--
-- Older bundles call phase_one_replace_project_plan_milestones with parameters
-- in the order (p_milestones, p_project_id, p_quote_id). Keep this wrapper
-- while clients are redeployed so saves do not fail from schema-cache lookup.

create or replace function public.phase_one_replace_project_plan_milestones(
  p_milestones jsonb,
  p_project_id uuid,
  p_quote_id uuid
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.phase_one_replace_project_milestones(
    p_project_id,
    p_quote_id,
    p_milestones
  );
$$;

revoke all on function public.phase_one_replace_project_plan_milestones(jsonb, uuid, uuid) from public, anon;
grant execute on function public.phase_one_replace_project_plan_milestones(jsonb, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
