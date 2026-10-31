-- Migration 19: Offline / Manual Payment Methods, Proof of Payment, and Admin Verification
-- Replaces gateway dependencies with flexible external payment + proof submission + admin verification workflow.

-- 1. Create normalized payment_methods table (configurable by admin without code changes)
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- e.g. 'bdo_bank_transfer', 'bpi_bank_transfer', 'gcash_qr', 'maya_wallet', 'qr_ph', 'cash_otc', 'external_card'
  display_name text not null,
  category text not null check (category in ('bank_transfer', 'ewallet', 'qr_ph', 'card', 'cash_check', 'other')),
  bank_or_provider_name text not null, -- e.g. 'BDO Unibank', 'GCash', 'Maya', 'Land Bank'
  account_holder_name text not null, -- e.g. 'Smart Contractor Matching Platform Inc.'
  account_number_or_id text not null, -- e.g. '0012-3456-7890' or '0917-123-4567'
  qr_code_url text, -- optional QR Ph or merchant QR code image
  payment_instructions text not null,
  min_amount numeric(14,2) default 1.00,
  max_amount numeric(14,2) default 10000000.00,
  transaction_fee_pct numeric(5,2) default 0.00,
  transaction_fee_fixed numeric(10,2) default 0.00,
  is_active boolean not null default true,
  requires_proof boolean not null default true,
  requires_admin_verification boolean not null default true,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Seed default verified Philippine payment channels
insert into public.payment_methods (
  code, display_name, category, bank_or_provider_name, account_holder_name, account_number_or_id, qr_code_url, payment_instructions, transaction_fee_pct, is_active, sort_order
) values
(
  'bdo_transfer',
  'BDO Unibank (Online / Over-the-Counter)',
  'bank_transfer',
  'BDO Unibank',
  'Smart Contractor Matching Platform Inc.',
  '0045-8021-9923',
  null,
  '1. Open your BDO Online Banking app or visit any BDO branch.\n2. Transfer or deposit the milestone amount to Account #0045-8021-9923.\n3. Take a screenshot or keep your physical deposit slip.\n4. Enter the BDO Confirmation / Trace Ref # and upload the proof below.',
  0.00,
  true,
  1
),
(
  'bpi_transfer',
  'BPI (Bank of the Philippine Islands)',
  'bank_transfer',
  'Bank of the Philippine Islands',
  'Smart Contractor Matching Platform Inc.',
  '2941-0082-19',
  null,
  '1. Send via BPI to BPI or InstaPay/PESONet.\n2. Target Account: 2941-0082-19 (Smart Contractor Matching Platform Inc.).\n3. Note down the transaction reference and upload the transfer receipt below.',
  0.00,
  true,
  2
),
(
  'unionbank_transfer',
  'UnionBank of the Philippines',
  'bank_transfer',
  'UnionBank of the Philippines',
  'Smart Contractor Matching Platform Inc.',
  '1094-2201-8490',
  null,
  '1. Open UnionBank Online or transfer via InstaPay.\n2. Transfer to Account #1094-2201-8490.\n3. Submit your transfer reference receipt for admin verification.',
  0.00,
  true,
  3
),
(
  'gcash_qr',
  'GCash / QR Ph (Instant E-Wallet Transfer)',
  'ewallet',
  'GCash Philippines',
  'Smart Contractor Matching - Operations',
  '0917-882-9012',
  'https://images.unsplash.com/photo-1595079676339-1534801ad6cf?auto=format&fit=crop&w=600&q=80',
  '1. Open GCash app and tap "Send Money" or "Scan QR".\n2. Send the exact amount to 0917-882-9012 or scan the official QR Ph code.\n3. Take a screenshot of the GCash Confirmation screen showing the 13-digit Reference #.\n4. Submit proof below for platform verification.',
  0.00,
  true,
  4
),
(
  'maya_pay',
  'Maya Wallet / Maya Business',
  'ewallet',
  'Maya Philippines',
  'Smart Contractor Matching Inc.',
  '0918-992-1044',
  null,
  '1. Open your Maya app and tap "Send Money" to 0918-992-1044.\n2. Keep your Maya Transaction Reference Number.\n3. Upload your receipt screenshot below.',
  0.00,
  true,
  5
),
(
  'cash_manager_check',
  'Manager''s Check / Over-the-Counter Escrow Handover',
  'cash_check',
  'Accredited Platform Partner Desk',
  'Smart Contractor Matching Platform Inc.',
  'MC-DESK-MANILA',
  null,
  '1. Issue a Manager''s Check payable to: Smart Contractor Matching Platform Inc.\n2. Present the check to our partner legal desk or bank depository partner.\n3. Obtain an Official Acknowledgment Receipt and upload the scanned copy below.',
  0.00,
  true,
  6
),
(
  'external_card',
  'Credit / Debit Card (External Terminal / Virtual Terminal)',
  'card',
  'Partner Merchant Terminal (Visa / Mastercard)',
  'Smart Contractor Matching Platform Inc.',
  'TERMINAL-EXT-01',
  null,
  'We do not capture card numbers directly on this website for your protection. If you wish to pay via Credit/Debit card, use your issuing bank''s "Pay Bills / Credit Card Virtual Payment" to our merchant account, or request an authorized virtual terminal link from our billing team. Once completed, submit the transaction authorization slip below.',
  2.50,
  true,
  7
)
on conflict (code) do update set
  display_name = excluded.display_name,
  payment_instructions = excluded.payment_instructions,
  is_active = excluded.is_active;

-- 3. Enhance payment_transactions table for proof submission & verification lifecycle
alter table public.payment_transactions 
  add column if not exists payment_method_id uuid references public.payment_methods(id),
  add column if not exists sender_name text,
  add column if not exists sender_account_identifier text,
  add column if not exists proof_file_url text,
  add column if not exists proof_file_name text,
  add column if not exists notes text,
  add column if not exists reviewer_id uuid references public.profiles(id),
  add column if not exists reviewer_notes text,
  add column if not exists rejection_reason text,
  add column if not exists verified_amount numeric(14,2);

-- 4. Enable RLS on payment_methods
alter table public.payment_methods enable row level security;

drop policy if exists payment_methods_read on public.payment_methods;
create policy payment_methods_read on public.payment_methods for select to authenticated
using (true);

drop policy if exists payment_methods_admin_all on public.payment_methods;
create policy payment_methods_admin_all on public.payment_methods for all to authenticated
using (public.is_admin());
