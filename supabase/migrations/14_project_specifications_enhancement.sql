-- Migration 14: Enhanced Homeowner Project Creation Schema
-- Adds support for multi-step specification fields: province, bathrooms, per-floor areas,
-- structural details, site conditions, roofing, finish specifications, scope items, and renovation/extension scopes.

alter table public.projects 
  add column if not exists province text default 'Metro Manila',
  add column if not exists bathrooms integer default 2 check (bathrooms is null or bathrooms >= 0),
  add column if not exists floor_1_area_sqm numeric(10,2),
  add column if not exists floor_2_area_sqm numeric(10,2),
  add column if not exists structural_system text default 'reinforced_concrete',
  add column if not exists site_condition text default 'flat_level',
  add column if not exists roofing_type text default 'long_span_metal',
  add column if not exists finish_specs jsonb default '{}'::jsonb,
  add column if not exists scope_items jsonb default '[]'::jsonb,
  add column if not exists renovation_scope jsonb default '{}'::jsonb,
  add column if not exists extension_scope jsonb default '{}'::jsonb,
  add column if not exists estimate_breakdown jsonb default '{}'::jsonb,
  add column if not exists estimate_confidence text default 'preliminary';

-- Create index for filtering projects by province and city
create index if not exists idx_projects_province_city on public.projects(province, city);
