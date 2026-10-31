-- Migration 12: Fraud Reports & Admin Settings Enhancement
-- Adds fraud_reports and complaint investigation tracking, and ensures audit_log and app_settings indexes

do $$ begin 
  create type public.fraud_report_status as enum ('pending', 'investigating', 'resolved_action_taken', 'resolved_dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.fraud_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  category text not null,
  description text not null check (length(trim(description)) > 0),
  status public.fraud_report_status not null default 'pending',
  investigation_notes text,
  investigated_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for speedy queries
create index if not exists idx_fraud_reports_status on public.fraud_reports(status);
create index if not exists idx_fraud_reports_created_at on public.fraud_reports(created_at desc);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log(entity, entity_id);

-- Enable RLS
alter table public.fraud_reports enable row level security;

-- Policies for fraud_reports: Admins can do all, authenticated users can create
drop policy if exists fraud_reports_admin_all on public.fraud_reports;
create policy fraud_reports_admin_all on public.fraud_reports
  for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

drop policy if exists fraud_reports_insert_self on public.fraud_reports;
create policy fraud_reports_insert_self on public.fraud_reports
  for insert to authenticated
  with check (reporter_id = auth.uid());
