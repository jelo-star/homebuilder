-- SMART CONTRACTOR MATCHING | 06
-- Enable RLS on all application tables.
do $$ declare t text; begin
 foreach t in array array[
 'profiles','contractor_profiles','contractor_documents','portfolio_items','portfolio_images',
 'estimate_rates','milestone_templates','projects','project_matches','quotes','milestones',
 'milestone_proofs','payments','escrow_ledger','payouts','disputes','dispute_messages','reviews',
 'notifications','audit_log','app_settings'
 ] loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;

-- Remove prior policies of the same names to keep this migration repeatable.
drop policy if exists profiles_read_policy on public.profiles;
create policy profiles_read_policy on public.profiles for select to authenticated
using (id=auth.uid() or public.is_admin() or
  (role='contractor' and exists(select 1 from public.quotes q join public.projects p on p.id=q.project_id
    where q.contractor_id=profiles.id and p.homeowner_id=auth.uid())));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
using (id=auth.uid() and role=public.current_role()) with check (id=auth.uid() and role=public.current_role());
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id=auth.uid() and role='homeowner');

drop policy if exists contractor_profiles_read on public.contractor_profiles;
create policy contractor_profiles_read on public.contractor_profiles for select to authenticated
using ((verification_status='approved' and is_active) or profile_id=auth.uid() or public.is_admin());
drop policy if exists contractor_profiles_insert_own on public.contractor_profiles;
create policy contractor_profiles_insert_own on public.contractor_profiles for insert to authenticated with check (profile_id=auth.uid() and public.current_role()='contractor');
drop policy if exists contractor_profiles_update_own on public.contractor_profiles;
create policy contractor_profiles_update_own on public.contractor_profiles for update to authenticated
using (profile_id=auth.uid() or public.is_admin())
with check (profile_id=auth.uid() or public.is_admin());

drop policy if exists contractor_documents_owner_admin_select on public.contractor_documents;
create policy contractor_documents_owner_admin_select on public.contractor_documents for select to authenticated
using (contractor_id=auth.uid() or public.is_admin());
drop policy if exists contractor_documents_owner_insert on public.contractor_documents;
create policy contractor_documents_owner_insert on public.contractor_documents for insert to authenticated
with check (contractor_id=auth.uid() and public.current_role()='contractor' and status='pending');
drop policy if exists contractor_documents_admin_update on public.contractor_documents;
create policy contractor_documents_admin_update on public.contractor_documents for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists portfolio_items_read on public.portfolio_items;
create policy portfolio_items_read on public.portfolio_items for select to authenticated
using (public.is_admin() or contractor_id=auth.uid() or exists(select 1 from public.contractor_profiles cp where cp.profile_id=contractor_id and cp.verification_status='approved' and cp.is_active));
drop policy if exists portfolio_items_owner_write on public.portfolio_items;
create policy portfolio_items_owner_write on public.portfolio_items for all to authenticated
using (contractor_id=auth.uid() or public.is_admin()) with check (contractor_id=auth.uid() or public.is_admin());

drop policy if exists portfolio_images_read on public.portfolio_images;
create policy portfolio_images_read on public.portfolio_images for select to authenticated
using (public.is_admin() or exists(select 1 from public.portfolio_items pi where pi.id=portfolio_item_id and
  (pi.contractor_id=auth.uid() or exists(select 1 from public.contractor_profiles cp where cp.profile_id=pi.contractor_id and cp.verification_status='approved' and cp.is_active))));
drop policy if exists portfolio_images_owner_write on public.portfolio_images;
create policy portfolio_images_owner_write on public.portfolio_images for all to authenticated
using (public.is_admin() or exists(select 1 from public.portfolio_items pi where pi.id=portfolio_item_id and pi.contractor_id=auth.uid()))
with check (public.is_admin() or exists(select 1 from public.portfolio_items pi where pi.id=portfolio_item_id and pi.contractor_id=auth.uid()));

drop policy if exists estimate_rates_read_admin on public.estimate_rates;
create policy estimate_rates_read_admin on public.estimate_rates for select to authenticated using (public.is_admin());
drop policy if exists estimate_rates_admin_all on public.estimate_rates;
create policy estimate_rates_admin_all on public.estimate_rates for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists milestone_templates_admin_read on public.milestone_templates;
create policy milestone_templates_admin_read on public.milestone_templates for select to authenticated using (public.is_admin());
drop policy if exists milestone_templates_admin_all on public.milestone_templates;
create policy milestone_templates_admin_all on public.milestone_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists projects_select_policy on public.projects;
create policy projects_select_policy on public.projects for select to authenticated
using (homeowner_id=auth.uid() or public.is_admin() or exists(select 1 from public.project_matches pm where pm.project_id=projects.id and pm.contractor_id=auth.uid())
  or exists(select 1 from public.quotes q where q.project_id=projects.id and q.contractor_id=auth.uid()));
drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects for insert to authenticated with check (homeowner_id=auth.uid() and public.current_role()='homeowner');
drop policy if exists projects_update_own_draft on public.projects;
create policy projects_update_own_draft on public.projects for update to authenticated
using ((homeowner_id=auth.uid() and status in ('draft','open')) or public.is_admin())
with check ((homeowner_id=auth.uid() and status in ('draft','open','quoted')) or public.is_admin());
drop policy if exists projects_admin_delete on public.projects;
create policy projects_admin_delete on public.projects for delete to authenticated using (public.is_admin());

drop policy if exists project_matches_select_policy on public.project_matches;
create policy project_matches_select_policy on public.project_matches for select to authenticated
using (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and p.homeowner_id=auth.uid()) or contractor_id=auth.uid());
drop policy if exists project_matches_admin_all on public.project_matches;
create policy project_matches_admin_all on public.project_matches for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists quotes_select_policy on public.quotes;
create policy quotes_select_policy on public.quotes for select to authenticated
using (public.is_admin() or contractor_id=auth.uid() or exists(select 1 from public.projects p where p.id=project_id and p.homeowner_id=auth.uid()));
drop policy if exists quotes_contractor_insert on public.quotes;
create policy quotes_contractor_insert on public.quotes for insert to authenticated with check (false);
drop policy if exists quotes_contractor_update on public.quotes;
create policy quotes_contractor_update on public.quotes for update to authenticated
using (contractor_id=auth.uid() and status='requested') with check (contractor_id=auth.uid() and status in ('requested','submitted'));
drop policy if exists quotes_homeowner_update on public.quotes;
create policy quotes_homeowner_update on public.quotes for update to authenticated
using (exists(select 1 from public.projects p where p.id=project_id and p.homeowner_id=auth.uid()))
with check (exists(select 1 from public.projects p where p.id=project_id and p.homeowner_id=auth.uid()));
drop policy if exists quotes_admin_all on public.quotes;
create policy quotes_admin_all on public.quotes for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists milestones_select_policy on public.milestones;
create policy milestones_select_policy on public.milestones for select to authenticated
using (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and p.homeowner_id=auth.uid())
 or exists(select 1 from public.quotes q where q.id=quote_id and q.contractor_id=auth.uid()));
drop policy if exists milestones_no_direct_write on public.milestones;
create policy milestones_no_direct_write on public.milestones for insert to authenticated with check (false);
drop policy if exists milestones_update_admin_only on public.milestones;
create policy milestones_update_admin_only on public.milestones for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists milestone_proofs_select_policy on public.milestone_proofs;
create policy milestone_proofs_select_policy on public.milestone_proofs for select to authenticated
using (public.is_admin() or uploaded_by=auth.uid() or exists(select 1 from public.milestones m join public.projects p on p.id=m.project_id
  where m.id=milestone_id and p.homeowner_id=auth.uid()) or exists(select 1 from public.milestones m join public.quotes q on q.id=m.quote_id
  where m.id=milestone_id and q.contractor_id=auth.uid()));
drop policy if exists milestone_proofs_insert_owner on public.milestone_proofs;
create policy milestone_proofs_insert_owner on public.milestone_proofs for insert to authenticated
with check (uploaded_by=auth.uid() and exists(select 1 from public.milestones m join public.quotes q on q.id=m.quote_id
  where m.id=milestone_id and q.contractor_id=auth.uid() and m.status='in_progress'));

drop policy if exists payments_select_policy on public.payments;
create policy payments_select_policy on public.payments for select to authenticated
using (public.is_admin() or payer_id=auth.uid() or exists(select 1 from public.quotes q where q.id=quote_id and q.contractor_id=auth.uid()));
drop policy if exists payments_no_direct_write on public.payments;
create policy payments_no_direct_write on public.payments for all to authenticated using (false) with check (false);

drop policy if exists escrow_ledger_select_policy on public.escrow_ledger;
create policy escrow_ledger_select_policy on public.escrow_ledger for select to authenticated
using (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and p.homeowner_id=auth.uid())
 or exists(select 1 from public.quotes q join public.milestones m on m.quote_id=q.id where m.project_id=project_id and q.contractor_id=auth.uid()));
drop policy if exists escrow_ledger_no_direct_write on public.escrow_ledger;
create policy escrow_ledger_no_direct_write on public.escrow_ledger for all to authenticated using (false) with check (false);

drop policy if exists payouts_select_policy on public.payouts;
create policy payouts_select_policy on public.payouts for select to authenticated using (public.is_admin() or contractor_id=auth.uid());
drop policy if exists payouts_no_direct_write on public.payouts;
create policy payouts_no_direct_write on public.payouts for all to authenticated using (false) with check (false);

drop policy if exists disputes_select_policy on public.disputes;
create policy disputes_select_policy on public.disputes for select to authenticated
using (public.is_admin() or opened_by=auth.uid() or exists(select 1 from public.projects p where p.id=project_id and p.homeowner_id=auth.uid())
 or exists(select 1 from public.quotes q join public.milestones m on m.quote_id=q.id where m.id=milestone_id and q.contractor_id=auth.uid()));
drop policy if exists disputes_insert_homeowner on public.disputes;
create policy disputes_insert_homeowner on public.disputes for insert to authenticated with check (false);
drop policy if exists disputes_update_admin on public.disputes;
create policy disputes_update_admin on public.disputes for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists dispute_messages_select_policy on public.dispute_messages;
create policy dispute_messages_select_policy on public.dispute_messages for select to authenticated
using (public.is_admin() or author_id=auth.uid() or exists(select 1 from public.disputes d where d.id=dispute_id and
 (d.opened_by=auth.uid() or exists(select 1 from public.quotes q join public.milestones m on m.quote_id=q.id where m.id=d.milestone_id and q.contractor_id=auth.uid()))));
drop policy if exists dispute_messages_insert_participant on public.dispute_messages;
create policy dispute_messages_insert_participant on public.dispute_messages for insert to authenticated
with check (author_id=auth.uid() and exists(select 1 from public.disputes d where d.id=dispute_id and
 (public.is_admin() or d.opened_by=auth.uid() or exists(select 1 from public.quotes q join public.milestones m on m.quote_id=q.id where m.id=d.milestone_id and q.contractor_id=auth.uid()))));

drop policy if exists reviews_select_all on public.reviews;
create policy reviews_select_all on public.reviews for select to authenticated using (true);
drop policy if exists reviews_insert_homeowner on public.reviews;
create policy reviews_insert_homeowner on public.reviews for insert to authenticated
with check (homeowner_id=auth.uid() and exists(select 1 from public.projects p where p.id=project_id and p.homeowner_id=auth.uid()));
drop policy if exists reviews_admin_update on public.reviews;
create policy reviews_admin_update on public.reviews for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists notifications_own_select on public.notifications;
create policy notifications_own_select on public.notifications for select to authenticated using (user_id=auth.uid() or public.is_admin());
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists notifications_own_insert on public.notifications;
create policy notifications_own_insert on public.notifications for insert to authenticated with check (false);

drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log for select to authenticated using (public.is_admin());
drop policy if exists audit_log_no_client_write on public.audit_log;
create policy audit_log_no_client_write on public.audit_log for all to authenticated using (false) with check (false);

drop policy if exists app_settings_admin_all on public.app_settings;
create policy app_settings_admin_all on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
