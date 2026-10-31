-- DESTRUCTIVE: run manually in the intended Supabase project's SQL Editor only.
-- Deletes all projects and their dependent project/milestone records.
-- Does not seed replacement data or delete profiles, contractors, settings,
-- catalogs, saved estimates, fraud reports, or audit history.
-- Storage files are not changed; remove any milestone proof files separately.
-- Run the entire script in one execution.

begin;

delete from public.notifications
 where data ->> 'project_id' in (select id::text from public.projects);

delete from public.contract_amendments
 where project_id in (select id from public.projects);

delete from public.project_agreements
 where project_id in (select id from public.projects);

delete from public.project_plan_comments
 where project_id in (select id from public.projects);

delete from public.project_plans
 where project_id in (select id from public.projects);

delete from public.disputes
 where project_id in (select id from public.projects);

delete from public.escrow_ledger
 where project_id in (select id from public.projects);

delete from public.payouts
 where project_id in (select id from public.projects)
    or milestone_id in (
      select id from public.milestones
       where project_id in (select id from public.projects)
    );

delete from public.payment_transactions
 where project_id in (select id from public.projects);

delete from public.payments
 where project_id in (select id from public.projects);

delete from public.reviews
 where project_id in (select id from public.projects);

delete from public.milestones
 where project_id in (select id from public.projects);

delete from public.quotes
 where project_id in (select id from public.projects);

delete from public.projects;

select
  (select count(*) from public.projects) as remaining_projects,
  (select count(*) from public.milestones) as remaining_milestones;

commit;
