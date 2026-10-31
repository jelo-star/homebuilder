-- SMART CONTRACTOR MATCHING | 05
-- RPCs are SECURITY DEFINER with a fixed search_path. Money functions are not executable by anon.
-- calculate_estimate returns a low/mid/high estimate and milestone-based cost breakdown.
create or replace function public.calculate_estimate(
  p_floor_area numeric, p_floors integer, p_finish_level public.finish_level, p_work_type public.work_type
)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare r public.estimate_rates%rowtype; v_mid numeric(14,2); v_low numeric(14,2); v_high numeric(14,2);
begin
  if p_floor_area <= 0 or p_floors < 1 then raise exception 'Floor area must be positive and floors must be at least 1'; end if;
  select * into r from public.estimate_rates
   where finish_level=p_finish_level and work_type=p_work_type and is_active
   order by effective_from desc limit 1;
  if not found then raise exception 'No active estimate rate configured for this finish level and work type'; end if;
  v_mid := round(p_floor_area * r.rate_per_sqm * (1 + r.extra_floor_factor * (p_floors - 1)), 2);
  v_low := round(v_mid * (1-r.range_pct), 2);
  v_high := round(v_mid * (1+r.range_pct), 2);
  return jsonb_build_object(
    'low',v_low,'mid',v_mid,'high',v_high,
    'budget_status',null,
    'breakdown',(select coalesce(jsonb_agg(jsonb_build_object('name',mt.name,'percent',mt.percent,'amount',round(v_mid*mt.percent/100,2)) order by mt.seq),'[]'::jsonb)
                 from public.milestone_templates mt where mt.is_active)
  );
end $$;

-- save_project_estimate calculates and persists estimates for the owning homeowner or an admin.
create or replace function public.save_project_estimate(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare p public.projects%rowtype; e jsonb;
begin
  select * into p from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found'; end if;
  if p.homeowner_id <> auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  e := public.calculate_estimate(p.floor_area_sqm,p.floors,p.finish_level,p.work_type);
  update public.projects set est_low=(e->>'low')::numeric, est_mid=(e->>'mid')::numeric, est_high=(e->>'high')::numeric
   where id=p_project_id;
  return jsonb_set(e,'{budget_status}',to_jsonb(case
    when p.budget is null then 'not_set'
    when p.budget >= (e->>'high')::numeric then 'fits'
    when p.budget >= (e->>'low')::numeric then 'close'
    else 'above_budget' end));
end $$;

-- match_contractors scores only approved, active contractors and stores score explanations.
create or replace function public.match_contractors(p_project_id uuid)
returns integer language plpgsql security definer set search_path = pg_catalog, public
as $$
declare p public.projects%rowtype; c record; weights jsonb; min_reviews integer; v_score numeric; v_specialty numeric;
        v_rating numeric; v_experience numeric; v_city numeric; v_count integer := 0;
begin
  select * into p from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found'; end if;
  if p.homeowner_id <> auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  select value into weights from public.app_settings where key='match_weights';
  weights := coalesce(weights,'{"specialty":35,"rating":25,"experience":20,"city":20}'::jsonb);
  select coalesce((value#>>'{}')::integer,3) into min_reviews from public.app_settings where key='min_reviews_for_full_rating';
  min_reviews := coalesce(min_reviews,3);
  delete from public.project_matches where project_id=p_project_id;
  for c in select cp.* from public.contractor_profiles cp
    where cp.verification_status='approved' and cp.is_active
      and exists (select 1 from public.contractor_documents d where d.contractor_id=cp.profile_id and d.doc_type='gov_id' and d.status='approved')
      and exists (select 1 from public.contractor_documents d where d.contractor_id=cp.profile_id and d.doc_type='license' and d.status='approved')
  loop
    v_specialty := (
      (case when p.house_type=any(c.specialties) then 1 else 0 end) +
      (case when p.finish_level=any(c.finish_levels) then 1 else 0 end) +
      (case when p.work_type=any(c.work_types) then 1 else 0 end)
    ) / 3.0;
    v_rating := (least(c.rating_avg,5)/5.0) * least(1.0, c.rating_count::numeric/greatest(min_reviews,1));
    v_experience := (least(c.projects_completed,20)::numeric/20.0 * 0.6) + (least(c.years_experience,20)::numeric/20.0 * 0.4);
    v_city := case when exists(select 1 from unnest(c.service_cities) city where lower(trim(city))=lower(trim(p.city))) then 1 else 0 end;
    v_score := round(
      coalesce((weights->>'specialty')::numeric,35)*v_specialty +
      coalesce((weights->>'rating')::numeric,25)*v_rating +
      coalesce((weights->>'experience')::numeric,20)*v_experience +
      coalesce((weights->>'city')::numeric,20)*v_city, 2);
    insert into public.project_matches(project_id,contractor_id,match_score,reasons)
    values (p_project_id,c.profile_id,v_score,jsonb_build_object(
      'specialty_fit',round(v_specialty*100,2),'rating_component',round(v_rating*100,2),
      'experience_component',round(v_experience*100,2),'service_city_match',v_city=1))
    on conflict(project_id,contractor_id) do update set match_score=excluded.match_score,reasons=excluded.reasons,created_at=now();
    v_count := v_count+1;
  end loop;
  return v_count;
end $$;

-- request_quote creates one quote request for an eligible matched contractor.
create or replace function public.request_quote(p_project_id uuid,p_contractor_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare p public.projects%rowtype; v_id uuid;
begin
  select * into p from public.projects where id=p_project_id for update;
  if not found or p.homeowner_id <> auth.uid() then raise exception 'Project not found or not owned by caller'; end if;
  if p.status not in ('open','quoted') then raise exception 'Project is not accepting quote requests'; end if;
  if not exists(select 1 from public.project_matches where project_id=p_project_id and contractor_id=p_contractor_id) then
    raise exception 'Contractor is not matched to this project';
  end if;
  if not exists(select 1 from public.contractor_profiles cp
    where cp.profile_id=p_contractor_id and cp.is_active and cp.verification_status='approved')
    then raise exception 'Contractor is not approved and active'; end if;
  insert into public.quotes(project_id,contractor_id,status,valid_until)
  values(p_project_id,p_contractor_id,'requested',now()+make_interval(days=>coalesce((select (value#>>'{}')::int from public.app_settings where key='quote_valid_days'),14)))
  on conflict(project_id,contractor_id) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.quotes where project_id=p_project_id and contractor_id=p_contractor_id; end if;
  update public.projects set status='quoted' where id=p_project_id and status='open';
  insert into public.notifications(user_id,type,title,body,data)
  values(p_contractor_id,'quote_requested','New quote request','A homeowner requested a quote.',jsonb_build_object('project_id',p_project_id,'quote_id',v_id));
  return v_id;
end $$;

-- submit_quote lets the assigned contractor submit a firm price and duration.
create or replace function public.submit_quote(p_quote_id uuid,p_price numeric,p_duration_months integer,p_notes text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare q public.quotes%rowtype;
begin
  select * into q from public.quotes where id=p_quote_id for update;
  if not found or q.contractor_id <> auth.uid() then raise exception 'Quote not found or not owned by caller'; end if;
  if q.status <> 'requested' then raise exception 'Only requested quotes can be submitted'; end if;
  if p_price <= 0 or p_duration_months < 1 then raise exception 'Price and duration must be positive'; end if;
  if not exists(select 1 from public.contractor_profiles cp where cp.profile_id=q.contractor_id and cp.verification_status='approved' and cp.is_active)
    then raise exception 'Contractor must be approved and active'; end if;
  update public.quotes set status='submitted',price=p_price,duration_months=p_duration_months,notes=p_notes,
    submitted_at=now(),valid_until=now()+make_interval(days=>coalesce((select (value#>>'{}')::int from public.app_settings where key='quote_valid_days'),14))
  where id=p_quote_id;
end $$;

-- accept_quote atomically accepts one quote, declines competing quotes, creates milestones, and awards the project.
create or replace function public.accept_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare q public.quotes%rowtype; p public.projects%rowtype; mt record; v_milestone uuid; v_sum numeric;
begin
  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'Quote not found'; end if;
  select * into p from public.projects where id=q.project_id for update;
  if p.homeowner_id <> auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  if q.status <> 'submitted' or q.valid_until < now() then raise exception 'Quote is not currently acceptable'; end if;
  if exists(select 1 from public.quotes where project_id=q.project_id and status='accepted' and id<>q.id) then raise exception 'Another quote has already been accepted'; end if;
  select sum(percent) into v_sum from public.milestone_templates where is_active;
  if v_sum is null or abs(v_sum-100)>0.01 then raise exception 'Active milestone template percentages must total 100'; end if;
  update public.quotes set status='accepted',decided_at=now() where id=q.id;
  update public.quotes set status='declined',decided_at=now()
    where project_id=q.project_id and id<>q.id and status in ('requested','submitted');
  delete from public.milestones where quote_id=q.id;
  for mt in select * from public.milestone_templates where is_active order by seq loop
    insert into public.milestones(project_id,quote_id,seq,name,percent,amount,status)
    values(q.project_id,q.id,mt.seq,mt.name,mt.percent,round(q.price*mt.percent/100,2),
      case when mt.seq=(select min(seq) from public.milestone_templates where is_active) then 'in_progress'::public.milestone_status else 'locked'::public.milestone_status)
    returning id into v_milestone;
  end loop;
  update public.projects set awarded_quote_id=q.id,status='awarded' where id=q.project_id;
  return v_milestone;
end $$;

-- submit_proof records contractor evidence and starts the homeowner approval window.
create or replace function public.submit_proof(p_milestone_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare m public.milestones%rowtype; q public.quotes%rowtype; days_count integer;
begin
  select * into m from public.milestones where id=p_milestone_id for update;
  if not found then raise exception 'Milestone not found'; end if;
  select * into q from public.quotes where id=m.quote_id;
  if q.contractor_id <> auth.uid() then raise exception 'Only the assigned contractor can submit proof'; end if;
  if m.status <> 'in_progress' then raise exception 'Milestone is not in progress'; end if;
  if not exists(select 1 from public.milestone_proofs where milestone_id=m.id) then
    raise exception 'Upload at least one proof file before submitting proof';
  end if;
  select coalesce((value#>>'{}')::int,5) into days_count from public.app_settings where key='auto_approve_days';
  days_count := coalesce(days_count,5);
  update public.milestones set status='proof_submitted',proof_submitted_at=now(),approve_by=now()+make_interval(days=>days_count) where id=m.id;
end $$;

-- approve_milestone approves homeowner work and appends release/fee ledger entries exactly once.
create or replace function public.approve_milestone(p_milestone_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare m public.milestones%rowtype; p public.projects%rowtype; q public.quotes%rowtype;
  fee_pct numeric; fee numeric(14,2); net numeric(14,2); v_payout uuid;
begin
  select * into m from public.milestones where id=p_milestone_id for update;
  if not found then raise exception 'Milestone not found'; end if;
  select * into p from public.projects where id=m.project_id for update;
  select * into q from public.quotes where id=m.quote_id;
  if p.homeowner_id <> auth.uid() and not public.is_admin()
     and not (auth.uid() is null and m.status='proof_submitted' and m.approve_by is not null and m.approve_by < now()) then
    raise exception 'Not authorized';
  end if;
  if m.status not in ('proof_submitted','approved') then raise exception 'Milestone has not been submitted for approval'; end if;
  if exists(select 1 from public.payouts where milestone_id=m.id) then
    select id into v_payout from public.payouts where milestone_id=m.id; return v_payout;
  end if;
  if not exists(select 1 from public.payments where project_id=m.project_id and quote_id=m.quote_id and status='held') then
    raise exception 'No held payment exists for this accepted quote';
  end if;
  select coalesce((value#>>'{}')::numeric,0) into fee_pct from public.app_settings where key='platform_fee_percent';
  fee_pct := coalesce(fee_pct,0);
  if fee_pct < 0 or fee_pct > 100 then raise exception 'platform_fee_percent must be between 0 and 100'; end if;
  fee := round(m.amount*fee_pct/100,2); net := m.amount-fee;
  update public.milestones set status='paid',approved_at=coalesce(approved_at,now()),paid_at=now() where id=m.id;
  insert into public.escrow_ledger(project_id,milestone_id,entry_type,amount,from_party,to_party,note)
  values(m.project_id,m.id,'release',net,null,q.contractor_id,'Milestone contractor payout (net of platform fee)');
  if fee > 0 then
    insert into public.escrow_ledger(project_id,milestone_id,entry_type,amount,from_party,to_party,note)
    values(m.project_id,m.id,'fee',fee,null,null,'Platform fee withheld from contractor payout');
  end if;
  insert into public.payouts(contractor_id,milestone_id,gross_amount,fee_amount,net_amount,status)
  values(q.contractor_id,m.id,m.amount,fee,net,'pending') returning id into v_payout;
  update public.milestones set status='paid' where id=m.id;
  if not exists(select 1 from public.milestones where project_id=m.project_id and status not in ('paid','refunded')) then
    update public.projects set status='completed' where id=m.project_id;
    update public.contractor_profiles set projects_completed=projects_completed+1 where profile_id=q.contractor_id;
  else
    update public.milestones set status='in_progress'
      where project_id=m.project_id and status='locked'
      and seq=(select min(seq) from public.milestones where project_id=m.project_id and status='locked');
  end if;
  return v_payout;
end $$;

-- open_dispute lets a homeowner dispute submitted proof before the approval deadline.
create or replace function public.open_dispute(p_milestone_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare m public.milestones%rowtype; p public.projects%rowtype; v_id uuid;
begin
  select * into m from public.milestones where id=p_milestone_id for update;
  if not found then raise exception 'Milestone not found'; end if;
  select * into p from public.projects where id=m.project_id;
  if p.homeowner_id <> auth.uid() then raise exception 'Only the homeowner can open a dispute'; end if;
  if m.status <> 'proof_submitted' or m.approve_by is null or now()>m.approve_by then raise exception 'Milestone is outside the dispute window'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'A dispute reason is required'; end if;
  insert into public.disputes(milestone_id,project_id,opened_by,reason)
  values(m.id,m.project_id,auth.uid(),p_reason) returning id into v_id;
  update public.milestones set status='disputed' where id=m.id;
  update public.projects set status='disputed' where id=p.id;
  return v_id;
end $$;

-- resolve_dispute records an admin decision and distributes the milestone amount by ledger.
create or replace function public.resolve_dispute(p_dispute_id uuid,p_resolution public.dispute_status,p_contractor_amount numeric,p_homeowner_amount numeric)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare d public.disputes%rowtype; m public.milestones%rowtype; q public.quotes%rowtype;
  fee_pct numeric; fee numeric; net numeric;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_resolution not in ('resolved_paid','resolved_refund','resolved_split') then raise exception 'Invalid final resolution'; end if;
  select * into d from public.disputes where id=p_dispute_id for update;
  if not found or d.status not in ('open','need_more_proof') then raise exception 'Dispute not found or already resolved'; end if;
  select * into m from public.milestones where id=d.milestone_id for update;
  select * into q from public.quotes where id=m.quote_id;
  if p_contractor_amount < 0 or p_homeowner_amount < 0 or round(p_contractor_amount+p_homeowner_amount,2) <> m.amount then
    raise exception 'Contractor and homeowner amounts must be nonnegative and sum to the milestone amount';
  end if;
  if not exists(select 1 from public.payments where project_id=m.project_id and quote_id=m.quote_id and status='held') then
    raise exception 'No held payment exists for this accepted quote';
  end if;
  select coalesce((value#>>'{}')::numeric,0) into fee_pct from public.app_settings where key='platform_fee_percent';
  fee_pct := coalesce(fee_pct,0);
  fee := round(p_contractor_amount*fee_pct/100,2); net := p_contractor_amount-fee;
  if net > 0 then
    insert into public.escrow_ledger(project_id,milestone_id,entry_type,amount,from_party,to_party,note)
    values(m.project_id,m.id,'release',net,null,q.contractor_id,'Dispute settlement payout');
  end if;
  if fee > 0 then
    insert into public.escrow_ledger(project_id,milestone_id,entry_type,amount,from_party,to_party,note)
    values(m.project_id,m.id,'fee',fee,null,null,'Platform fee withheld from dispute settlement');
  end if;
  if p_homeowner_amount > 0 then
    insert into public.escrow_ledger(project_id,milestone_id,entry_type,amount,from_party,to_party,note)
    values(m.project_id,m.id,'refund',p_homeowner_amount,null,d.opened_by,'Dispute settlement refund');
  end if;
  if p_contractor_amount > 0 then
    insert into public.payouts(contractor_id,milestone_id,gross_amount,fee_amount,net_amount,status)
    values(q.contractor_id,m.id,p_contractor_amount,fee,net,'pending')
    on conflict(milestone_id) do nothing;
  end if;
  update public.disputes set status=p_resolution,resolution=p_resolution::text,
    contractor_amount=p_contractor_amount,homeowner_amount=p_homeowner_amount,resolved_by=auth.uid(),resolved_at=now()
  where id=d.id;
  update public.milestones set status=case when p_contractor_amount=0 then 'refunded'::public.milestone_status else 'paid'::public.milestone_status,
    paid_at=case when p_contractor_amount>0 then now() else paid_at end where id=m.id;
  if not exists(select 1 from public.milestones where project_id=m.project_id and status not in ('paid','refunded')) then
    update public.projects set status='completed' where id=m.project_id;
  else
    update public.projects set status='in_progress' where id=m.project_id;
  end if;
end $$;

-- submit_review permits one homeowner review after at least one milestone is paid.
create or replace function public.submit_review(p_project_id uuid,p_rating integer,p_comment text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare p public.projects%rowtype; q public.quotes%rowtype; v_id uuid;
begin
  select * into p from public.projects where id=p_project_id;
  if not found or p.homeowner_id<>auth.uid() then raise exception 'Project not found or not owned by caller'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5'; end if;
  if not exists(select 1 from public.milestones where project_id=p.id and status='paid') then raise exception 'At least one milestone must be paid before reviewing'; end if;
  select * into q from public.quotes where id=p.awarded_quote_id;
  insert into public.reviews(project_id,homeowner_id,contractor_id,rating,comment)
  values(p.id,p.homeowner_id,q.contractor_id,p_rating,p_comment) returning id into v_id;
  return v_id;
end $$;

-- review_contractor_documents allows admin approval/rejection of contractor documents.
create or replace function public.review_contractor_documents(p_contractor_id uuid,p_decision public.verification_status,p_reason text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
  if p_decision='rejected' and nullif(trim(p_reason),'') is null then raise exception 'Rejection reason is required'; end if;
  update public.contractor_documents set status=p_decision,reject_reason=case when p_decision='rejected' then p_reason else null end,
    reviewed_by=auth.uid(),reviewed_at=now()
  where contractor_id=p_contractor_id and status='pending';
  if not exists(select 1 from public.contractor_documents where contractor_id=p_contractor_id and doc_type='gov_id' and status='approved')
     or not exists(select 1 from public.contractor_documents where contractor_id=p_contractor_id and doc_type='license' and status='approved') then
    update public.contractor_profiles set verification_status=case when p_decision='rejected' then 'rejected'::public.verification_status else 'pending'::public.verification_status end,
      verified_at=null,verified_by=auth.uid() where profile_id=p_contractor_id;
  else
    update public.contractor_profiles set verification_status='approved',verified_at=now(),verified_by=auth.uid()
      where profile_id=p_contractor_id;
  end if;
end $$;

-- set_payment_held is a trusted server-side webhook RPC; call only after provider signature verification.
create or replace function public.set_payment_held(p_payment_id uuid,p_provider_ref text)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare pay public.payments%rowtype; p public.projects%rowtype;
begin
  select * into pay from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if pay.status='held' then return; end if;
  if pay.status<>'pending' then raise exception 'Payment is not pending'; end if;
  select * into p from public.projects where id=pay.project_id for update;
  if pay.quote_id<>p.awarded_quote_id then raise exception 'Payment quote is not the awarded quote'; end if;
  update public.payments set status='held',provider_ref=p_provider_ref,paid_at=now() where id=pay.id;
  insert into public.escrow_ledger(project_id,payment_id,entry_type,amount,from_party,to_party,note)
  values(pay.project_id,pay.id,'deposit',pay.amount,pay.payer_id,null,'Provider confirmed escrow deposit');
  update public.projects set status='in_progress' where id=p.id and status='awarded';
end $$;

-- expire_quotes marks stale submitted/requested quotes expired on schedule.
create or replace function public.expire_quotes()
returns integer language plpgsql security definer set search_path = pg_catalog, public
as $$
declare n integer;
begin
  update public.quotes set status='expired',decided_at=now()
   where status in ('requested','submitted') and valid_until is not null and valid_until < now();
  get diagnostics n = row_count; return n;
end $$;

-- auto_approve_milestones processes milestones past their configured approval deadline.
create or replace function public.auto_approve_milestones()
returns integer language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r record; n integer := 0;
begin
  for r in select id from public.milestones where status='proof_submitted' and approve_by < now() loop
    begin
      -- Runs as the scheduler/database owner; the approval RPC still checks held escrow.
      perform public.approve_milestone(r.id);
      n := n+1;
    exception when others then
      insert into public.audit_log(actor_id,action,entity,entity_id,details)
      values(null,'auto_approve_failed','milestones',r.id,jsonb_build_object('error',sqlerrm));
    end;
  end loop;
  return n;
end $$;

-- Restrict RPC execution; authenticated users invoke user-facing functions, service_role invokes webhook settlement.
revoke all on function public.calculate_estimate(numeric,integer,public.finish_level,public.work_type) from public;
revoke all on function public.save_project_estimate(uuid) from public;
revoke all on function public.match_contractors(uuid) from public;
revoke all on function public.request_quote(uuid,uuid) from public;
revoke all on function public.submit_quote(uuid,numeric,integer,text) from public;
revoke all on function public.accept_quote(uuid) from public;
revoke all on function public.submit_proof(uuid,text) from public;
revoke all on function public.approve_milestone(uuid) from public;
revoke all on function public.open_dispute(uuid,text) from public;
revoke all on function public.resolve_dispute(uuid,public.dispute_status,numeric,numeric) from public;
revoke all on function public.submit_review(uuid,integer,text) from public;
revoke all on function public.review_contractor_documents(uuid,public.verification_status,text) from public;
revoke all on function public.set_payment_held(uuid,text) from public;
revoke all on function public.expire_quotes() from public;
revoke all on function public.auto_approve_milestones() from public;

grant execute on function public.calculate_estimate(numeric,integer,public.finish_level,public.work_type) to authenticated;
grant execute on function public.save_project_estimate(uuid) to authenticated;
grant execute on function public.match_contractors(uuid) to authenticated;
grant execute on function public.request_quote(uuid,uuid) to authenticated;
grant execute on function public.submit_quote(uuid,numeric,integer,text) to authenticated;
grant execute on function public.accept_quote(uuid) to authenticated;
grant execute on function public.submit_proof(uuid,text) to authenticated;
grant execute on function public.approve_milestone(uuid) to authenticated;
grant execute on function public.open_dispute(uuid,text) to authenticated;
grant execute on function public.resolve_dispute(uuid,public.dispute_status,numeric,numeric) to authenticated;
grant execute on function public.submit_review(uuid,integer,text) to authenticated;
grant execute on function public.review_contractor_documents(uuid,public.verification_status,text) to authenticated;
grant execute on function public.set_payment_held(uuid,text) to service_role;
grant execute on function public.expire_quotes() to service_role;
grant execute on function public.auto_approve_milestones() to service_role;
