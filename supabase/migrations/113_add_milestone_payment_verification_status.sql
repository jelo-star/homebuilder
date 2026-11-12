alter type public.milestone_status
  add value if not exists 'payment_verification_pending';

alter table public.payment_transactions
  add column if not exists milestone_approval_requested boolean not null default false;
