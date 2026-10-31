-- Migration 15: Contractor Module Schema Enhancements
-- Adds support for detailed contractor business registration, credential metadata, quote breakdown & attachments, and quote revisions.

-- 1. Extend contractor_profiles with Philippine business registration details
alter table public.contractor_profiles
  add column if not exists business_type text default 'sole_proprietorship', -- sole_proprietorship, partnership, corporation
  add column if not exists trade_name text,
  add column if not exists authorized_representative text,
  add column if not exists business_email text,
  add column if not exists business_phone text,
  add column if not exists business_address text,
  add column if not exists province text default 'Metro Manila',
  add column if not exists pcab_category text, -- e.g. AAA, AA, A, B, C, D, Trade/E
  add column if not exists pcab_license_no text,
  add column if not exists pcab_expiration_date date,
  add column if not exists dti_sec_no text,
  add column if not exists bir_tin text,
  add column if not exists team_capacity integer default 5,
  add column if not exists accepted_project_types text[] default array['new_build', 'renovation', 'extension'],
  add column if not exists min_project_budget numeric(14,2) default 500000,
  add column if not exists max_project_budget numeric(14,2) default 50000000;

-- 2. Extend contractor_documents with issuing authority, dates, document reference numbers, and review history
alter table public.contractor_documents
  add column if not exists doc_title text,
  add column if not exists doc_number text,
  add column if not exists issuing_authority text,
  add column if not exists issue_date date,
  add column if not exists expiry_date date,
  add column if not exists reviewer_notes text;

-- 3. Extend quotes with itemized breakdown, scope inclusions/exclusions, payment milestones proposal, warranty, and validity
alter table public.quotes
  add column if not exists scope_of_work text,
  add column if not exists inclusions text,
  add column if not exists exclusions text,
  add column if not exists assumptions text,
  add column if not exists warranty_terms text,
  add column if not exists payment_terms text,
  add column if not exists breakdown jsonb default '[]'::jsonb,
  add column if not exists attachment_path text,
  add column if not exists revision_number integer not null default 1,
  add column if not exists previous_quote_id uuid references public.quotes(id) on delete set null;

-- 4. Create quote_revisions table for immutable audit trail of negotiated proposals
create table if not exists public.quote_revisions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  revision_number integer not null,
  price numeric(14,2) not null,
  duration_months integer not null,
  notes text,
  scope_of_work text,
  inclusions text,
  exclusions text,
  assumptions text,
  warranty_terms text,
  breakdown jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Enable RLS on quote_revisions
alter table public.quote_revisions enable row level security;

drop policy if exists quote_revisions_select_policy on public.quote_revisions;
create policy quote_revisions_select_policy on public.quote_revisions for select to authenticated
using (
  public.is_admin() or 
  exists (
    select 1 from public.quotes q 
    where q.id = quote_id and (
      q.contractor_id = auth.uid() or 
      exists (select 1 from public.projects p where p.id = q.project_id and p.homeowner_id = auth.uid())
    )
  )
);

drop policy if exists quote_revisions_insert_contractor on public.quote_revisions;
create policy quote_revisions_insert_contractor on public.quote_revisions for insert to authenticated
with check (
  exists (
    select 1 from public.quotes q 
    where q.id = quote_id and q.contractor_id = auth.uid()
  ) or public.is_admin()
);

-- 5. Extend RLS policies to allow approved contractors to discover open projects and submit proposals
-- Allow approved contractors to view all open/quoted projects in the marketplace (not just project_matches)
drop policy if exists projects_select_policy on public.projects;
create policy projects_select_policy on public.projects for select to authenticated
using (
  homeowner_id = auth.uid() or 
  public.is_admin() or 
  status in ('open', 'quoted') or
  exists (select 1 from public.project_matches pm where pm.project_id = projects.id and pm.contractor_id = auth.uid()) or 
  exists (select 1 from public.quotes q where q.project_id = projects.id and q.contractor_id = auth.uid())
);

-- Allow contractors to insert quotes for open projects directly, or update existing quotes
drop policy if exists quotes_contractor_insert on public.quotes;
create policy quotes_contractor_insert on public.quotes for insert to authenticated
with check (
  contractor_id = auth.uid() and 
  exists (
    select 1 from public.contractor_profiles cp 
    where cp.profile_id = auth.uid() and cp.is_active
  ) and
  exists (
    select 1 from public.projects p 
    where p.id = project_id and p.status in ('open', 'quoted')
  )
);

-- Update quotes contractor update policy to allow revising their submitted quotes while open
drop policy if exists quotes_contractor_update on public.quotes;
create policy quotes_contractor_update on public.quotes for update to authenticated
using (contractor_id = auth.uid() and status in ('requested', 'submitted'))
with check (contractor_id = auth.uid() and status in ('requested', 'submitted', 'withdrawn'));

-- Create helpful indexes
create index if not exists idx_quotes_contractor on public.quotes(contractor_id, status);
create index if not exists idx_quote_revisions_quote on public.quote_revisions(quote_id);
create index if not exists idx_contractor_profiles_service_cities on public.contractor_profiles using gin (service_cities);
create index if not exists idx_contractor_documents_contractor on public.contractor_documents(contractor_id, status);
