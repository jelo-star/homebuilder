-- Migration 23: Project Management and Contractor Milestone Planning
-- Adds project_plans, project_plan_versions, project_plan_comments
-- Enhances milestones with start_date, end_date, and description

-- 1. Ensure milestones has start_date, end_date, and description
ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Create project_plans table
CREATE TABLE IF NOT EXISTS public.project_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  contractor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  homeowner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  agreed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'revision_requested')),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  revision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_plans_project UNIQUE (project_id)
);

-- 3. Create project_plan_versions for immutable snapshot preservation
CREATE TABLE IF NOT EXISTS public.project_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_plan_id UUID NOT NULL REFERENCES public.project_plans(id) ON DELETE CASCADE,
  version_num INT NOT NULL DEFAULT 1,
  stages_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  submitted_by UUID REFERENCES public.profiles(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create project_plan_comments for contractor-homeowner discussion
CREATE TABLE IF NOT EXISTS public.project_plan_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id),
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('contractor', 'homeowner', 'admin')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_plans_project_id ON public.project_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_project_plans_contractor_id ON public.project_plans(contractor_id);
CREATE INDEX IF NOT EXISTS idx_project_plan_versions_plan ON public.project_plan_versions(project_plan_id);
CREATE INDEX IF NOT EXISTS idx_project_plan_comments_project ON public.project_plan_comments(project_id, created_at ASC);

-- Row Level Security (RLS)
ALTER TABLE public.project_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_plan_comments ENABLE ROW LEVEL SECURITY;

-- Project plans policies
CREATE POLICY "project_plans_select_participants" ON public.project_plans
  FOR SELECT TO authenticated
  USING (
    contractor_id = auth.uid() OR
    homeowner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "project_plans_insert_update_contractor" ON public.project_plans
  FOR ALL TO authenticated
  USING (
    contractor_id = auth.uid() OR
    homeowner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    contractor_id = auth.uid() OR
    homeowner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Project plan versions policies
CREATE POLICY "project_plan_versions_select" ON public.project_plan_versions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "project_plan_versions_insert" ON public.project_plan_versions
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Project plan comments policies
CREATE POLICY "project_plan_comments_select" ON public.project_plan_comments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "project_plan_comments_insert" ON public.project_plan_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

