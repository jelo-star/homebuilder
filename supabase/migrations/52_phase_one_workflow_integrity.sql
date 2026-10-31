-- Phase 1: proposal, contract award, and project-plan workflow integrity.
-- Forward-only migration. It does not remove or reset existing records.

alter table public.milestones
  add column if not exists scope_of_work text,
  add column if not exists deliverables text,
  add column if not exists required_materials text,
  add column if not exists payment_mode text not null default 'fixed'
    check (payment_mode in ('fixed', 'percentage'));

alter table public.quotes
  add column if not exists proposed_start_date date,
  add column if not exists work_methodology text;

alter table public.project_agreements
  add column if not exists accepted_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists accepted_at timestamptz;

create table if not exists public.contract_amendments (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.project_agreements(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  previous_amount numeric(14,2) not null check (previous_amount > 0),
  proposed_amount numeric(14,2) not null check (proposed_amount > 0),
  reason text not null check (length(trim(reason)) > 0),
  requested_by uuid not null references public.profiles(id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contract_amendments enable row level security;

create or replace function public.phase_one_is_project_contractor(p_project_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.projects p
    join public.quotes q on q.id = p.awarded_quote_id
    where p.id = p_project_id and q.contractor_id = auth.uid()
  );
$$;

revoke all on function public.phase_one_is_project_contractor(uuid) from public, anon;
grant execute on function public.phase_one_is_project_contractor(uuid) to authenticated;

drop policy if exists projects_select_policy on public.projects;
create policy projects_select_policy on public.projects
for select to authenticated
using (
  homeowner_id = auth.uid()
  or public.is_admin()
  or (
    status in ('open', 'quoted')
    and exists (
      select 1 from public.contractor_profiles cp
      where cp.profile_id = auth.uid()
        and cp.verification_status = 'approved'
        and cp.is_active
    )
  )
  or exists (select 1 from public.project_matches pm where pm.project_id = projects.id and pm.contractor_id = auth.uid())
  or exists (select 1 from public.quotes q where q.project_id = projects.id and q.contractor_id = auth.uid())
);

drop policy if exists quotes_contractor_insert on public.quotes;
create policy quotes_contractor_insert on public.quotes
for insert to authenticated
with check (
  contractor_id = auth.uid()
  and status in ('requested', 'draft', 'submitted')
  and exists (
    select 1
    from public.projects p
    join public.contractor_profiles cp on cp.profile_id = auth.uid()
    where p.id = project_id
      and p.status in ('open', 'quoted')
      and cp.verification_status = 'approved'
      and cp.is_active
  )
);

drop policy if exists quotes_contractor_update on public.quotes;
create policy quotes_contractor_update on public.quotes
for update to authenticated
using (
  contractor_id = auth.uid()
  and status in ('requested', 'draft', 'submitted', 'revision_requested', 'revised')
)
with check (
  contractor_id = auth.uid()
  and status in ('requested', 'draft', 'submitted', 'revision_requested', 'revised', 'withdrawn')
);

drop policy if exists milestones_no_direct_write on public.milestones;
create policy milestones_contractor_insert on public.milestones
for insert to authenticated
with check (
  exists (
    select 1
    from public.quotes q
    join public.projects p on p.id = q.project_id
    where q.id = quote_id
      and q.project_id = milestones.project_id
      and q.contractor_id = auth.uid()
      and q.status = 'accepted'
      and p.awarded_quote_id = q.id
      and p.status in ('project_planning', 'in_progress')
  )
);

drop policy if exists milestones_update_admin_only on public.milestones;
create policy milestones_contractor_update on public.milestones
for update to authenticated
using (
  exists (
    select 1 from public.quotes q
    join public.projects p on p.id = q.project_id
    where q.id = quote_id and q.contractor_id = auth.uid()
      and p.awarded_quote_id = q.id
      and p.status in ('project_planning', 'in_progress')
  )
  and status in ('locked', 'in_progress', 'proof_submitted')
)
with check (
  status in ('locked', 'in_progress', 'proof_submitted')
  and amount > 0 and percent > 0 and percent <= 100
);

drop policy if exists milestones_homeowner_review on public.milestones;
create policy milestones_homeowner_review on public.milestones
for update to authenticated
using (
  exists (select 1 from public.projects p where p.id = project_id and p.homeowner_id = auth.uid())
  and status in ('locked', 'proof_submitted', 'disputed')
)
with check (status in ('approved', 'disputed', 'in_progress'));

drop policy if exists project_plans_contractor_write on public.project_plans;
create policy project_plans_contractor_insert on public.project_plans
for insert to authenticated
with check (
  (contractor_id = auth.uid() and status in ('draft', 'submitted', 'revision_requested'))
  or public.is_admin()
);

create policy project_plans_contractor_update on public.project_plans
for update to authenticated
using ((contractor_id = auth.uid() and status in ('draft', 'submitted', 'revision_requested')) or public.is_admin())
with check (
  (contractor_id = auth.uid() and status in ('draft', 'submitted', 'revision_requested'))
  or public.is_admin()
);

create policy project_plans_homeowner_review on public.project_plans
for update to authenticated
using (homeowner_id = auth.uid() and status in ('submitted', 'revision_requested'))
with check (homeowner_id = auth.uid() and status in ('approved', 'revision_requested'));

create policy projects_contractor_planning_update on public.projects
for update to authenticated
using (public.phase_one_is_project_contractor(id) and status = 'project_planning')
with check (public.phase_one_is_project_contractor(id) and status = 'project_planning');

create policy projects_homeowner_plan_approval on public.projects
for update to authenticated
using (homeowner_id = auth.uid() and status = 'project_planning')
with check (homeowner_id = auth.uid() and status in ('project_planning', 'in_progress'));

drop policy if exists agreements_select_policy on public.project_agreements;
create policy agreements_select_policy on public.project_agreements
for select to authenticated
using (homeowner_id = auth.uid() or contractor_id = auth.uid() or public.is_admin());

create policy amendments_select_participants on public.contract_amendments
for select to authenticated
using (
  public.is_admin()
  or requested_by = auth.uid()
  or exists (
    select 1 from public.project_agreements a
    where a.id = agreement_id and (a.homeowner_id = auth.uid() or a.contractor_id = auth.uid())
  )
);

create policy amendments_insert_participants on public.contract_amendments
for insert to authenticated
with check (
  requested_by = auth.uid()
  and exists (
    select 1 from public.project_agreements a
    where a.id = agreement_id and (a.homeowner_id = auth.uid() or a.contractor_id = auth.uid())
  )
);

create policy amendments_admin_update on public.contract_amendments
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.phase_one_create_agreement_and_notify()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_project public.projects;
begin
  if new.status = 'accepted' and (old.status is distinct from new.status) then
    select * into v_project from public.projects where id = new.project_id for update;
    insert into public.project_agreements (
      project_id, quote_id, homeowner_id, contractor_id, contract_amount,
      materials_subtotal, labor_other_subtotal, project_duration_months,
      scope_of_work, inclusions, exclusions, warranty_terms,
      accepted_breakdown, accepted_at, status
    )
    values (
      v_project.id, new.id, v_project.homeowner_id, new.contractor_id, new.price,
      coalesce(new.materials_subtotal, 0),
      coalesce(new.labor_cost, 0) + coalesce(new.equipment_cost, 0) + coalesce(new.logistics_cost, 0)
        + coalesce(new.other_charges, 0) + coalesce(new.overhead_profit_cost, 0)
        + coalesce(new.taxes_cost, 0),
      coalesce(new.duration_months, 1), new.scope_of_work, new.inclusions,
      new.exclusions, new.warranty_terms, coalesce(new.material_quotation, '{}'::jsonb),
      now(), 'executed'
    )
    on conflict (project_id, quote_id) do nothing;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.contractor_id, 'quote_accepted', 'Proposal accepted',
      'Your proposal was accepted. Prepare the project plan for homeowner approval.',
      jsonb_build_object('project_id', new.project_id, 'quote_id', new.id)
    );
    insert into public.financial_audit_logs (
      actor_id, action_type, entity_type, entity_id, previous_state, new_state, reason
    )
    values (
      auth.uid(), 'QUOTE_ACCEPTED', 'quotes', new.id,
      jsonb_build_object('status', old.status, 'price', old.price),
      jsonb_build_object('status', new.status, 'price', new.price),
      'Homeowner accepted contractor proposal'
    );
  elsif new.status in ('declined', 'revision_requested')
    and old.status is distinct from new.status then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.contractor_id,
      case when new.status = 'declined' then 'quote_declined' else 'quote_revision_requested' end,
      case when new.status = 'declined' then 'Proposal declined' else 'Proposal revision requested' end,
      case when new.status = 'declined'
        then 'Your proposal was declined by the homeowner.'
        else 'The homeowner requested changes to your proposal.' end,
      jsonb_build_object('project_id', new.project_id, 'quote_id', new.id)
    );
    insert into public.financial_audit_logs (
      actor_id, action_type, entity_type, entity_id, previous_state, new_state, reason
    )
    values (
      auth.uid(), 'QUOTE_DECISION', 'quotes', new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status),
      'Homeowner updated contractor proposal decision'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists phase_one_quote_decision on public.quotes;
create trigger phase_one_quote_decision
after update of status on public.quotes
for each row execute function public.phase_one_create_agreement_and_notify();

create or replace function public.phase_one_protect_accepted_quote()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'accepted' and (
    new.price is distinct from old.price
    or new.material_quotation is distinct from old.material_quotation
    or new.breakdown is distinct from old.breakdown
    or new.contractor_id is distinct from old.contractor_id
    or new.project_id is distinct from old.project_id
  ) then
    raise exception 'Accepted proposal is immutable; use a contract amendment.';
  end if;
  return new;
end;
$$;

drop trigger if exists phase_one_protect_accepted_quote on public.quotes;
create trigger phase_one_protect_accepted_quote
before update on public.quotes
for each row execute function public.phase_one_protect_accepted_quote();

create or replace function public.phase_one_accept_quote(p_quote_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_quote record;
begin
  select q.*, p.homeowner_id as project_homeowner_id, p.status as project_status
  into v_quote
  from public.quotes q
  join public.projects p on p.id = q.project_id
  where q.id = p_quote_id;

  if not found or v_quote.project_homeowner_id <> auth.uid() then
    raise exception 'Only the project homeowner may accept this proposal.';
  end if;
  if v_quote.status not in ('submitted', 'revised') then
    raise exception 'Only a submitted proposal may be accepted.';
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
  set awarded_quote_id = p_quote_id, status = 'project_planning',
      updated_at = now()
  where id = v_quote.project_id;

  return jsonb_build_object(
    'success', true, 'project_id', v_quote.project_id,
    'quote_id', p_quote_id, 'contract_amount', v_quote.price
  );
end;
$$;

revoke all on function public.phase_one_accept_quote(uuid) from public, anon;
grant execute on function public.phase_one_accept_quote(uuid) to authenticated;

notify pgrst, 'reload schema';
