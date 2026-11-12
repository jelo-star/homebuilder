create or replace function public.request_milestone_payment_approval(
  p_milestone_id uuid,
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_milestone public.milestones%rowtype;
  v_project public.projects%rowtype;
  v_transaction public.payment_transactions%rowtype;
  v_dispute public.disputes%rowtype;
  v_contractor_id uuid;
  v_admin_id uuid;
begin
  select *
    into v_transaction
    from public.payment_transactions
   where id = p_payment_id
   for update;
  if not found then
    raise exception 'Payment transaction not found';
  end if;

  select *
    into v_milestone
    from public.milestones
   where id = p_milestone_id
   for update;
  if not found then
    raise exception 'Milestone not found';
  end if;

  select *
    into v_project
    from public.projects
   where id = v_milestone.project_id;
  if v_project.homeowner_id is distinct from auth.uid() then
    raise exception 'Only the project homeowner can request milestone approval';
  end if;

  if v_transaction.project_id is distinct from v_milestone.project_id
     or v_transaction.milestone_id is distinct from v_milestone.id
     or v_transaction.payer_id is distinct from v_project.homeowner_id then
    raise exception 'Payment transaction does not match this homeowner milestone';
  end if;
  if v_transaction.payment_status not in ('PENDING_VERIFICATION', 'PENDING', 'CREATED') then
    raise exception 'Only a pending payment can be submitted for milestone approval';
  end if;
  if v_transaction.proof_file_url is null then
    raise exception 'Payment proof is required for milestone approval';
  end if;
  if v_transaction.milestone_approval_requested is not true then
    raise exception 'This payment was not submitted for milestone approval';
  end if;
  if v_milestone.status not in ('proof_submitted', 'disputed') then
    raise exception 'Milestone must have submitted contractor proof before payment approval';
  end if;

  if v_milestone.status = 'disputed' then
    select *
      into v_dispute
      from public.disputes
     where milestone_id = v_milestone.id
       and status in ('open', 'need_more_proof')
     for update;
    if not found then
      raise exception 'No active dispute exists for this milestone';
    end if;

    select q.contractor_id
      into v_contractor_id
      from public.quotes q
     where q.id = v_milestone.quote_id;
    if not exists (
      select 1
        from public.milestone_proofs mp
       where mp.milestone_id = v_milestone.id
         and mp.uploaded_by = v_contractor_id
         and mp.created_at > v_dispute.created_at
    ) then
      raise exception 'The contractor must submit replacement proof photos before approval';
    end if;
  end if;

  if exists (
    select 1
      from public.payment_transactions
     where milestone_id = v_milestone.id
       and id <> v_transaction.id
       and payment_status in ('PENDING_VERIFICATION', 'PENDING', 'CREATED')
  ) then
    raise exception 'Another milestone payment is already awaiting verification';
  end if;

  if v_milestone.status = 'proof_submitted' then
    update public.milestones
       set status = 'payment_verification_pending',
           updated_at = now()
     where id = v_milestone.id;
  end if;

  insert into public.notifications(user_id, type, title, body, data)
  values (
    v_project.homeowner_id,
    'milestone_status',
    'Payment awaiting verification',
    format('Payment proof for %s was submitted. The milestone remains unapproved until an administrator verifies it.', v_milestone.name),
    jsonb_build_object(
      'project_id', v_milestone.project_id,
      'milestone_id', v_milestone.id,
      'payment_id', v_transaction.id,
      'status', case when v_milestone.status = 'disputed' then 'disputed' else 'payment_verification_pending' end
    )
  );

  for v_admin_id in
    select id from public.profiles where role = 'admin'
  loop
    insert into public.notifications(user_id, type, title, body, data)
    values (
      v_admin_id,
      'milestone_payment',
      'Milestone payment requires verification',
      format('Review payment proof for %s before approving the milestone.', v_milestone.name),
      jsonb_build_object(
        'project_id', v_milestone.project_id,
        'milestone_id', v_milestone.id,
        'payment_id', v_transaction.id
      )
    );
  end loop;
end;
$$;

create or replace function public.refresh_project_after_disputed_milestone_approval(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_awarded_quote_id uuid;
  v_contractor_id uuid;
  v_is_complete boolean;
begin
  select awarded_quote_id
    into v_awarded_quote_id
    from public.projects
   where id = p_project_id
     and status = 'disputed'
   for update;
  if not found then
    return;
  end if;

  if exists (
    select 1
      from public.milestones
     where project_id = p_project_id
       and status = 'disputed'
  ) then
    return;
  end if;

  select not exists (
    select 1
      from public.milestones m
     where m.project_id = p_project_id
       and (
         m.status not in ('approved', 'paid', 'refunded')
         or (
           m.status = 'approved'
           and public.milestone_verified_funding(m.id) < coalesce(m.homeowner_total_amount, m.amount)
         )
       )
  )
    into v_is_complete;

  update public.projects
     set status = case when v_is_complete then 'completed' else 'in_progress' end,
         updated_at = now()
   where id = p_project_id
     and status = 'disputed';

  if v_is_complete then
    select contractor_id
      into v_contractor_id
      from public.quotes
     where id = v_awarded_quote_id;

    update public.contractor_profiles
       set projects_completed = projects_completed + 1
     where profile_id = v_contractor_id;
  end if;
end;
$$;

create or replace function public.approve_disputed_milestone_fix(p_milestone_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_homeowner_id uuid;
  v_contractor_id uuid;
  v_milestone public.milestones%rowtype;
  v_dispute public.disputes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in as the project homeowner to approve this fix';
  end if;

  select *
    into v_milestone
    from public.milestones
   where id = p_milestone_id
   for update;
  if not found then
    raise exception 'Milestone not found';
  end if;

  select p.homeowner_id, q.contractor_id
    into v_homeowner_id, v_contractor_id
    from public.projects p
    join public.quotes q on q.id = v_milestone.quote_id
   where p.id = v_milestone.project_id
     and p.awarded_quote_id = q.id;

  if v_homeowner_id is null or v_homeowner_id <> auth.uid() then
    raise exception 'Only the project homeowner can approve this fix';
  end if;
  if v_milestone.status <> 'disputed' then
    raise exception 'This milestone is not in dispute';
  end if;

  select *
    into v_dispute
    from public.disputes
   where milestone_id = p_milestone_id
     and status in ('open', 'need_more_proof')
   for update;
  if not found then
    raise exception 'No active dispute exists for this milestone';
  end if;

  if not exists (
    select 1
      from public.milestone_proofs mp
     where mp.milestone_id = p_milestone_id
       and mp.uploaded_by = v_contractor_id
       and mp.created_at > v_dispute.created_at
  ) then
    raise exception 'The contractor must submit replacement proof photos before approval';
  end if;

  update public.disputes
     set contractor_fix_status = 'fixed',
         contractor_fixed_at = coalesce(contractor_fixed_at, now()),
         updated_at = now()
   where id = v_dispute.id;

  perform public.approve_milestone(p_milestone_id);
  perform public.refresh_project_after_disputed_milestone_approval(v_milestone.project_id);
end;
$$;

create or replace function public.approve_disputed_milestone_after_payment_verification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_milestone public.milestones%rowtype;
  v_dispute public.disputes%rowtype;
  v_contractor_id uuid;
  v_required_amount numeric;
begin
  if old.payment_status not in ('PENDING_VERIFICATION', 'PENDING', 'CREATED')
     or new.payment_status not in ('PAID', 'SUCCEEDED')
     or new.verified_at is null
     or new.milestone_approval_requested is not true
     or new.milestone_id is null then
    return new;
  end if;

  if not public.is_admin() then
    raise exception 'Only administrator-verified payments can approve a disputed milestone';
  end if;

  select *
    into v_milestone
    from public.milestones
   where id = new.milestone_id
   for update;
  if not found or v_milestone.status <> 'disputed' then
    return new;
  end if;

  select *
    into v_dispute
    from public.disputes
   where milestone_id = v_milestone.id
     and status in ('open', 'need_more_proof')
   for update;
  if not found then
    return new;
  end if;

  select contractor_id
    into v_contractor_id
    from public.quotes
   where id = v_milestone.quote_id;
  if v_contractor_id is null or not exists (
    select 1
      from public.milestone_proofs mp
     where mp.milestone_id = v_milestone.id
       and mp.uploaded_by = v_contractor_id
       and mp.created_at > v_dispute.created_at
  ) then
    return new;
  end if;

  update public.disputes
     set contractor_fix_status = 'fixed',
         contractor_fixed_at = coalesce(contractor_fixed_at, now()),
         updated_at = now()
   where id = v_dispute.id;

  v_required_amount := coalesce(v_milestone.homeowner_total_amount, v_milestone.amount);
  if public.milestone_verified_funding(v_milestone.id) >= v_required_amount then
    perform public.approve_milestone(v_milestone.id);
    perform public.refresh_project_after_disputed_milestone_approval(v_milestone.project_id);
  end if;

  return new;
end;
$$;

revoke all on function public.request_milestone_payment_approval(uuid, uuid) from public, anon;
grant execute on function public.request_milestone_payment_approval(uuid, uuid) to authenticated;

revoke all on function public.approve_disputed_milestone_fix(uuid) from public, anon;
grant execute on function public.approve_disputed_milestone_fix(uuid) to authenticated;

revoke all on function public.refresh_project_after_disputed_milestone_approval(uuid) from public, anon, authenticated;

revoke all on function public.approve_disputed_milestone_after_payment_verification() from public, anon, authenticated;

drop trigger if exists payment_transactions_approve_disputed_milestone on public.payment_transactions;
create trigger payment_transactions_approve_disputed_milestone
after update of payment_status on public.payment_transactions
for each row
execute function public.approve_disputed_milestone_after_payment_verification();

notify pgrst, 'reload schema';
