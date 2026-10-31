-- ============================================================================
-- Migration 22: Contractor Materials Quotation Module & Supplier Management
-- Implements Philippine construction materials quotation workflow:
-- 1. Suppliers table (isolated per contractor)
-- 2. Quotation line items & material quotation metadata enhancements
-- 3. Quotation status flow: draft, submitted, revision_requested, revised, accepted, declined, expired, withdrawn
-- 4. RLS policies and audit trail
-- ============================================================================

-- 1. Update quote_status ENUM to include full lifecycle statuses
DO $$
BEGIN
  ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'draft';
  ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'revision_requested';
  ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'revised';
  ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'rejected';
EXCEPTION
  WHEN others THEN null;
END $$;

-- 2. Create public.suppliers table for contractor supplier directory
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES public.contractor_profiles(profile_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_contractor ON public.suppliers(contractor_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);

-- 3. Extend public.quotes with quotation arrangement, detailed financial subtotals, and revision notes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS quote_ref TEXT,
  ADD COLUMN IF NOT EXISTS quotation_arrangement TEXT DEFAULT 'itemized', -- 'itemized' or 'lump_sum'
  ADD COLUMN IF NOT EXISTS materials_subtotal NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_charges NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_charges NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_discount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_materials_quotation NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equipment_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS logistics_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxes_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_profit_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS procurement_timeline_days INTEGER DEFAULT 14,
  ADD COLUMN IF NOT EXISTS revision_requested_notes TEXT,
  ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS material_quotation JSONB DEFAULT NULL;

-- 4. Extend public.quotation_line_items with brand, specifications, and supplier reference
ALTER TABLE public.quotation_line_items
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_contact TEXT,
  ADD COLUMN IF NOT EXISTS supplier_phone TEXT,
  ADD COLUMN IF NOT EXISTS supplier_email TEXT,
  ADD COLUMN IF NOT EXISTS supplier_address TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS price_validity DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 5. Enable RLS on public.suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_contractor_all ON public.suppliers;
CREATE POLICY suppliers_contractor_all ON public.suppliers
FOR ALL TO authenticated
USING (
  contractor_id = auth.uid() OR public.is_admin()
)
WITH CHECK (
  contractor_id = auth.uid() OR public.is_admin()
);

-- 6. Helper function to accept a quotation atomically
-- Sets chosen quote to 'accepted', project to 'awarded', and competing quotes to 'declined'
CREATE OR REPLACE FUNCTION public.accept_contractor_quotation(
  p_quote_id UUID,
  p_homeowner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_id UUID;
  v_quote_price NUMERIC(14,2);
  v_quote RECORD;
BEGIN
  -- Verify quote exists and homeowner owns the project
  SELECT q.*, p.homeowner_id AS p_homeowner_id
  INTO v_quote
  FROM public.quotes q
  JOIN public.projects p ON p.id = q.project_id
  WHERE q.id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation record not found.';
  END IF;

  IF v_quote.p_homeowner_id != p_homeowner_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only the homeowner may accept quotations for this project.';
  END IF;

  v_project_id := v_quote.project_id;
  v_quote_price := v_quote.price;

  -- 1. Mark accepted quote
  UPDATE public.quotes
  SET status = 'accepted',
      decided_at = now(),
      updated_at = now()
  WHERE id = p_quote_id;

  -- 2. Mark other submitted quotes as declined
  UPDATE public.quotes
  SET status = 'declined',
      decided_at = now(),
      updated_at = now()
  WHERE project_id = v_project_id AND id != p_quote_id AND status IN ('submitted', 'revision_requested', 'revised', 'requested');

  -- 3. Award project
  UPDATE public.projects
  SET status = 'awarded',
      awarded_quote_id = p_quote_id,
      budget = v_quote_price,
      updated_at = now()
  WHERE id = v_project_id;

  RETURN jsonb_build_object(
    'success', true,
    'quote_id', p_quote_id,
    'project_id', v_project_id,
    'price', v_quote_price
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_contractor_quotation(UUID, UUID) TO authenticated, service_role;

