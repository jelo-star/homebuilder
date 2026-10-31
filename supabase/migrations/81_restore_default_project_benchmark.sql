-- Restore the default estimator rate if it was removed during a database reset.
-- Preserve any existing rate values and administrator-managed sources.
insert into public.construction_benchmarks (
  project_type,
  house_type,
  finish_level,
  region,
  rate_low,
  rate_base,
  rate_high,
  contingency_pct,
  contractor_overhead_profit_pct,
  vat_pct,
  source,
  source_notes,
  version,
  is_active
)
values (
  'new_build',
  'two_storey',
  'standard',
  'NCR',
  28500,
  34500,
  40000,
  10,
  15,
  12,
  'Demo benchmark catalog',
  'Standard two-storey construction benchmark.',
  '2026.1',
  true
)
on conflict (project_type, house_type, finish_level, region, version)
do update
set is_active = true,
    updated_at = now()
where public.construction_benchmarks.source = 'Demo benchmark catalog';
