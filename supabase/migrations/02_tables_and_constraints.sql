-- SMART CONTRACTOR MATCHING | 02
-- Core schema. Every table has created_at; mutable entities also have updated_at.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'homeowner',
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  phone text,
  city text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contractor_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  business_name text not null check (length(trim(business_name)) between 1 and 200),
  bio text,
  years_experience integer not null default 0 check (years_experience >= 0),
  service_cities text[] not null default '{}',
  specialties public.house_type[] not null default '{}',
  finish_levels public.finish_level[] not null default '{}',
  work_types public.work_type[] not null default '{}',
  license_no text,
  verification_status public.verification_status not null default 'pending',
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  rating_avg numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  projects_completed integer not null default 0 check (projects_completed >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contractor_documents (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  doc_type public.doc_type not null,
  file_path text not null,
  status public.verification_status not null default 'pending',
  reject_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'rejected' or nullif(trim(reject_reason),'') is not null)
);

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  house_type public.house_type,
  floors integer check (floors is null or floors >= 1),
  floor_area_sqm numeric(10,2) check (floor_area_sqm is null or floor_area_sqm > 0),
  year_completed integer check (year_completed is null or year_completed between 1900 and 2200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_images (
  id uuid primary key default gen_random_uuid(),
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  file_path text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.estimate_rates (
  id uuid primary key default gen_random_uuid(),
  finish_level public.finish_level not null,
  work_type public.work_type not null,
  rate_per_sqm numeric(14,2) not null check (rate_per_sqm > 0),
  extra_floor_factor numeric(6,4) not null default 0.04 check (extra_floor_factor >= 0 and extra_floor_factor <= 5),
  range_pct numeric(6,4) not null default 0.06 check (range_pct >= 0 and range_pct < 1),
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (finish_level, work_type, effective_from)
);

create table if not exists public.milestone_templates (
  id uuid primary key default gen_random_uuid(),
  seq integer not null check (seq > 0),
  name text not null check (length(trim(name)) between 1 and 160),
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seq, name)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  homeowner_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 200),
  house_type public.house_type not null,
  work_type public.work_type not null,
  lot_area_sqm numeric(10,2) check (lot_area_sqm is null or lot_area_sqm > 0),
  floor_area_sqm numeric(10,2) not null check (floor_area_sqm > 0),
  floors integer not null check (floors >= 1),
  bedrooms integer check (bedrooms is null or bedrooms >= 0),
  finish_level public.finish_level not null,
  city text not null check (length(trim(city)) > 0),
  budget numeric(14,2) check (budget is null or budget > 0),
  desired_start public.start_window not null default 'in_6_months',
  plan_file_path text,
  est_low numeric(14,2) check (est_low is null or est_low >= 0),
  est_mid numeric(14,2) check (est_mid is null or est_mid >= 0),
  est_high numeric(14,2) check (est_high is null or est_high >= 0),
  status public.project_status not null default 'draft',
  awarded_quote_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (est_low is null or est_mid is null or est_high is null or (est_low <= est_mid and est_mid <= est_high))
);

create table if not exists public.project_matches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(profile_id) on delete cascade,
  match_score numeric(5,2) not null check (match_score between 0 and 100),
  reasons jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, contractor_id)
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  contractor_id uuid not null references public.contractor_profiles(profile_id) on delete restrict,
  status public.quote_status not null default 'requested',
  price numeric(14,2) check (price is null or price > 0),
  duration_months integer check (duration_months is null or duration_months > 0),
  notes text,
  valid_until timestamptz,
  requested_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, contractor_id),
  check (status not in ('submitted','accepted') or (price is not null and duration_months is not null))
);

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  seq integer not null check (seq > 0),
  name text not null,
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  amount numeric(14,2) not null check (amount > 0),
  status public.milestone_status not null default 'locked',
  proof_submitted_at timestamptz,
  approve_by timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, seq)
);

create table if not exists public.milestone_proofs (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  file_path text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  payer_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method not null,
  provider text not null default 'mock',
  provider_ref text unique,
  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.escrow_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  milestone_id uuid references public.milestones(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  amount numeric(14,2) not null check (amount > 0),
  from_party uuid references public.profiles(id) on delete set null,
  to_party uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_profiles(profile_id) on delete restrict,
  milestone_id uuid not null unique references public.milestones(id) on delete restrict,
  gross_amount numeric(14,2) not null check (gross_amount > 0),
  fee_amount numeric(14,2) not null check (fee_amount >= 0),
  net_amount numeric(14,2) not null check (net_amount >= 0),
  status public.payout_status not null default 'pending',
  provider_ref text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (gross_amount = fee_amount + net_amount)
);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null unique references public.milestones(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(trim(reason)) > 0),
  status public.dispute_status not null default 'open',
  resolution text,
  contractor_amount numeric(14,2) check (contractor_amount is null or contractor_amount >= 0),
  homeowner_amount numeric(14,2) check (homeowner_amount is null or homeowner_amount >= 0),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  message text,
  file_path text,
  created_at timestamptz not null default now(),
  check (nullif(trim(coalesce(message,'')),'') is not null or file_path is not null)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete restrict,
  homeowner_id uuid not null references public.profiles(id) on delete restrict,
  contractor_id uuid not null references public.contractor_profiles(profile_id) on delete restrict,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add the circular awarded quote FK after both projects and quotes exist.
do $$ begin
  alter table public.projects add constraint projects_awarded_quote_fk
    foreign key (awarded_quote_id) references public.quotes(id) on delete set null;
exception when duplicate_object then null; end $$;
