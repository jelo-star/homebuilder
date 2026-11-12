create or replace function public.phase_one_accept_quote(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_quote record;
  v_project public.projects%rowtype;
begin
  select q.*, p.homeowner_id as project_homeowner_id, p.status as project_status
    into v_quote
    from public.quotes q
    join public.projects p on p.id = q.project_id
   where q.id = p_quote_id
   for update of q, p;

  if not found or v_quote.project_homeowner_id <> auth.uid() then
    raise exception 'Only the project homeowner may accept this proposal.';
  end if;
  if v_quote.status not in ('submitted', 'revised', 'revision_requested') then
    raise exception 'Only an active proposal may be accepted.';
  end if;
  if v_quote.price is null or v_quote.duration_months is null then
    raise exception 'The proposal is missing its price or duration.';
  end if;

  update public.quotes
     set status = 'accepted', decided_at = now(), updated_at = now()
   where id = p_quote_id;

  update public.quotes
     set status = 'declined', decided_at = now(), updated_at = now()
   where project_id = v_quote.project_id
     and id <> p_quote_id
     and status in ('submitted', 'revision_requested', 'revised', 'requested');

  update public.projects
     set awarded_quote_id = p_quote_id,
         status = 'project_planning',
         updated_at = now()
   where id = v_quote.project_id;

  select *
    into v_project
    from public.projects
   where id = v_quote.project_id;

  return jsonb_build_object(
    'success', true,
    'project_id', v_quote.project_id,
    'quote_id', p_quote_id,
    'contract_amount', v_quote.price,
    'commission_percent', v_project.platform_commission_percent,
    'commission_amount', v_project.platform_commission_amount,
    'homeowner_total_amount', v_project.homeowner_total_amount
  );
end;
$$;

revoke all on function public.phase_one_accept_quote(uuid) from public, anon;
grant execute on function public.phase_one_accept_quote(uuid) to authenticated;

notify pgrst, 'reload schema';
