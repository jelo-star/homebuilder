-- SMART CONTRACTOR MATCHING | 01
-- Enable required extensions and create enum types. Safe to rerun.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

do $$ begin create type public.user_role as enum ('homeowner','contractor','admin');
exception when duplicate_object then null; end $$;
do $$ begin create type public.verification_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;
do $$ begin create type public.doc_type as enum ('gov_id','license','permit','other');
exception when duplicate_object then null; end $$;
do $$ begin create type public.house_type as enum ('one_storey','two_storey','townhouse');
exception when duplicate_object then null; end $$;
do $$ begin create type public.work_type as enum ('new_build','renovation','extension');
exception when duplicate_object then null; end $$;
do $$ begin create type public.finish_level as enum ('basic','standard','premium');
exception when duplicate_object then null; end $$;
do $$ begin create type public.start_window as enum ('asap','in_2_months','in_6_months');
exception when duplicate_object then null; end $$;
do $$ begin create type public.project_status as enum ('draft','open','quoted','awarded','in_progress','completed','cancelled','disputed');
exception when duplicate_object then null; end $$;
do $$ begin create type public.quote_status as enum ('requested','submitted','accepted','declined','expired','withdrawn');
exception when duplicate_object then null; end $$;
do $$ begin create type public.milestone_status as enum ('locked','in_progress','proof_submitted','approved','disputed','paid','refunded');
exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_method as enum ('gcash','maya','bank_transfer','card');
exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status as enum ('pending','held','released','refunded','failed');
exception when duplicate_object then null; end $$;
do $$ begin create type public.ledger_entry_type as enum ('deposit','release','refund','fee');
exception when duplicate_object then null; end $$;
do $$ begin create type public.dispute_status as enum ('open','need_more_proof','resolved_paid','resolved_refund','resolved_split');
exception when duplicate_object then null; end $$;
do $$ begin create type public.payout_status as enum ('pending','sent','failed');
exception when duplicate_object then null; end $$;
