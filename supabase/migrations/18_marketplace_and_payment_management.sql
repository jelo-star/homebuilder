-- Migration 18: Complete Marketplace, Quotations Line Items, Agreements, and Payment Management
-- Normalizes tables for quotation materials/labor line items, project agreements, payout accounts, and financial transactions.

-- 1. Extend project_status enum with explicit marketplace workflow states if not present
do $$ begin
  alter type public.project_status add value if not exists 'open_for_bids';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.project_status add value if not exists 'awaiting_initial_payment';
exception when duplicate_object then null; end $$;

-- 2. Extend quote_status enum with revision and selection states
do $$ begin
  alter type public.quote_status add value if not exists 'not_selected';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.quote_status add value if not exists 'revision_requested';
exception when duplicate_object then null; end $$;

-- 3. Quotation Line Items Table (Distinguishing Materials vs Construction/Labor Expenses)
create table if not exists public.quotation_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  category text not null check (category in ('material', 'labor', 'equipment', 'logistics', 'subcontractor', 'management_fee', 'taxes_permits', 'other')),
  item_name text not null,
  specifications text,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit text not null default 'lot',
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  line_total numeric(14,2) not null default 0 check (line_total >= 0),
  supplier text,
  delivery_cost numeric(14,2) default 0,
  delivery_schedule text,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

-- 4. Project Agreements Table (Contracts generated upon quote acceptance)
create table if not exists public.project_agreements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  homeowner_id uuid not null references public.profiles(id) on delete restrict,
  contractor_id uuid not null references public.contractor_profiles(profile_id) on delete restrict,
  contract_amount numeric(14,2) not null check (contract_amount > 0),
  materials_subtotal numeric(14,2) not null default 0,
  labor_other_subtotal numeric(14,2) not null default 0,
  project_duration_months integer not null default 4,
  scope_of_work text,
  inclusions text,
  exclusions text,
  warranty_terms text,
  status text not null default 'draft' check (status in ('draft', 'pending_signatures', 'executed', 'terminated', 'completed')),
  homeowner_signed_at timestamptz,
  contractor_signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, quote_id)
);

-- 5. Contractor Payout Accounts Table (Bank, GCash, Maya with verification lifecycle)
create table if not exists public.contractor_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  payout_method text not null check (payout_method in ('bank_transfer', 'gcash', 'maya')),
  bank_name text,
  account_name text not null,
  account_number_mask text not null, -- tokenized or masked e.g. **** **** 4819
  account_identifier text, -- tokenized reference from provider
  status text not null default 'PENDING_VERIFICATION' check (status in ('NOT_CONFIGURED', 'PENDING_VERIFICATION', 'VERIFIED', 'RESTRICTED')),
  is_primary boolean not null default true,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. Payment Provider Configurations (Platform settings for admin management)
create table if not exists public.payment_provider_configs (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null unique check (provider_name in ('gcash', 'maya', 'card_gateway', 'bank_transfer', 'sandbox')),
  display_name text not null,
  is_enabled boolean not null default true,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  transaction_fee_pct numeric(5,2) not null default 0.00,
  transaction_fee_fixed numeric(10,2) not null default 0.00,
  supports_automatic_disbursement boolean not null default false,
  metadata jsonb default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- Seed default provider configurations safely
insert into public.payment_provider_configs (provider_name, display_name, is_enabled, environment, transaction_fee_pct, transaction_fee_fixed, supports_automatic_disbursement)
values
  ('gcash', 'GCash QR & Wallet', true, 'sandbox', 1.50, 0.00, true),
  ('maya', 'Maya Checkout & Wallet', true, 'sandbox', 1.50, 0.00, true),
  ('card_gateway', 'Credit / Debit Cards (Visa, Mastercard)', true, 'sandbox', 2.80, 15.00, false),
  ('bank_transfer', 'Online Direct Bank Transfer (InstaPay / PESONet)', true, 'sandbox', 0.50, 25.00, true),
  ('sandbox', 'Mock Platform Escrow Sandbox', true, 'sandbox', 0.00, 0.00, true)
on conflict (provider_name) do update set
  is_enabled = excluded.is_enabled,
  display_name = excluded.display_name;

-- 7. Payment Transactions (Normalized table with Minor Currency Unit centavos & Idempotency)
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_ref text not null unique,
  idempotency_key text unique,
  project_id uuid not null references public.projects(id) on delete restrict,
  milestone_id uuid references public.milestones(id) on delete set null,
  payer_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid references public.profiles(id) on delete restrict,
  amount_centavos bigint not null check (amount_centavos > 0),
  currency text not null default 'PHP',
  payment_method text not null check (payment_method in ('gcash', 'maya', 'card', 'bank_transfer', 'cash', 'sandbox')),
  provider text not null default 'sandbox',
  provider_tx_ref text,
  payment_status text not null default 'PENDING' check (payment_status in ('CREATED', 'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED')),
  payout_status text not null default 'NOT_READY' check (payout_status in ('NOT_READY', 'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'ON_HOLD', 'CANCELLED')),
  provider_fee_centavos bigint default 0,
  platform_fee_centavos bigint default 0,
  net_amount_centavos bigint default 0,
  failure_reason text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8. Append-Only Financial Audit Logs
create table if not exists public.financial_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action_type text not null, -- e.g. 'PAYMENT_VERIFIED', 'PAYOUT_INITIATED', 'REFUND_PROCESSED', 'OVERRIDE_ADJUSTMENT'
  entity_type text not null, -- 'payment_transactions', 'milestones', 'project_agreements'
  entity_id uuid not null,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  ip_address text,
  created_at timestamptz not null default now()
);

-- Enable RLS on newly created tables
alter table public.quotation_line_items enable row level security;
alter table public.project_agreements enable row level security;
alter table public.contractor_payout_accounts enable row level security;
alter table public.payment_provider_configs enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.financial_audit_logs enable row level security;

-- Policies for project_agreements
drop policy if exists agreements_select_policy on public.project_agreements;
create policy agreements_select_policy on public.project_agreements for select to authenticated
using (
  homeowner_id = auth.uid() or 
  contractor_id = auth.uid() or 
  public.is_admin()
);

-- Policies for quotation_line_items
drop policy if exists line_items_select_policy on public.quotation_line_items;
create policy line_items_select_policy on public.quotation_line_items for select to authenticated
using (
  public.is_admin() or 
  exists (
    select 1 from public.quotes q 
    where q.id = quotation_line_items.quote_id and (
      q.contractor_id = auth.uid() or 
      exists (select 1 from public.projects p where p.id = q.project_id and p.homeowner_id = auth.uid())
    )
  )
);

-- Policies for contractor_payout_accounts
drop policy if exists payout_accounts_policy on public.contractor_payout_accounts;
create policy payout_accounts_policy on public.contractor_payout_accounts for select to authenticated
using (
  contractor_id = auth.uid() or public.is_admin()
);

-- Policies for payment_provider_configs (public read for enabled methods, admin write)
drop policy if exists configs_select_policy on public.payment_provider_configs;
create policy configs_select_policy on public.payment_provider_configs for select to authenticated
using (true);

drop policy if exists configs_admin_write on public.payment_provider_configs;
create policy configs_admin_write on public.payment_provider_configs for all to authenticated
using (public.is_admin());

-- Policies for payment_transactions
drop policy if exists transactions_select_policy on public.payment_transactions;
create policy transactions_select_policy on public.payment_transactions for select to authenticated
using (
  payer_id = auth.uid() or 
  recipient_id = auth.uid() or 
  public.is_admin()
);

-- Policies for financial_audit_logs (admin only)
drop policy if exists audit_logs_policy on public.financial_audit_logs;
create policy audit_logs_policy on public.financial_audit_logs for select to authenticated
using (public.is_admin());
