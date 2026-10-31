-- Migration 20: Manual Payment, Proof of Payment, Verification, and Release Funds Workflow
-- Enforces separate Homeowner Payment Statuses and Contractor Payout Statuses,
-- adds payout proof/reference columns, and updates RLS policies for full workflow support.

-- 1. Update payment_transactions status constraints to use explicit Homeowner Payment Statuses and Contractor Payout Statuses
do $$ begin
  alter table public.payment_transactions drop constraint if exists payment_transactions_payment_status_check;
exception when others then null; end $$;

do $$ begin
  alter table public.payment_transactions drop constraint if exists payment_transactions_payout_status_check;
exception when others then null; end $$;

-- Normalize existing records to the canonical status values
update public.payment_transactions
set payment_status = 'PAID'
where payment_status = 'SUCCEEDED';

update public.payment_transactions
set payment_status = 'PENDING_VERIFICATION'
where payment_status in ('CREATED', 'PENDING', 'UNDER_REVIEW');

update public.payment_transactions
set payout_status = 'RELEASED'
where payout_status = 'PAID';

update public.payment_transactions
set payout_status = 'NOT_READY'
where payout_status in ('NOT_DUE', 'CANCELLED');

alter table public.payment_transactions
  alter column payment_status set default 'PENDING_VERIFICATION',
  alter column payout_status set default 'NOT_READY';

alter table public.payment_transactions
  add constraint payment_transactions_payment_status_check
  check (payment_status in (
    'UNPAID',
    'PENDING_VERIFICATION',
    'PAID',
    'REJECTED',
    'REFUNDED',
    'DISPUTED',
    -- Legacy compatibility values
    'CREATED',
    'PENDING',
    'PROCESSING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED'
  ));

alter table public.payment_transactions
  add constraint payment_transactions_payout_status_check
  check (payout_status in (
    'NOT_READY',
    'PENDING',
    'PROCESSING',
    'RELEASED',
    'FAILED',
    'ON_HOLD',
    -- Legacy compatibility values
    'NOT_DUE',
    'PAID',
    'CANCELLED'
  ));

-- 2. Add contractor payout release columns to payment_transactions
alter table public.payment_transactions
  add column if not exists payout_tx_ref text unique,
  add column if not exists payout_account_id uuid references public.contractor_payout_accounts(id),
  add column if not exists payout_method text,
  add column if not exists payout_proof_url text,
  add column if not exists payout_proof_name text,
  add column if not exists payout_released_by uuid references public.profiles(id),
  add column if not exists payout_released_at timestamptz,
  add column if not exists payout_notes text;

-- 3. Enhance payouts table with manual transfer proof and release audit fields
alter table public.payouts
  add column if not exists project_id uuid references public.projects(id),
  add column if not exists transaction_id uuid references public.payment_transactions(id),
  add column if not exists payout_tx_ref text,
  add column if not exists payout_method text,
  add column if not exists payout_account_details text,
  add column if not exists proof_file_url text,
  add column if not exists proof_file_name text,
  add column if not exists released_by uuid references public.profiles(id),
  add column if not exists released_at timestamptz,
  add column if not exists notes text;

-- 4. RLS Policies for payment_transactions (Homeowner insert, Admin verify/release, Contractor read-only)
drop policy if exists transactions_homeowner_insert on public.payment_transactions;
create policy transactions_homeowner_insert on public.payment_transactions
  for insert to authenticated
  with check (payer_id = auth.uid() or public.is_admin());

drop policy if exists transactions_admin_update on public.payment_transactions;
create policy transactions_admin_update on public.payment_transactions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 5. RLS Policies for financial_audit_logs (Authenticated insert for audit trail, Admin select)
drop policy if exists audit_logs_insert_policy on public.financial_audit_logs;
create policy audit_logs_insert_policy on public.financial_audit_logs
  for insert to authenticated
  with check (true);

