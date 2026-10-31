-- SMART CONTRACTOR MATCHING | 13
-- Enhanced Philippine Construction Estimation Engine: Benchmarks, Unit Rates, and Saved Estimates
-- Based on PSA Construction Statistics, CMRPI, and Arcadis Philippines Construction Cost Handbook 2026.

-- 1. Create enum for estimate level and confidence
do $$ begin
  create type public.estimate_level as enum ('preliminary', 'refined', 'detailed', 'quotation', 'contract');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.estimate_work_category as enum (
    'site_prep_earthworks',
    'concrete_works',
    'reinforcing_steel',
    'formworks',
    'masonry_walls',
    'structural_steel',
    'roofing_waterproofing',
    'doors_windows',
    'finishes_floor_wall',
    'painting',
    'electrical_works',
    'plumbing_sanitary',
    'mechanical_fire',
    'fixtures_fittings',
    'preliminaries_supervision'
  );
exception when duplicate_object then null;
end $$;

-- 2. Enhanced Benchmark Rates (Level A)
-- Extends the benchmark data with low, base, and high rates per sqm, source citations, location modifiers, and scope exclusions.
create table if not exists public.construction_benchmarks (
  id uuid primary key default gen_random_uuid(),
  project_type public.work_type not null,
  house_type public.house_type not null,
  finish_level public.finish_level not null,
  region text not null default 'NCR', -- e.g. 'NCR', 'Region IV-A (Calabarzon)', 'Region III (Central Luzon)', 'Other Provinces'
  rate_low numeric(14,2) not null check (rate_low > 0),
  rate_base numeric(14,2) not null check (rate_base >= rate_low),
  rate_high numeric(14,2) not null check (rate_high >= rate_base),
  contingency_pct numeric(5,2) not null default 10.0 check (contingency_pct >= 0 and contingency_pct <= 50),
  contractor_overhead_profit_pct numeric(5,2) not null default 15.0 check (contractor_overhead_profit_pct >= 0 and contractor_overhead_profit_pct <= 50),
  vat_pct numeric(5,2) not null default 12.0 check (vat_pct >= 0 and vat_pct <= 25),
  source text not null default 'Arcadis PH 2026 / PSA Building Permits',
  source_notes text,
  version text not null default '2026.1',
  effective_from timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_type, house_type, finish_level, region, version)
);

-- 3. Detailed Construction Unit Rates Catalog (Level B)
-- Quantity surveyor item catalogue with unit rates covering labor, materials, equipment, and specifications.
create table if not exists public.construction_unit_rates (
  id uuid primary key default gen_random_uuid(),
  category public.estimate_work_category not null,
  item_code text not null unique,
  item_description text not null check (length(trim(item_description)) > 0),
  unit text not null, -- 'sqm', 'cum', 'kg', 'lot', 'set', 'lnm', 'lm'
  rate_low numeric(14,2) not null check (rate_low > 0),
  rate_base numeric(14,2) not null check (rate_base >= rate_low),
  rate_high numeric(14,2) not null check (rate_high >= rate_base),
  includes_labor boolean not null default true,
  includes_material boolean not null default true,
  includes_equipment boolean not null default true,
  spec_standard text, -- e.g. 'PNS 49 Grade 40 / 3000 PSI ready-mix'
  region text not null default 'NCR',
  source text not null default 'PSA CMRPI July 2026 / Local Trade Rates',
  version text not null default '2026.1',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Saved Project Estimates (Persists immutable estimate records with version and assumptions)
create table if not exists public.saved_estimates (
  id uuid primary key default gen_random_uuid(),
  homeowner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  estimate_level public.estimate_level not null default 'preliminary',
  title text not null,
  work_type public.work_type not null,
  house_type public.house_type not null,
  finish_level public.finish_level not null,
  region text not null default 'NCR',
  city text not null,
  floor_area_sqm numeric(10,2) not null check (floor_area_sqm > 0),
  floors integer not null default 1 check (floors >= 1),
  bedrooms integer,
  bathrooms integer,
  cost_low numeric(14,2) not null,
  cost_base numeric(14,2) not null,
  cost_high numeric(14,2) not null,
  direct_cost numeric(14,2) not null,
  overhead_profit_amt numeric(14,2) not null default 0,
  vat_amt numeric(14,2) not null default 0,
  contingency_amt numeric(14,2) not null default 0,
  rate_per_sqm_base numeric(14,2) not null,
  line_items jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  exclusions jsonb not null default '[]'::jsonb,
  rate_version text not null default '2026.1',
  rate_source text not null default 'Arcadis PH 2026 / PSA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Seed Initial Credible Benchmark Rates
insert into public.construction_benchmarks 
(project_type, house_type, finish_level, region, rate_low, rate_base, rate_high, contingency_pct, contractor_overhead_profit_pct, vat_pct, source, source_notes, version)
values
-- New Build (Single Storey)
('new_build', 'one_storey', 'basic', 'NCR', 21000, 24000, 27500, 8.0, 15.0, 12.0, 'PSA Construction Stats & Arcadis PH 2026', 'Simple reinforced concrete framing, 4-inch CHB, long-span pre-painted CGI roofing, ceramic tile floors', '2026.1'),
('new_build', 'one_storey', 'standard', 'NCR', 26000, 31000, 36000, 10.0, 15.0, 12.0, 'Arcadis PH Construction Cost Handbook 2026', '60x60 polished porcelain tile, custom laminated kitchen with synthetic granite, aluminum powder-coated windows', '2026.1'),
('new_build', 'one_storey', 'premium', 'NCR', 36000, 44000, 52000, 12.0, 18.0, 12.0, 'Arcadis PH Construction Cost Handbook 2026', 'Imported quartz countertops, solid wood panel doors, UPVC multi-point lock windows, smart home wiring', '2026.1'),

-- New Build (Two Storey)
('new_build', 'two_storey', 'basic', 'NCR', 23000, 26500, 30500, 8.0, 15.0, 12.0, 'PSA Construction Stats & Arcadis PH 2026', 'Structural slab, reinforced columns and beams, standard sanitary, semi-gloss latex painting', '2026.1'),
('new_build', 'two_storey', 'standard', 'NCR', 28500, 34500, 40000, 10.0, 15.0, 12.0, 'Arcadis PH Construction Cost Handbook 2026', 'Two-storey frame, structural engineer certified, tempered glass railings, LED cove lighting, quality PPR plumbing', '2026.1'),
('new_build', 'two_storey', 'premium', 'NCR', 40000, 49000, 58000, 12.0, 18.0, 12.0, 'Arcadis PH Construction Cost Handbook 2026', 'High-ceiling structural architectural features, concealed multi-split AC duct provisions, imported tiles and bath fixtures', '2026.1'),

-- Townhouse / Rowhouse
('new_build', 'townhouse', 'basic', 'NCR', 20500, 23500, 27000, 8.0, 15.0, 12.0, 'PSA Building Permits NCR', 'Common party walls, standard pre-fab roof trusses, basic sanitary lines', '2026.1'),
('new_build', 'townhouse', 'standard', 'NCR', 25500, 30000, 35000, 10.0, 15.0, 12.0, 'Arcadis PH Construction Cost Handbook 2026', 'Acoustic fire-rated party wall, modern architectural facade, laminated built-in closets', '2026.1'),
('new_build', 'townhouse', 'premium', 'NCR', 35000, 43000, 51000, 12.0, 18.0, 12.0, 'Arcadis PH Construction Cost Handbook 2026', 'Premium urban townhouse with acoustic insulation, balcony glazing, automated gate provision', '2026.1'),

-- Renovation
('renovation', 'one_storey', 'basic', 'NCR', 11000, 14000, 17500, 12.0, 15.0, 12.0, 'PSA CMRPI & Trade Contractor Survey', 'Partition reconfigurations, ceiling replacement, re-tiling, wall repaint', '2026.1'),
('renovation', 'two_storey', 'standard', 'NCR', 17000, 21500, 26000, 15.0, 15.0, 12.0, 'Arcadis PH / Industry Benchmarks', 'Bathroom overhaul, electrical re-wiring to PEC standards, waterproofing, kitchen modular revamp', '2026.1'),
('renovation', 'two_storey', 'premium', 'NCR', 25000, 32000, 39000, 15.0, 18.0, 12.0, 'Arcadis PH Construction Cost Handbook 2026', 'Full interior and facade structural retrofitting, replacement of MEPFS systems, luxury fixtures', '2026.1'),

-- Extension
('extension', 'one_storey', 'standard', 'NCR', 22000, 27000, 32000, 10.0, 15.0, 12.0, 'Industry Benchmarks', 'Rear/side room extension, tie-in to existing roofline, electrical tie-in to main panel', '2026.1'),
('extension', 'two_storey', 'standard', 'NCR', 26000, 31500, 37000, 12.0, 15.0, 12.0, 'Industry Benchmarks', 'Second-storey vertical or lateral extension requiring structural tie-ins and new foundations', '2026.1')
on conflict(project_type, house_type, finish_level, region, version) do update set
  rate_low = excluded.rate_low,
  rate_base = excluded.rate_base,
  rate_high = excluded.rate_high,
  updated_at = now();

-- 6. Seed Detailed Level B Construction Unit Rates Catalog
insert into public.construction_unit_rates
(category, item_code, item_description, unit, rate_low, rate_base, rate_high, includes_labor, includes_material, includes_equipment, spec_standard, region, source, version)
values
-- Earthworks
('site_prep_earthworks', 'EW-01', 'Site clearing, grubbing and grubbing disposal', 'sqm', 80, 110, 150, true, false, true, 'Manual and backhoe leveling', 'NCR', 'PSA CMRPI 2026', '2026.1'),
('site_prep_earthworks', 'EW-02', 'Structure excavation in common soil with backfill compaction', 'cum', 450, 580, 750, true, false, true, 'Up to 2.0m depth, 95% compaction', 'NCR', 'PSA CMRPI 2026', '2026.1'),
('site_prep_earthworks', 'EW-03', 'Gravel bedding (G-1) compacted under footings and ground slab', 'cum', 1400, 1750, 2100, true, true, true, 'Clean crushed 3/4 gravel, 50mm thickness', 'NCR', 'PSA CMRPI 2026', '2026.1'),

-- Concrete Works
('concrete_works', 'CW-01', 'Structural concrete 3000 PSI (20.7 MPa) for foundations and tie beams', 'cum', 5200, 6100, 7200, true, true, true, '28-day cylinder compressive strength', 'NCR', 'Arcadis PH 2026', '2026.1'),
('concrete_works', 'CW-02', 'Structural concrete 3500 PSI for columns, suspended slabs and beams', 'cum', 5600, 6600, 7800, true, true, true, 'Ready-mix with pumpcrete placement', 'NCR', 'Arcadis PH 2026', '2026.1'),
('concrete_works', 'CW-03', 'Plain concrete 2500 PSI for 100mm ground slab on fill', 'cum', 4600, 5400, 6300, true, true, false, 'Vibrated and steel-troweled finish', 'NCR', 'PSA CMRPI 2026', '2026.1'),

-- Reinforcing Steel
('reinforcing_steel', 'RS-01', 'Deformed reinforcing steel bars Grade 40 (10mm to 16mm)', 'kg', 75, 88, 105, true, true, false, 'PNS 49, includes #16 G.I. tie wire, cutting and bending', 'NCR', 'PSA CMRPI July 2026', '2026.1'),
('reinforcing_steel', 'RS-02', 'Deformed reinforcing steel bars Grade 60 (16mm to 25mm)', 'kg', 82, 95, 115, true, true, false, 'High-tensile structural steel for beams and columns', 'NCR', 'PSA CMRPI July 2026', '2026.1'),

-- Formworks
('formworks', 'FW-01', 'Phenolic plywood formwork with steel scaffolding supports', 'sqm', 550, 700, 880, true, true, true, '1/2 inch black film phenolic board, multi-use', 'NCR', 'Local Market Survey 2026', '2026.1'),

-- Masonry & Walls
('masonry_walls', 'MW-01', '150mm (6-inch) Concrete Hollow Block (CHB) load-bearing exterior wall', 'sqm', 950, 1200, 1450, true, true, false, 'Includes vertical/horizontal 10mm rebars at 600mm, cement plaster 20mm both sides', 'NCR', 'PSA CMRPI 2026', '2026.1'),
('masonry_walls', 'MW-02', '100mm (4-inch) CHB interior partition wall with plaster finish', 'sqm', 780, 980, 1200, true, true, false, 'Class B mortar fill, 10mm rebar, sponge-finish plaster', 'NCR', 'PSA CMRPI 2026', '2026.1'),

-- Roofing & Waterproofing
('roofing_waterproofing', 'RW-01', 'Rib-type 0.40mm pre-painted long-span roofing on C-purlins', 'sqm', 850, 1100, 1400, true, true, false, 'Includes insulation foil, flashing and ridge rolls', 'NCR', 'PSA CMRPI 2026', '2026.1'),
('roofing_waterproofing', 'RW-02', 'Flexible elastomeric cementitious waterproofing (3 coats) on wet areas and balconies', 'sqm', 420, 550, 720, true, true, false, 'Includes fiber mesh reinforcement at corner fillets', 'NCR', 'Local Trade Rates 2026', '2026.1'),

-- Doors & Windows
('doors_windows', 'DW-01', 'Powder-coated aluminum sliding windows with 6mm clear tempered glass', 'sqm', 3200, 4200, 5500, true, true, false, 'Analok/white frame with weather stripping and fly screen', 'NCR', 'Arcadis PH 2026', '2026.1'),
('doors_windows', 'DW-02', 'Solid wood entry door with jamb, deadbolt and lever handle set', 'set', 12000, 16500, 24000, true, true, false, 'Kiln-dried hardwood, polyurethane finished', 'NCR', 'Trade Suppliers 2026', '2026.1'),

-- Finishes (Floor & Wall)
('finishes_floor_wall', 'FF-01', '600mm x 600mm polished homogeneous porcelain floor tiles', 'sqm', 850, 1150, 1550, true, true, false, 'Heavy-duty tile adhesive, non-shrink polymer grout', 'NCR', 'PSA CMRPI 2026', '2026.1'),
('finishes_floor_wall', 'FF-02', 'Fiber cement ceiling board (4.5mm) on light-gauge metal furring', 'sqm', 520, 680, 890, true, true, false, 'Perforated joint tape, skim coat finish', 'NCR', 'PSA CMRPI 2026', '2026.1'),

-- Painting
('painting', 'PT-01', 'Interior and exterior paint system (primer + 2 finish coats)', 'sqm', 240, 320, 420, true, true, false, '100% acrylic semi-gloss premium latex on masonry', 'NCR', 'PSA CMRPI 2026', '2026.1'),

-- Electrical
('electrical_works', 'EL-01', 'Rough-in electrical conduit, THHN copper wire, utility boxes and fittings', 'lot', 450, 600, 800, true, true, false, 'Phelps Dodge or equal, non-metallic uPVC pipes per sqm floor', 'NCR', 'Philippine Electrical Code 2026', '2026.1'),
('electrical_works', 'EL-02', 'Main distribution panel board with miniature circuit breakers (Schneider/ABB)', 'set', 9500, 14000, 21000, true, true, false, '12-branch 2P panel with main breaker and surge protection', 'NCR', 'Industry Benchmarks', '2026.1'),

-- Plumbing & Sanitary
('plumbing_sanitary', 'PL-01', 'PPR water supply and uPVC drainage sanitary piping complete roughing-in', 'sqm', 500, 680, 900, true, true, false, 'Hot & cold PPR lines, Schedule 40 sanitary series 1000 per sqm floor', 'NCR', 'National Plumbing Code PH', '2026.1'),
('plumbing_sanitary', 'PL-02', 'Three-chamber reinforced septic tank (Digestive chamber + leaching field)', 'lot', 32000, 42000, 56000, true, true, true, 'Capacity for 6-8 occupants per DENR standards', 'NCR', 'Local Trade Rates 2026', '2026.1'),

-- Preliminaries
('preliminaries_supervision', 'PR-01', 'Site supervision, temporary utilities (water/power), safety PPE, and waste disposal', 'lot', 28000, 45000, 65000, true, true, true, 'Project preliminaries and health & safety compliance', 'NCR', 'DOLE Safety Guidelines', '2026.1')
on conflict (item_code) do update set
  rate_low = excluded.rate_low,
  rate_base = excluded.rate_base,
  rate_high = excluded.rate_high,
  item_description = excluded.item_description,
  spec_standard = excluded.spec_standard,
  updated_at = now();

-- 7. Add RLS Policies for Saved Estimates and Benchmarks
alter table public.construction_benchmarks enable row level security;
alter table public.construction_unit_rates enable row level security;
alter table public.saved_estimates enable row level security;

-- Public can view active benchmarks and unit rates (for calculator transparency)
drop policy if exists "Anyone can view active benchmarks" on public.construction_benchmarks;
create policy "Anyone can view active benchmarks"
  on public.construction_benchmarks for select
  using (is_active = true);

drop policy if exists "Anyone can view active unit rates" on public.construction_unit_rates;
create policy "Anyone can view active unit rates"
  on public.construction_unit_rates for select
  using (is_active = true);

-- Platform Owner / Admin can update benchmarks and unit rates
drop policy if exists "Admins can manage benchmarks" on public.construction_benchmarks;
create policy "Admins can manage benchmarks"
  on public.construction_benchmarks for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

drop policy if exists "Admins can manage unit rates" on public.construction_unit_rates;
create policy "Admins can manage unit rates"
  on public.construction_unit_rates for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Homeowners can read and create their own saved estimates
drop policy if exists "Homeowners can manage their own saved estimates" on public.saved_estimates;
create policy "Homeowners can manage their own saved estimates"
  on public.saved_estimates for all
  using (auth.uid() = homeowner_id)
  with check (auth.uid() = homeowner_id);

-- Admins can view all saved estimates
drop policy if exists "Admins can view all saved estimates" on public.saved_estimates;
create policy "Admins can view all saved estimates"
  on public.saved_estimates for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
