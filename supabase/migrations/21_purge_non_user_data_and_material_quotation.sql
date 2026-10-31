-- ============================================================================
-- Migration 21: Purge Non-User Data & Add Contractor Material Quotation Column
-- Preserves all users (auth.users, profiles, contractor_profiles, portfolios)
-- Deletes all projects, quotes, milestones, payments, payouts, disputes, logs
-- ============================================================================

-- 1. Ensure is_admin() is executable by authenticated and anon roles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
  END IF;
END $$;

-- 2. Add material_quotation JSONB column to public.quotes so contractors'
-- itemized Material Quotation (Bill of Materials) is stored directly on quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS material_quotation JSONB DEFAULT NULL;

-- 3. Delete all transactional / project data while preserving Users & Profiles
DO $$
DECLARE
  tbl TEXT;
  tables_to_clear TEXT[] := ARRAY[
    'payment_transactions',
    'financial_audit_logs',
    'project_agreements',
    'quotation_line_items',
    'quote_revisions',
    'dispute_messages',
    'disputes',
    'payouts',
    'escrow_ledger',
    'payments',
    'milestone_proofs',
    'milestones',
    'quotes',
    'project_matches',
    'saved_estimates',
    'reviews',
    'notifications',
    'audit_logs',
    'projects'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_clear
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('DELETE FROM public.%I;', tbl);
    END IF;
  END LOOP;
END $$;

