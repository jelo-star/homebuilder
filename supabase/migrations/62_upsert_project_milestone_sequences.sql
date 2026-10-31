-- Migration 62: Update project milestones by their project sequence.
--
-- The deployed database enforces milestones_project_seq_unique on
-- (project_id, seq). Updating existing sequence rows instead of deleting and
-- reinserting them avoids transient conflicts and preserves milestone IDs.

create or replace function public.phase_one_replace_project_milestones(
  p_project_id uuid,
  p_quote_id uuid,
  p_milestones jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  item jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.projects p
    join public.quotes q on q.id = p.awarded_quote_id
    where p.id = p_project_id
      and q.id = p_quote_id
      and q.contractor_id = auth.uid()
      and q.status = 'accepted'
      and p.status in ('awarded', 'project_planning', 'in_progress')
  ) then
    raise exception 'You are not authorized to edit this project plan';
  end if;

  if jsonb_typeof(p_milestones) <> 'array'
     or jsonb_array_length(p_milestones) < 1 then
    raise exception 'At least one milestone is required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_milestones) as m(
      seq integer,
      amount numeric,
      name text,
      percent numeric
    )
    where m.seq is null
      or m.seq < 1
      or m.amount is null
      or m.amount <= 0
      or m.percent is null
      or m.percent <= 0
      or m.percent > 100
      or coalesce(trim(m.name), '') = ''
  ) then
    raise exception 'Each milestone requires a valid sequence, name, amount, and percentage';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_milestones) as m(seq integer)
    group by m.seq
    having count(*) > 1
  ) then
    raise exception 'Milestone sequence numbers must be unique';
  end if;

  for item in select * from jsonb_array_elements(p_milestones)
  loop
    insert into public.milestones (
      project_id, quote_id, seq, name, percent, amount, status,
      start_date, end_date, description, updated_at
    )
    values (
      p_project_id,
      p_quote_id,
      (item->>'seq')::integer,
      trim(item->>'name'),
      (item->>'percent')::numeric,
      (item->>'amount')::numeric,
      (case when (item->>'seq')::integer = 1
        then 'in_progress' else 'locked' end)::public.milestone_status,
      nullif(item->>'start_date', '')::date,
      nullif(item->>'end_date', '')::date,
      nullif(trim(item->>'description'), ''),
      now()
    )
    on conflict (project_id, seq) do update
    set quote_id = excluded.quote_id,
        name = excluded.name,
        percent = excluded.percent,
        amount = excluded.amount,
        status = excluded.status,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        description = excluded.description,
        updated_at = excluded.updated_at;
  end loop;

  delete from public.milestones m
  where m.project_id = p_project_id
    and m.status in ('locked', 'in_progress')
    and not exists (
      select 1
      from jsonb_to_recordset(p_milestones) as submitted(seq integer)
      where submitted.seq = m.seq
    );
end;
$$;

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

revoke all on function public.phase_one_replace_project_milestones(uuid, uuid, jsonb) from public, anon;
grant execute on function public.phase_one_replace_project_milestones(uuid, uuid, jsonb) to authenticated;
revoke all on function public.phase_one_replace_project_plan_milestones(jsonb, uuid, uuid) from public, anon;
grant execute on function public.phase_one_replace_project_plan_milestones(jsonb, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
