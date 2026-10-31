-- SMART CONTRACTOR MATCHING | 10
-- Run in Supabase SQL Editor as an administrator. These are inspection/manual test queries, not destructive fixtures.
-- 1) Schema and RLS status
select schemaname, tablename, rowsecurity
from pg_tables where schemaname='public'
and tablename in ('profiles','contractor_profiles','contractor_documents','portfolio_items','portfolio_images',
'estimate_rates','milestone_templates','projects','project_matches','quotes','milestones','milestone_proofs',
'payments','escrow_ledger','payouts','disputes','dispute_messages','reviews','notifications','audit_log','app_settings')
order by tablename;

-- 2) Configuration: active rate rows and milestone percentages should total 100.
select finish_level, work_type, rate_per_sqm, extra_floor_factor, range_pct
from public.estimate_rates where is_active order by finish_level, work_type, effective_from desc;
select sum(percent) as active_milestone_percent_total
from public.milestone_templates where is_active;

-- 3) Admin inspection: contractor verification and document checklist.
select cp.profile_id, cp.business_name, cp.verification_status, cp.is_active,
       bool_or(d.doc_type='gov_id' and d.status='approved') as approved_government_id,
       bool_or(d.doc_type='license' and d.status='approved') as approved_license
from public.contractor_profiles cp left join public.contractor_documents d on d.contractor_id=cp.profile_id
group by cp.profile_id, cp.business_name, cp.verification_status, cp.is_active;

-- 4) Project estimate smoke test (requires matching active estimate rate).
select public.calculate_estimate(100,2,'standard','new_build');

-- 5) Check one accepted quote per project and valid milestone totals.
select project_id, count(*) filter(where status='accepted') as accepted_quotes
from public.quotes group by project_id having count(*) filter(where status='accepted') > 1;
select quote_id, sum(percent) as milestone_percent_total, sum(amount) as milestone_amount_total
from public.milestones group by quote_id;

-- 6) Ledger append-only trigger is installed.
select tgname, tgenabled from pg_trigger
where tgrelid='public.escrow_ledger'::regclass and not tgisinternal;

-- 7) Privilege audit: anon should not have execute on money-moving RPCs.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema='public'
and routine_name in ('approve_milestone','resolve_dispute','set_payment_held','auto_approve_milestones')
order by routine_name, grantee;

-- 8) Role/RLS testing instructions:
-- Use Supabase Auth test accounts, then test from the app/client as each account:
-- Homeowner: can read/update own profile, create/read own projects, read own matches/quotes/milestones,
--            cannot read private contractor IDs, cannot write payments/ledger/payouts directly.
-- Contractor: can edit own business profile, upload own docs/portfolio, read matched/quoted projects,
--             submit quotes only through submit_quote RPC, upload proof only for own in-progress milestone.
-- Admin: assign role='admin' to a trusted profile using SQL Editor; can review docs, read operational tables,
--        resolve disputes, edit rates/settings. Never expose admin role assignment to client UI.
-- IMPORTANT: Supabase SQL Editor runs as a privileged database role and does not simulate end-user RLS.
-- For actual RLS tests, use the Supabase client with each test user's JWT.
