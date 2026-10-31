-- SMART CONTRACTOR MATCHING | 04
-- current_role returns the authenticated user's application role.
create or replace function public.current_role()
returns public.user_role
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;
revoke all on function public.current_role() from public;
grant execute on function public.current_role() to authenticated;

-- is_admin is a narrow helper for RLS and privileged RPC checks.
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select coalesce(public.current_role() = 'admin'::public.user_role, false) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- touch_updated_at maintains updated_at on mutable rows.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$ begin new.updated_at := now(); return new; end $$;

-- prevent_ledger_mutation makes escrow ledger rows append-only.
create or replace function public.prevent_ledger_mutation()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$ begin raise exception 'escrow_ledger is append-only'; end $$;

-- protect_contractor_verification_fields prevents a contractor from self-approving or changing review metadata.
create or replace function public.protect_contractor_verification_fields()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.profile_id <> old.profile_id
       or new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by
       or new.rating_avg is distinct from old.rating_avg
       or new.rating_count is distinct from old.rating_count
       or new.projects_completed is distinct from old.projects_completed then
      raise exception 'Contractors cannot modify verification, rating, or completed-project fields';
    end if;
  end if;
  return new;
end $$;

-- write_audit_log records key table mutations without copying sensitive file contents.
create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_id uuid; v_action text;
begin
  if tg_op = 'DELETE' then v_id := old.id; else v_id := new.id; end if;
  v_action := lower(tg_table_name) || '.' || lower(tg_op);
  insert into public.audit_log(actor_id, action, entity, entity_id, details)
  values (auth.uid(), v_action, tg_table_name, v_id,
          jsonb_build_object('source','trigger','operation',tg_op));
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

-- notify_project_owner emits in-app notices when a quote or milestone changes state.
create or replace function public.notify_quote_status()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_homeowner uuid;
begin
  if new.status is distinct from old.status then
    select homeowner_id into v_homeowner from public.projects where id = new.project_id;
    if v_homeowner is not null then
      insert into public.notifications(user_id,type,title,body,data)
      values (v_homeowner,'quote_status','Quote update',
        'A quote status changed to ' || new.status::text,
        jsonb_build_object('project_id',new.project_id,'quote_id',new.id,'status',new.status));
    end if;
    insert into public.notifications(user_id,type,title,body,data)
    values (new.contractor_id,'quote_status','Quote update',
      'Your quote status changed to ' || new.status::text,
      jsonb_build_object('project_id',new.project_id,'quote_id',new.id,'status',new.status));
  end if;
  return new;
end $$;

-- notify_milestone_status alerts project participants after milestone status changes.
create or replace function public.notify_milestone_status()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_homeowner uuid; v_contractor uuid;
begin
  if new.status is distinct from old.status then
    select p.homeowner_id, q.contractor_id into v_homeowner, v_contractor
      from public.projects p join public.quotes q on q.id = new.quote_id where p.id = new.project_id;
    insert into public.notifications(user_id,type,title,body,data)
    values (v_homeowner,'milestone_status','Milestone update',
      new.name || ' is now ' || new.status::text,
      jsonb_build_object('project_id',new.project_id,'milestone_id',new.id,'status',new.status));
    insert into public.notifications(user_id,type,title,body,data)
    values (v_contractor,'milestone_status','Milestone update',
      new.name || ' is now ' || new.status::text,
      jsonb_build_object('project_id',new.project_id,'milestone_id',new.id,'status',new.status));
  end if;
  return new;
end $$;

-- recalculate_contractor_rating keeps rating average/count synchronized with reviews.
create or replace function public.recalculate_contractor_rating()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_contractor uuid;
begin
  v_contractor := coalesce(new.contractor_id, old.contractor_id);
  update public.contractor_profiles cp
     set rating_avg = coalesce((select round(avg(r.rating)::numeric,2) from public.reviews r where r.contractor_id=v_contractor),0),
         rating_count = (select count(*) from public.reviews r where r.contractor_id=v_contractor),
         updated_at = now()
   where cp.profile_id = v_contractor;
  return coalesce(new,old);
end $$;

drop trigger if exists contractor_profiles_protect_fields on public.contractor_profiles;
create trigger contractor_profiles_protect_fields before update on public.contractor_profiles
for each row execute function public.protect_contractor_verification_fields();

drop trigger if exists escrow_ledger_no_update_delete on public.escrow_ledger;
create trigger escrow_ledger_no_update_delete before update or delete on public.escrow_ledger
for each row execute function public.prevent_ledger_mutation();

do $$ declare t text; begin
  foreach t in array array['profiles','contractor_profiles','contractor_documents','portfolio_items','estimate_rates','milestone_templates','projects','quotes','milestones','payments','payouts','disputes','app_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch_updated_at', t);
  end loop;
end $$;

drop trigger if exists quotes_notify_status on public.quotes;
create trigger quotes_notify_status after update on public.quotes
for each row execute function public.notify_quote_status();
drop trigger if exists milestones_notify_status on public.milestones;
create trigger milestones_notify_status after update on public.milestones
for each row execute function public.notify_milestone_status();
drop trigger if exists reviews_recalculate_rating on public.reviews;
create trigger reviews_recalculate_rating after insert or update or delete on public.reviews
for each row execute function public.recalculate_contractor_rating();

-- Audit triggers capture key changes; audit_log itself is intentionally not recursively audited.
do $$ declare t text; begin
  foreach t in array array['contractor_documents','projects','quotes','milestones','payments','disputes','reviews'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_log()', t || '_audit', t);
  end loop;
end $$;
