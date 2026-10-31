-- Migration 57: Atomically replace a contractor's draft milestone schedule.

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
  milestone_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.quotes q
    join public.projects p on p.id = q.project_id
    where q.id = p_quote_id
      and q.project_id = p_project_id
      and q.contractor_id = auth.uid()
      and q.status = 'accepted'
      and p.awarded_quote_id = q.id
      and p.status = 'project_planning'
  ) then
    raise exception 'You are not authorized to edit this project plan';
  end if;

  if jsonb_typeof(p_milestones) <> 'array' then
    raise exception 'Milestones must be an array';
  end if;

  select count(*) into milestone_count
  from jsonb_array_elements(p_milestones);

  if milestone_count < 1 then
    raise exception 'At least one milestone is required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_milestones) as m(seq integer, amount numeric, name text)
    where m.seq is null or m.seq < 1
      or m.amount is null or m.amount <= 0
      or coalesce(trim(m.name), '') = ''
  ) then
    raise exception 'Each milestone requires a positive amount, sequence, and name';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_milestones) as m(seq integer)
    group by m.seq
    having count(*) > 1
  ) then
    raise exception 'Milestone sequence numbers must be unique';
  end if;

  delete from public.milestones
  where project_id = p_project_id
    and quote_id = p_quote_id
    and status in ('locked', 'in_progress');

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
      (case when (item->>'seq')::integer = 1 then 'in_progress' else 'locked' end)::public.milestone_status,
      nullif(item->>'start_date', '')::date,
      nullif(item->>'end_date', '')::date,
      nullif(trim(item->>'description'), ''),
      now()
    );
  end loop;
end;
$$;

revoke all on function public.phase_one_replace_project_milestones(uuid, uuid, jsonb) from public, anon;
grant execute on function public.phase_one_replace_project_milestones(uuid, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
